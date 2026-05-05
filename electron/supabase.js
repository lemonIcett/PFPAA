/**
 * supabase.js — Supabase integration for PFPA (replaces Firebase)
 * Handles: real-time cross-device sync, CAM-4 digital twin state
 */

let supabaseClient = null
let supabaseConfig = null
const subscriptions = []

async function initSupabase(config) {
  try {
    // config = { url: 'https://xxx.supabase.co', anonKey: 'eyJ...' }
    if (!config?.url || !config?.anonKey) return { error: 'Missing url or anonKey' }

    const { createClient } = require('@supabase/supabase-js')
    supabaseClient = createClient(config.url, config.anonKey, {
      realtime: { params: { eventsPerSecond: 10 } }
    })

    // Verify connection with a quick ping
    const { error } = await supabaseClient.from('pfpa_sync').select('id').limit(1)
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = table doesn't exist yet — that's fine, we'll create it
      console.warn('[SUPABASE] Ping warning:', error.message)
    }

    supabaseConfig = config
    console.log('[SUPABASE] Connected to', config.url)
    return { success: true }
  } catch (e) {
    console.error('[SUPABASE] Init error:', e.message)
    return { error: e.message }
  }
}

async function syncToSupabase(table, data) {
  if (!supabaseClient) return
  try {
    const { error } = await supabaseClient
      .from(`pfpa_${table}`)
      .upsert({ ...data, synced_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) console.error(`[SUPABASE] sync error (${table}):`, error.message)
  } catch (e) {
    console.error('[SUPABASE] sync exception:', e.message)
  }
}

async function syncSettingsToSupabase(settings) {
  if (!supabaseClient) return
  try {
    const { error } = await supabaseClient
      .from('pfpa_settings')
      .upsert({ id: 'settings-1', ...settings, synced_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) console.error('[SUPABASE] settings sync error:', error.message)
  } catch (e) {
    console.error('[SUPABASE] settings sync exception:', e.message)
  }
}

async function syncRelationshipsToSupabase(graph) {
  if (!supabaseClient) return
  try {
    const { error } = await supabaseClient
      .from('pfpa_relationships')
      .upsert({ id: 'graph-1', data: graph, synced_at: new Date().toISOString() }, { onConflict: 'id' })
    if (error) console.error('[SUPABASE] relationships sync error:', error.message)
  } catch (e) {}
}

function startSupabaseListeners(store, broadcastToRenderer) {
  if (!supabaseClient) return

  // Listen for predictions from other devices
  const predSub = supabaseClient
    .channel('pfpa_predictions_channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pfpa_predictions' }, (payload) => {
      const data = payload.new
      const existing = (store.get('predictions') || []).find(p => p.id === data.id)
      if (!existing && data.id) {
        const preds = store.get('predictions') || []
        preds.unshift(data)
        store.set('predictions', preds.slice(0, 200))
        broadcastToRenderer('prediction:new', data)
        console.log('[SUPABASE] Cross-device prediction received:', data.id)
      }
    })
    .subscribe()

  // Listen for signals from other devices
  const sigSub = supabaseClient
    .channel('pfpa_signals_channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pfpa_signals' }, (payload) => {
      const data = payload.new
      const existing = (store.get('signals') || []).find(s => s.id === data.id)
      if (!existing && data.id) {
        const sigs = store.get('signals') || []
        sigs.unshift(data)
        store.set('signals', sigs.slice(0, 300))
        broadcastToRenderer('signal:new', data)
      }
    })
    .subscribe()

  // Listen for settings changes from other devices (CAM-4: digital twin state)
  const settingsSub = supabaseClient
    .channel('pfpa_settings_channel')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pfpa_settings' }, (payload) => {
      const data = payload.new
      // Merge remote settings with local (don't overwrite api keys set locally)
      const localSettings = store.get('userSettings') || {}
      const merged = {
        ...data,
        claude_api_key: localSettings.claude_api_key || data.claude_api_key,
        supabase_config: localSettings.supabase_config || data.supabase_config,
      }
      delete merged.synced_at
      store.set('userSettings', merged)
      broadcastToRenderer('settings:synced', merged)
      console.log('[SUPABASE] Settings synced from another device')
    })
    .subscribe()

  // Listen for relationship graph changes
  const relSub = supabaseClient
    .channel('pfpa_relationships_channel')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pfpa_relationships' }, (payload) => {
      if (payload.new?.data) {
        store.set('relationshipGraph', payload.new.data)
        broadcastToRenderer('relationship:updated', payload.new.data)
      }
    })
    .subscribe()

  subscriptions.push(predSub, sigSub, settingsSub, relSub)
  console.log('[SUPABASE] Real-time listeners started (CAM-4 digital twin sync active)')
}

function stopSupabaseListeners() {
  subscriptions.forEach(sub => {
    try { sub.unsubscribe() } catch (e) {}
  })
  subscriptions.length = 0
}

function isConnected() {
  return !!supabaseClient
}

module.exports = {
  initSupabase,
  syncToSupabase,
  syncSettingsToSupabase,
  syncRelationshipsToSupabase,
  startSupabaseListeners,
  stopSupabaseListeners,
  isConnected,
  getClient: () => supabaseClient,
}
