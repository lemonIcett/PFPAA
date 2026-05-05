# Privacy Dashboard

**PFPA v2.0** | [Back to Index](./index.md)

PFPA is built on a **local-first, privacy-first** architecture. This document explains exactly what data is collected, where it goes, how long it is kept, and how to delete it.

---

## What data PFPA collects

### On-device only (never leaves your machine without your action)

| Data type | Purpose | Retention |
|-----------|---------|-----------|
| App focus events | Context signals for prediction | 7 days raw, 90 days processed |
| Window titles | Digital context monitoring | 7 days |
| Browser tab URLs | Context signals | 7 days |
| File activity paths | Workflow triggers | 7 days |
| Clipboard snippets | Form pre-fill context | Session only — never persisted |
| Behavioral pattern vectors | Preference learning | Indefinite (until account deletion) |
| Email metadata (sender, subject) | Relationship graph + drafts | 90 days |
| Calendar event titles + times | Temporal context | 90 days |

### Sent to third-party services (only when you configure them)

| Service | Data sent | When sent | Encrypted in transit |
|---------|-----------|-----------|---------------------|
| Supabase | Context signals, predictions, action logs | When sync is enabled | AES-256-GCM client-side + TLS 1.3 |
| Anthropic API (Claude) | Context description + recent signals | Each prediction cycle | TLS 1.3 |
| Google Calendar / Gmail | OAuth token only; PFPA reads/writes via API | When connected | TLS 1.3 (Google) |
| Slack | OAuth token only | When connected | TLS 1.3 (Slack) |
| ipapi.co | Your public IP address | On location detection | TLS 1.3 |

**PFPA does not send any data to Anthropic for training.** The Claude API is used only for inference (generating predictions). Your prompts are not used to train future models under Anthropic's API terms.

---

## Privacy Vault (SGL-2)

The following contexts are **completely isolated** from the prediction engine. Signals from these contexts are stored encrypted and never analysed:

- Private / incognito browser windows
- Banking applications (detected by window title keywords: bank, chase, wellsfargo, barclays, hsbc, revolut, wise, coinbase, robinhood, etrade, schwab)
- Medical / health portals (detected by: epic, mychart, health, patient, medicat, nhs)
- Password manager windows (1password, bitwarden, lastpass, dashlane, keepass, keychain)

To add custom vault patterns: Settings → Privacy → Custom vault patterns.

---

## Local encryption (SEC-1)

All data stored on your device by PFPA's local database (`pfpa-data-v2`) is encrypted using **AES-256** with a key that is:

- Derived uniquely for your OS user account using Electron `safeStorage` (macOS Keychain / Windows DPAPI / Linux SecretService)
- **Never hardcoded** — the key cannot be extracted from the application binary
- Regenerated if you delete the app and reinstall

The Supabase sync payloads use a separate **AES-256-GCM** key derived from your Supabase anon key via HKDF-SHA256. Even if Supabase were compromised, your data would be unreadable without the client-side key.

---

## Data retention schedule

| Data class | Retention | Auto-purge |
|------------|-----------|-----------|
| Raw context signals | 7 days | Yes — nightly |
| Processed behavioral patterns | 90 days | Yes — weekly |
| Action logs | 90 days | Yes — weekly |
| Preference vectors | Indefinite | No — manual deletion only |
| Relationship graph | Indefinite | No — manual deletion only |
| Slack drafts | Until sent or discarded | Manual |
| Undo buffer | 30 seconds | Yes — automatic |

---

## Your rights

### View all stored data

Settings → Privacy → *Export my data* — downloads a JSON file of everything PFPA has stored locally.

### Delete specific data types

Settings → Privacy → *Manage data* — individual deletion controls for each category above.

### Delete everything

Settings → Privacy → *Delete all data* — wipes the encrypted local store, removes all Supabase sync records, and resets the app to factory state. This cannot be undone.

### Opt out of cloud sync

Settings → Integrations → Supabase → *Disconnect* — stops all sync. Data already synced is deleted from Supabase on disconnect (DELETE request sent automatically).

### Opt out of location detection

Settings → Context → Location → *Use manual location* — set your city manually. No IP lookup is performed.

---

## Transparency indicator

The **real-time privacy indicator** in the top-right of the PFPA window shows a coloured dot:

| Dot | Meaning |
|-----|---------|
| 🟢 Green | Processing on-device only |
| 🟡 Yellow | Active API call in progress (Claude or Supabase) |
| 🔴 Red | Sensitive context detected — vault active |

---

*Last updated: 2026-04-24 · PFPA v2.0*
