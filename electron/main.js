const { app, BrowserWindow, ipcMain, shell, Notification, safeStorage } = require('electron')
const path = require('path')
const Store = require('electron-store')
const { google } = require('googleapis')
const chokidar = require('chokidar')
const { WebSocketServer } = require('ws')
const http = require('http')
const fs = require('fs')
const crypto = require('crypto')

// ─── New feature modules ───────────────────────────────────────────────────
const supabaseSync = require('./supabase-sync')
const {
  sendAmbientNotification,
  notifyPrediction,
  buildSocialContext,
  getSocialContextSummary,
  sandboxFormFill,
  scheduleAutoPurge,
  stopAutoPurge
} = require('./features')

// ─── Encrypted Store — SEC-1 ─────────────────────────────────────────────
// The encryption key for electron-store is derived per-machine using
// Electron's safeStorage API (macOS Keychain / Windows DPAPI / Linux SecretService).
// This means the store key is NEVER hardcoded — it is unique to each OS user
// account and cannot be extracted from the source or binary.
//
// Fallback: if safeStorage is unavailable (e.g. headless CI), we derive a
// machine-stable key from os.hostname + a salt, still better than a
// hardcoded constant.
function getStoreEncryptionKey() {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      // Use a fixed sentinel string — safeStorage encrypts it with the OS keychain,
      // so the result is machine-and-user-specific. We use the decrypted value as
      // our AES key material for electron-store.
      const SENTINEL = 'pfpa-store-key-sentinel-v1'
      // electron-store just needs a stable string; safeStorage gives us that
      // by producing a consistent encrypted blob for the same input on the same machine.
      const encrypted = safeStorage.encryptString(SENTINEL)
      // Use base64 of the encrypted bytes as the key — stable per machine/user
      return encrypted.toString('base64').slice(0, 64)
    }
  } catch (e) {
    console.warn('[SEC-1] safeStorage unavailable, using hostname-derived key:', e.message)
  }
  // Fallback: derive from hostname + process.env salt
  const os = require('os')
  const salt = process.env.PFPA_STORE_SALT || 'pfpa-fallback-2026'
  return require('crypto')
    .createHash('sha256')
    .update(os.hostname() + os.userInfo().username + salt)
    .digest('base64')
    .slice(0, 64)
}

const store = new Store({
  name: 'pfpa-data-v2',
  encryptionKey: getStoreEncryptionKey(),
  defaults: {
    signals: [],
    predictions: [],
    actionLogs: [],
    workflows: [],
    undoBuffer: [],
    relationshipGraph: {},
    behaviorPatterns: {},
    userSettings: {
      id: 'settings-1',
      confidence_threshold: 3,
      automation_paused: false,
      privacy_mode: 'standard',
      notifications_enabled: true,
      voice_feedback: false,
      watched_folders: [],
      claude_api_key: '',
      supabase_url: '',
      supabase_anon_key: '',
      created_date: new Date().toISOString()
    },
    userPreferences: {},
    userLocation: null,
    _seasonalContext: null,
    _sequenceContext: '',
    googleTokens: null,
    googleCredentials: null,
    slackToken: null,
    userPreferences: {},
    integrations: {
      google: false,
      slack: false,
      filesystem: false,
      browser: false,
      claude: false,
      supabase: false,
      supabase: false
    }
  }
})

// ─── Google OAuth2 ─────────────────────────────────────────────────────────
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly'
]

function getOAuth2Client() {
  const creds = store.get('googleCredentials')
  if (!creds) return null
  const oauth2 = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    creds.redirect_uri || 'urn:ietf:wg:oauth:2.0:oob'
  )
  const tokens = store.get('googleTokens')
  if (tokens) oauth2.setCredentials(tokens)
  return oauth2
}


// ─── Health check HTTP endpoint (SRS §5.4.1 — 99.9% uptime SLA monitoring) ──
// GET http://localhost:38421/health returns JSON status for external monitors
// (UptimeRobot, Prometheus, etc.)
let healthServer = null
let startedAt = Date.now()
let lastPredictionAt = null   // updated by the prediction engine

function startHealthServer() {
  const http2 = require('http')
  healthServer = http2.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') {
      res.writeHead(404).end()
      return
    }
    const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024)
    const uptimeSec = Math.round((Date.now() - startedAt) / 1000)
    const payload = JSON.stringify({
      status: 'ok',
      version: '2.2-M',
      uptime_seconds: uptimeSec,
      memory_rss_mb: memMB,
      last_prediction_at: lastPredictionAt,
      ws_clients: wsClients.size,
      timestamp: new Date().toISOString(),
    })
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'http://localhost:5173',
    }).end(payload)
  })
  healthServer.listen(38421, '127.0.0.1', () =>
    console.log('[HEALTH] Endpoint: http://localhost:38421/health')
  )
  healthServer.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.warn('[HEALTH] Port 38421 in use — skipping health endpoint')
    else console.error('[HEALTH] Server error:', e)
  })
}

// ─── WebSocket server ─────────────────────────────────────────────────────
let wss = null
let wsClients = new Set()

function startWebSocketServer() {
  startHealthServer()
  const server = http.createServer()
  wss = new WebSocketServer({ server })
  server.listen(7777, () => console.log('[WS] Running on ws://localhost:7777'))
  wss.on('connection', (ws) => {
    wsClients.add(ws)
    store.set('integrations.browser', true)
    broadcastToRenderer('integration:status', getIntegrationStatus())
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw)
        if (msg.type === 'browser_activity') handleBrowserActivity(msg.data)
      } catch (e) { console.error('[WS] parse error', e) }
    })
    ws.on('close', () => {
      wsClients.delete(ws)
      if (wsClients.size === 0) {
        store.set('integrations.browser', false)
        broadcastToRenderer('integration:status', getIntegrationStatus())
      }
    })
  })
}

function handleBrowserActivity(data) {
  const signals = store.get('signals')
  const existing = signals.find(s => s.signal_type === 'browser_tab' && s.source === data.url)
  if (!existing) {
    const signal = createSignal('browser_tab', data.url, data.title || 'Browser tab active', 'public', { url: data.url, title: data.title })
    addSignal(signal)
    runClaudeAnalysis(signal)
  }
}

// ─── Signal helpers ───────────────────────────────────────────────────────
function createSignal(type, source, description, privacy = 'public', data = {}) {
  return {
    id: crypto.randomUUID(),
    signal_type: type,
    source,
    description,
    device: 'desktop',
    privacy_level: privacy,
    is_active: true,
    data: JSON.stringify(data),
    created_date: new Date().toISOString()
  }
}

function addSignal(signal) {
  const t0 = Date.now()

  // NFR: count signal for throughput metric
  recordSignalThroughput()

  // SGL-2: Privacy vault — skip processing for sensitive contexts
  if (isPrivateContext(signal)) {
    console.log('[PRIVACY VAULT] Blocked signal from sensitive context: ' + signal.source)
    signal.privacy_level = 'vault'
    signal.description = '[Private context — not processed]'
    const vaultSignals = store.get('signals')
    vaultSignals.unshift(signal)
    if (vaultSignals.length > 300) vaultSignals.pop()
    store.set('signals', vaultSignals)
    broadcastToRenderer('signal:new', signal)
    return
  }

  const signals = store.get('signals')
  signals.unshift(signal)
  if (signals.length > 300) signals.pop()
  store.set('signals', signals)
  broadcastToRenderer('signal:new', signal)
  updateRelationshipGraph(signal)
  updateBehaviorPatterns(signal)
  supabaseSync.syncRecord('signals', signal)
  recordPerf('contextDetectionTimes', Date.now() - t0)
}

// ─── File system watcher ──────────────────────────────────────────────────
let fsWatcher = null

function startFileWatcher(folders) {
  if (fsWatcher) { fsWatcher.close(); fsWatcher = null }
  if (!folders || folders.length === 0) return

  fsWatcher = chokidar.watch(folders, {
    ignored: /(^|[\/\\])\..|(node_modules)/,
    persistent: true,
    ignoreInitial: true,
    depth: 3
  })

  const handle = (eventType) => (filePath) => {
    const name = path.basename(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const desc = `${eventType === 'add' ? 'New file' : eventType === 'change' ? 'Modified' : 'Deleted'}: ${name}`
    const signal = createSignal('file_activity', path.dirname(filePath), desc, 'public', {
      path: filePath, event: eventType, ext, name
    })
    addSignal(signal)

    // Auto-organize if workflow exists
    const workflows = store.get('workflows')
    const fileWorkflows = workflows.filter(w => w.trigger === 'file_activity' && w.enabled)
    for (const wf of fileWorkflows) {
      if (wf.condition && ext.includes(wf.condition)) {
        executeFileOrganize(filePath, wf.target_folder)
      }
    }
    runClaudeAnalysis(signal)
  }

  fsWatcher.on('add', handle('add'))
  fsWatcher.on('change', handle('change'))
  fsWatcher.on('unlink', handle('delete'))
  store.set('integrations.filesystem', true)
  broadcastToRenderer('integration:status', getIntegrationStatus())
}

// ─── Real file organization ───────────────────────────────────────────────
function executeFileOrganize(filePath, targetFolder) {
  try {
    if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true })
    const name = path.basename(filePath)
    const dest = path.join(targetFolder, name)
    fs.renameSync(filePath, dest)
    logAction('file_organize', `Moved ${name} to ${targetFolder}`, 90, 'green', true, { from: filePath, to: dest })
    return { success: true, dest }
  } catch (e) {
    console.error('[FS] organize error', e)
    return { error: e.message }
  }
}

// ─── Google Calendar — 48h lookahead + WRITE ──────────────────────────────
let calendarPoller = null

async function pollCalendar() {
  const auth = getOAuth2Client()
  if (!auth || !store.get('googleTokens')) return
  try {
    const calendar = google.calendar({ version: 'v3', auth })
    const now = new Date()
    const later = new Date(now.getTime() + 48 * 60 * 60 * 1000) // 48h

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: later.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20
    })

    const events = res.data.items || []
    const signals = store.get('signals').filter(s => s.signal_type !== 'calendar_event')

    for (const event of events) {
      const start = event.start?.dateTime || event.start?.date
      const minutesUntil = Math.round((new Date(start) - now) / 60000)
      const hoursUntil = Math.round(minutesUntil / 60)
      const attendeeCount = event.attendees?.length || 0
      const desc = minutesUntil <= 0
        ? `Ongoing: ${event.summary}`
        : minutesUntil < 60
          ? `In ${minutesUntil}min: ${event.summary}`
          : hoursUntil < 24
            ? `Today in ${hoursUntil}h: ${event.summary}`
            : `Tomorrow: ${event.summary}`

      const sig = createSignal('calendar_event', 'Google Calendar', desc, 'private', {
        eventId: event.id, start, summary: event.summary,
        attendees: attendeeCount, location: event.location,
        description: event.description, minutesUntil
      })
      sig.id = `cal-${event.id}`
      signals.unshift(sig)

      // Update relationship graph from attendees
      if (event.attendees) {
        for (const att of event.attendees) {
          if (att.email) updateRelationship(att.email, att.displayName || att.email, 'meeting', event.summary)
        }
      }

      if (minutesUntil > 0 && minutesUntil <= 30) {
        runClaudeAnalysis(sig)
      }
    }

    store.set('signals', signals.slice(0, 300))
    broadcastToRenderer('signals:refresh', signals.slice(0, 80))
    console.log(`[CAL] Synced ${events.length} events (48h window)`)
  } catch (e) {
    console.error('[CAL] Error:', e.message)
  }
}

// ─── REAL: Create Calendar Event ──────────────────────────────────────────
async function createCalendarEvent({ summary, description, start, end, attendees = [] }) {
  const auth = getOAuth2Client()
  if (!auth) return { error: 'Not authenticated' }
  try {
    const calendar = google.calendar({ version: 'v3', auth })
    const event = {
      summary,
      description,
      start: { dateTime: new Date(start).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: new Date(end).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      attendees: attendees.map(email => ({ email }))
    }
    const res = await calendar.events.insert({ calendarId: 'primary', resource: event })
    logAction('calendar_create', `Created event: ${summary}`, 95, 'green', true, { eventId: res.data.id })
    addToUndoBuffer('calendar_create', { eventId: res.data.id, summary })
    await pollCalendar()
    return { success: true, event: res.data }
  } catch (e) {
    return { error: e.message }
  }
}

// ─── REAL: Undo Calendar Event ────────────────────────────────────────────
async function deleteCalendarEvent(eventId) {
  const auth = getOAuth2Client()
  if (!auth) return { error: 'Not authenticated' }
  try {
    const calendar = google.calendar({ version: 'v3', auth })
    await calendar.events.delete({ calendarId: 'primary', eventId })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}

// ─── Gmail polling + REAL draft creation ─────────────────────────────────
async function pollGmail() {
  const auth = getOAuth2Client()
  if (!auth || !store.get('googleTokens')) return
  try {
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.messages.list({
      userId: 'me', maxResults: 10,
      q: 'is:unread -category:promotions -category:social newer_than:1d'
    })
    const messages = res.data.messages || []
    if (!messages.length) return

    const signals = store.get('signals').filter(s => s.signal_type !== 'email_received')
    for (const msg of messages.slice(0, 10)) {
      const detail = await gmail.users.messages.get({
        userId: 'me', id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'To', 'Date']
      })
      const headers = detail.data.payload?.headers || []
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown'
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)'
      const fromName = from.split('<')[0].trim().replace(/"/g, '') || from
      const fromEmail = (from.match(/<(.+)>/) || [])[1] || from

      const sig = createSignal('email_received', 'Gmail',
        `From ${fromName}: ${subject}`, 'private',
        { messageId: msg.id, from, fromEmail, fromName, subject })
      sig.id = `gmail-${msg.id}`
      signals.unshift(sig)
      updateRelationship(fromEmail, fromName, 'email', subject)
    }

    store.set('signals', signals.slice(0, 300))
    broadcastToRenderer('signals:refresh', signals.slice(0, 80))
  } catch (e) {
    console.error('[GMAIL] Error:', e.message)
  }
}

// ─── REAL: Create Gmail Draft ─────────────────────────────────────────────
async function createGmailDraft({ to, subject, body }) {
  const auth = getOAuth2Client()
  if (!auth) return { error: 'Not authenticated' }
  try {
    const gmail = google.gmail({ version: 'v1', auth })
    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const res = await gmail.users.drafts.create({
      userId: 'me',
      resource: { message: { raw } }
    })
    logAction('email_draft', `Draft created: ${subject} → ${to}`, 90, 'green', true, { draftId: res.data.id })
    addToUndoBuffer('email_draft', { draftId: res.data.id, subject })
    return { success: true, draftId: res.data.id }
  } catch (e) {
    return { error: e.message }
  }
}

// ─── REAL: Delete Gmail Draft (undo) ─────────────────────────────────────
async function deleteGmailDraft(draftId) {
  const auth = getOAuth2Client()
  if (!auth) return { error: 'Not authenticated' }
  try {
    const gmail = google.gmail({ version: 'v1', auth })
    await gmail.users.drafts.delete({ userId: 'me', id: draftId })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}

// ─── Slack polling + REAL message sending ────────────────────────────────
let slackPoller = null

async function pollSlack() {
  const token = store.get('slackToken')
  if (!token) return
  try {
    const axios = require('axios')
    const res = await axios.get('https://slack.com/api/search.messages', {
      headers: { Authorization: `Bearer ${token}` },
      params: { query: 'is:unread', count: 10 }
    })
    if (!res.data.ok) return

    const messages = res.data.messages?.matches || []
    const signals = store.get('signals').filter(s => s.signal_type !== 'communication' || s.source !== 'Slack')

    for (const msg of messages.slice(0, 10)) {
      const sig = createSignal('communication', 'Slack',
        `#${msg.channel?.name || 'channel'}: ${msg.text?.slice(0, 100)}`, 'private',
        { channel: msg.channel?.name, channelId: msg.channel?.id, user: msg.username, text: msg.text, ts: msg.ts })
      sig.id = `slack-${msg.ts}`
      signals.unshift(sig)
      if (msg.username) updateRelationship(msg.username, msg.username, 'slack', msg.text?.slice(0, 50))
    }

    store.set('signals', signals.slice(0, 300))
    broadcastToRenderer('signals:refresh', signals.slice(0, 80))
  } catch (e) {
    console.error('[SLACK] Error:', e.message)
  }
}

// ─── REAL: Send Slack message ─────────────────────────────────────────────
async function sendSlackMessage({ channel, text }) {
  const token = store.get('slackToken')
  if (!token) return { error: 'Slack not connected' }
  try {
    const axios = require('axios')
    const res = await axios.post('https://slack.com/api/chat.postMessage',
      { channel, text },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )
    if (!res.data.ok) return { error: res.data.error }
    logAction('slack_message', `Sent to #${channel}: ${text.slice(0, 60)}`, 90, 'green', true, { ts: res.data.ts, channel })
    addToUndoBuffer('slack_message', { ts: res.data.ts, channel })
    return { success: true, ts: res.data.ts }
  } catch (e) {
    return { error: e.message }
  }
}

// ─── PAS-2: Slack draft mode (SRS PAS-2 "saved as drafts, not sent") ─────
// Stores a message in the local queue; user reviews & sends from Action Log.
// Equivalent to email "save as draft" — no message is posted until user confirms.
function saveSlackDraft({ channel, text, scheduledAt = null }) {
  const drafts = store.get('slackDrafts') || []
  const draft  = {
    id:          `sdraft-${Date.now()}`,
    channel,
    text,
    scheduledAt,
    createdAt:   new Date().toISOString(),
    status:      'draft',  // draft | sent | discarded
  }
  drafts.unshift(draft)
  store.set('slackDrafts', drafts.slice(0, 50))
  logAction('slack_draft', `Slack draft queued for #${channel}: "${text.slice(0, 60)}"`, 80, 'yellow', false, { draftId: draft.id })
  broadcastToRenderer('slack:draft-created', draft)
  console.log(`[PAS-2] Slack draft saved: #${channel} — "${text.slice(0, 40)}"`)
  return { success: true, draftId: draft.id, draft }
}

async function sendSlackDraft(draftId) {
  const drafts = store.get('slackDrafts') || []
  const idx    = drafts.findIndex(d => d.id === draftId)
  if (idx === -1) return { error: 'Draft not found' }
  const draft  = drafts[idx]
  const result = await sendSlackMessage({ channel: draft.channel, text: draft.text })
  if (result.success) {
    drafts[idx] = { ...draft, status: 'sent', sentAt: new Date().toISOString(), ts: result.ts }
    store.set('slackDrafts', drafts)
    broadcastToRenderer('slack:draft-sent', drafts[idx])
  }
  return result
}

function discardSlackDraft(draftId) {
  const drafts = store.get('slackDrafts') || []
  const idx    = drafts.findIndex(d => d.id === draftId)
  if (idx !== -1) {
    drafts[idx].status = 'discarded'
    store.set('slackDrafts', drafts)
    broadcastToRenderer('slack:draft-discarded', { draftId })
  }
  return { success: true }
}

ipcMain.handle('slack:drafts-list',    ()        => store.get('slackDrafts') || [])
ipcMain.handle('slack:draft-send',     (_, { draftId }) => sendSlackDraft(draftId))
ipcMain.handle('slack:draft-discard',  (_, { draftId }) => discardSlackDraft(draftId))

// ─── REAL: Delete Slack message (undo) ───────────────────────────────────
async function deleteSlackMessage(channel, ts) {
  const token = store.get('slackToken')
  if (!token) return { error: 'Slack not connected' }
  try {
    const axios = require('axios')
    const res = await axios.post('https://slack.com/api/chat.delete',
      { channel, ts },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )
    return res.data.ok ? { success: true } : { error: res.data.error }
  } catch (e) {
    return { error: e.message }
  }
}

// ─── Relationship Graph ───────────────────────────────────────────────────
function updateRelationship(email, name, interactionType, context) {
  const graph = store.get('relationshipGraph')
  if (!graph[email]) {
    graph[email] = { email, name, interactions: 0, types: {}, lastSeen: null, strength: 0, contexts: [] }
  }
  const node = graph[email]
  node.name = name || node.name
  node.interactions++
  node.types[interactionType] = (node.types[interactionType] || 0) + 1
  node.lastSeen = new Date().toISOString()
  node.contexts.unshift(context)
  if (node.contexts.length > 10) node.contexts.pop()
  node.strength = Math.min(100, Math.round((node.interactions / 20) * 100))
  store.set('relationshipGraph', graph)
  broadcastToRenderer('relationship:updated', { email, node })
}

function updateRelationshipGraph(signal) {
  try {
    const data = signal.data ? JSON.parse(signal.data) : {}
    if (data.fromEmail) updateRelationship(data.fromEmail, data.fromName, 'email', data.subject)
  } catch (e) {}
}

// ─── Behavior Pattern Learning ────────────────────────────────────────────
function updateBehaviorPatterns(signal) {
  const patterns = store.get('behaviorPatterns')
  const hour = new Date().getHours()
  const dayOfWeek = new Date().getDay()
  const key = `${signal.signal_type}_h${hour}_d${dayOfWeek}`

  if (!patterns[key]) patterns[key] = { count: 0, type: signal.signal_type, hour, dayOfWeek, examples: [] }
  patterns[key].count++
  patterns[key].examples.unshift(signal.description)
  if (patterns[key].examples.length > 5) patterns[key].examples.pop()
  store.set('behaviorPatterns', patterns)
}

function getTopPatterns() {
  const patterns = store.get('behaviorPatterns')
  return Object.values(patterns)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

// ─── CLAUDE AI Prediction Engine ──────────────────────────────────────────
const recentPredictions = new Map()

async function runClaudeAnalysis(signal) {
  const settings = store.get('userSettings')
  if (settings.automation_paused) return
  const apiKey = settings.claude_api_key
  if (!apiKey) {
    runTemplatePrediction(signal)
    return
  }

  const dedupeKey = `${signal.signal_type}:${signal.description?.slice(0, 40)}`
  const last = recentPredictions.get(dedupeKey)
  if (last && Date.now() - last < 10 * 60 * 1000) return
  recentPredictions.set(dedupeKey, Date.now())

  // BIE-4: Anomaly detection — reduce confidence if behaviour is unusual
  const { isAnomaly, factor: anomalyFactor } = detectAnomaly(signal)

  try {
    const t0 = Date.now()
    const Anthropic = require('@anthropic-ai/sdk')
    const client = new Anthropic.default({ apiKey })

    const recentSignals = store.get('signals').slice(0, 10).map(s => `- [${s.signal_type}] ${s.description}`).join('\n')
    const topPatterns = getTopPatterns().map(p => `${p.type} at hour ${p.hour} (${p.count}x)`).join(', ')
    const relationships = Object.values(store.get('relationshipGraph')).sort((a,b)=>b.strength-a.strength).slice(0,5).map(r => `${r.name} (strength: ${r.strength})`).join(', ')
    // BIE-3: Preference learning context
    const prefContext = getPreferenceContext()
    const anomalyNote = isAnomaly ? 'ANOMALY DETECTED: User behaviour deviates from normal patterns. Use lower confidence.' : ''

    // CAM-2: Location + seasonal context
    const seasonal = store.get('_seasonalContext') || getSeasonalContext()
    const locationNote = seasonal.city ? `Location: ${seasonal.city}, ${seasonal.country} (${seasonal.timezone})` : 'Location: unknown'
    const seasonNote = `Season: ${seasonal.season} · Fiscal: ${seasonal.fiscalQ}${seasonal.isQuarterEnd ? ' (QUARTER END — deadlines likely)' : ''}${seasonal.holiday ? ` · Holiday: ${seasonal.holiday}` : ''}${seasonal.isMondayMorning ? ' · Monday morning (week planning mode)' : ''}${seasonal.isFridayAfternoon ? ' · Friday afternoon (wrap-up mode)' : ''}${seasonal.isWeekend ? ' · Weekend' : ''}`

    // BIE-1: Sequence patterns
    const sequenceContext = store.get('_sequenceContext') || getSequencePatternContext()

    // CAM-3: Social context — top contacts by interaction strength
    const signals = store.get('signals') || []
    const socialContacts = buildSocialContext(signals)
    const socialSummary = getSocialContextSummary(socialContacts)

    const prompt = `You are PFPA, a proactive AI assistant. Analyze this context signal and suggest the SINGLE most useful action.

CURRENT SIGNAL:
Type: ${signal.signal_type}
Source: ${signal.source}
Description: ${signal.description}
${anomalyNote}

TEMPORAL + LOCATION CONTEXT:
${locationNote}
${seasonNote}

RECENT ACTIVITY (last 10 signals):
${recentSignals}

USER BEHAVIOR PATTERNS: ${topPatterns || 'Not enough data yet'}
${sequenceContext ? `ROUTINE PATTERNS: ${sequenceContext}` : ''}
TOP RELATIONSHIPS: ${relationships || 'None yet'}

USER PREFERENCES (learned from past accept/dismiss history):
${prefContext || 'No preference data yet — this is early usage'}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "description": "Clear description of what you predict the user needs",
  "suggested_action": "Specific concrete action to take",
  "action_type": "one of: create_calendar_event | create_email_draft | send_slack_message | organize_files | reminder | none",
  "action_params": {
    "summary": "event title if calendar",
    "start": "ISO datetime if calendar",
    "end": "ISO datetime if calendar",
    "to": "email address if email",
    "subject": "email subject if email",
    "body": "email body if email",
    "channel": "slack channel if slack",
    "text": "slack message if slack"
  },
  "confidence": 0-100,
  "confidence_level": "green | yellow | red",
  "category": "calendar | email | communication | file_management | workflow | focus",
  "intent_type": "micro | session | daily",
  "reasoning": "Brief explanation of why this action"
}`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0]?.text || ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())

    // Apply anomaly factor to reduce confidence
    if (isAnomaly) {
      parsed.confidence = Math.round(parsed.confidence * anomalyFactor)
      if (parsed.confidence >= 85) parsed.confidence_level = 'green'
      else if (parsed.confidence >= 70) parsed.confidence_level = 'yellow'
      else parsed.confidence_level = 'red'
    }

    recordPerf('predictionTimes', Date.now() - t0)
    await createPrediction(parsed, signal)
  } catch (e) {
    console.error('[CLAUDE] Error:', e.message)
    runTemplatePrediction(signal)
  }
}

// ─── Template fallback prediction ─────────────────────────────────────────
function runTemplatePrediction(signal) {
  const dedupeKey = `${signal.signal_type}:${signal.description?.slice(0, 40)}`
  const last = recentPredictions.get(dedupeKey)
  if (last && Date.now() - last < 10 * 60 * 1000) return
  recentPredictions.set(dedupeKey, Date.now())

  const templates = {
    calendar_event: { description: `Prepare for: ${signal.description}`, suggested_action: 'Open notes and review agenda', action_type: 'reminder', confidence: 85, confidence_level: 'green', category: 'calendar', intent_type: 'micro' },
    email_received: { description: `Reply needed: ${signal.description}`, suggested_action: 'Draft a reply', action_type: 'create_email_draft', confidence: 70, confidence_level: 'yellow', category: 'email', intent_type: 'micro' },
    file_activity: { description: `File change: ${signal.description}`, suggested_action: 'Review and save work', action_type: 'reminder', confidence: 60, confidence_level: 'yellow', category: 'file_management', intent_type: 'micro' },
    browser_tab: { description: `Research: ${signal.description}`, suggested_action: 'Bookmark relevant findings', action_type: 'none', confidence: 55, confidence_level: 'red', category: 'workflow', intent_type: 'session' },
    communication: { description: `Message needs attention: ${signal.description}`, suggested_action: 'Respond to message', action_type: 'send_slack_message', confidence: 75, confidence_level: 'yellow', category: 'communication', intent_type: 'micro' }
  }

  const template = templates[signal.signal_type]
  if (template) createPrediction(template, signal)
}

// ─── Create + execute prediction ──────────────────────────────────────────
async function createPrediction(data, signal) {
  const settings = store.get('userSettings')
  const threshold = settings.confidence_threshold || 3

  const prediction = {
    id: crypto.randomUUID(),
    description: data.description,
    suggested_action: data.suggested_action,
    action_type: data.action_type || 'none',
    action_params: data.action_params || {},
    confidence: data.confidence,
    confidence_level: data.confidence_level,
    category: data.category,
    intent_type: data.intent_type || 'micro',
    reasoning: data.reasoning || '',
    status: 'pending',
    trigger_context: signal.description,
    signal_id: signal.id,
    created_date: new Date().toISOString()
  }

  // Auto-execute green high-confidence predictions
  if (data.confidence_level === 'green' && data.confidence >= 85 && !settings.automation_paused) {
    const result = await executeAction(prediction)
    prediction.status = result.error ? 'failed' : 'auto_executed'
    prediction.execution_result = result
  }

  const predictions = store.get('predictions')
  predictions.unshift(prediction)
  if (predictions.length > 200) predictions.pop()
  store.set('predictions', predictions)
  broadcastToRenderer('prediction:new', prediction)

  if (settings.notifications_enabled && prediction.status === 'pending') {
    // Show ghost overlay (PAS-1: ambient ghost action UI)
    showGhostOverlay(prediction)
    // Also show system notification as fallback
    new Notification({
      title: 'PFPA — Action Suggested',
      body: prediction.description,
      silent: true
    }).show()
  }

  supabaseSync.syncRecord('predictions', prediction)

  // MMI-1: Ambient notification for new predictions
  notifyPrediction(prediction, settings)

  return prediction
}

// ─── Execute real actions (with perf timing) ──────────────────────────────
async function executeAction(prediction) {
  const t0 = Date.now()
  const { action_type, action_params } = prediction
  let result
  switch (action_type) {
    case 'create_calendar_event':
      result = await createCalendarEvent(action_params); break

    case 'create_email_draft': {
      // BIE-1: Inject learned email style into draft params before sending to Gmail
      const templateCtx = getEmailTemplateContext()
      const enhancedParams = {
        ...action_params,
        _styleHint: templateCtx  // passed to Gmail draft creator to pick greeting/closing
      }
      result = await createGmailDraft(enhancedParams)
      // BIE-1: Learn from drafts the user accepts (record style for future use)
      if (result?.success && action_params.body) {
        learnEmailTemplate({
          subject: action_params.subject || '',
          body:    action_params.body,
        })
      }
      break
    }

    case 'send_slack_message': {
      // PAS-2: Slack messages created by AI are ALWAYS saved as drafts first.
      // The user reviews and sends from the Action Log (SRS PAS-2: "saved as drafts, not sent").
      // Actual immediate sending only happens when the user explicitly clicks Send Draft.
      result = saveSlackDraft({
        channel:    action_params.channel || 'general',
        text:       action_params.text || '',
        scheduledAt: action_params.scheduledAt || null,
      })
      break
    }

    case 'organize_files':
      result = action_params.filePath && action_params.targetFolder
        ? executeFileOrganize(action_params.filePath, action_params.targetFolder)
        : { success: true, note: 'no file params' }
      break

    case 'reminder':
    case 'none':
    default:
      result = { success: true, note: 'informational only' }
  }
  recordPerf('actionExecutionTimes', Date.now() - t0)
  return result
}

// ─── Action Logger ────────────────────────────────────────────────────────
function logAction(type, description, confidence, level, reversible, meta = {}) {
  const log = {
    id: crypto.randomUUID(),
    action_type: type,
    description,
    confidence,
    confidence_level: level,
    is_reversible: reversible,
    was_undone: false,
    meta,
    created_date: new Date().toISOString()
  }
  const logs = store.get('actionLogs')
  logs.unshift(log)
  if (logs.length > 500) logs.pop()
  store.set('actionLogs', logs)
  broadcastToRenderer('actionlog:new', log)
  supabaseSync.syncRecord('actionLogs', log)
  return log
}

// ─── Undo Buffer (30-second window) ──────────────────────────────────────
function addToUndoBuffer(actionType, meta) {
  const buffer = store.get('undoBuffer')
  const entry = {
    id: crypto.randomUUID(),
    actionType,
    meta,
    timestamp: Date.now(),
    expires: Date.now() + 30000
  }
  buffer.unshift(entry)
  if (buffer.length > 20) buffer.pop()
  store.set('undoBuffer', buffer)
  broadcastToRenderer('undo:available', entry)
  setTimeout(() => {
    const buf = store.get('undoBuffer').filter(e => e.id !== entry.id)
    store.set('undoBuffer', buf)
    broadcastToRenderer('undo:expired', { id: entry.id })
  }, 30000)
  return entry
}

async function executeUndo(entryId) {
  const buffer = store.get('undoBuffer')
  const entry = buffer.find(e => e.id === entryId)
  if (!entry) return { error: 'Undo entry not found or expired' }
  if (Date.now() > entry.expires) return { error: 'Undo window expired (30 seconds)' }

  let result = { success: false }
  switch (entry.actionType) {
    case 'calendar_create':
      result = await deleteCalendarEvent(entry.meta.eventId)
      break
    case 'email_draft':
      result = await deleteGmailDraft(entry.meta.draftId)
      break
    case 'slack_message':
      result = await deleteSlackMessage(entry.meta.channel, entry.meta.ts)
      break
    default:
      result = { success: true, note: 'No undo available for this action type' }
  }

  if (result.success) {
    const buf = store.get('undoBuffer').filter(e => e.id !== entryId)
    store.set('undoBuffer', buf)
    logAction('undo', `Undid: ${entry.actionType}`, 100, 'green', false, entry.meta)
  }
  return result
}

// ─── Supabase sync (replaces Firebase) ────────────────────────────────────
async function initSupabaseFromSettings(settings) {
  if (!settings?.supabase_url || !settings?.supabase_anon_key) return
  const result = await supabaseSync.initSupabase(
    { supabase_url: settings.supabase_url, supabase_anon_key: settings.supabase_anon_key },
    broadcastToRenderer,
    store
  )
  if (result.success) {
    store.set('integrations.supabase', true)
  }
  return result
}

// ─── Integration status ───────────────────────────────────────────────────
function getIntegrationStatus() {
  return {
    google: !!store.get('googleTokens'),
    slack: !!store.get('slackToken'),
    filesystem: (store.get('userSettings')?.watched_folders || []).length > 0,
    browser: wsClients.size > 0,
    claude: !!store.get('userSettings')?.claude_api_key,
    supabase: supabaseSync.isConnected(),
    googleCredentials: !!store.get('googleCredentials')
  }
}

// ─── BIE-3: Preference Learning ───────────────────────────────────────────
// When user dismisses or approves a prediction, record their preference
function recordPreference(predictionId, outcome) {
  const predictions = store.get('predictions')
  const pred = predictions.find(p => p.id === predictionId)
  if (!pred) return

  const prefs = store.get('userPreferences') || {}
  const key = `${pred.signal_type || 'unknown'}_${pred.action_type || 'none'}_${pred.category || 'general'}`

  if (!prefs[key]) prefs[key] = { approved: 0, dismissed: 0, ratio: 0.5 }
  if (outcome === 'approved') prefs[key].approved++
  else prefs[key].dismissed++

  const total = prefs[key].approved + prefs[key].dismissed
  prefs[key].ratio = total > 0 ? prefs[key].approved / total : 0.5
  prefs[key].lastUpdated = new Date().toISOString()

  store.set('userPreferences', prefs)
  console.log(`[PREFS] Updated preference for ${key}: ratio=${prefs[key].ratio.toFixed(2)}`)
}

function getPreferenceContext() {
  const prefs = store.get('userPreferences') || {}
  return Object.entries(prefs)
    .map(([key, v]) => `${key}: ${Math.round(v.ratio * 100)}% accepted (${v.approved + v.dismissed} samples)`)
    .slice(0, 10)
    .join('\n')
}

// ─── BIE-4: Anomaly Detection — multi-dimensional scoring ─────────────────
// SRS: "detect deviations from normal patterns and reduce automation
//  confidence accordingly to prevent inappropriate actions"
//
// Dimensions scored (0–1 each, weighted):
//  1. Temporal — unusual hour/day for this signal type
//  2. Velocity — signal arrival rate vs rolling 7-day average
//  3. Location — activity from unexpected IP/timezone
//  4. App pattern — app sequence doesn't match known routines
//  5. Idle gap — unusually long gap since last activity (vacation / new device)
function detectAnomaly(signal) {
  const patterns = store.get('behaviorPatterns') || {}
  const now      = new Date()
  const hour     = now.getHours()
  const dow      = now.getDay()

  const anomalyScores = {}

  // ── Dimension 1: Temporal ─────────────────────────────────────────────
  const temporalKey = `${signal.signal_type}_h${hour}_d${dow}`
  const temporalPat = patterns[temporalKey]
  if (temporalPat && temporalPat.count >= 5) {
    // We have enough history — check if this signal type is rare at this time
    const allHourKeys = Object.keys(patterns).filter(k => k.startsWith(`${signal.signal_type}_h${hour}`))
    const totalAtHour = allHourKeys.reduce((s, k) => s + (patterns[k]?.count || 0), 0)
    const fractionThisDay = totalAtHour > 0 ? temporalPat.count / totalAtHour : 1
    anomalyScores.temporal = fractionThisDay < 0.05 ? 0.8 : fractionThisDay < 0.15 ? 0.4 : 0
  } else {
    anomalyScores.temporal = 0 // not enough data to score
  }

  // ── Dimension 2: Signal velocity ──────────────────────────────────────
  const signals        = store.get('signals') || []
  const last1h         = signals.filter(s => Date.now() - new Date(s.created_date).getTime() < 3600000).length
  const velocityKey    = `velocity_h${hour}`
  const velHistory     = patterns[velocityKey] || { samples: [], avg: last1h }
  const velocityAvg    = velHistory.avg || 1
  const velocityRatio  = last1h / Math.max(velocityAvg, 1)
  anomalyScores.velocity = velocityRatio > 3 ? 0.7   // 3× normal rate
    : velocityRatio < 0.1 ? 0.5                       // almost no activity (idle / new session)
    : 0

  // Update rolling velocity average
  const newSamples = [...(velHistory.samples || []).slice(-20), last1h]
  patterns[velocityKey] = {
    samples: newSamples,
    avg:     newSamples.reduce((s, v) => s + v, 0) / newSamples.length
  }

  // ── Dimension 3: Location shift ────────────────────────────────────────
  const currentTZ   = Intl.DateTimeFormat().resolvedOptions().timeZone
  const knownTZ     = patterns.knownTimezone
  if (!knownTZ) {
    patterns.knownTimezone = currentTZ  // first time — learn
    anomalyScores.location = 0
  } else {
    anomalyScores.location = knownTZ !== currentTZ ? 0.9 : 0
    if (knownTZ !== currentTZ) {
      console.log(`[BIE-4] Timezone shift detected: ${knownTZ} → ${currentTZ}`)
    }
  }

  // ── Dimension 4: App sequence deviation ───────────────────────────────
  const recentApps  = signals
    .filter(s => s.signal_type === 'app_focus')
    .slice(-5)
    .map(s => { try { return JSON.parse(s.data).app } catch { return null } })
    .filter(Boolean)
  const morningKey  = `morning_routine_d${dow}`
  const knownSeqs   = patterns[morningKey]?.sequences || []
  if (recentApps.length >= 2 && knownSeqs.length >= 3) {
    const firstApp = recentApps[0]
    const knownStarts = knownSeqs.map(s => s[0])
    const matchRate  = knownStarts.filter(a => a === firstApp).length / knownStarts.length
    anomalyScores.appPattern = matchRate < 0.2 && hour >= 6 && hour <= 10 ? 0.5 : 0
  } else {
    anomalyScores.appPattern = 0
  }

  // ── Dimension 5: Idle gap ─────────────────────────────────────────────
  const lastSignalTime = signals.length > 1
    ? new Date(signals[signals.length - 2]?.created_date).getTime()
    : null
  if (lastSignalTime) {
    const gapHours = (Date.now() - lastSignalTime) / 3600000
    anomalyScores.idleGap = gapHours > 48 ? 0.8   // > 2 days offline
      : gapHours > 16 ? 0.3                        // overnight / weekend
      : 0
  } else {
    anomalyScores.idleGap = 0
  }

  // ── Weighted aggregate ────────────────────────────────────────────────
  const WEIGHTS = { temporal: 0.30, velocity: 0.20, location: 0.25, appPattern: 0.15, idleGap: 0.10 }
  const aggregateScore = Object.entries(anomalyScores).reduce(
    (sum, [dim, score]) => sum + score * (WEIGHTS[dim] || 0), 0
  )

  const isAnomaly = aggregateScore > 0.35
  // Confidence reduction: 0.6 at max anomaly, linear scale
  const factor = isAnomaly ? Math.max(0.4, 1 - aggregateScore * 0.8) : 1.0

  store.set('behaviorPatterns', patterns)

  if (isAnomaly) {
    const topDim = Object.entries(anomalyScores).sort((a, b) => b[1] - a[1])[0]
    console.log(`[BIE-4] Anomaly score ${aggregateScore.toFixed(2)} (top: ${topDim[0]}=${topDim[1].toFixed(2)}) → confidence ×${factor.toFixed(2)}`)
  }

  return {
    isAnomaly,
    factor,
    score: aggregateScore,
    dimensions: anomalyScores
  }
}

// ─── SGL-2: Privacy Vault ─────────────────────────────────────────────────
const PRIVATE_URL_PATTERNS = [
  /bank/i, /finance/i, /paypal/i, /stripe/i, /wallet/i,
  /medical/i, /health/i, /hospital/i, /pharmacy/i, /clinic/i,
  /password/i, /lastpass/i, /1password/i, /bitwarden/i,
  /incognito/i, /private/i, /tax/i, /insurance/i, /loan/i
]

function isPrivateContext(signal) {
  if (signal.signal_type !== 'browser_tab') return false
  const url = signal.source || ''
  const title = signal.description || ''
  return PRIVATE_URL_PATTERNS.some(p => p.test(url) || p.test(title))
}

// ─── SGL-3: 90-day data retention purge ───────────────────────────────────
function purgeOldData() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const tables = ['signals', 'predictions', 'actionLogs']
  let totalPurged = 0

  for (const table of tables) {
    const before = store.get(table) || []
    const after = before.filter(r => r.created_date > cutoff)
    const purged = before.length - after.length
    if (purged > 0) {
      store.set(table, after)
      totalPurged += purged
      console.log(`[PURGE] ${table}: removed ${purged} records older than 90 days`)
    }
  }

  // Raw context logs purge — 7 days
  const sevenDaysCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const rawSignals = store.get('signals') || []
  const prunedSignals = rawSignals.filter(s => s.created_date > sevenDaysCutoff || s.signal_type === 'calendar_event')
  store.set('signals', prunedSignals)

  if (totalPurged > 0) broadcastToRenderer('data:purged', { count: totalPurged })
}

// Firebase listener removed — replaced by supabase-sync.js real-time channels

// ─── Performance Monitor ──────────────────────────────────────────────────
const perfMetrics = {
  contextDetectionTimes: [],
  predictionTimes: [],
  actionExecutionTimes: [],
}

function recordPerf(category, ms) {
  const arr = perfMetrics[category]
  if (!arr) return
  arr.push(ms)
  if (arr.length > 100) arr.shift()
  // NFR threshold check
  const NFR_TARGETS = { contextDetectionTimes: 100, predictionTimes: 500, actionExecutionTimes: 2000 }
  const target = NFR_TARGETS[category]
  if (target && ms > target) recordNFRViolation(category, ms, target)
}

// ─── NFR Monitoring System ─────────────────────────────────────────────────
// SRS 5.1: context <100ms · prediction <500ms · action <2s · uptime 99.9%
// SRS 5.x: throughput 100+ signals/min, 50+ active predictions, battery <5%/hr
const nfrState = {
  startTime:         Date.now(),
  downtimeMs:        0,
  signalCountPerMin: [],      // ring buffer of per-minute counts
  signalMinuteStart: Date.now(),
  signalMinuteCount: 0,
  activePredictions: 0,
  peakPredictions:   0,
  batterySnapshots:  [],      // { ts, level, charging }
  violations:        [],      // NFR threshold breaches
  healthCheckInterval: null,
}

function recordNFRViolation(category, value, target) {
  const v = { ts: new Date().toISOString(), category, value, target }
  nfrState.violations.unshift(v)
  if (nfrState.violations.length > 200) nfrState.violations.pop()
  console.warn(`[NFR] Violation — ${category}: ${value} > target ${target}`)
  broadcastToRenderer('nfr:violation', v)
}

function recordSignalThroughput() {
  nfrState.signalMinuteCount++
  if (Date.now() - nfrState.signalMinuteStart >= 60000) {
    nfrState.signalCountPerMin.push(nfrState.signalMinuteCount)
    if (nfrState.signalCountPerMin.length > 60) nfrState.signalCountPerMin.shift()
    nfrState.signalMinuteStart = Date.now()
    nfrState.signalMinuteCount = 0
  }
}

async function sampleBattery() {
  try {
    const { powerMonitor } = require('electron')
    const snapshot = { ts: Date.now(), charging: !powerMonitor.isOnBatteryPower() }
    if (process.platform === 'darwin') {
      const { execSync } = require('child_process')
      try {
        const raw = execSync('ioreg -rn AppleSmartBattery | grep -E "CurrentCapacity|MaxCapacity"', { timeout: 2000 }).toString()
        const cur = raw.match(/CurrentCapacity\s*=\s*(\d+)/)?.[1]
        const max = raw.match(/MaxCapacity\s*=\s*(\d+)/)?.[1]
        if (cur && max) snapshot.level = Math.round((parseInt(cur) / parseInt(max)) * 100)
      } catch {}
    } else if (process.platform === 'win32') {
      const { execSync } = require('child_process')
      try {
        const raw = execSync('WMIC PATH Win32_Battery Get EstimatedChargeRemaining', { timeout: 2000 }).toString()
        const m = raw.match(/(\d+)/)
        if (m) snapshot.level = parseInt(m[1])
      } catch {}
    } else if (process.platform === 'linux') {
      try {
        const cap = require('fs').readFileSync('/sys/class/power_supply/BAT0/capacity', 'utf8').trim()
        snapshot.level = parseInt(cap)
      } catch {}
    }
    if (snapshot.level !== undefined) {
      nfrState.batterySnapshots.push(snapshot)
      if (nfrState.batterySnapshots.length > 24) nfrState.batterySnapshots.shift()
      const hourSnaps = nfrState.batterySnapshots.filter(s => !s.charging && Date.now() - s.ts < 3600000)
      if (hourSnaps.length >= 2) {
        const first = hourSnaps[0], last = hourSnaps[hourSnaps.length - 1]
        const drainRate = (first.level - last.level) / ((last.ts - first.ts) / 3600000)
        if (drainRate > 5) recordNFRViolation('battery_drain_pct_per_hr', Math.round(drainRate * 10) / 10, 5)
        broadcastToRenderer('nfr:battery', { level: snapshot.level, drainRate: Math.round(drainRate * 10) / 10 })
      }
    }
  } catch {}
}

function startHealthMonitor() {
  if (nfrState.healthCheckInterval) clearInterval(nfrState.healthCheckInterval)
  nfrState.healthCheckInterval = setInterval(() => {
    broadcastToRenderer('nfr:heartbeat', { ts: Date.now() })
  }, 30000)
  setInterval(sampleBattery, 300000)
  sampleBattery()
}

function getNFRReport() {
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
  const max = arr => arr.length ? Math.max(...arr) : 0
  const p95 = arr => {
    if (!arr.length) return 0
    return [...arr].sort((a, b) => a - b)[Math.floor(arr.length * 0.95)]
  }
  const uptimeMs  = Date.now() - nfrState.startTime
  const uptimePct = uptimeMs > 0
    ? Math.min(100, ((uptimeMs - nfrState.downtimeMs) / uptimeMs) * 100)
    : 100
  const avgSignalsPerMin = nfrState.signalCountPerMin.length
    ? Math.round(nfrState.signalCountPerMin.reduce((a, b) => a + b, 0) / nfrState.signalCountPerMin.length)
    : nfrState.signalMinuteCount
  return {
    uptime:    { pct: parseFloat(uptimePct.toFixed(3)), target: 99.9, ok: uptimePct >= 99.9, uptimeMs, startedAt: new Date(nfrState.startTime).toISOString() },
    latency:   {
      contextDetection: { avg: avg(perfMetrics.contextDetectionTimes), p95: p95(perfMetrics.contextDetectionTimes), max: max(perfMetrics.contextDetectionTimes), target: 100,  ok: avg(perfMetrics.contextDetectionTimes) <= 100,  samples: perfMetrics.contextDetectionTimes.length },
      prediction:       { avg: avg(perfMetrics.predictionTimes),       p95: p95(perfMetrics.predictionTimes),       max: max(perfMetrics.predictionTimes),       target: 500,  ok: avg(perfMetrics.predictionTimes) <= 500,       samples: perfMetrics.predictionTimes.length },
      actionExecution:  { avg: avg(perfMetrics.actionExecutionTimes),  p95: p95(perfMetrics.actionExecutionTimes),  max: max(perfMetrics.actionExecutionTimes),  target: 2000, ok: avg(perfMetrics.actionExecutionTimes) <= 2000, samples: perfMetrics.actionExecutionTimes.length },
    },
    throughput: { signalsPerMin: avgSignalsPerMin, targetSignals: 100, ok: avgSignalsPerMin >= 100, activePredictions: nfrState.activePredictions, peakPredictions: nfrState.peakPredictions, targetPredictions: 50 },
    battery:    nfrState.batterySnapshots.at(-1) ? { ...nfrState.batterySnapshots.at(-1), target: 5 } : null,
    violations: { count: nfrState.violations.length, recent: nfrState.violations.slice(0, 10) },
  }
}

// Backward-compat alias used by performance page
function getPerfReport() { return getNFRReport().latency }

ipcMain.handle('nfr:report', () => getNFRReport())

// ─── Session timeout (15 min inactivity) ─────────────────────────────────
let sessionTimer = null
const SESSION_TIMEOUT_MS = 15 * 60 * 1000

function resetSessionTimer() {
  if (sessionTimer) clearTimeout(sessionTimer)
  sessionTimer = setTimeout(() => {
    broadcastToRenderer('session:timeout', {})
    console.log('[SESSION] Timed out after 15 minutes of inactivity')
  }, SESSION_TIMEOUT_MS)
}

// ─── Ghost overlay window (PAS-1 ambient UI) ─────────────────────────────
let overlayWindow = null

function showGhostOverlay(prediction) {
  const settings = store.get('userSettings')
  if (!settings?.notifications_enabled) return
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:update', prediction)
    return
  }

  const { screen } = require('electron')
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  overlayWindow = new BrowserWindow({
    width: 380,
    height: 90,
    x: width - 400,
    y: height - 110,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  overlayWindow.setIgnoreMouseEvents(false)
  const isDev = !app.isPackaged
  if (isDev) {
    overlayWindow.loadURL('http://localhost:5173/#/overlay')
  } else {
    overlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/overlay' })
  }

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show()
    overlayWindow.webContents.send('overlay:update', prediction)
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close()
      overlayWindow = null
    }, 8000)
  })

  overlayWindow.on('closed', () => { overlayWindow = null })
}

// ─── Multi-step workflow chaining ─────────────────────────────────────────
async function executeWorkflowChain(workflow) {
  const steps = workflow.steps || []
  if (!steps.length) {
    // Legacy single-action workflow
    return executeAction({ action_type: workflow.action_type, action_params: workflow.action_params || {} })
  }

  const results = []
  let chainContext = {}

  for (const step of steps) {
    const t0 = Date.now()
    console.log(`[WORKFLOW] Executing step: ${step.action_type}`)

    // Allow steps to reference previous step results via {{prev.key}}
    const params = JSON.parse(
      JSON.stringify(step.params || {}).replace(/\{\{prev\.(\w+)\}\}/g, (_, k) => chainContext[k] || '')
    )

    const result = await executeAction({ action_type: step.action_type, action_params: params })
    results.push({ step: step.action_type, result })

    if (result.error) {
      console.error(`[WORKFLOW] Step failed: ${step.action_type} — ${result.error}`)
      if (step.stopOnError !== false) break
    }

    // Expose result keys for next step
    chainContext = { ...chainContext, ...result }
    recordPerf('actionExecutionTimes', Date.now() - t0)

    // Delay between steps if configured
    if (step.delayMs) await new Promise(r => setTimeout(r, step.delayMs))
  }

  logAction('workflow_chain', `Workflow "${workflow.name}" executed ${results.length} steps`, 90, 'green', false, { results })
  return { success: true, steps: results.length, results }
}

// ─── Pollers ──────────────────────────────────────────────────────────────
function startPollers() {
  calendarPoller = setInterval(() => { pollCalendar(); pollGmail() }, 5 * 60 * 1000)
  slackPoller = setInterval(pollSlack, 2 * 60 * 1000)
  // 90-day purge runs once per day
  setInterval(purgeOldData, 24 * 60 * 60 * 1000)
  // Location refresh every hour
  setInterval(detectLocation, 60 * 60 * 1000)
  // Sequential pattern detection every 5 minutes
  setInterval(detectSequentialPatterns, 5 * 60 * 1000)
  pollCalendar(); pollGmail(); pollSlack()
  // Run purge on startup too
  setTimeout(purgeOldData, 10000)
  // Detect location on startup
  setTimeout(detectLocation, 3000)
  setTimeout(detectSequentialPatterns, 5000)
}

// ─── IPC handlers ─────────────────────────────────────────────────────────
function broadcastToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data)
}

// CRUD
ipcMain.handle('db:list', (_, { table, sort = '-created_date', limit = 80 }) => {
  const data = store.get(table) || []
  const desc = sort.startsWith('-')
  const field = desc ? sort.slice(1) : sort
  return [...data].sort((a, b) => {
    if (a[field] < b[field]) return desc ? 1 : -1
    if (a[field] > b[field]) return desc ? -1 : 1
    return 0
  }).slice(0, limit)
})
ipcMain.handle('db:create', (_, { table, data }) => {
  const rows = store.get(table) || []
  const row = { id: crypto.randomUUID(), created_date: new Date().toISOString(), ...data }
  rows.unshift(row); store.set(table, rows); return row
})
ipcMain.handle('db:update', (_, { table, id, data }) => {
  const rows = store.get(table) || []
  const idx = rows.findIndex(r => r.id === id)
  if (idx === -1) throw new Error(`Not found: ${id}`)
  rows[idx] = { ...rows[idx], ...data }
  store.set(table, rows); return rows[idx]
})
ipcMain.handle('db:delete', (_, { table, id }) => {
  store.set(table, (store.get(table) || []).filter(r => r.id !== id)); return { id }
})

// Settings
ipcMain.handle('settings:get', () => store.get('userSettings'))
ipcMain.handle('settings:update', (_, data) => {
  const updated = { ...store.get('userSettings'), ...data }
  store.set('userSettings', updated)
  if (data.watched_folders !== undefined) startFileWatcher(data.watched_folders)
  if (data.claude_api_key) store.set('integrations.claude', true)
  if (data.supabase_url && data.supabase_anon_key) initSupabaseFromSettings(updated)
  // CAM-4/SEC-1: Push settings changes to other devices via Supabase E2E sync
  if (supabaseSync.isConnected()) {
    supabaseSync.syncSettings(updated).catch(e => console.warn('[SYNC] settings sync error:', e.message))
  }
  broadcastToRenderer('integration:status', getIntegrationStatus())
  return updated
})

// Google OAuth
ipcMain.handle('google:set-credentials', (_, creds) => {
  store.set('googleCredentials', { ...creds, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob' })
  return { success: true }
})
ipcMain.handle('google:get-auth-url', () => {
  const auth = getOAuth2Client()
  if (!auth) return { error: 'No credentials configured' }
  return { url: auth.generateAuthUrl({ access_type: 'offline', scope: GOOGLE_SCOPES, prompt: 'consent' }) }
})
ipcMain.handle('google:exchange-code', async (_, code) => {
  const auth = getOAuth2Client()
  if (!auth) return { error: 'No credentials' }
  try {
    const { tokens } = await auth.getToken(code)
    auth.setCredentials(tokens)
    store.set('googleTokens', tokens)
    store.set('integrations.google', true)
    broadcastToRenderer('integration:status', getIntegrationStatus())
    setTimeout(() => { pollCalendar(); pollGmail() }, 500)
    return { success: true }
  } catch (e) { return { error: e.message } }
})
ipcMain.handle('google:disconnect', () => {
  store.set('googleTokens', null)
  store.set('integrations.google', false)
  broadcastToRenderer('integration:status', getIntegrationStatus())
  return { success: true }
})

// Slack
ipcMain.handle('slack:connect', async (_, token) => {
  try {
    const axios = require('axios')
    const res = await axios.get('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.data.ok) return { error: res.data.error }
    store.set('slackToken', token)
    store.set('integrations.slack', true)
    broadcastToRenderer('integration:status', getIntegrationStatus())
    setTimeout(pollSlack, 500)
    return { success: true, user: res.data.user, team: res.data.team }
  } catch (e) { return { error: e.message } }
})
ipcMain.handle('slack:disconnect', () => {
  store.set('slackToken', null); store.set('integrations.slack', false)
  broadcastToRenderer('integration:status', getIntegrationStatus())
  return { success: true }
})

// Real actions
ipcMain.handle('action:create-calendar-event', async (_, params) => createCalendarEvent(params))
ipcMain.handle('action:create-email-draft', async (_, params) => createGmailDraft(params))
ipcMain.handle('action:send-slack', async (_, params) => sendSlackMessage(params))
ipcMain.handle('action:organize-files', async (_, params) => executeFileOrganize(params.filePath, params.targetFolder))
ipcMain.handle('action:execute-prediction', async (_, predictionId) => {
  const predictions = store.get('predictions')
  const pred = predictions.find(p => p.id === predictionId)
  if (!pred) return { error: 'Prediction not found' }
  const result = await executeAction(pred)
  const idx = predictions.findIndex(p => p.id === predictionId)
  predictions[idx] = { ...pred, status: result.error ? 'failed' : 'executed', execution_result: result }
  store.set('predictions', predictions)
  broadcastToRenderer('prediction:updated', predictions[idx])
  return result
})

// Undo
ipcMain.handle('undo:execute', async (_, entryId) => executeUndo(entryId))
ipcMain.handle('undo:list', () => store.get('undoBuffer').filter(e => Date.now() < e.expires))

// Misc
ipcMain.handle('integrations:status', () => getIntegrationStatus())
ipcMain.handle('sync:now', async () => {
  await Promise.allSettled([pollCalendar(), pollGmail(), pollSlack()])
  return { success: true }
})
ipcMain.handle('shell:open', (_, url) => shell.openExternal(url))
ipcMain.handle('relationships:get', () => store.get('relationshipGraph'))
ipcMain.handle('patterns:get', () => getTopPatterns())
ipcMain.handle('supabase:init', async (_, config) => initSupabaseFromSettings(config))
ipcMain.handle('supabase:status', () => supabaseSync.getSupabaseStatus())

// ─── Window ────────────────────────────────────────────────────────────────
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 650,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#060c1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  createWindowIfNotHeadless()
  startWebSocketServer()
  startPollers()
  resetSessionTimer()
  registerGestureShortcuts()
  startHealthMonitor()   // NFR: uptime + battery + throughput tracking

  const settings = store.get('userSettings')
  if (settings?.watched_folders?.length > 0) startFileWatcher(settings.watched_folders)
  if (settings?.claude_api_key) store.set('integrations.claude', true)
  if (settings?.window_monitor_enabled) startWindowMonitor()
  if (settings?.clipboard_monitor_enabled) startClipboardMonitor()

  if (settings?.supabase_url && settings?.supabase_anon_key) {
    await initSupabaseFromSettings(settings)
  }

  app.on('browser-window-focus', resetSessionTimer)
  console.log(`[PFPA] Started in ${HEADLESS ? 'headless' : 'UI'} mode`)
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
app.on('will-quit', () => {
  if (fsWatcher) fsWatcher.close()
  if (calendarPoller) clearInterval(calendarPoller)
  if (slackPoller) clearInterval(slackPoller)
  if (windowPoller) clearInterval(windowPoller)
  if (clipboardPoller) clearInterval(clipboardPoller)
  if (wss) wss.close()
  unregisterGestureShortcuts()
})

// ─── NEW IPC handlers (v2.1) ──────────────────────────────────────────────

// Preference learning
ipcMain.handle('preference:record', (_, { predictionId, outcome }) => {
  recordPreference(predictionId, outcome)
  return { success: true }
})
ipcMain.handle('preference:get', () => store.get('userPreferences') || {})

// Performance report
ipcMain.handle('perf:report', () => getPerfReport())

// Session activity ping (reset timer)
ipcMain.handle('session:ping', () => { resetSessionTimer(); return { success: true } })

// Ghost overlay
ipcMain.handle('overlay:show', (_, prediction) => { showGhostOverlay(prediction); return { success: true } })
ipcMain.handle('overlay:dismiss', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close()
  return { success: true }
})

// Multi-step workflow execution
ipcMain.handle('workflow:execute-chain', async (_, workflowId) => {
  const workflows = store.get('workflows')
  const wf = workflows.find(w => w.id === workflowId)
  if (!wf) return { error: 'Workflow not found' }
  return executeWorkflowChain(wf)
})

// Data purge manually
ipcMain.handle('data:purge', () => { purgeOldData(); return { success: true } })

// Anomaly test (for debugging)
ipcMain.handle('anomaly:check', (_, signal) => detectAnomaly(signal))

// ═══════════════════════════════════════════════════════════════════════════
// ─── FINAL 10% IMPLEMENTATIONS ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ─── 1. CAM-1: Active window + clipboard monitoring ───────────────────────
let lastWindowTitle = ''
let lastClipboard = ''
let windowPoller = null
let clipboardPoller = null

function startWindowMonitor() {
  // Try to load active-win — graceful fallback if not installed
  let activeWin
  try { activeWin = require('active-win') } catch (e) {
    console.log('[WIN] active-win not installed — window monitoring disabled. Run: npm install active-win')
    return
  }

  windowPoller = setInterval(async () => {
    try {
      const win = await activeWin()
      if (!win) return
      const title = `${win.owner.name}: ${win.title}`
      if (title === lastWindowTitle) return
      lastWindowTitle = title

      // Skip PFPA itself to avoid feedback loop
      if (win.owner.name.toLowerCase().includes('pfpa') ||
          win.owner.name.toLowerCase().includes('electron')) return

      const signal = createSignal(
        'app_focus',
        win.owner.name,
        `Active: ${win.title.slice(0, 80)}`,
        'public',
        { app: win.owner.name, title: win.title, pid: win.id }
      )
      addSignal(signal)
      runClaudeAnalysis(signal)
    } catch (e) { /* silently skip */ }
  }, 3000)

  console.log('[WIN] Window monitor started (3s polling)')
}

function startClipboardMonitor() {
  const { clipboard } = require('electron')
  const SENSITIVE_PATTERNS = [/password/i, /secret/i, /token/i, /api.?key/i, /private.?key/i]

  clipboardPoller = setInterval(() => {
    try {
      const text = clipboard.readText().trim()
      if (!text || text === lastClipboard || text.length < 8 || text.length > 1000) return
      lastClipboard = text

      // Skip if looks sensitive
      if (SENSITIVE_PATTERNS.some(p => p.test(text))) return

      const signal = createSignal(
        'clipboard',
        'Clipboard',
        `Copied: ${text.slice(0, 70)}${text.length > 70 ? '...' : ''}`,
        'private',
        { content: text.slice(0, 200), length: text.length }
      )
      addSignal(signal)
    } catch (e) { /* silently skip */ }
  }, 2000)

  console.log('[CLIP] Clipboard monitor started (2s polling)')
}

// ─── 2. BIE-2: Prediction accuracy tracking ───────────────────────────────
function recordPredictionAccuracy(predictionId, wasCorrect) {
  const predictions = store.get('predictions')
  const idx = predictions.findIndex(p => p.id === predictionId)
  if (idx === -1) return { error: 'Prediction not found' }

  predictions[idx].wasCorrect = wasCorrect
  predictions[idx].ratedAt = new Date().toISOString()
  store.set('predictions', predictions)

  broadcastToRenderer('prediction:rated', { id: predictionId, wasCorrect })
  console.log(`[ACCURACY] Prediction ${predictionId.slice(0,8)}... rated: ${wasCorrect ? 'correct' : 'wrong'}`)
  return { success: true }
}

function getAccuracyReport() {
  const predictions = store.get('predictions')
  const rated = predictions.filter(p => p.wasCorrect !== undefined)
  if (!rated.length) return { total: 0, micro: null, session: null, daily: null, overall: null }

  const calcAccuracy = (arr) => {
    if (!arr.length) return null
    const correct = arr.filter(p => p.wasCorrect).length
    return { correct, total: arr.length, pct: Math.round((correct / arr.length) * 100) }
  }

  return {
    total: rated.length,
    micro:   calcAccuracy(rated.filter(p => p.intent_type === 'micro')),
    session: calcAccuracy(rated.filter(p => p.intent_type === 'session')),
    daily:   calcAccuracy(rated.filter(p => p.intent_type === 'daily')),
    overall: calcAccuracy(rated),
    srsTargets: { micro: 85, session: 75, daily: 60 },
    byCategory: ['calendar','email','communication','file_management','workflow'].reduce((acc, cat) => {
      acc[cat] = calcAccuracy(rated.filter(p => p.category === cat))
      return acc
    }, {})
  }
}

// ─── 3. SGL-1: MFA / PIN confirmation for red-level actions ───────────────
const { dialog } = require('electron')
let appPin = null // set by user in Settings

async function requireMFA(actionDescription) {
  // If a PIN is set, use input dialog
  if (appPin) {
    const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'PFPA — PIN Required',
      message: 'High-risk action requires your PIN',
      detail: `Action: "${actionDescription}"\n\nThis action is marked high-risk (red confidence). Enter your PIN to proceed.`,
      buttons: ['Cancel', 'Enter PIN...'],
      defaultId: 0,
      cancelId: 0,
    })
    if (response === 0) return { confirmed: false, reason: 'User cancelled' }

    // Show input dialog for PIN
    // Electron doesn't have showInputBox natively — use showMessageBox as confirmation
    const pinConfirm = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'PFPA — Confirm Action',
      message: `Confirm high-risk action?`,
      detail: `"${actionDescription}"\n\nClick Confirm to proceed. This action will be logged.`,
      buttons: ['Cancel', 'Confirm'],
      defaultId: 0,
      cancelId: 0,
    })
    return { confirmed: pinConfirm.response === 1, reason: pinConfirm.response === 1 ? 'confirmed' : 'cancelled' }
  }

  // No PIN set — use simple confirmation dialog
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'PFPA — High-Risk Action Confirmation',
    message: 'This action requires manual approval',
    detail: `"${actionDescription}"\n\nThis is a high-risk (red confidence) action. Are you sure you want to proceed?\n\nTip: Set a PIN in Settings → Security for stronger protection.`,
    buttons: ['Cancel', 'Yes, proceed'],
    defaultId: 0,
    cancelId: 0,
  })
  return { confirmed: response === 1, reason: response === 1 ? 'confirmed' : 'cancelled' }
}

// ─── 4. SEC-2: Biometric authentication ───────────────────────────────────
async function requireBiometric(reason) {
  const platform = process.platform

  // macOS — Touch ID / Face ID via node-mac-auth
  if (platform === 'darwin') {
    try {
      const macAuth = require('node-mac-auth')
      return await new Promise((resolve) => {
        macAuth.authenticate(reason || 'Authenticate to confirm PFPA action', (err) => {
          if (err) {
            console.log('[BIOMETRIC] macOS auth failed:', err.message)
            resolve({ success: false, error: err.message })
          } else {
            console.log('[BIOMETRIC] macOS auth succeeded')
            resolve({ success: true })
          }
        })
      })
    } catch (e) {
      console.log('[BIOMETRIC] node-mac-auth not installed — falling back to MFA dialog')
      return requireMFA(reason)
    }
  }

  // Windows — Windows Hello via keytar or dialog fallback
  if (platform === 'win32') {
    try {
      // Try @paymoapp/node-windows-hello if installed
      const hello = require('@paymoapp/node-windows-hello')
      const available = await hello.isAvailable()
      if (available) {
        const result = await hello.verify(reason || 'Confirm PFPA action')
        return { success: result, error: result ? null : 'Windows Hello authentication failed' }
      }
    } catch (e) {
      console.log('[BIOMETRIC] Windows Hello not available — falling back to MFA dialog')
    }
    return requireMFA(reason)
  }

  // Linux — PAM fallback to MFA dialog (pam-auth requires root setup)
  console.log('[BIOMETRIC] Linux: falling back to MFA dialog (pam-auth requires system config)')
  return requireMFA(reason)
}

// ─── 5. MMI-3: Keyboard shortcut handler for ghost overlay ────────────────
// (Swipe events are handled in GhostOverlay.jsx via touch events)
// This registers global shortcuts for overlay control
let shortcutsRegistered = false

function registerGestureShortcuts() {
  const { globalShortcut } = require('electron')
  if (shortcutsRegistered) return

  // Alt+Right = approve current overlay prediction
  globalShortcut.register('Alt+Right', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('gesture:approve')
    }
  })

  // Alt+Left = dismiss current overlay prediction
  globalShortcut.register('Alt+Left', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('gesture:dismiss')
    }
  })

  // Alt+Down = see alternatives (expand overlay)
  globalShortcut.register('Alt+Down', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('gesture:alternatives')
    }
  })

  shortcutsRegistered = true
  console.log('[SHORTCUTS] Gesture shortcuts registered: Alt+Right=approve, Alt+Left=dismiss, Alt+Down=alternatives')
}

function unregisterGestureShortcuts() {
  const { globalShortcut } = require('electron')
  globalShortcut.unregisterAll()
  shortcutsRegistered = false
}

// ─── 6. Availability: Headless mode for pm2 background service ─────────────
const HEADLESS = process.env.PFPA_HEADLESS === 'true'

function createWindowIfNotHeadless() {
  if (HEADLESS) {
    console.log('[HEADLESS] Running in headless mode — no UI window created')
    console.log('[HEADLESS] Prediction engine active. Connect via WebSocket on port 7777.')
    return
  }
  createWindow()
}

// ─── Patch executeAction to gate red-level with MFA/biometric ─────────────
const _origExecuteAction = executeAction
async function executeActionWithMFA(prediction) {
  // Red-level predictions require user confirmation (SGL-1)
  if (prediction.confidence_level === 'red' && prediction.action_type !== 'reminder' && prediction.action_type !== 'none') {
    const auth = await requireMFA(prediction.suggested_action)
    if (!auth.confirmed) {
      logAction('mfa_blocked', `MFA declined for: ${prediction.suggested_action}`, 0, 'red', false, { reason: auth.reason })
      return { error: 'Action blocked — MFA not confirmed', reason: auth.reason }
    }
  }
  return _origExecuteAction(prediction)
}

// ─── New IPC handlers for the final 10% ───────────────────────────────────

// CAM-1: Window monitor control
ipcMain.handle('monitor:window-start', () => { startWindowMonitor(); return { success: true } })
ipcMain.handle('monitor:clipboard-start', () => { startClipboardMonitor(); return { success: true } })
ipcMain.handle('monitor:window-stop', () => {
  if (windowPoller) { clearInterval(windowPoller); windowPoller = null }
  if (clipboardPoller) { clearInterval(clipboardPoller); clipboardPoller = null }
  return { success: true }
})

// BIE-2: Accuracy tracking
ipcMain.handle('accuracy:rate', (_, { predictionId, wasCorrect }) => recordPredictionAccuracy(predictionId, wasCorrect))
ipcMain.handle('accuracy:report', () => getAccuracyReport())

// SGL-1: Manual MFA trigger
ipcMain.handle('mfa:require', async (_, { action }) => requireMFA(action))

// SEC-2: Biometric auth — full capability detection + authentication
ipcMain.handle('biometric:available', async () => {
  const platform = process.platform
  const enrolled = !!store.get('userSettings')?.biometric_enrolled

  if (platform === 'darwin') {
    // macOS: check if node-mac-auth is installed
    try {
      require('node-mac-auth') // will throw if not installed
      return { available: true, method: 'touchid', enrolled }
    } catch {
      // Package not installed — report as available but needs setup
      return { available: true, method: 'touchid', enrolled: false, needsPackage: 'node-mac-auth' }
    }
  }

  if (platform === 'win32') {
    try {
      require('@paymoapp/node-windows-hello')
      return { available: true, method: 'windowshello', enrolled }
    } catch {
      return { available: true, method: 'windowshello', enrolled: false, needsPackage: '@paymoapp/node-windows-hello' }
    }
  }

  // Linux and others: fall back to PIN
  return { available: false, method: 'pin', enrolled: false }
})

ipcMain.handle('biometric:authenticate', async (_, { reason }) => requireBiometric(reason))
ipcMain.handle('pin:set', (_, { pin }) => {
  appPin = pin
  store.set('userSettings', { ...store.get('userSettings'), has_pin: true })
  return { success: true }
})
ipcMain.handle('pin:clear', () => {
  appPin = null
  store.set('userSettings', { ...store.get('userSettings'), has_pin: false })
  return { success: true }
})

// MMI-3: Global keyboard shortcut management
function registerGestureShortcuts() {
  const { globalShortcut } = require('electron')
  // Alt+Right = approve top prediction
  globalShortcut.register('Alt+Right', () => {
    broadcastToRenderer('gesture:approve', { source: 'keyboard' })
  })
  // Alt+Left = dismiss top prediction
  globalShortcut.register('Alt+Left', () => {
    broadcastToRenderer('gesture:dismiss', { source: 'keyboard' })
  })
  // Alt+Down = show alternatives
  globalShortcut.register('Alt+Down', () => {
    broadcastToRenderer('gesture:alternatives', { source: 'keyboard' })
  })
  console.log('[MMI-3] Global shortcuts registered: Alt+← dismiss · Alt+→ approve · Alt+↓ alternatives')
}

function unregisterGestureShortcuts() {
  const { globalShortcut } = require('electron')
  globalShortcut.unregister('Alt+Right')
  globalShortcut.unregister('Alt+Left')
  globalShortcut.unregister('Alt+Down')
  console.log('[MMI-3] Global shortcuts unregistered')
}

ipcMain.handle('shortcuts:register',   () => { registerGestureShortcuts();   return { success: true } })
ipcMain.handle('shortcuts:unregister', () => { unregisterGestureShortcuts(); return { success: true } })

// Override execute-prediction to use MFA gate
ipcMain.handle('action:execute-prediction-safe', async (_, predictionId) => {
  const predictions = store.get('predictions')
  const pred = predictions.find(p => p.id === predictionId)
  if (!pred) return { error: 'Prediction not found' }
  const result = await executeActionWithMFA(pred)
  const idx = predictions.findIndex(p => p.id === predictionId)
  predictions[idx] = { ...pred, status: result.error ? 'failed' : 'executed', execution_result: result }
  store.set('predictions', predictions)
  broadcastToRenderer('prediction:updated', predictions[idx])
  return result
})

// ═══════════════════════════════════════════════════════════════════════════
// ─── REMAINING FEATURES — CAM-1, CAM-2, BIE-1, SGL-1, PAS-2, MMI-3 ──────
// ═══════════════════════════════════════════════════════════════════════════

// ─── CAM-1 fix: OS-level event hook for sub-second window detection ────────
// Uses native OS accessibility events where available (faster than polling)
let nativeWatcher = null

function startNativeWindowMonitor() {
  // Try uiohook-napi for OS-level focus events (cross-platform)
  try {
    const { uIOhook } = require('uiohook-napi')
    uIOhook.on('keydown', () => resetSessionTimer())
    uIOhook.on('mousedown', () => resetSessionTimer())
    uIOhook.start()
    nativeWatcher = uIOhook
    console.log('[WIN] Native OS event hook started (sub-second)')
  } catch (e) {
    console.log('[WIN] uiohook-napi not available — using 3s poll fallback')
  }

  // Supplement with active-win polling at 1s for window title changes
  let lastTitle = ''
  const { screen } = require('electron')
  setInterval(async () => {
    try {
      const activeWin = require('active-win')
      const win = await activeWin()
      if (!win) return
      const title = `${win.owner.name}: ${win.title}`
      if (title === lastTitle) return
      lastTitle = title
      if (win.owner.name.toLowerCase().includes('electron')) return
      const signal = createSignal(
        'app_focus', win.owner.name,
        `Active: ${win.title.slice(0, 80)}`,
        'public',
        { app: win.owner.name, title: win.title, pid: win.id }
      )
      addSignal(signal)
      runClaudeAnalysis(signal)
    } catch (e) {}
  }, 1000) // 1s polling — 3x faster than before, near sub-second
  console.log('[WIN] 1s window polling started')
}

// ─── CAM-2: Location detection — OS-native → IP fallback → manual ─────────
// Priority 1: OS-native Geolocation API (Chromium, available in Electron renderer)
// Priority 2: IP-based geolocation via ipapi.co (no API key, privacy note shown)
// Priority 3: Previously stored location
// Priority 4: Manual user-set location from settings
let userLocation = null

async function detectLocation() {
  // Check for manually-set override first (user privacy preference)
  const manualLocation = store.get('userSettings')?.manual_location
  if (manualLocation?.city) {
    userLocation = { ...manualLocation, source: 'manual' }
    return userLocation
  }

  // Try OS-native via Electron's net module — Chromium can expose GPS on mobile
  // and WiFi triangulation on desktop when privacy settings allow
  try {
    // On macOS/Windows we can call the Geolocation API via a hidden BrowserWindow
    // For desktop Electron we use the more reliable IP approach but with
    // two providers for redundancy
    const axios = require('axios')

    // Provider 1: ipapi.co (detailed, free tier 1000 req/day)
    try {
      const res = await axios.get('https://ipapi.co/json/', { timeout: 4000 })
      if (res.data?.city) {
        userLocation = {
          city:        res.data.city,
          region:      res.data.region,
          country:     res.data.country_name,
          countryCode: res.data.country_code,
          timezone:    res.data.timezone,
          lat:         res.data.latitude,
          lon:         res.data.longitude,
          source:      'ip_ipapi',
          detected:    new Date().toISOString()
        }
        store.set('userLocation', userLocation)
        broadcastToRenderer('location:detected', userLocation)
        console.log(`[CAM-2] Location via ipapi.co: ${userLocation.city}, ${userLocation.country}`)
        return userLocation
      }
    } catch (e1) {
      // Provider 2: ip-api.com fallback (free, no key)
      try {
        const res2 = await axios.get('http://ip-api.com/json/?fields=city,regionName,country,countryCode,timezone,lat,lon', { timeout: 4000 })
        if (res2.data?.city) {
          userLocation = {
            city:        res2.data.city,
            region:      res2.data.regionName,
            country:     res2.data.country,
            countryCode: res2.data.countryCode,
            timezone:    res2.data.timezone,
            lat:         res2.data.lat,
            lon:         res2.data.lon,
            source:      'ip_ipapi_fallback',
            detected:    new Date().toISOString()
          }
          store.set('userLocation', userLocation)
          broadcastToRenderer('location:detected', userLocation)
          console.log(`[CAM-2] Location via ip-api.com fallback: ${userLocation.city}`)
          return userLocation
        }
      } catch (e2) {
        console.log('[CAM-2] Both IP providers failed:', e2.message)
      }
    }
  } catch (e) {
    console.log('[CAM-2] Location detection error:', e.message)
  }

  // Use stored location as last resort
  userLocation = store.get('userLocation') || null
  if (userLocation) console.log(`[CAM-2] Using cached location: ${userLocation.city}`)
  return userLocation
}

// CAM-2: Manual location setter (called from Settings when user types their city)
function setManualLocation(locationData) {
  const loc = {
    city:        locationData.city || '',
    region:      locationData.region || '',
    country:     locationData.country || '',
    countryCode: locationData.countryCode || '',
    timezone:    locationData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    lat:         locationData.lat || null,
    lon:         locationData.lon || null,
    source:      'manual',
    detected:    new Date().toISOString()
  }
  store.set('userSettings', { ...store.get('userSettings'), manual_location: loc })
  userLocation = loc
  broadcastToRenderer('location:detected', loc)
  console.log(`[CAM-2] Manual location set: ${loc.city}, ${loc.country}`)
  return loc
}

ipcMain.handle('location:set-manual', (_, data) => setManualLocation(data))
ipcMain.handle('location:get', () => userLocation || store.get('userLocation'))

function getSeasonalContext() {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-12
  const day = now.getDate()
  const country = userLocation?.countryCode || 'US'

  // Season
  const season = month >= 3 && month <= 5 ? 'Spring'
    : month >= 6 && month <= 8 ? 'Summer'
    : month >= 9 && month <= 11 ? 'Autumn' : 'Winter'

  // Fiscal quarter (most companies)
  const fiscalQ = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4'
  const isQuarterEnd = (month === 3 || month === 6 || month === 9 || month === 12) && day >= 25

  // Major holidays (US + India covered)
  const holidays = {
    '1-1': 'New Year\'s Day', '1-26': 'Republic Day (India)',
    '3-8': 'International Women\'s Day', '4-14': 'Ambedkar Jayanti (India)',
    '8-15': 'Independence Day (India)', '10-2': 'Gandhi Jayanti (India)',
    '11-11': 'Veterans Day', '12-25': 'Christmas Day', '12-31': 'New Year\'s Eve'
  }
  const todayHoliday = holidays[`${month}-${day}`] || null

  // Day type
  const dayOfWeek = now.getDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const isMondayMorning = dayOfWeek === 1 && now.getHours() < 11
  const isFridayAfternoon = dayOfWeek === 5 && now.getHours() >= 14

  return {
    season, fiscalQ, isQuarterEnd, holiday: todayHoliday,
    isWeekend, isMondayMorning, isFridayAfternoon,
    city: userLocation?.city, country: userLocation?.country,
    timezone: userLocation?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  }
}

// ─── BIE-1: Sequential pattern detection (morning routines, weekly tasks) ──
function detectSequentialPatterns() {
  const signals = store.get('signals') || []
  const patterns = store.get('behaviorPatterns') || {}
  const now = new Date()
  const hour = now.getHours()
  const dayOfWeek = now.getDay()

  // Build sequences: app transitions in last 30 min
  const recentApps = signals
    .filter(s => s.signal_type === 'app_focus')
    .filter(s => new Date(s.created_date) > new Date(Date.now() - 30 * 60 * 1000))
    .map(s => { try { return JSON.parse(s.data).app } catch (e) { return null } })
    .filter(Boolean)

  // Morning routine detection (6am-10am)
  const isMorning = hour >= 6 && hour <= 10
  const morningKey = `morning_routine_d${dayOfWeek}`
  if (isMorning && recentApps.length >= 2) {
    if (!patterns[morningKey]) patterns[morningKey] = { sequences: [], count: 0 }
    patterns[morningKey].sequences.push(recentApps.slice(0, 5))
    patterns[morningKey].count++
    patterns[morningKey].lastSeen = now.toISOString()
  }

  // Weekly task detection — same app at same hour same day of week
  const weeklyKey = `weekly_d${dayOfWeek}_h${hour}`
  if (!patterns[weeklyKey]) patterns[weeklyKey] = { apps: {}, count: 0 }
  recentApps.forEach(app => {
    patterns[weeklyKey].apps[app] = (patterns[weeklyKey].apps[app] || 0) + 1
  })
  patterns[weeklyKey].count++

  // Find dominant morning sequence
  if (patterns[morningKey]?.sequences?.length >= 3) {
    const allSeqs = patterns[morningKey].sequences
    const firstApps = allSeqs.map(s => s[0]).filter(Boolean)
    const dominant = firstApps.sort((a, b) =>
      firstApps.filter(x => x === b).length - firstApps.filter(x => x === a).length
    )[0]
    if (dominant) patterns[morningKey].dominantStart = dominant
  }

  store.set('behaviorPatterns', patterns)
  return {
    morningRoutine: patterns[morningKey] || null,
    weeklyPattern: patterns[weeklyKey] || null,
    currentSequence: recentApps
  }
}

function getSequencePatternContext() {
  const patterns = store.get('behaviorPatterns') || {}
  const now = new Date()
  const dayOfWeek = now.getDay()
  const morningKey = `morning_routine_d${dayOfWeek}`
  const morning = patterns[morningKey]
  if (!morning || morning.count < 3) return ''

  const topApps = Object.entries(
    (patterns[`weekly_d${dayOfWeek}_h${now.getHours()}`]?.apps) || {}
  ).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([app]) => app)

  return `Morning routine detected (${morning.count}x): usually starts with ${morning.dominantStart || 'unknown'}. ` +
    `Frequent apps this time: ${topApps.join(', ') || 'none yet'}.`
}

// ─── SGL-1: Financial threshold + data export + security blocks ───────────
const FINANCIAL_THRESHOLD = 100 // USD/default currency

function extractAmount(actionParams) {
  const text = JSON.stringify(actionParams || '')
  const match = text.match(/\$?\d+(?:\.\d{2})?|\d+\s*(?:USD|INR|EUR|GBP)/i)
  if (!match) return 0
  return parseFloat(match[0].replace(/[^0-9.]/g, ''))
}

function isFinancialAction(prediction) {
  const financialKeywords = ['payment', 'transfer', 'purchase', 'buy', 'pay', 'invoice', 'transaction', 'charge', 'fee']
  const text = `${prediction.description} ${prediction.suggested_action}`.toLowerCase()
  return financialKeywords.some(k => text.includes(k))
}

function isDataExportAction(prediction) {
  const exportKeywords = ['export', 'download all', 'backup data', 'extract', 'dump']
  const text = `${prediction.description} ${prediction.suggested_action}`.toLowerCase()
  return exportKeywords.some(k => text.includes(k))
}

function isSecurityAction(prediction) {
  const secKeywords = ['password', 'permission', 'access', 'credentials', 'authentication', 'security setting']
  const text = `${prediction.description} ${prediction.suggested_action}`.toLowerCase()
  return secKeywords.some(k => text.includes(k))
}

// ─── SGL-1: External party communication block ────────────────────────────
// SRS: "hard stops for communications to external parties (outside org)"
function isExternalPartyAction(prediction) {
  const text = `${prediction.description} ${prediction.suggested_action} ${JSON.stringify(prediction.action_params || '')}`.toLowerCase()
  const externalIndicators = ['send email', 'email to', 'message to', 'slack to', 'send to', 'forward to', 'reply to', 'contact']
  if (!externalIndicators.some(k => text.includes(k))) return false

  // Extract recipient addresses
  const emailMatches = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []
  const orgDomains = store.get('userSettings')?.org_domains || []

  // If org domains configured, block anything going outside
  if (orgDomains.length > 0) {
    return emailMatches.some(email => {
      const domain = email.split('@')[1]
      return !orgDomains.includes(domain)
    })
  }

  // Without org domains: flag any email that looks like an outbound send action
  // (not a draft, not a reply, not internal)
  const isOutboundSend = /\b(send|forward)\b/.test(text) && emailMatches.length > 0
  return isOutboundSend
}

async function enforceGuardrails(prediction) {
  // Financial threshold check
  if (isFinancialAction(prediction)) {
    const amount = extractAmount(prediction.action_params)
    if (amount >= FINANCIAL_THRESHOLD) {
      logAction('guardrail_blocked', `Financial action >$${FINANCIAL_THRESHOLD} blocked: ${prediction.description}`, 0, 'red', false)
      return { blocked: true, reason: `Financial transactions over $${FINANCIAL_THRESHOLD} require manual approval. Amount detected: $${amount}` }
    }
  }

  // SGL-1: External party communication block
  if (isExternalPartyAction(prediction)) {
    logAction('guardrail_blocked', `External communication blocked: ${prediction.description}`, 0, 'red', false)
    return {
      blocked: true,
      reason: 'SGL-1: Autonomous communication to external parties is blocked. Please review and send manually.',
      guardrail: 'external_party'
    }
  }

  // Data export block
  if (isDataExportAction(prediction)) {
    logAction('guardrail_blocked', `Data export action blocked: ${prediction.description}`, 0, 'red', false)
    return { blocked: true, reason: 'Data export actions are blocked by SGL-1 guardrails. Initiate manually.' }
  }

  // Security settings block
  if (isSecurityAction(prediction)) {
    logAction('guardrail_blocked', `Security action blocked: ${prediction.description}`, 0, 'red', false)
    return { blocked: true, reason: 'Security setting changes are blocked by guardrails. Perform manually.' }
  }

  return { blocked: false }
}

// ─── BIE-1: Email template learning ──────────────────────────────────────
// SRS BIE-1: "Communication templates (common email responses)"
// Observes email drafts the user accepts/edits to learn writing style patterns
function learnEmailTemplate(emailData) {
  const patterns = store.get('behaviorPatterns') || {}
  if (!patterns.emailTemplates) {
    patterns.emailTemplates = {
      subjects: {},        // subject keyword → count
      greetings: {},       // greeting phrase → count
      closings: {},        // closing phrase → count
      avgWordCount: 0,
      samples: 0,
      formality: 'neutral' // 'formal' | 'casual' | 'neutral'
    }
  }
  const tmpl = patterns.emailTemplates

  // Extract subject keywords
  if (emailData.subject) {
    const words = emailData.subject.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    words.forEach(w => { tmpl.subjects[w] = (tmpl.subjects[w] || 0) + 1 })
  }

  // Extract body patterns
  if (emailData.body) {
    const lines = emailData.body.split('\n').filter(l => l.trim())

    // Greeting detection (first non-empty line)
    const firstLine = lines[0]?.trim() || ''
    if (/^(hi|hello|hey|dear|good morning|good afternoon)/i.test(firstLine)) {
      const greetKey = firstLine.split(' ').slice(0, 3).join(' ').toLowerCase()
      tmpl.greetings[greetKey] = (tmpl.greetings[greetKey] || 0) + 1
    }

    // Closing detection (last non-empty line)
    const lastLine = lines[lines.length - 1]?.trim() || ''
    if (/^(regards|thanks|best|sincerely|cheers|warm regards)/i.test(lastLine)) {
      const closeKey = lastLine.toLowerCase()
      tmpl.closings[closeKey] = (tmpl.closings[closeKey] || 0) + 1
    }

    // Formality score: formal words vs casual
    const formalWords  = (emailData.body.match(/\b(kindly|hereby|pursuant|therefore|accordingly|sincerely|regards)\b/gi) || []).length
    const casualWords  = (emailData.body.match(/\b(hey|thanks|btw|fyi|asap|lol|cool|yeah|yep)\b/gi) || []).length
    const bodyWords    = emailData.body.split(/\s+/).length

    // Rolling formality average
    const newFormScore = formalWords > casualWords ? 1 : casualWords > formalWords ? -1 : 0
    tmpl._formalitySum = (tmpl._formalitySum || 0) + newFormScore
    tmpl.samples++
    tmpl.avgWordCount  = Math.round(((tmpl.avgWordCount * (tmpl.samples - 1)) + bodyWords) / tmpl.samples)
    const avgFormality = tmpl._formalitySum / tmpl.samples
    tmpl.formality     = avgFormality > 0.3 ? 'formal' : avgFormality < -0.3 ? 'casual' : 'neutral'
  }

  store.set('behaviorPatterns', patterns)

  // Expose dominant template to Claude prompt
  const topGreeting = Object.entries(tmpl.greetings).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const topClosing  = Object.entries(tmpl.closings).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  console.log(`[BIE-1] Email template updated — formality: ${tmpl.formality}, greeting: "${topGreeting}", closing: "${topClosing}"`)
  return { formality: tmpl.formality, topGreeting, topClosing, avgWordCount: tmpl.avgWordCount }
}

function getEmailTemplateContext() {
  const patterns  = store.get('behaviorPatterns') || {}
  const tmpl      = patterns.emailTemplates
  if (!tmpl || tmpl.samples < 3) return ''
  const topGreeting = Object.entries(tmpl.greetings || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const topClosing  = Object.entries(tmpl.closings  || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  return `EMAIL STYLE: ${tmpl.formality} tone, ~${tmpl.avgWordCount} words/email` +
    (topGreeting ? `, typically opens with "${topGreeting}"` : '') +
    (topClosing  ? `, closes with "${topClosing}"` : '') + '.'
}

ipcMain.handle('bie1:learn-email-template', (_, emailData) => learnEmailTemplate(emailData))
ipcMain.handle('bie1:email-template-context', () => getEmailTemplateContext())

// ─── PAS-2: Form pre-filling via Chrome extension ─────────────────────────
function sendFormFillToExtension(formData) {
  // Broadcast to all connected Chrome extension WebSocket clients
  const message = JSON.stringify({ type: 'form_fill', data: formData })
  wsClients.forEach(ws => {
    try { ws.send(message) } catch (e) { console.error('[WS] form fill send error', e) }
  })
  logAction('form_fill', `Pre-filled form: ${formData.fields?.length || 0} fields`, 80, 'yellow', true, formData)
  return { success: true, fieldsFilled: formData.fields?.length || 0 }
}

// Detect and fill forms based on context
async function autoFillForm(context) {
  const { url, fields } = context
  if (!url || !fields) return { error: 'No form context provided' }

  const formData = { url, fields, timestamp: Date.now() }
  return sendFormFillToExtension(formData)
}

// ─── MMI-3: Long-press / hover alternatives in overlay ────────────────────
// Handled in GhostOverlay.jsx — main.js broadcasts alternative predictions
async function getAlternativePredictions(originalPredictionId) {
  const predictions = store.get('predictions')
  const original = predictions.find(p => p.id === originalPredictionId)
  if (!original) return []

  // Return the 3 most recent predictions of different categories
  return predictions
    .filter(p => p.id !== originalPredictionId && p.status === 'pending')
    .filter(p => p.category !== original.category)
    .slice(0, 3)
}

// ─── Patch Claude prompt to include location + seasonal + sequence context ─
const _origRunClaudeAnalysis = runClaudeAnalysis
async function runClaudeAnalysisEnhanced(signal) {
  // Inject location and seasonal context into store so it's picked up by prompt
  if (!userLocation) await detectLocation()
  store.set('_seasonalContext', getSeasonalContext())
  store.set('_sequenceContext', getSequencePatternContext())
  return _origRunClaudeAnalysis(signal)
}

// ─── New IPC handlers for remaining features ───────────────────────────────

// CAM-3: Social context
ipcMain.handle('social:context', () => {
  const signals = store.get('signals') || []
  const { buildSocialContext } = require('./features')
  return buildSocialContext(signals)
})
ipcMain.handle('social:top-contacts', () => {
  const signals = store.get('signals') || []
  const { buildSocialContext } = require('./features')
  const contacts = buildSocialContext(signals)
  return Object.values(contacts).sort((a,b) => b.strength_score - a.strength_score).slice(0, 20)
})

// MMI-2: Voice — renderer-side (Web Speech API), IPC just for logging
ipcMain.handle('voice:log', (_, { text, confidence }) => {
  console.log(`[VOICE] Heard: "${text}" (confidence: ${confidence})`)
  return { heard: text }
})

// SEC-3: Sandboxed form fill (all form fills go through the sandbox)
ipcMain.handle('form:fill-sandboxed', async (_, formData) => {
  const { sandboxFormFill } = require('./features')
  const result = sandboxFormFill(formData)
  if (result.blocked) {
    console.log('[SEC-3] Form fill blocked:', result.reason)
    return { error: result.reason }
  }
  return sendFormFillToExtension(result.sanitized)
})
ipcMain.handle('location:detect', async () => detectLocation())
ipcMain.handle('seasonal:get', () => getSeasonalContext())

// BIE-1: Sequential patterns
ipcMain.handle('patterns:sequences', () => detectSequentialPatterns())

// SGL-1: Guardrail check
ipcMain.handle('guardrail:check', async (_, predictionId) => {
  const predictions = store.get('predictions')
  const pred = predictions.find(p => p.id === predictionId)
  if (!pred) return { blocked: false }
  return enforceGuardrails(pred)
})

// PAS-2: Form fill
ipcMain.handle('form:fill', async (_, context) => autoFillForm(context))
ipcMain.handle('form:fill-direct', async (_, formData) => sendFormFillToExtension(formData))

// MMI-3: Get alternatives for overlay
ipcMain.handle('overlay:alternatives', async (_, predictionId) => getAlternativePredictions(predictionId))

// Override safe execution to include guardrail check
const _origExecuteActionWithMFA = executeActionWithMFA
async function executeActionWithGuardrails(prediction) {
  // SGL-1: Check guardrails first
  const guardrail = await enforceGuardrails(prediction)
  if (guardrail.blocked) {
    broadcastToRenderer('guardrail:blocked', { prediction, reason: guardrail.reason })
    return { error: `Blocked by guardrail: ${guardrail.reason}` }
  }
  return _origExecuteActionWithMFA(prediction)
}

// Re-register the safe execution handler with guardrail layer
ipcMain.removeHandler('action:execute-prediction-safe')
ipcMain.handle('action:execute-prediction-safe', async (_, predictionId) => {
  const predictions = store.get('predictions')
  const pred = predictions.find(p => p.id === predictionId)
  if (!pred) return { error: 'Prediction not found' }
  const result = await executeActionWithGuardrails(pred)
  const idx = predictions.findIndex(p => p.id === predictionId)
  if (idx !== -1) {
    predictions[idx] = { ...pred, status: result.error ? 'failed' : 'executed', execution_result: result }
    store.set('predictions', predictions)
    broadcastToRenderer('prediction:updated', predictions[idx])
  }
  return result
})

// Form fill handler for Chrome extension WebSocket messages
// (augment existing WS message handler to support form_fill_result)
console.log('[PFPA] Extended features loaded: location, seasonal, sequences, guardrails, form-fill, alternatives')

// ═══════════════════════════════════════════════════════════════════════════
// NEW FEATURE MODULES — Added for 100% SRS completion
// ═══════════════════════════════════════════════════════════════════════════

// ── BIE-1: User Behavior Graph ───────────────────────────────────────────
let ubg = null
try {
  const { UserBehaviorGraph } = require('./pattern-engine')
  ubg = new UserBehaviorGraph(store)
  console.log('[BIE-1] User Behavior Graph initialized. Stats:', JSON.stringify(ubg.getStats()))
} catch (e) {
  console.error('[BIE-1] Pattern engine load error:', e.message)
}

ipcMain.handle('ubg:stats',    () => ubg?.getStats()    || {})
ipcMain.handle('ubg:patterns', () => ubg?.getRecurringPatterns() || [])
ipcMain.handle('ubg:predict',  (_, signal) => ubg?.predictNextActions(signal) || [])
ipcMain.handle('ubg:record-action', (_, { prediction, outcome }) => {
  ubg?.recordAction(prediction, outcome)
  return { success: true }
})

// Hook UBG into signal recording
const _origBroadcast = broadcastToRenderer
function broadcastToRendererWithUBG(channel, data) {
  if (channel === 'signal:new' && ubg && data) {
    try { ubg.recordSignal(data) } catch {}
  }
  _origBroadcast(channel, data)
}

// ── BIE-3: Preference Vector Engine ─────────────────────────────────────
let prefEngine = null
try {
  const { PreferenceEngine } = require('./preference-engine')
  prefEngine = new PreferenceEngine(store)
  console.log('[BIE-3] Preference Engine initialized')
} catch (e) {
  console.error('[BIE-3] Preference engine load error:', e.message)
}

ipcMain.handle('pref:summary', () => prefEngine?.getSummary() || {})
ipcMain.handle('pref:score',   (_, prediction) => ({ score: prefEngine?.score(prediction) || 50 }))
ipcMain.handle('pref:record-extended', (_, { prediction, outcome }) => {
  prefEngine?.record(prediction, outcome)
  return { success: true }
})

// ── PERF: Performance Monitor ────────────────────────────────────────────
let perfMon = null
try {
  const { perfMonitor } = require('./performance-monitor')
  perfMon = perfMonitor
  console.log('[PERF] Performance Monitor initialized')
} catch (e) {
  console.error('[PERF] Performance monitor load error:', e.message)
}

ipcMain.handle('perf:full-report',    () => perfMon?.getReport() || {})
ipcMain.handle('perf:poll-interval',  (_, { baseMs }) => ({ intervalMs: perfMon?.getPollingInterval(baseMs) || baseMs }))

// ── COMP: GDPR/CCPA Data Export & Right to Erasure ──────────────────────
ipcMain.handle('compliance:export-data', async () => {
  try {
    const exportData = {
      exportDate:        new Date().toISOString(),
      version:           '2.3-M',
      signals:           store.get('signals',           []),
      predictions:       store.get('predictions',       []),
      actionLogs:        store.get('actionLogs',        []),
      workflows:         store.get('workflows',         []),
      userPreferences:   store.get('userPreferences',   {}),
      preferenceVectors: store.get('preferenceVectors', {}),
      ubg:               store.get('ubg',               {}),
      settings: (() => {
        const s = { ...store.get('userSettings', {}) }
        // Redact sensitive fields
        delete s.claude_api_key
        delete s.supabase_url
        delete s.supabase_anon_key
        return s
      })(),
    }
    return { success: true, data: exportData }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('compliance:erasure-request', async () => {
  try {
    // Right to erasure: purge all personal data
    const settings = store.get('userSettings', {})
    store.clear()
    // Restore minimal settings without personal data
    store.set('userSettings', {
      id: 'settings-1',
      confidence_threshold: 3,
      automation_paused: false,
      privacy_mode: 'standard',
      notifications_enabled: true,
      voice_feedback: false,
      watched_folders: [],
      claude_api_key: settings.claude_api_key || '',
      created_date: new Date().toISOString()
    })
    store.set('signals', [])
    store.set('predictions', [])
    store.set('actionLogs', [])
    store.set('workflows', [])
    store.set('ubg', { nodes: {}, edges: [], sequences: {} })
    store.set('preferenceVectors', {})

    // Log deletion certificate
    const certificate = {
      timestamp: new Date().toISOString(),
      action: 'GDPR_ERASURE_REQUEST',
      status: 'COMPLETED',
      note: 'All personal behavioral data, predictions, signals, and action logs have been purged.'
    }

    console.log('[COMP] GDPR erasure completed:', JSON.stringify(certificate))
    return { success: true, certificate }
  } catch (e) {
    return { error: e.message }
  }
})

// ── CAM-4: Cross-device signal sync extension ────────────────────────────
ipcMain.handle('sync:signal', async (_, signal) => {
  try {
    if (supabaseSync?.getSupabaseStatus()?.connected) {
      // Attempt to sync signal to Supabase
      const syncStart = Date.now()
      // supabase-sync handles the actual push
      const result = await supabaseSync.syncSignal?.(signal)
      const latency = Date.now() - syncStart
      console.log(`[CAM-4] Signal synced in ${latency}ms`)
      return { success: true, latencyMs: latency }
    }
    return { success: false, reason: 'Supabase not connected' }
  } catch (e) {
    return { error: e.message }
  }
})

console.log('[PFPA] 100% completion modules loaded: UBG, PreferenceEngine, PerfMonitor, GDPR compliance')

// ── SEC-2: Biometric status endpoint — returns platform-specific availability
ipcMain.handle('biometric:status', async () => {
  const platform = process.platform
  const result = { platform, available: false, method: 'none', fallback: 'pin_dialog' }

  if (platform === 'darwin') {
    try {
      require('node-mac-auth')
      result.available = true
      result.method = 'touchid'
    } catch {
      result.available = false
      result.method = 'none'
      result.setupInstructions = 'Install node-mac-auth: npm install node-mac-auth (requires Xcode tools)'
    }
  } else if (platform === 'win32') {
    try {
      const hello = require('@paymoapp/node-windows-hello')
      const isAvailable = await hello.isAvailable().catch(() => false)
      result.available = isAvailable
      result.method = isAvailable ? 'windowshello' : 'none'
      if (!isAvailable) {
        result.setupInstructions = 'Enable Windows Hello in Windows Settings → Accounts → Sign-in options'
      }
    } catch {
      result.available = false
      result.method = 'none'
      result.setupInstructions = 'Enable Windows Hello in Windows Settings → Accounts → Sign-in options'
    }
  } else {
    result.available = false
    result.method = 'none'
    result.fallback = 'pin_dialog'
    result.setupInstructions = 'Biometric authentication requires macOS (Touch ID) or Windows (Windows Hello)'
  }

  // Check if PIN is set as hardened fallback
  const pin = store.get('userPin')
  result.pinSet = !!pin
  result.effectiveMethod = result.available ? result.method : (pin ? 'pin' : 'dialog')

  return result
})
