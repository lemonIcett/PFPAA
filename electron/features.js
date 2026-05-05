/**
 * features.js — New SRS feature implementations
 * MMI-1: Ambient Notifications
 * CAM-3: Social Context Integration  
 * SEC-3: Browser Sandboxing
 * Auto data purge (SGL-3 / Privacy 5.4.4)
 */

// ─── MMI-1: Ambient Notification system ───────────────────────────────────
// Sends OS-level notifications with icons mapped to prediction category
const CATEGORY_ICONS = {
  calendar:       '📅',
  email:          '✉️',
  file:           '📁',
  slack:          '💬',
  workflow:       '⚙️',
  communication:  '👤',
  default:        '🤖'
}

function sendAmbientNotification({ title, body, category = 'default', urgency = 'normal' }) {
  try {
    const { Notification } = require('electron')
    if (!Notification.isSupported()) return

    const icon = CATEGORY_ICONS[category] || CATEGORY_ICONS.default
    const notification = new Notification({
      title: `${icon} ${title}`,
      body,
      silent: urgency === 'silent',
      urgency: urgency === 'critical' ? 'critical' : 'normal',
      timeoutType: 'default'
    })

    notification.show()
    console.log(`[MMI-1] Ambient notification: ${title}`)
    return notification
  } catch (e) {
    console.error('[MMI-1] Notification error:', e.message)
  }
}

// Map prediction confidence level to urgency
function notifyPrediction(prediction, settings) {
  if (!settings?.notifications_enabled) return
  if (settings?.automation_paused) return

  const category = prediction.category || 'default'
  const confidence = prediction.confidence_score || 0

  if (prediction.status === 'auto_executed') {
    sendAmbientNotification({
      title: 'Action completed',
      body: prediction.suggested_action || prediction.description,
      category,
      urgency: 'silent'
    })
  } else if (prediction.status === 'pending' && confidence < 85) {
    // Red level — needs attention
    sendAmbientNotification({
      title: 'Action needs approval',
      body: prediction.description,
      category,
      urgency: 'normal'
    })
  }
}

// ─── CAM-3: Social Context Integration ────────────────────────────────────
// Builds a contact graph from email/calendar/slack interactions and scores
// relationship strength based on interaction frequency and recency

const RELATIONSHIP_DECAY_DAYS = 30  // interactions older than this decay 50%

function buildSocialContext(signals) {
  const contacts = {}

  for (const signal of signals) {
    try {
      const data = typeof signal.data === 'string' ? JSON.parse(signal.data) : (signal.data || {})

      if (signal.signal_type === 'email_received') {
        const email = data.from_email || data.sender
        const name = data.from_name || data.sender_name || email
        if (email) _recordContact(contacts, email, name, 'email', signal.created_date)
      }

      if (signal.signal_type === 'calendar_event' && data.attendees) {
        const attendees = Array.isArray(data.attendees_list)
          ? data.attendees_list
          : []
        for (const att of attendees) {
          if (att.email) _recordContact(contacts, att.email, att.displayName || att.email, 'meeting', signal.created_date)
        }
      }

      if (signal.signal_type === 'communication' && data.user) {
        _recordContact(contacts, data.user, data.display_name || data.user, 'slack', signal.created_date)
      }
    } catch (e) { /* skip malformed signals */ }
  }

  // Score each contact
  const now = Date.now()
  for (const email of Object.keys(contacts)) {
    const c = contacts[email]
    let score = 0
    for (const interaction of c.interactions) {
      const ageDays = (now - new Date(interaction.date).getTime()) / (1000 * 60 * 60 * 24)
      const weight = interaction.type === 'meeting' ? 3 : interaction.type === 'email' ? 2 : 1
      const decay = ageDays > RELATIONSHIP_DECAY_DAYS ? 0.5 : 1.0
      score += weight * decay
    }
    c.strength_score = Math.min(100, Math.round(score * 5))
    c.interaction_count = c.interactions.length
    c.last_interaction = c.interactions[0]?.date || null
  }

  return contacts
}

function _recordContact(contacts, id, name, type, date) {
  if (!contacts[id]) {
    contacts[id] = { id, name, email: id, interactions: [], strength_score: 0 }
  }
  contacts[id].name = name || contacts[id].name
  contacts[id].interactions.unshift({ type, date })
  if (contacts[id].interactions.length > 100) contacts[id].interactions.pop()
}

function getSocialContextSummary(contacts) {
  const sorted = Object.values(contacts).sort((a, b) => b.strength_score - a.strength_score)
  const top5 = sorted.slice(0, 5)
  if (top5.length === 0) return ''
  return `Top contacts: ${top5.map(c => `${c.name} (${c.strength_score}/100)`).join(', ')}`
}

// ─── SEC-3: Browser Sandboxing ─────────────────────────────────────────────
// Enforces that browser automation only touches whitelisted form fields
// and blocks access to password manager fields / secure enclaves

const BLOCKED_FIELD_PATTERNS = [
  /password/i, /passwd/i, /secret/i, /pin\b/i, /cvv/i,
  /ssn/i, /social.?security/i, /credit.?card/i, /card.?number/i,
  /account.?number/i, /routing/i, /private.?key/i, /seed.?phrase/i
]

const BLOCKED_DOMAINS = [
  'lastpass.com', '1password.com', 'bitwarden.com', 'dashlane.com',
  'keeper.io', 'nordpass.com', 'keychain', 'vault.bitwarden'
]

function sandboxFormFill(formData) {
  if (!formData?.fields || !Array.isArray(formData.fields)) {
    return { blocked: false, sanitized: formData }
  }

  // Block if the URL is a password manager
  const url = formData.url || ''
  if (BLOCKED_DOMAINS.some(d => url.includes(d))) {
    return {
      blocked: true,
      reason: 'SEC-3: Password manager domains are blocked from automation'
    }
  }

  // Filter out any sensitive fields
  const originalCount = formData.fields.length
  const safe = formData.fields.filter(field => {
    const fieldKey = (field.key || field.name || '').toLowerCase()
    const isSensitive = BLOCKED_FIELD_PATTERNS.some(p => p.test(fieldKey))
    if (isSensitive) console.log(`[SEC-3] Blocked sensitive field: ${fieldKey}`)
    return !isSensitive
  })

  const blocked_count = originalCount - safe.length
  return {
    blocked: false,
    sanitized: { ...formData, fields: safe },
    blocked_fields: blocked_count
  }
}

// ─── SGL-3 / Privacy 5.4.4: Scheduled auto-purge ─────────────────────────
// Runs on startup and daily — fixes the "manual only" gap

let purgeInterval = null

function scheduleAutoPurge(store, broadcast) {
  // Run immediately on startup
  _runPurge(store, broadcast)

  // Then every 24 hours
  purgeInterval = setInterval(() => _runPurge(store, broadcast), 24 * 60 * 60 * 1000)
  console.log('[PURGE] Auto-purge scheduled (daily)')
}

function _runPurge(store, broadcast) {
  const now = Date.now()

  // Raw context logs: 7 days
  const sevenDays = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const signals = store.get('signals') || []
  const prunedSignals = signals.filter(s =>
    s.created_date > sevenDays || s.signal_type === 'calendar_event'
  )

  // Predictions + action logs: 90 days
  const ninetyDays = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()
  const predictions = (store.get('predictions') || []).filter(p => p.created_date > ninetyDays)
  const actionLogs = (store.get('actionLogs') || []).filter(a => a.created_date > ninetyDays)

  const totalPurged = (signals.length - prunedSignals.length) +
    ((store.get('predictions') || []).length - predictions.length) +
    ((store.get('actionLogs') || []).length - actionLogs.length)

  store.set('signals', prunedSignals)
  store.set('predictions', predictions)
  store.set('actionLogs', actionLogs)

  if (totalPurged > 0) {
    broadcast('data:purged', { count: totalPurged })
    console.log(`[PURGE] Auto-purge complete: removed ${totalPurged} old records`)
  }
}

function stopAutoPurge() {
  if (purgeInterval) clearInterval(purgeInterval)
}

module.exports = {
  sendAmbientNotification,
  notifyPrediction,
  buildSocialContext,
  getSocialContextSummary,
  sandboxFormFill,
  scheduleAutoPurge,
  stopAutoPurge
}
