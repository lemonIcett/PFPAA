const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── DB CRUD ──────────────────────────────────────────────────────────────
  list:   (table, sort, limit) => ipcRenderer.invoke('db:list',   { table, sort, limit }),
  create: (table, data)        => ipcRenderer.invoke('db:create',  { table, data }),
  update: (table, id, data)    => ipcRenderer.invoke('db:update',  { table, id, data }),
  remove: (table, id)          => ipcRenderer.invoke('db:delete',  { table, id }),

  // ── Settings ─────────────────────────────────────────────────────────────
  getSettings:    ()     => ipcRenderer.invoke('settings:get'),
  updateSettings: (data) => ipcRenderer.invoke('settings:update', data),

  // ── Google OAuth ─────────────────────────────────────────────────────────
  setGoogleCredentials: (creds) => ipcRenderer.invoke('google:set-credentials', creds),
  getGoogleAuthUrl:     ()      => ipcRenderer.invoke('google:get-auth-url'),
  exchangeGoogleCode:   (code)  => ipcRenderer.invoke('google:exchange-code', code),
  disconnectGoogle:     ()      => ipcRenderer.invoke('google:disconnect'),

  // ── Slack ─────────────────────────────────────────────────────────────────
  connectSlack:    (token) => ipcRenderer.invoke('slack:connect', token),
  disconnectSlack: ()      => ipcRenderer.invoke('slack:disconnect'),

  // ── Integrations ──────────────────────────────────────────────────────────
  getIntegrationStatus: () => ipcRenderer.invoke('integrations:status'),
  syncNow:              () => ipcRenderer.invoke('sync:now'),
  openExternal:         (url) => ipcRenderer.invoke('shell:open', url),
  initFirebase:         (config) => ipcRenderer.invoke('firebase:init', config),
  initSupabase:         (config) => ipcRenderer.invoke('supabase:init', config),
  supabaseStatus:       ()       => ipcRenderer.invoke('supabase:status'),

  // ── Real action execution ─────────────────────────────────────────────────
  createCalendarEvent: (params) => ipcRenderer.invoke('action:create-calendar-event', params),
  createEmailDraft:    (params) => ipcRenderer.invoke('action:create-email-draft', params),
  sendSlackMessage:    (params) => ipcRenderer.invoke('action:send-slack', params),
  organizeFiles:       (params) => ipcRenderer.invoke('action:organize-files', params),
  executePrediction:   (id)     => ipcRenderer.invoke('action:execute-prediction', id),

  // ── Safe execution (MFA gate for red-level) ───────────────────────────────
  executePredictionSafe: (id) => ipcRenderer.invoke('action:execute-prediction-safe', id),

  // ── Undo buffer ───────────────────────────────────────────────────────────
  executeUndo: (entryId) => ipcRenderer.invoke('undo:execute', entryId),
  listUndo:    ()        => ipcRenderer.invoke('undo:list'),

  // ── Intelligence / relationships / patterns ───────────────────────────────
  getRelationships: () => ipcRenderer.invoke('relationships:get'),
  getPatterns:      () => ipcRenderer.invoke('patterns:get'),

  // ── BIE-3: Preference learning ────────────────────────────────────────────
  recordPreference: (predictionId, outcome) => ipcRenderer.invoke('preference:record', { predictionId, outcome }),
  getPreferences:   ()                       => ipcRenderer.invoke('preference:get'),

  // ── BIE-2: Prediction accuracy ────────────────────────────────────────────
  ratePrediction:  (predictionId, wasCorrect) => ipcRenderer.invoke('accuracy:rate', { predictionId, wasCorrect }),
  accuracyReport:  ()                          => ipcRenderer.invoke('accuracy:report'),

  // ── SGL-1: MFA dialog ────────────────────────────────────────────────────
  requireMFA: (action) => ipcRenderer.invoke('mfa:require', { action }),

  // ── SEC-2: Biometric + PIN ────────────────────────────────────────────────
  biometricAvailable:   ()         => ipcRenderer.invoke('biometric:available'),
  biometricAuthenticate: ({ reason }) => ipcRenderer.invoke('biometric:authenticate', { reason }),
  biometricAuth:        (reason)   => ipcRenderer.invoke('biometric:authenticate', { reason }),
  setPin:               (pin)      => ipcRenderer.invoke('pin:set', { pin }),
  clearPin:             ()         => ipcRenderer.invoke('pin:clear'),

  // ── CAM-1: Window + clipboard monitors ───────────────────────────────────
  startWindowMonitor:    () => ipcRenderer.invoke('monitor:window-start'),
  startClipboardMonitor: () => ipcRenderer.invoke('monitor:clipboard-start'),
  stopMonitors:          () => ipcRenderer.invoke('monitor:window-stop'),

  // ── MMI-3: Global keyboard shortcuts ─────────────────────────────────────
  registerShortcuts:   () => ipcRenderer.invoke('shortcuts:register'),
  unregisterShortcuts: () => ipcRenderer.invoke('shortcuts:unregister'),

  // ── Performance monitoring ────────────────────────────────────────────────
  getPerfReport: () => ipcRenderer.invoke('perf:report'),

  // ── Session management ────────────────────────────────────────────────────
  pingSession: () => ipcRenderer.invoke('session:ping'),

  // ── Data management ───────────────────────────────────────────────────────
  dataPurge:  () => ipcRenderer.invoke('data:purge'),

  // ── Ghost overlay ─────────────────────────────────────────────────────────
  showOverlay:    (prediction) => ipcRenderer.invoke('overlay:show', prediction),
  dismissOverlay: ()           => ipcRenderer.invoke('overlay:dismiss'),

  // ── Workflow chain ────────────────────────────────────────────────────────
  executeWorkflowChain: (workflowId) => ipcRenderer.invoke('workflow:execute-chain', workflowId),

  // ── CAM-3: Social context ─────────────────────────────────────────────────
  getSocialContext:   () => ipcRenderer.invoke('social:context'),
  getTopContacts:     () => ipcRenderer.invoke('social:top-contacts'),

  // ── CAM-2: Location ───────────────────────────────────────────────────────
  getLocation:        ()       => ipcRenderer.invoke('location:get'),
  setManualLocation:  (data)   => ipcRenderer.invoke('location:set-manual', data),
  detectLocation:     ()       => ipcRenderer.invoke('location:detect'),

  // ── BIE-1: Email template learning ───────────────────────────────────────
  learnEmailTemplate: (data)   => ipcRenderer.invoke('bie1:learn-email-template', data),
  getEmailTemplateCtx:()       => ipcRenderer.invoke('bie1:email-template-context'),

  // ── PAS-2: Slack drafts ───────────────────────────────────────────────────
  listSlackDrafts:    ()       => ipcRenderer.invoke('slack:drafts-list'),
  sendSlackDraft:     (id)     => ipcRenderer.invoke('slack:draft-send',    { draftId: id }),
  discardSlackDraft:  (id)     => ipcRenderer.invoke('slack:draft-discard', { draftId: id }),

  // ── NFR monitoring ────────────────────────────────────────────────────────
  getNFRReport:       ()       => ipcRenderer.invoke('nfr:report'),

  // ── MMI-2: Voice feedback logging ─────────────────────────────────────────
  logVoice: (data) => ipcRenderer.invoke('voice:log', data),

  // ── SEC-3: Sandboxed form fill ────────────────────────────────────────────
  fillFormSandboxed: (formData) => ipcRenderer.invoke('form:fill-sandboxed', formData),

  // ── BIE-1: User Behavior Graph ────────────────────────────────────────────
  getUbgStats:    ()         => ipcRenderer.invoke('ubg:stats'),
  getUbgPatterns: ()         => ipcRenderer.invoke('ubg:patterns'),
  ubgPredict:     (signal)   => ipcRenderer.invoke('ubg:predict', signal),
  ubgRecordAction:(p, o)     => ipcRenderer.invoke('ubg:record-action', { prediction: p, outcome: o }),

  // ── BIE-3: Preference Vector Engine ─────────────────────────────────────
  getPrefSummary: ()         => ipcRenderer.invoke('pref:summary'),
  getPrefScore:   (pred)     => ipcRenderer.invoke('pref:score', pred),
  recordPrefExtended: (p, o) => ipcRenderer.invoke('pref:record-extended', { prediction: p, outcome: o }),

  // ── PERF: Performance Monitor ────────────────────────────────────────────
  getFullPerfReport:  ()          => ipcRenderer.invoke('perf:full-report'),
  getPollInterval:    (baseMs)    => ipcRenderer.invoke('perf:poll-interval', { baseMs }),

  // ── COMP: GDPR/CCPA Compliance ───────────────────────────────────────────
  exportUserData:     ()          => ipcRenderer.invoke('compliance:export-data'),
  erasureRequest:     ()          => ipcRenderer.invoke('compliance:erasure-request'),

  // ── CAM-4: Signal sync ───────────────────────────────────────────────────
  syncSignal:         (signal)    => ipcRenderer.invoke('sync:signal', signal),

  // ── Real-time event listeners ─────────────────────────────────────────────
  on: (channel, cb) => {
    const allowed = [
      'signal:new', 'signals:refresh',
      'prediction:new', 'prediction:updated', 'prediction:rated',
      'actionlog:new',
      'integration:status', 'integration:connected', 'integration:disconnected',
      'undo:available', 'undo:expired',
      'relationship:updated',
      'session:timeout',
      'overlay:update',
      'data:purged',
      'gesture:approve', 'gesture:dismiss', 'gesture:alternatives',
      'guardrail:blocked', 'location:detected', 'settings:synced',
      'slack:draft-created', 'slack:draft-sent', 'slack:draft-discarded',
      'nfr:violation', 'nfr:battery', 'nfr:heartbeat',
      'sync:devices', 'sync:latency', 'sync:updated',
      'workflow:triggered',
    ]
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_, data) => cb(data))
  },
  off: (channel) => ipcRenderer.removeAllListeners(channel),
})
