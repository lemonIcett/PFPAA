# PFPA — Frequently Asked Questions

## General

**What is PFPA?**
PFPA (Prompt-Free Proactive AI) is an ambient desktop assistant that watches your digital context — open apps, emails, calendar, files, Slack messages — and quietly predicts what you are about to do next, then either suggests or automatically executes low-risk tasks on your behalf. You never have to type a prompt.

**Does it always listen to me?**
No. PFPA monitors *screen context* (which app is in focus, what windows are open, clipboard text you copy, calendar events), not audio. Microphone access is only ever requested for the optional Voice Feedback feature (MMI-2) and only when you explicitly enable it in Settings → Voice & Gesture.

**Does it send my data to the cloud?**
By default, all processing runs on your device. Data only leaves your machine in two cases:
1. When the Claude AI engine is enabled — your context summary is sent to Anthropic's API to generate predictions (covered by Anthropic's data policy).
2. When Supabase cross-device sync is configured — data is encrypted end-to-end (AES-256-GCM) before upload, so Supabase servers never see plaintext.

---

## Installation & Setup

**The app won't start — "app is damaged" on macOS.**
Right-click the app → Open → Open anyway. This happens because the app is not yet notarized. Alternatively run `xattr -cr /Applications/PFPA.app` in Terminal.

**I see "Claude API key missing" and only get basic predictions.**
Go to Settings → Claude AI Engine → paste your `sk-ant-…` key. Without it, PFPA falls back to rule-based predictions which are less accurate. Get a key at https://console.anthropic.com.

**Google Calendar/Gmail won't connect.**
Ensure your Google OAuth app has the Calendar and Gmail API scopes enabled and that you added yourself as a test user on the OAuth consent screen. See SETUP.md Step 2 for the full walkthrough.

**Slack shows "not connected" even after I pasted the token.**
PFPA needs a **User OAuth Token** (starts with `xoxp-`), not a Bot token. In your Slack app settings go to **OAuth & Permissions** and copy the User OAuth Token. Ensure scopes include `channels:history`, `search:read`, and `chat:write`.

---

## Predictions & Actions

**Why did PFPA suggest something completely wrong?**
Early in its lifecycle PFPA has little behavioral data. Accuracy improves as it observes more of your routines (typically after 3–5 days of normal use). You can also click the thumbs-down on any prediction to teach it faster.

**A prediction is stuck at "yellow" level — will it ever auto-execute?**
Yellow-level predictions (85–95% confidence) always require a one-tap confirmation. To raise a prediction to green (auto-execute), either accept it repeatedly so PFPA learns it is correct, or lower your Confidence Tuner threshold in Settings.

**PFPA drafted an email I didn't ask for. How do I stop this?**
Open the Action Log, find the draft entry, and click Discard. To prevent future drafts for a particular trigger, go to Settings → Automation → Confidence Tuner and raise the threshold, or add the app/domain to the Privacy Vault in Settings → Privacy.

**Slack messages are saved as drafts instead of sent automatically — is that a bug?**
No, this is intentional (SRS PAS-2). All AI-generated Slack messages go to a draft queue first. Review them in the Action Log → Slack Drafts tab, then click Send when you are happy with the message. This prevents sending incorrect messages to colleagues.

**A workflow I created isn't firing.**
Check that the workflow is enabled (toggle is on). Then verify the trigger type matches what is actually happening — for example, a `file_activity` trigger only fires when PFPA detects a filesystem change in a watched folder (Settings → Context Monitoring → Watched Folders). Also confirm the condition keyword matches the signal text exactly (it is case-insensitive).

---

## Safety & Privacy

**Can PFPA accidentally send an email to the wrong person?**
PFPA never sends emails directly — it always creates a Gmail draft that sits in your Drafts folder. You review and click Send yourself. The same applies to Slack: all AI-generated messages are queued as drafts.

**PFPA tried to execute an action and was blocked by a guardrail. What happened?**
SGL-1 guardrails automatically block certain high-risk actions: financial transactions over $100, communications sent to addresses outside your organisation's domains, data exports, and security setting changes. The Action Log shows the exact reason. You can complete the action manually if it was a false positive.

**I accidentally approved something. Can I undo it?**
Yes. Every autonomous action is reversible within a 30-second window. Look for the "Undo" banner that appears immediately after execution, or open Action Log → click the action → Undo. After 30 seconds the undo window closes.

**Where is my data stored?**
All local data is stored in an encrypted electron-store database at:
- macOS: `~/Library/Application Support/pfpa/pfpa-data-v2`
- Windows: `%APPDATA%\pfpa\pfpa-data-v2`
- Linux: `~/.config/pfpa/pfpa-data-v2`

The encryption key is derived per-machine using the OS keychain (macOS Keychain / Windows DPAPI / Linux SecretService) — it is never hardcoded or stored in source code.

**How do I delete all my data?**
Go to Settings → Privacy → Purge All Data. This wipes the local store, behavioral model, relationship graph, and all sync records. The app will restart as if newly installed.

---

## Voice & Gestures

**Voice feedback is not working.**
First ensure your browser/OS has granted microphone permission. In PFPA go to Settings → Voice & Gesture → Grant microphone access. Also check that Web Speech API is supported in your browser (Chrome and Edge support it; Firefox has partial support; Safari requires enabling in Experimental Features).

**I said "yes" but PFPA didn't hear me.**
The recognition window is open for 5 seconds after a suggestion is spoken. Say the approval word clearly during that window. You can also swipe right on the ghost overlay or press the right arrow key as an alternative.

**Swipe gestures aren't working on desktop.**
Mouse drag gestures require dragging at least 40px horizontally on the ghost overlay. For a more reliable desktop experience, enable Global Keyboard Shortcuts in Settings → Voice & Gesture, which registers `Alt+→` (approve) and `Alt+←` (dismiss) system-wide.

---

## Performance & NFR

**The app feels slow — predictions take more than a second.**
The target is under 500ms per prediction. Check Settings → Performance → NFR Report to see your actual p95 latency. Common causes of slowness: Claude API network latency (check your internet connection), a very large behavioral model (prune old data in Settings → Privacy → Data Retention), or background processes hogging CPU.

**Battery drain seems high on my laptop.**
PFPA targets less than 5% battery drain per hour. The Performance page shows the measured drain rate. If it is higher than expected, reduce the polling interval in Settings → Context Monitoring or disable the Clipboard Monitor which polls more frequently.

---

## Cross-Device Sync

**I set up Supabase but my other device still does not see my predictions.**
Ensure both devices use the same Supabase URL and anon key. The sync uses real-time Postgres channels — check your Supabase project's Realtime section is enabled for the `pfpa_predictions`, `pfpa_signals`, and `pfpa_settings` tables. Also confirm both devices are online at the same time for the initial push.

**Is the cross-device sync secure?**
Yes. Every record is encrypted client-side with AES-256-GCM before being uploaded to Supabase. The encryption key is derived from your Supabase anon key using HKDF-SHA256, so Supabase servers only ever store ciphertext. All connections use TLS 1.3.

---

## Compliance & Privacy

**Is PFPA GDPR compliant?**
Yes. PFPA implements GDPR requirements including:
- Lawful basis captured per data category (Compliance page → Consent Management)
- Right to Access: export all your data from Compliance → Data Subject Requests
- Right to Erasure: delete all data from Compliance → Erase my data
- Record of Processing Activities (RoPA) table in the Compliance page
- Data minimisation: automatic purge at 7 / 90-day retention limits

**Is PFPA CCPA compliant?**
Yes. The Compliance page includes a "Do Not Sell or Share" toggle as required by CCPA §1798.120 (even though PFPA does not sell data). California users can exercise access and deletion rights via Compliance → Data Subject Requests.

**Does PFPA support HIPAA?**
The HIPAA healthcare module is a Phase 2 feature. The PHI Vault architecture is already in place (sensitive health-app windows are excluded from processing), but the full module requires a signed BAA. A BAA template is available at . Contact your compliance officer before enabling.

**Can I see exactly what data PFPA holds on me?**
Yes — go to Compliance → Data Subject Requests → "Export my data" to download a full JSON export of every signal, prediction, action log, and preference vector stored on your device.

**What happens to my data if I uninstall PFPA?**
Run Compliance → Erase my data before uninstalling. This clears the electron-store and revokes Supabase sync tokens. If you skip this step, the data remains in your OS user profile until manually deleted from  (Linux),  (macOS), or  (Windows).

**Does voice recognition send audio to any server?**
By default, PFPA uses your browser's built-in Web Speech API — your browser vendor (e.g. Google for Chrome) may process audio server-side per their own privacy policy. Enable **Local-only mode** in Voice & Gesture settings to restrict recognition to the on-device engine only, ensuring audio never leaves your device.
