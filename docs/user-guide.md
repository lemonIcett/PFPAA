# PFPA User Guide

**Version 2.0** | [Back to Index](./index.md)

---

## Table of Contents

1. [Dashboard](#1-dashboard)
2. [Context Monitor (CAM)](#2-context-monitor-cam)
3. [Predictions (BIE)](#3-predictions-bie)
4. [Ghost Overlay (PAS-1)](#4-ghost-overlay-pas-1)
5. [Action Log (SGL-3)](#5-action-log-sgl-3)
6. [Workflows (PAS-4)](#6-workflows-pas-4)
7. [Voice & Gesture (MMI-2, MMI-3)](#7-voice--gesture-mmi-2-mmi-3)
8. [Relationships (CAM-3)](#8-relationships-cam-3)
9. [Safety (SGL)](#9-safety-sgl)
10. [Performance & NFR](#10-performance--nfr)
11. [Integrations](#11-integrations)
12. [Settings](#12-settings)

---

## 1. Dashboard

The dashboard is your real-time command centre. It shows:

- **Active context signals** — what PFPA is observing right now (apps, calendar, email, files)
- **Pending predictions** — actions PFPA thinks you need, colour-coded by confidence
- **Recent automation** — last 5 things PFPA did on your behalf
- **Integration health** — which connections are live

### Confidence colour system

| Colour | Confidence | What happens |
|--------|-----------|-------------|
| 🟢 Green | > 95 % | Executes automatically — reversible within 30 s |
| 🟡 Yellow | 85–95 % | Shows ghost overlay — one-tap to approve |
| 🔴 Red | < 85 % | Requires explicit approval + PIN / biometric |

The shape inside the dot (●▲■) conveys the same information for colour-blind users.

---

## 2. Context Monitor (CAM)

**Path:** Sidebar → *Context Monitor*

The Context Acquisition Module collects signals that tell PFPA what you are doing.

### Signal types

| Type | What triggers it | Privacy level |
|------|-----------------|---------------|
| `app_focus` | You switch to an application | Public |
| `browser_tab` | You open a browser tab | Public |
| `email_received` | New email arrives | Private |
| `calendar_event` | Upcoming meeting detected | Private |
| `file_activity` | File created / modified | Public |
| `communication` | Slack / Teams message | Private |
| `clipboard` | Clipboard content changed | Vault |

### Privacy vault

Any signal from an **incognito window**, **banking app**, or **medical portal** is automatically routed to the Privacy Vault. Vault signals are stored encrypted and are **never sent to the prediction engine**.  
See [Privacy Dashboard](./privacy-dashboard.md) for the full list of protected contexts.

### Cross-device sync (CAM-4)

When Supabase is configured (Settings → Sync), context signals are replicated to your other devices within 2 seconds. All payloads are **AES-256-GCM encrypted client-side** before upload — the Supabase server never sees your data in plaintext.

### Location awareness (CAM-2)

PFPA detects your location to improve temporal context (e.g. rush-hour commute detection, timezone-aware scheduling). Location is detected in this priority order:

1. **Manual override** — Settings → Context → Location — highest privacy, you choose
2. **IP geolocation** (ipapi.co / ip-api.com fallback) — city-level accuracy
3. **Cached last-known** — used when offline

To set a manual location: Settings → Context → *Location override* → type your city.

---

## 3. Predictions (BIE)

**Path:** Sidebar → *Predictions*

The Behavioural Intelligence Engine analyses your context history and produces ranked predictions.

### How predictions are generated

1. **Pattern recognition (BIE-1)** — PFPA learns recurring sequences (morning routine apps, weekly report cadence, email response patterns). After 3–5 repetitions it begins predicting.

2. **Intent prediction (BIE-2)** — Context signals feed a probability model across three time horizons:
   - *Micro-intent* — next 60 seconds (> 85 % accuracy target)
   - *Session intent* — next 30 minutes (> 75 % accuracy target)
   - *Daily intent* — next 24 hours (> 60 % accuracy target)

3. **Preference learning (BIE-3)** — Your accept/reject history shapes future confidence. Dismiss a suggestion three times and its confidence drops. Accept it consistently and it may become a green-level auto-action.

4. **Anomaly detection (BIE-4)** — PFPA scores five dimensions to detect unusual behaviour and reduces confidence accordingly, preventing inappropriate automation:

   | Dimension | What it detects |
   |-----------|----------------|
   | Temporal | Activity at an unusual hour for that signal type |
   | Velocity | Signal rate 3× above or below your normal pace |
   | Location | Timezone shift since last session |
   | App pattern | Morning app sequence doesn't match known routines |
   | Idle gap | > 48 hours since last activity (vacation / new device) |

   When the aggregate anomaly score exceeds 0.35, confidence is multiplied by a factor between 0.4–0.8 until patterns normalise.

### Rating predictions

Use the **thumbs up / thumbs down** on any prediction card to train the model. Your feedback is stored locally and incorporated into the next prediction cycle.

---

## 4. Ghost Overlay (PAS-1)

The ghost overlay is a translucent, always-on-top window that appears when PFPA has a **yellow-level** suggestion. It stays out of your way and requires only a single interaction.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `→` or `Enter` | Approve and execute |
| `←` or `Escape` | Dismiss |
| `↓` | Show alternative suggestions |

### Gesture shortcuts (touch / mobile)

| Gesture | Action |
|---------|--------|
| Swipe right | Approve |
| Swipe left | Dismiss |
| Long press (500 ms) | Show alternatives |

### Global shortcuts

Enable **Alt+→ / Alt+←** system-wide in *Settings → Voice & Gesture → Global keyboard shortcuts* so you can approve or dismiss without the overlay needing focus.

### Undo (30-second window)

Every green-level action that executes automatically shows an **Undo** button in the notification tray. You have 30 seconds. After that the action is permanent (but still visible in the Action Log).

---

## 5. Action Log (SGL-3)

**Path:** Sidebar → *Action Log*

Every action PFPA takes — including blocked guardrail attempts — is logged here with:

- Timestamp
- Action type and description
- Confidence score and level
- Whether it was overridden or reversed
- Source signal that triggered it

The log is retained for **90 days** then automatically purged. You can export the full log as JSON from the Action Log page.

### Slack drafts

When PFPA suggests a Slack message, it is **always saved as a draft** — never sent automatically. Drafts appear in the Action Log with a *Draft* badge. Click **Send** to post, or **Discard** to delete.

---

## 6. Workflows (PAS-4)

**Path:** Sidebar → *Workflows*

Workflows chain multiple actions together, triggered by a single context signal.

### Built-in presets

| Preset | Trigger | What it does |
|--------|---------|-------------|
| Travel Day Mode | Calendar event containing "travel" | Posts Slack status, queues OOO email draft, sets reminder |
| Meeting Prep | Calendar event containing "meeting" | Drafts agenda email, sets pre-meeting reminder |
| PDF Organizer | File activity ending in `.pdf` | Moves file to organised folder, logs reminder |
| Invoice Handler | Email containing "invoice" | Files PDF, creates calendar task, notifies Slack #accounting |
| Morning Standup | App focus: Zoom | Mute reminder, drafts standup notes email |

### Creating a workflow

1. Click **New workflow**
2. Choose a **trigger signal type** (calendar, email, file, Slack, browser tab, app focus)
3. Set a **condition** — `contains`, `does not contain`, `matches regex`, or `always`
4. Add **steps** — each step is an action type with its own parameters
5. For each step, optionally set:
   - **Delay** (milliseconds after the previous step completes)
   - **Halt on error** — stop the whole chain if this step fails

### Template variables

Steps can reference the output of previous steps using `{{prev.key}}` syntax. For example, a "Create calendar event" step with title `"Review {{prev.subject}}"` will inherit the subject from the preceding email draft step.

---

## 7. Voice & Gesture (MMI-2, MMI-3)

**Path:** Sidebar → *Voice & Gesture*

### Voice feedback (MMI-2)

When enabled, PFPA speaks suggestions aloud and listens for your yes/no response — useful when your hands are busy.

**Enable:** Toggle *Voice Feedback* → grant microphone permission when prompted.

**Approval words:** yes, yep, yeah, ok, okay, approve, confirm, do it, go, accept, sure  
**Dismiss words:** no, nope, cancel, dismiss, stop, skip, reject, abort, ignore

Use the **Test** buttons to verify your microphone level and speaker output before relying on voice in production.

### Gesture control (MMI-3)

| Platform | How it works |
|----------|-------------|
| Touch (iOS/Android) | Native swipe detection on the overlay panel |
| Desktop mouse | Click-drag left or right on the overlay |
| Keyboard | Arrow keys active whenever the overlay has focus |
| Global (desktop) | Enable Alt+→/← in settings to work system-wide |

---

## 8. Relationships (CAM-3)

**Path:** Sidebar → *Relationships*

PFPA analyses your communication patterns to build a **relationship strength graph**. This feeds into social context scoring — frequent collaborators get higher prediction weight for meeting prep, follow-up drafts, etc.

Strength is calculated from interaction frequency across email, Slack, and calendar. No message content is stored in the graph — only metadata (sender, channel, timestamp).

---

## 9. Safety (SGL)

**Path:** Sidebar → *Safety*

### Guardrail rules (SGL-1)

PFPA will always **block and require manual approval** for:

| Category | Threshold |
|----------|-----------|
| Financial transactions | > $100 |
| Email / Slack to external parties | Any autonomous send |
| Data export or deletion | Any |
| Security setting changes | Any |

External party detection compares recipient email domains against your configured **org domains** (Settings → Security → Org domains). Without org domains configured, any outbound send action is flagged.

### Panic button

The **Pause all automation** button at the top of the Safety page immediately suspends all green-level auto-execution and overlay suggestions. Useful before a sensitive call or screen-share. Click **Resume** to re-enable.

### Privacy vault (SGL-2)

Vault-protected app contexts (configurable in Settings → Privacy):
- Incognito / private browsing windows
- Banking applications
- Medical / health portals
- Password manager windows

### Undo buffer (SGL-4)

All reversible actions (calendar holds, file moves, email drafts) can be undone within **30 seconds** via the notification or the Safety → Undo log.

---

## 10. Performance & NFR

**Path:** Sidebar → *Performance*

Live metrics against SRS non-functional requirements:

| Metric | Target | Where to check |
|--------|--------|----------------|
| Context detection latency | < 100 ms avg | Performance → Latency |
| Intent prediction latency | < 500 ms avg | Performance → Latency |
| Action execution latency | < 2 000 ms avg | Performance → Latency |
| Signal throughput | ≥ 100/min | Performance → Throughput |
| Core engine uptime | ≥ 99.9 % | Performance → Uptime |
| Mobile battery drain | < 5 %/hr | Performance → Battery |

NFR violations (individual measurements that breach a target) are logged with timestamp and shown in *Performance → Violations*. The violation list is cleared on restart.

---

## 11. Integrations

**Path:** Sidebar → *Integrations*

| Integration | What PFPA uses it for | Auth method |
|-------------|----------------------|-------------|
| Google Calendar | Read upcoming events, create holds | OAuth 2.0 |
| Gmail | Read email metadata, create drafts | OAuth 2.0 |
| Slack | Read messages, save message drafts | Bot token |
| Supabase | Cross-device sync (E2E encrypted) | Project URL + anon key |
| Claude AI | Natural-language prediction generation | API key |

### Connecting integrations

See [SETUP.md](../SETUP.md) for step-by-step OAuth configuration for each provider.

### Integration health indicators

Each integration card shows one of three states:

- 🟢 **Connected** — active, last-seen timestamp shown
- 🟡 **Degraded** — connected but returning errors, check credentials
- ⚫ **Disconnected** — not configured or auth expired

---

## 12. Settings

**Path:** Sidebar → *Settings*

### Confidence tuner (UI-2)

The 1–5 scale controls how aggressively PFPA acts:

| Level | Behaviour |
|-------|----------|
| 1 — Ask me everything | No auto-execution; every suggestion requires approval |
| 2 — Conservative | Only > 97 % confidence auto-executes |
| 3 — Balanced (default) | Standard green/yellow/red thresholds |
| 4 — Aggressive | Yellow-level actions auto-execute |
| 5 — Just do it | All non-guardrailed actions auto-execute |

### Security (SEC-2)

**PIN:** Required for all red-level predictions. Must be 4–8 digits. Stored via Electron's encrypted store — never in plaintext.

**Biometric enrolment:**
- macOS: uses Touch ID / Face ID via `node-mac-auth`
- Windows: uses Windows Hello via `@paymoapp/node-windows-hello`
- Linux: falls back to PIN dialog
- Hardware keys (FIDO2/YubiKey): supported via WebAuthn when biometric package is installed

**Session auto-lock:** Re-authenticates after 15 minutes of inactivity.

### Location override (CAM-2)

Type your city/region to override IP-based detection. This is the highest-privacy option — no network request is made for location.

### Org domains (SGL-1)

List your organisation's email domains (e.g. `company.com`, `subsidiary.co`). PFPA uses these to distinguish internal from external communications for guardrail enforcement.

---

*Last updated: 2026-04-24 · PFPA v2.0*

---

## Slack Drafts (PAS-2)

When PFPA suggests sending a Slack message it **never posts immediately**. Every AI-generated Slack message is saved as a draft first so you can review it.

**To review and send drafts:**
1. Open **Action Log** in the sidebar
2. Click the **Slack Drafts** tab
3. Review the channel and message text
4. Click **Send** to post, or **Discard** to delete

This matches Gmail draft behaviour — PFPA creates; you approve.

---

## Cross-Device Sync (CAM-4)

PFPA can synchronise your predictions, signals, and settings across multiple computers in real-time (< 2 seconds).

**Setup:**
1. Create a free account at https://supabase.com
2. Create a new project → note the **Project URL** and **anon/public API key**
3. In PFPA → **Settings → Cross-device sync** → paste both values → Connect
4. Repeat on your other device with the same credentials

**Security:** All synced data is encrypted end-to-end with AES-256-GCM on your device before upload. Supabase never sees your plaintext context data.

---

## Location & Temporal Context (CAM-2)

PFPA uses your location to provide time-zone-aware scheduling and seasonal pattern awareness.

**How location is detected (in priority order):**
1. Manual override (Settings → Context → Set location)
2. IP geolocation via ipapi.co (no API key required, city-level accuracy)
3. Previously stored location

**To set location manually:**
Settings → Context Monitoring → Location → type your city and country → Save.
Manual location overrides automatic detection entirely for privacy-conscious users.

---

## Email Style Learning (BIE-1)

Every time you accept an email draft created by PFPA, the system learns your writing style:

- **Formality** — formal ("kindly", "hereby") vs casual ("hey", "btw")
- **Greeting** — your most-used opening (e.g. "Hi Sarah,")
- **Closing** — your most-used sign-off (e.g. "Best,")
- **Length** — average word count per email

After 3+ accepted drafts, new email suggestions reflect your personal style. Check the learned profile at Settings → Behavioral Intelligence → Email Style.

---

## NFR Performance Dashboard

Open **Settings → Performance** to see live metrics against SRS targets:

| Metric | SRS Target | Status |
|--------|-----------|--------|
| Context detection latency | < 100 ms | shown as avg / p95 |
| Prediction latency | < 500 ms | shown as avg / p95 |
| Action execution | < 2000 ms | shown as avg / p95 |
| System uptime | ≥ 99.9% | shown since last launch |
| Signal throughput | ≥ 100/min | shown as rolling average |
| Battery drain (mobile) | < 5%/hr | shown when on battery |

Red values mean the SRS target is being missed. A violation history log shows the last 10 breaches with timestamps.

---

## Biometric Authentication (SEC-2)

PFPA requires authentication before executing **red-level** predictions (high-risk / irreversible actions).

**Setup wizard:**
1. Settings → Security → Biometric section
2. Click **Enrol Touch ID / Windows Hello**
3. Complete the OS prompt
4. Click **Test authentication** to verify
5. Done — future red-level actions will prompt your biometric

**Fallback:** If biometric is unavailable or fails, the PIN you set in Settings → Security → App PIN is used. The PIN is required to be at least 4 digits and is validated client-side before storage.

**Hardware keys:** FIDO2 tokens (YubiKey, etc.) work automatically through the OS WebAuthn/biometric prompt — no extra setup needed.

