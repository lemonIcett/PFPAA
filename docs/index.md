# PFPA Documentation

**Prompt-Free Proactive AI** — v2.0  
*An ambient intelligence platform that anticipates your needs and acts without explicit commands.*

---

## Documentation Index

| Guide | What it covers | Status |
|-------|---------------|--------|
| [User Guide](./user-guide.md) | Daily usage, every feature explained | ✅ Complete |
| [Privacy Dashboard](./privacy-dashboard.md) | What data is collected, where it goes, how to delete it | ✅ Complete |
| [Setup & Configuration](../SETUP.md) | Install, connect integrations, first run | ✅ Complete |
| [API Reference](./api-reference.md) | IPC + WebSocket API for developers | ✅ Complete |
| [FAQ](./faq.md) | Common questions and troubleshooting | ✅ Complete |
| [Security Model](./security.md) | Encryption, biometrics, threat model | ✅ Complete |

---

## Quick Orientation

```
┌──────────────────────────────────────────────────────┐
│  Context Engine (CAM)  →  Intelligence (BIE)         │
│  monitors apps, email,     learns your patterns,     │
│  calendar, files, Slack    predicts your next move   │
│                    ↓                                  │
│  Action System (PAS)   ←  Safety Layer (SGL)         │
│  suggests or executes      guardrails, audit log,    │
│  tasks automatically       undo buffer, vault        │
└──────────────────────────────────────────────────────┘
```

All processing happens **on your device**.  
Data is only sent to the cloud when you explicitly connect an integration.

---

## Feature Status (v2.0)

| Module | Features | Status |
|--------|----------|--------|
| CAM — Context Acquisition | Digital monitoring, temporal context, social context, cross-device sync | ✅ |
| BIE — Behavioral Intelligence | Pattern recognition + email templates, intent prediction, preference learning, anomaly detection | ✅ |
| PAS — Proactive Actions | Ghost overlay, autonomous execution, confidence levels, workflow automation, Slack drafts | ✅ |
| SGL — Safety & Governance | Guardrails (incl. external party block), privacy vault, 90-day audit trail, 30s undo | ✅ |
| MMI — Multi-Modal Interface | Ambient notifications, voice feedback, gesture control | ✅ |
| SEC — Security | AES-256-GCM + TLS 1.3, biometric auth, sandboxing | ✅ |
| NFR — Non-Functional | Uptime ≥99.9%, latency targets, throughput, battery monitoring | ✅ |
