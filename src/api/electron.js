/**
 * electron.js — renderer-side API layer
 * Routes through window.electronAPI (Electron) or falls back to browser mocks.
 */

// ── Environment detection ──────────────────────────────────────────────────
const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI
const api = IS_ELECTRON ? window.electronAPI : null

// Safe IPC call: returns fallback value if not in Electron
function ipc(fn, fallback = null) {
  if (!api) return Promise.resolve(fallback)
  try {
    const result = fn(api)
    return result instanceof Promise ? result : Promise.resolve(result)
  } catch (e) {
    console.warn('[electron.js] IPC call failed:', e)
    return Promise.resolve(fallback)
  }
}

// ── Mock data for browser preview ─────────────────────────────────────────
const MOCK = {
  signals:      [],
  predictions:  [],
  actionLogs:   [],
  workflows:    [],
  userSettings: { theme: 'dark', sessionTimeout: 15 },
}

// ── Table mapping ──────────────────────────────────────────────────────────
const TABLE_MAP = {
  ContextSignal: 'signals',
  Prediction:    'predictions',
  ActionLog:     'actionLogs',
  Workflow:      'workflows',
  UserSetting:   'userSettings',
}

function makeEntity(entityName) {
  const table = TABLE_MAP[entityName]
  return {
    async list(sort = '-created_date', limit = 80) {
      if (!api) {
        if (entityName === 'UserSetting') return [MOCK.userSettings]
        return MOCK[table] ?? []
      }
      if (entityName === 'UserSetting') {
        const s = await api.getSettings()
        return s ? [s] : []
      }
      return api.list(table, sort, limit)
    },
    async create(data) {
      if (!api) return { ...data, id: Date.now().toString() }
      if (entityName === 'UserSetting') return api.updateSettings(data)
      return api.create(table, data)
    },
    async update(id, data) {
      if (!api) return { id, ...data }
      if (entityName === 'UserSetting') return api.updateSettings(data)
      return api.update(table, id, data)
    },
    async delete(id) {
      if (!api) return null
      return api.remove(table, id)
    },
  }
}

export const entities = {
  ContextSignal: makeEntity('ContextSignal'),
  Prediction:    makeEntity('Prediction'),
  ActionLog:     makeEntity('ActionLog'),
  Workflow:      makeEntity('Workflow'),
  UserSetting:   makeEntity('UserSetting'),
}

export const integrations = {
  getStatus:            () => ipc(a => a.getIntegrationStatus(), { google: false, slack: false }),
  setGoogleCredentials: (c) => ipc(a => a.setGoogleCredentials(c)),
  getGoogleAuthUrl:     () => ipc(a => a.getGoogleAuthUrl(), '#'),
  exchangeGoogleCode:   (code) => ipc(a => a.exchangeGoogleCode(code)),
  disconnectGoogle:     () => ipc(a => a.disconnectGoogle()),
  connectSlack:         (token) => ipc(a => a.connectSlack(token)),
  disconnectSlack:      () => ipc(a => a.disconnectSlack()),
  syncNow:              () => ipc(a => a.syncNow()),
  openExternal:         (url) => IS_ELECTRON ? api.openExternal(url) : window.open(url, '_blank'),
  initSupabase:         (c) => ipc(a => a.initSupabase(c)),
  supabaseStatus:       () => ipc(a => a.supabaseStatus(), { connected: false }),
}

export const actions = {
  createCalendarEvent:  (params) => ipc(a => a.createCalendarEvent(params)),
  createEmailDraft:     (params) => ipc(a => a.createEmailDraft(params)),
  sendSlackMessage:     (params) => ipc(a => a.sendSlackMessage(params)),
  organizeFiles:        (params) => ipc(a => a.organizeFiles(params)),
  executePrediction:    (id)     => ipc(a => a.executePrediction(id)),
}

export const safeActions = {
  executePrediction: (id) => ipc(a => a.executePredictionSafe(id)),
}

export const workflowActions = {
  executeChain: (id) => ipc(a => a.executeWorkflowChain(id)),
}

export const undo = {
  execute: (entryId) => ipc(a => a.executeUndo(entryId)),
  list:    ()        => ipc(a => a.listUndo(), []),
}

export const intelligence = {
  getRelationships:  () => ipc(a => a.getRelationships(), []),
  getPatterns:       () => ipc(a => a.getPatterns(), []),
  recordPreference:  (predictionId, outcome) => ipc(a => a.recordPreference(predictionId, outcome)),
  getPreferences:    () => ipc(a => a.getPreferences(), []),
}

export const preferences = {
  record: (predictionId, outcome) => ipc(a => a.recordPreference(predictionId, outcome)),
  get:    ()                       => ipc(a => a.getPreferences(), []),
}

export const accuracy = {
  rate:   (predictionId, wasCorrect) => ipc(a => a.ratePrediction(predictionId, wasCorrect)),
  report: ()                          => ipc(a => a.accuracyReport(), { total: 0, correct: 0, rate: 0 }),
}

export const auth = {
  mfa:       (action) => ipc(a => a.requireMFA(action), { approved: true }),
  biometric: (reason) => ipc(a => a.biometricAuth(reason), { approved: true }),
  setPin:    (pin)    => ipc(a => a.setPin(pin)),
  clearPin:  ()       => ipc(a => a.clearPin()),
}

export const monitors = {
  startWindow:    () => ipc(a => a.startWindowMonitor()),
  startClipboard: () => ipc(a => a.startClipboardMonitor()),
  stop:           () => ipc(a => a.stopMonitors()),
}

export const shortcuts = {
  register:   () => ipc(a => a.registerShortcuts()),
  unregister: () => ipc(a => a.unregisterShortcuts()),
}

export const perf = {
  report: () => ipc(a => a.getPerfReport(), {}),
}

export const session = {
  ping: () => ipc(a => a.pingSession()),
}

export const data = {
  purge: () => ipc(a => a.dataPurge()),
}

export const location = {
  get:      () => ipc(a => a.getLocation(), null),
  detect:   () => ipc(a => a.detectLocation(), null),
  seasonal: () => ipc(a => a.getSeasonal(), null),
}

export const sequences = {
  get: () => ipc(a => a.getSequences(), []),
}

export const guardrails = {
  check: (predictionId) => ipc(a => a.checkGuardrail(predictionId), { approved: true }),
}

export const formFill = {
  fill:          (context)  => ipc(a => a.fillForm(context)),
  fillDirect:    (formData) => ipc(a => a.fillFormDirect(formData)),
  fillSandboxed: (formData) => ipc(a => a.fillFormSandboxed(formData)),
}

export const social = {
  getContext:     () => ipc(a => a.getSocialContext(), {}),
  getTopContacts: () => ipc(a => a.getTopContacts(), []),
}

export const voice = {
  log: (d) => ipc(a => a.logVoice(d)),
}

export const alternatives = {
  get: (predictionId) => ipc(a => a.getAlternatives(predictionId), []),
}

export const overlay = {
  show:    (prediction) => ipc(a => a.showOverlay(prediction)),
  dismiss: ()           => ipc(a => a.dismissOverlay()),
}

// In browser: no-op (no IPC events). In Electron: normal IPC.
export const realtime = {
  on:  (channel, cb) => { if (api) api.on(channel, cb) },
  off: (channel)     => { if (api) api.off(channel) },
}

export const ubg = {
  stats:        ()              => ipc(a => a.getUbgStats(), {}),
  patterns:     ()              => ipc(a => a.getUbgPatterns(), []),
  predict:      (signal)        => ipc(a => a.ubgPredict(signal), null),
  recordAction: (pred, outcome) => ipc(a => a.ubgRecordAction(pred, outcome)),
}

export const prefVectors = {
  summary:  ()              => ipc(a => a.getPrefSummary(), {}),
  score:    (pred)          => ipc(a => a.getPrefScore(pred), 0),
  record:   (pred, outcome) => ipc(a => a.recordPrefExtended(pred, outcome)),
}

export const perfFull = {
  report:       ()       => ipc(a => a.getFullPerfReport(), {}),
  pollInterval: (baseMs) => ipc(a => a.getPollInterval(baseMs), baseMs),
}

export const compliance = {
  exportData:     () => ipc(a => a.exportUserData(), null),
  erasureRequest: () => ipc(a => a.erasureRequest()),
}

export const signalSync = {
  push: (signal) => ipc(a => a.syncSignal(signal)),
}
