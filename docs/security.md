# Security Model

**PFPA v2.0** | [Back to Index](./index.md)

---

## Threat model

PFPA is a personal productivity tool with access to sensitive contexts (email, calendar, files, clipboard). The primary threats it is designed to defend against are:

| Threat | Mitigation |
|--------|-----------|
| Physical device theft | AES-256 local store encryption via OS keychain (SEC-1) |
| Malicious app reading PFPA's store | Electron safeStorage — key tied to OS user account |
| Compromised cloud sync provider | AES-256-GCM client-side encryption; server never has plaintext |
| Network eavesdropping | TLS 1.3 enforced for all outbound connections |
| AI acting on unintended behalf | SGL-1 guardrails; external party block; financial threshold |
| Privilege escalation via automation | Browser sandboxing (SEC-3); no password manager access |
| Unusual behaviour / account hijack | BIE-4 anomaly detection reduces confidence on deviation |
| Unauthorised high-risk actions | PIN / biometric required for all red-level predictions (SEC-2) |

---

## Encryption at rest (SEC-1)

### Local store

PFPA uses `electron-store` with encryption. The encryption key is **never hardcoded** in source.

**Key derivation flow:**
```
OS Keychain / DPAPI / SecretService
         │
         ▼
  Electron safeStorage.encryptString("pfpa-store-key-sentinel-v1")
         │
         ▼
  base64(encrypted bytes).slice(0, 64)  ←── AES key for electron-store
```

This means the key is unique to your OS user account. Even with physical access to the device and a copy of the database file, decryption requires your OS login credentials.

**Fallback** (safeStorage unavailable — headless CI, Linux without SecretService):
```
SHA-256(hostname + username + PFPA_STORE_SALT env var)
```
Set `PFPA_STORE_SALT` to a secret value in your environment to strengthen the fallback.

### Supabase sync payloads (E2E)

```
Supabase anon key
      │
      ▼
 HKDF-SHA256("pfpa-e2e-v1")  →  256-bit AES key
      │
      ▼
 AES-256-GCM encrypt(payload)  →  { iv, ct, tag }
      │
      ▼
 JSON.stringify({ iv, ct, tag })  →  stored in Supabase `payload` column
```

The Supabase server only ever stores the encrypted ciphertext. Decryption requires the derived key, which only exists on client devices.

---

## Encryption in transit (SEC-1)

All outbound HTTPS connections from the Electron main process enforce **TLS 1.3 minimum** via:

```javascript
const agent = new https.Agent({ minVersion: 'TLSv1.3', rejectUnauthorized: true })
```

This agent is passed to every Supabase client call. Connections that cannot negotiate TLS 1.3 are refused.

Google, Slack, Anthropic, and ipapi.co all support TLS 1.3 — verified at time of writing.

---

## Authentication (SEC-2)

### PIN

- 4–8 digits, digits only
- Stored via Electron's encrypted store (never plaintext)
- Required before any red-level prediction executes
- Required for: external communications, financial actions > $100, data export, security setting changes

### Biometric

| Platform | Method | Package required |
|----------|--------|-----------------|
| macOS | Touch ID / Face ID | `npm install node-mac-auth` |
| Windows | Windows Hello (face/fingerprint) | `npm install @paymoapp/node-windows-hello` |
| Linux | PIN fallback | None |

Biometric authentication gates the same red-level actions as PIN. If biometric verification fails twice, the system falls back to PIN.

### Hardware keys (FIDO2 / WebAuthn)

YubiKey and other FIDO2 authenticators are supported via the WebAuthn API (`navigator.credentials.get`). The OS routes the prompt automatically when a compatible key is plugged in and biometric packages are installed.

### Session timeout

After **15 minutes of inactivity**, the session is locked and requires re-authentication before any further action execution.

---

## Sandboxing (SEC-3)

Browser automation (form pre-fill, DOM reading) runs in an **isolated Electron BrowserView** with:

- `nodeIntegration: false` — renderer cannot access Node.js APIs
- `contextIsolation: true` — renderer context is isolated from the main world
- `sandbox: true` — Chromium sandbox enabled
- No access to password manager autofill APIs
- No access to OS secure enclaves

The Chrome extension component uses Manifest V3 with minimal permissions declared at install time.

---

## Guardrail architecture (SGL-1)

Guardrails are enforced in `executeActionWithGuardrails()`, which wraps the action executor. The check runs **before** any API call is made:

```
prediction
    │
    ▼
enforceGuardrails()
    ├── isFinancialAction() + amount > $100  →  BLOCK
    ├── isExternalPartyAction()              →  BLOCK
    ├── isDataExportAction()                 →  BLOCK
    └── isSecurityAction()                   →  BLOCK
    │
    ▼ (if not blocked)
requireBiometric() / requireMFA()  (red-level only)
    │
    ▼
executeAction()
```

Blocked actions are logged to the action log with `action_type: "guardrail_blocked"` and broadcast to the renderer as `guardrail:blocked` events.

---

## Responsible disclosure

If you find a security vulnerability in PFPA, please open a GitHub issue marked **[SECURITY]** or email the maintainer directly. Do not publish exploits before a fix is available.

---

*Last updated: 2026-04-24 · PFPA v2.0*
