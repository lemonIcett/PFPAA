/**
 * electron.js — renderer-side API layer (complete)
 * All calls route through window.electronAPI → IPC → main process
 */

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
      if (entityName === 'UserSetting') {
        const s = await window.electronAPI.getSettings()
        return s ? [s] : []
      }
      return window.electronAPI.list(table, sort, limit)
    },
    async create(data) {
      if (entityName === 'UserSetting') return window.electronAPI.updateSettings(data)
      return window.electronAPI.create(table, data)
    },
    async update(id, data) {
      if (entityName === 'UserSetting') return window.electronAPI.updateSettings(data)
      return window.electronAPI.update(table, id, data)
    },
    async delete(id) { return window.electronAPI.remove(table, id) },
  }
}

// ── Entities (CRUD) ────────────────────────────────────────────────────────
export const entities = {
  ContextSignal: makeEntity('ContextSignal'),
  Prediction:    makeEntity('Prediction'),
  ActionLog:     makeEntity('ActionLog'),
  Workflow:      makeEntity('Workflow'),
  UserSetting:   makeEntity('UserSetting'),
}

// ── Integrations ───────────────────────────────────────────────────────────
export const integrations = {
  getStatus:            () => window.electronAPI.getIntegrationStatus(),
  setGoogleCredentials: (c) => window.electronAPI.setGoogleCredentials(c),
  getGoogleAuthUrl:     () => window.electronAPI.getGoogleAuthUrl(),
  exchangeGoogleCode:   (code) => window.electronAPI.exchangeGoogleCode(code),
  disconnectGoogle:     () => window.electronAPI.disconnectGoogle(),
  connectSlack:         (token) => window.electronAPI.connectSlack(token),
  disconnectSlack:      () => window.electronAPI.disconnectSlack(),
  syncNow:              () => window.electronAPI.syncNow(),
  openExternal:         (url) => window.electronAPI.openExternal(url),
  initSupabase:         (c) => window.electronAPI.initSupabase(c),
  supabaseStatus:       () => window.electronAPI.supabaseStatus(),
}

// ── Real action execution ──────────────────────────────────────────────────
export const actions = {
  createCalendarEvent:  (params) => window.electronAPI.createCalendarEvent(params),
  createEmailDraft:     (params) => window.electronAPI.createEmailDraft(params),
  sendSlackMessage:     (params) => window.electronAPI.sendSlackMessage(params),
  organizeFiles:        (params) => window.electronAPI.organizeFiles(params),
  executePrediction:    (id)     => window.electronAPI.executePrediction(id),
}

// ── Safe action execution (MFA gate for red-level) ─────────────────────────
export const safeActions = {
  executePrediction: (id) => window.electronAPI.executePredictionSafe(id),
}

// ── Workflow chaining ──────────────────────────────────────────────────────
export const workflowActions = {
  executeChain: (id) => window.electronAPI.executeWorkflowChain(id),
}

// ── Undo system ────────────────────────────────────────────────────────────
export const undo = {
  execute: (entryId) => window.electronAPI.executeUndo(entryId),
  list:    ()        => window.electronAPI.listUndo(),
}

// ── Intelligence (relationships, patterns, preferences) ───────────────────
export const intelligence = {
  getRelationships:  () => window.electronAPI.getRelationships(),
  getPatterns:       () => window.electronAPI.getPatterns(),
  recordPreference:  (predictionId, outcome) => window.electronAPI.recordPreference(predictionId, outcome),
  getPreferences:    () => window.electronAPI.getPreferences(),
}

// ── BIE-3: Preferences (shorthand) ────────────────────────────────────────
export const preferences = {
  record: (predictionId, outcome) => window.electronAPI.recordPreference(predictionId, outcome),
  get:    ()                       => window.electronAPI.getPreferences(),
}

// ── BIE-2: Accuracy tracking ───────────────────────────────────────────────
export const accuracy = {
  rate:   (predictionId, wasCorrect) => window.electronAPI.ratePrediction(predictionId, wasCorrect),
  report: ()                          => window.electronAPI.accuracyReport(),
}

// ── SEC-2 + SGL-1: Auth (biometric / PIN / MFA) ───────────────────────────
export const auth = {
  mfa:       (action) => window.electronAPI.requireMFA(action),
  biometric: (reason) => window.electronAPI.biometricAuth(reason),
  setPin:    (pin)    => window.electronAPI.setPin(pin),
  clearPin:  ()       => window.electronAPI.clearPin(),
}

// ── CAM-1: Window + clipboard monitors ────────────────────────────────────
export const monitors = {
  startWindow:    () => window.electronAPI.startWindowMonitor(),
  startClipboard: () => window.electronAPI.startClipboardMonitor(),
  stop:           () => window.electronAPI.stopMonitors(),
}

// ── MMI-3: Global keyboard shortcuts ──────────────────────────────────────
export const shortcuts = {
  register:   () => window.electronAPI.registerShortcuts(),
  unregister: () => window.electronAPI.unregisterShortcuts(),
}

// ── Performance monitoring ─────────────────────────────────────────────────
export const perf = {
  report: () => window.electronAPI.getPerfReport(),
}

// ── Session management ─────────────────────────────────────────────────────
export const session = {
  ping: () => window.electronAPI.pingSession(),
}

// ── Data management ────────────────────────────────────────────────────────
export const data = {
  purge: () => window.electronAPI.dataPurge(),
}

// ── CAM-2: Location + seasonal context ────────────────────────────────────
export const location = {
  get:     () => window.electronAPI.getLocation(),
  detect:  () => window.electronAPI.detectLocation(),
  seasonal:() => window.electronAPI.getSeasonal(),
}

// ── BIE-1: Sequential pattern recognition ─────────────────────────────────
export const sequences = {
  get: () => window.electronAPI.getSequences(),
}

// ── SGL-1: Guardrail enforcement ───────────────────────────────────────────
export const guardrails = {
  check: (predictionId) => window.electronAPI.checkGuardrail(predictionId),
}

// ── PAS-2: Form pre-filling ────────────────────────────────────────────────
export const formFill = {
  fill:           (context)  => window.electronAPI.fillForm(context),
  fillDirect:     (formData) => window.electronAPI.fillFormDirect(formData),
  fillSandboxed:  (formData) => window.electronAPI.fillFormSandboxed(formData),
}

// ── CAM-3: Social context ─────────────────────────────────────────────────
export const social = {
  getContext:    () => window.electronAPI.getSocialContext(),
  getTopContacts:() => window.electronAPI.getTopContacts(),
}

// ── MMI-2: Voice logging ──────────────────────────────────────────────────
export const voice = {
  log: (data) => window.electronAPI.logVoice(data),
}

// ── MMI-3: Overlay alternatives ────────────────────────────────────────────
export const alternatives = {
  get: (predictionId) => window.electronAPI.getAlternatives(predictionId),
}

// ── Ghost overlay ──────────────────────────────────────────────────────────
export const overlay = {
  show:    (prediction) => window.electronAPI.showOverlay(prediction),
  dismiss: ()           => window.electronAPI.dismissOverlay(),
}

// ── Real-time event listeners ──────────────────────────────────────────────
export const realtime = {
  on:  (channel, cb) => window.electronAPI.on(channel, cb),
  off: (channel)     => window.electronAPI.off(channel),
}

// ── BIE-1: User Behavior Graph ─────────────────────────────────────────────
export const ubg = {
  stats:        ()             => window.electronAPI.getUbgStats(),
  patterns:     ()             => window.electronAPI.getUbgPatterns(),
  predict:      (signal)       => window.electronAPI.ubgPredict(signal),
  recordAction: (pred, outcome)=> window.electronAPI.ubgRecordAction(pred, outcome),
}

// ── BIE-3: Preference Vector Engine ───────────────────────────────────────
export const prefVectors = {
  summary:  ()             => window.electronAPI.getPrefSummary(),
  score:    (pred)         => window.electronAPI.getPrefScore(pred),
  record:   (pred, outcome)=> window.electronAPI.recordPrefExtended(pred, outcome),
}

// ── PERF: Full performance report ─────────────────────────────────────────
export const perfFull = {
  report:       ()       => window.electronAPI.getFullPerfReport(),
  pollInterval: (baseMs) => window.electronAPI.getPollInterval(baseMs),
}

// ── COMP: GDPR/CCPA Compliance ─────────────────────────────────────────────
export const compliance = {
  exportData:      () => window.electronAPI.exportUserData(),
  erasureRequest:  () => window.electronAPI.erasureRequest(),
}

// ── CAM-4: Signal sync ─────────────────────────────────────────────────────
export const signalSync = {
  push: (signal) => window.electronAPI.syncSignal(signal),
}
