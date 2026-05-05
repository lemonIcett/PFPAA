# PFPA v2 — Complete Setup Guide

## Quick Start

```bash
npm install
npm run dev
```

---

## Step 1 — Claude AI Engine (Smart Predictions)

1. Go to https://console.anthropic.com
2. Create an account → go to **API Keys**
3. Click **Create Key** → copy the key (starts with `sk-ant-`)
4. In PFPA → **Settings → Claude AI Engine** → paste your key → Save

Without this key the app falls back to rule-based template predictions.

---

## Step 2 — Google Calendar & Gmail

### Create OAuth credentials
1. Go to https://console.cloud.google.com
2. Create a new project → name it "PFPA"
3. **APIs & Services → Library** → Enable:
   - Google Calendar API
   - Gmail API
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Click Create → copy **Client ID** and **Client Secret**
5. **OAuth consent screen** → External → fill app name → **Add yourself as Test User**

### Connect in app
1. PFPA → **Integrations → Set up Google OAuth**
2. Paste Client ID + Client Secret → Continue
3. Open Google Sign-In → approve → paste code back → Connect

**Features enabled:** 48-hour calendar lookahead, real Gmail draft creation, real calendar event creation, relationship tracking from email contacts (CAM-3).

---

## Step 3 — Slack

1. Go to https://api.slack.com/apps → **Create New App → From scratch**
2. Name: "PFPA" → choose workspace
3. **OAuth & Permissions → Bot Token Scopes** → Add:
   - `channels:history`
   - `channels:read`
   - `search:read`
   - `users:read`
   - `chat:write`
4. **Install to Workspace** → copy **Bot User OAuth Token** (`xoxb-...`)
5. PFPA → **Integrations → Connect Slack** → paste token

---

## Step 4 — Supabase (Cross-device sync — replaces Firebase)

Supabase provides real-time PostgreSQL sync across all your devices (CAM-4: digital twin state, <2s latency).

### Create project
1. Go to https://supabase.com → **New project**
2. Choose a region close to you → set a database password → Create
3. Go to **Project Settings → API**:
   - Copy the **Project URL** (e.g. `https://xxxxxxxxxxxx.supabase.co`)
   - Copy the **anon / public** key (starts with `eyJ...`)

### Run the schema (SQL Editor)

Go to **SQL Editor** in your Supabase project and run:

```sql
-- PFPA Schema — run this once in Supabase SQL Editor

create table if not exists pfpa_signals (
  id            text primary key,
  signal_type   text,
  source        text,
  description   text,
  device        text,
  privacy_level text,
  is_active     boolean,
  data          text,
  created_date  timestamptz,
  synced_at     timestamptz default now()
);

create table if not exists pfpa_predictions (
  id               text primary key,
  description      text,
  suggested_action text,
  action_type      text,
  action_params    jsonb,
  confidence       integer,
  confidence_level text,
  category         text,
  intent_type      text,
  reasoning        text,
  status           text,
  trigger_context  text,
  signal_id        text,
  created_date     timestamptz,
  synced_at        timestamptz default now()
);

create table if not exists pfpa_action_logs (
  id               text primary key,
  action_type      text,
  description      text,
  confidence       integer,
  confidence_level text,
  is_reversible    boolean,
  was_undone       boolean,
  meta             jsonb,
  created_date     timestamptz,
  synced_at        timestamptz default now()
);

create table if not exists pfpa_settings (
  id           text primary key default 'settings-1',
  data         jsonb,
  synced_at    timestamptz default now()
);

create table if not exists pfpa_relationships (
  id        text primary key default 'graph-1',
  data      jsonb,
  synced_at timestamptz default now()
);

-- Enable real-time replication for all tables
alter publication supabase_realtime add table pfpa_signals;
alter publication supabase_realtime add table pfpa_predictions;
alter publication supabase_realtime add table pfpa_action_logs;
alter publication supabase_realtime add table pfpa_settings;
alter publication supabase_realtime add table pfpa_relationships;
```

### Connect in app
1. PFPA → **Settings → Supabase — Cross-device sync**
2. Paste your **Project URL** and **Anon Key**
3. Click **Connect Supabase**

Green "Connected" badge confirms real-time sync is active across all your devices.

**Free tier limits:** 500MB database, unlimited real-time connections, 2GB bandwidth/month — plenty for personal use.

---

## Step 5 — File System Watcher

1. PFPA → **Integrations → File System Watcher**
2. Add absolute paths:
   - Windows: `C:\Users\YourName\Documents`
   - Mac/Linux: `/home/yourname/projects`
3. Click **Add** — real-time watching starts immediately

Combine with Workflows to auto-organize files by extension into target folders.

---

## Step 6 — Chrome Extension

1. Chrome → `chrome://extensions` → Enable **Developer mode**
2. **Load unpacked** → select the `chrome-extension/` folder
3. Make sure PFPA desktop app is running first
4. Extension shows green dot when connected to ws://localhost:7777

---

## Step 7 — Workflows (Real action chaining)

Go to **Workflows** page → Create New Workflow:

| Trigger | Action | Example |
|---------|--------|---------|
| `file_activity` | `organize_files` | Move `.pdf` files to `/home/user/PDFs` |
| `email_received` | `create_email_draft` | Auto-draft reply template |
| `calendar_event` | `send_slack_message` | Notify team before meetings |

---

## Feature Reference

### UI-2: Confidence Tuner

Go to **Settings → Automation aggressiveness**. 5-level scale:

| Level | Label | Behaviour |
|-------|-------|-----------|
| 1 | Ask me everything | Always asks before doing anything |
| 2 | Mostly ask | Auto-executes only very high confidence green actions |
| 3 | Balanced (default) | Auto-executes green, confirms yellow, blocks red |
| 4 | Mostly automatic | Auto-executes green+yellow, confirms red only |
| 5 | Just do it | Maximum automation — only blocks irreversible red |

### UI-3: Panic Button (Always visible)

The **Pause/Resume** button is always visible in the top toolbar on every page. Click it to instantly pause all automation. Click again to resume. No need to navigate to Settings or Safety.

### MMI-2: Voice Feedback (Bidirectional)

Enable in **Settings → Voice feedback** or toggle the microphone button on the **Predictions** page.

- PFPA speaks each prediction aloud
- For yellow/red predictions, it waits for your voice response
- Say **"yes"**, **"ok"**, **"approve"** → action is executed
- Say **"no"**, **"cancel"**, **"dismiss"** → suggestion is dismissed
- Requires a browser with Web Speech API support (Chrome/Edge recommended)

### MMI-3: Gesture + Keyboard Shortcuts

The ghost overlay window supports:
- **Touch/trackpad swipe right** → approve action
- **Touch/trackpad swipe left** → dismiss action
- **Long press / swipe down** → view alternatives
- **Alt + →** (global shortcut) → approve current overlay
- **Alt + ←** (global shortcut) → dismiss current overlay
- **Alt + ↓** (global shortcut) → show alternatives

### CAM-3: Social Context (Automatic)

No setup needed. PFPA automatically builds a relationship graph from:
- Gmail contacts (sender email + name from incoming mail)
- Google Calendar attendees (meeting participants)
- Slack message authors

View it at **Relationships** page. Strength score decays for interactions older than 30 days. Meetings count 3×, emails 2×, Slack messages 1×.

### SEC-3: Browser Sandboxing

All form fills via the Chrome extension are sandboxed automatically:
- Password manager domains (LastPass, 1Password, Bitwarden, etc.) are completely blocked
- Fields with sensitive names (password, CVV, SSN, credit card, etc.) are filtered out before any data is sent
- Runs transparently — no setup required

### SGL-1: Guardrails

Hard stops enforced automatically:
- Financial transactions > $100 → blocked, requires manual action
- External emails → draft only, never auto-sent
- Data export/deletion → blocked, manual only
- Security setting changes → blocked, manual only

---

## v2.1 — Optional Enhancements

### CAM-1: Window + Clipboard Monitoring

```bash
npm install active-win
```

Then in **Settings → Context monitoring** toggle on "Active window monitor" and "Clipboard monitor".

### SEC-2: Biometric Authentication

**macOS (Touch ID / Face ID):**
```bash
npm install node-mac-auth
```

**Windows (Windows Hello):**
```bash
npm install @paymoapp/node-windows-hello
```

Restart the app. Biometric auth activates automatically for red-level predictions.

### 99.9% Uptime Background Service

```bash
npm install -g pm2
pm2 start pm2.config.js
pm2 startup
pm2 save
pm2 status
```

---

## Architecture

```
┌────────────────────────────────────────────────┐
│              PFPA v2 Electron App              │
│                                                │
│  ┌──────────────┐    ┌────────────────────┐   │
│  │ React UI     │◄──►│  Electron Main     │   │
│  │ (Renderer)   │IPC │  - Claude AI API   │   │
│  │              │    │  - Google APIs     │   │
│  │ Pages:       │    │  - Slack API       │   │
│  │ Dashboard    │    │  - chokidar FS     │   │
│  │ Context      │    │  - WebSocket :7777 │   │
│  │ Predictions  │    │  - Supabase sync   │   │
│  │ Relationships│    │  - Undo buffer     │   │
│  │ Workflows    │    │  - AES-256 store   │   │
│  │ Safety       │    └─────────┬──────────┘   │
│  │ Integrations │              │              │
│  └──────────────┘    ┌─────────▼──────────┐   │
│                      │ chrome-extension/  │   │
│                      │ ws://localhost:7777│   │
│                      └────────────────────┘   │
└────────────────────────────────────────────────┘
         ↕ Supabase (real-time cross-device sync)
```

## Troubleshooting

**"Claude API error"** → Check your API key in Settings. Make sure it starts with `sk-ant-`.

**"google:exchange-code failed"** → Ensure redirect URI is `urn:ietf:wg:oauth:2.0:oob` in Google Cloud Console.

**"Slack missing_scope chat:write"** → Re-add `chat:write` scope in Slack app settings, reinstall to workspace.

**Supabase connection failed** → Check URL starts with `https://` and key starts with `eyJ`. Make sure you ran the SQL schema first.

**Supabase real-time not working** → Ensure you ran `alter publication supabase_realtime add table ...` for all tables in the SQL schema above.

**File watcher not working** → Use absolute paths. On Windows use `C:\` not `C:/`.

**Voice feedback not working** → Use Chrome or Edge (Web Speech API). Check microphone permissions in browser/OS settings.

---

## Step 8 — Battery & Performance Validation (SRS TCPERF003)

The SRS requires mobile background processing to remain below 5% hourly battery drain.

### Running the battery benchmark

```bash
# Record baseline (device must be unplugged)
npm run start:headless &
sleep 3600   # let it run for 1 hour
# Compare battery % before and after; target: <5% drain
```

Alternatively, on macOS:
```bash
pmset -g batt   # note percentage
# ...1 hour later...
pmset -g batt   # check delta
```

On Linux:
```bash
upower -i /org/freedesktop/UPower/devices/battery_BAT0 | grep percentage
```

The app logs CPU usage every 5 minutes to `~/.config/pfpa-v2/perf.log` when running in headless mode.

---

## Step 9 — Health Endpoint & SLA Monitoring

PFPA exposes a lightweight HTTP health endpoint on startup:

```
GET http://localhost:38421/health
```

**Example response:**
```json
{
  "status": "ok",
  "version": "2.2-M",
  "uptime_seconds": 3842,
  "memory_rss_mb": 124,
  "last_prediction_at": "2026-04-25T10:32:11.000Z",
  "ws_clients": 1,
  "timestamp": "2026-04-25T11:36:13.000Z"
}
```

### Connect to UptimeRobot (free)

1. Go to https://uptimerobot.com → Add New Monitor
2. Monitor Type: **HTTP(s)**
3. URL: `http://localhost:38421/health` *(requires PFPA running on a server/VPS)*
4. Friendly Name: PFPA Engine
5. Alert Contacts: your email

The Performance page shows a 30-day uptime % calculated from local 60-second heartbeat pings.

---

## Step 10 — Compliance Setup

Before deploying to users:

1. **PFPA → Compliance** → review consent categories for your jurisdiction
2. Set your **Organisation Domain** (e.g. `acme.com`) to activate the external-comm guardrail
3. For EU users: ensure GDPR consent is captured on first run
4. For California users: the CCPA "Do Not Sell" toggle is on by default
5. For healthcare deployments: sign a BAA using `docs/hipaa-baa-template.md` before enabling the HIPAA module
