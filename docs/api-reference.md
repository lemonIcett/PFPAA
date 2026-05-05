# PFPA — API Reference

PFPA exposes two APIs:
1. **Electron IPC** — used by the renderer process (React UI) via `window.electronAPI`
2. **WebSocket** — used by the Chrome extension and third-party integrations on `ws://localhost:7878`

---

## Electron IPC API (`window.electronAPI`)

All methods return Promises. Available only in the Electron renderer context.

### Context & Signals (CAM)

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `getSignals` | `()` | `Signal[]` | Last 300 context signals |
| `getLocation` | `()` | `Location \| null` | Current detected location |
| `setManualLocation` | `(LocationData)` | `Location` | Override auto-detected location |
| `detectLocation` | `()` | `Location \| null` | Re-run location detection |
| `getSocialContext` | `()` | `SocialContext` | Relationship graph summary |
| `getTopContacts` | `()` | `Contact[]` | Top 10 contacts by interaction strength |

#### Types

```ts
interface Signal {
  id:           string
  signal_type:  'app_focus' | 'file_activity' | 'email_received' | 'communication' | 'browser_tab' | 'clipboard'
  source:       string          // app name, 'Gmail', 'Slack', etc.
  description:  string
  device:       string
  privacy_level: 'public' | 'private' | 'vault'
  is_active:    boolean
  data:         string          // JSON-encoded extra fields
  created_date: string          // ISO 8601
}

interface Location {
  city:        string
  region:      string
  country:     string
  countryCode: string
  timezone:    string
  lat:         number | null
  lon:         number | null
  source:      'ip_ipapi' | 'ip_ipapi_fallback' | 'manual'
  detected:    string           // ISO 8601
}
```

---

### Predictions (BIE / PAS)

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `getPredictions` | `()` | `Prediction[]` | All current predictions |
| `executePrediction` | `(id: string)` | `ExecuteResult` | Execute a prediction by ID |
| `ratePrediction` | `(id, 'accepted' \| 'rejected' \| 'modified')` | `void` | Teach the model |
| `getAlternatives` | `(id: string)` | `Prediction[]` | Alternative predictions |
| `getEmailTemplateCtx` | `()` | `string` | BIE-1 email style hint for prompts |
| `learnEmailTemplate` | `(EmailData)` | `TemplateStats` | BIE-1 learn from accepted draft |

#### Types

```ts
interface Prediction {
  id:               string
  description:      string          // Human-readable e.g. "Draft follow-up email to Sarah"
  suggested_action: string          // Short action label
  action_type:      ActionType
  action_params:    object
  confidence:       number          // 0–100
  confidence_level: 'green' | 'yellow' | 'red'
  category:         string          // 'email' | 'calendar' | 'file' | ...
  intent_type:      'micro' | 'session' | 'daily'
  reasoning:        string
  created_date:     string
}

type ActionType = 
  | 'create_calendar_event'
  | 'create_email_draft'
  | 'send_slack_message'    // always queued as draft — see PAS-2
  | 'organize_files'
  | 'reminder'
  | 'none'

interface ExecuteResult {
  success?: boolean
  error?:   string
  draftId?: string          // present when action_type is 'send_slack_message'
  ts?:      string          // Slack message timestamp (after sending draft)
}

interface EmailData {
  subject: string
  body:    string
  to?:     string
}
```

---

### Workflows (PAS-4)

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `listWorkflows` | `()` | `Workflow[]` | All saved workflows |
| `createWorkflow` | `(WorkflowInput)` | `Workflow` | Create a new workflow |
| `updateWorkflow` | `(id, patch)` | `Workflow` | Update fields |
| `deleteWorkflow` | `(id)` | `void` | Delete workflow |
| `executeWorkflowChain` | `(id)` | `ChainResult` | Run all steps immediately |

```ts
interface Workflow {
  id:          string
  name:        string
  trigger:     TriggerType
  conditionOp: 'contains' | 'not_contains' | 'regex' | 'always'
  condition:   string
  enabled:     boolean
  steps:       WorkflowStep[]
  createdAt:   string
}

type TriggerType = 
  | 'calendar_event' | 'email_received' | 'file_activity'
  | 'communication'  | 'browser_tab'    | 'app_focus'

interface WorkflowStep {
  action_type:  ActionType
  params:       object
  delayMs:      number     // ms to wait before executing this step
  stopOnError:  boolean    // halt chain if this step fails
}

interface ChainResult {
  steps:    number
  results:  StepResult[]
  error?:   string
}

interface StepResult {
  step:       string
  result:     ExecuteResult
  durationMs: number
}
```

---

### Safety & Governance (SGL)

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `getActionLogs` | `()` | `ActionLog[]` | Audit trail (90-day retention) |
| `undoAction` | `(id: string)` | `UndoResult` | Reverse action within 30s window |
| `getUndoBuffer` | `()` | `UndoEntry[]` | Current reversible actions |
| `requireMFA` | `({ action })` | `AuthResult` | Manually trigger PIN/biometric prompt |

```ts
interface ActionLog {
  id:               string
  action_type:      string
  description:      string
  confidence:       number
  confidence_level: 'green' | 'yellow' | 'red'
  is_reversible:    boolean
  was_undone:       boolean
  meta:             object
  created_date:     string
}
```

---

### Slack Drafts (PAS-2)

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `listSlackDrafts` | `()` | `SlackDraft[]` | All drafts (pending, sent, discarded) |
| `sendSlackDraft` | `(id: string)` | `ExecuteResult` | Send a queued draft now |
| `discardSlackDraft` | `(id: string)` | `{ success: boolean }` | Discard without sending |

```ts
interface SlackDraft {
  id:          string
  channel:     string
  text:        string
  scheduledAt: string | null
  createdAt:   string
  status:      'draft' | 'sent' | 'discarded'
  sentAt?:     string
  ts?:         string        // Slack message timestamp after sending
}
```

---

### Security (SEC)

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `biometricAvailable` | `()` | `BiometricInfo` | Detect platform biometric capability |
| `biometricAuthenticate` | `({ reason })` | `AuthResult` | Prompt biometric or PIN |
| `setPin` | `(pin: string)` | `{ success: boolean }` | Set app PIN |
| `clearPin` | `()` | `{ success: boolean }` | Remove app PIN |
| `registerShortcuts` | `()` | `{ success: boolean }` | Register global keyboard shortcuts |
| `unregisterShortcuts` | `()` | `{ success: boolean }` | Unregister global shortcuts |

```ts
interface BiometricInfo {
  available:    boolean
  method:       'touchid' | 'windowshello' | 'pin'
  enrolled:     boolean
  needsPackage?: string   // npm package to install if hardware present but lib missing
}

interface AuthResult {
  success: boolean
  error?:  string
}
```

---

### Settings & Integration

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `getSettings` | `()` | `UserSettings` | All settings |
| `updateSettings` | `(patch)` | `UserSettings` | Partial update |
| `getIntegrationStatus` | `()` | `IntegrationStatus` | Which integrations are connected |
| `connectSupabase` | `(url, key)` | `{ success, error? }` | Start cross-device sync |
| `supabaseStatus` | `()` | `SyncStatus` | CAM-4 sync status |

```ts
interface SyncStatus {
  connected:     boolean
  lastSyncAt:    number | null   // Unix ms
  deviceId:      string
  channelCount:  number
  e2eEnabled:    boolean
  tlsEnforced:   boolean
}
```

---

### NFR Monitoring

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `getNFRReport` | `()` | `NFRReport` | Full performance + uptime report |

```ts
interface NFRReport {
  uptime: {
    pct:       number     // e.g. 99.987
    target:    99.9
    ok:        boolean
    uptimeMs:  number
    startedAt: string
  }
  latency: {
    contextDetection: LatencyMetric   // target 100ms
    prediction:       LatencyMetric   // target 500ms
    actionExecution:  LatencyMetric   // target 2000ms
  }
  throughput: {
    signalsPerMin:     number          // target 100+
    activePredictions: number          // target 50+
    peakPredictions:   number
  }
  battery: {
    level:     number                  // 0–100%
    charging:  boolean
    target:    5                       // max %/hr drain
  } | null
  violations: {
    count:  number
    recent: NFRViolation[]
  }
}

interface LatencyMetric {
  avg:     number    // ms
  p95:     number    // ms
  max:     number    // ms
  target:  number    // ms SRS requirement
  ok:      boolean
  samples: number
}
```

---

## WebSocket API (`ws://localhost:7878`)

Used by the Chrome extension and any third-party tool that needs to push context signals into PFPA.

### Connection

```js
const ws = new WebSocket('ws://localhost:7878')
ws.onopen = () => console.log('Connected to PFPA')
```

### Sending a signal

Send JSON with `type: 'signal'`:

```json
{
  "type": "signal",
  "signal_type": "browser_tab",
  "source": "Chrome",
  "description": "Opened GitHub PR review — pfpa/v2 #42",
  "privacy": "public",
  "data": {
    "url": "https://github.com/pfpa/v2/pull/42",
    "title": "feat: add workflow step templates"
  }
}
```

**Supported `signal_type` values:**

| Value | When to use |
|-------|-------------|
| `app_focus` | User focused a desktop application |
| `browser_tab` | User opened or navigated to a URL |
| `file_activity` | File created, modified, or moved |
| `email_received` | New email arrived |
| `communication` | Slack, Teams, or chat message |
| `clipboard` | User copied text to clipboard |

### Receiving events

PFPA broadcasts prediction events back over the same connection:

```json
{
  "type": "prediction",
  "id": "uuid",
  "description": "Create a review comment draft",
  "confidence": 88,
  "confidence_level": "yellow",
  "action_type": "create_email_draft"
}
```

---

## Real-Time Events (IPC)

Subscribe via `window.electronAPI.on(channel, callback)`.

| Channel | Payload | When fired |
|---------|---------|------------|
| `signal:new` | `Signal` | New context signal captured |
| `prediction:new` | `Prediction` | New prediction generated |
| `prediction:updated` | `Prediction` | Prediction confidence changed |
| `actionlog:new` | `ActionLog` | Action executed or blocked |
| `undo:available` | `{ id, expires }` | 30s undo window opened |
| `slack:draft-created` | `SlackDraft` | AI created a Slack draft |
| `slack:draft-sent` | `SlackDraft` | Draft sent to Slack |
| `nfr:violation` | `NFRViolation` | Latency/throughput SLA breached |
| `nfr:battery` | `{ level, drainRate }` | Battery sample taken |
| `nfr:heartbeat` | `{ ts }` | 30s uptime heartbeat |
| `sync:devices` | `{ devices: string[] }` | Connected device list changed |
| `sync:updated` | `{ table, id, at }` | Remote record synced |
| `location:detected` | `Location` | Location auto-detected or changed |
| `guardrail:blocked` | `{ reason, guardrail }` | SGL-1 blocked an action |
| `gesture:approve` | `{ source }` | Keyboard/global shortcut approve |
| `gesture:dismiss` | `{ source }` | Keyboard/global shortcut dismiss |
| `session:timeout` | `{}` | 15-minute inactivity timeout |
| `workflow:triggered` | `{ workflowId, name }` | Workflow condition matched |

---

## Error Handling

All IPC methods return `{ error: string }` on failure. Always check for it:

```js
const result = await window.electronAPI.executePrediction(id)
if (result.error) {
  console.error('Execution failed:', result.error)
  // result.error may be 'Blocked by guardrail: ...' or 'Auth cancelled'
}
```
