# HIPAA Business Associate Agreement — Template Stub

> **Status:** Phase 2 placeholder. The PFPA healthcare module (PHI Vault) requires a
> fully executed BAA before activation. This document is a structural template only —
> it must be reviewed and signed by a qualified attorney and your organisation's
> compliance officer before use.

---

## 1. Parties

| Role | Party |
|------|-------|
| **Covered Entity (CE)** | *(Healthcare organisation name)* |
| **Business Associate (BA)** | PFPA Project / *(your organisation)* |
| **Effective Date** | *(date)* |

---

## 2. Definitions (45 CFR §164.304)

- **PHI** — Protected Health Information: individually identifiable health information
  transmitted or maintained in any form or medium.
- **ePHI** — Electronic PHI processed or stored by PFPA.
- **Minimum Necessary** — BA shall request, use, and disclose only the minimum PHI
  necessary to accomplish the intended purpose (§164.514(d)).

---

## 3. Permitted Uses and Disclosures

BA may use or disclose PHI only to:

1. Perform functions, activities, or services specified in the Service Agreement.
2. Carry out BA's legal responsibilities.
3. Report violations of law to appropriate authorities.

BA shall **not** use or disclose PHI in any manner that would violate 45 CFR Part 164
if done by CE.

---

## 4. PFPA-Specific PHI Safeguards

### 4.1 PHI Isolation (SGL-2 Privacy Vault)

When the HIPAA module is activated, PFPA enforces:

- Medical portal windows are classified as `privacy_level = 'phi'` and excluded from
  the Behavioural Intelligence Engine (BIE) pattern recognition.
- PHI context signals are **never written** to Supabase sync tables.
- PHI data is stored in a separate encrypted partition within `electron-store` using a
  dedicated AES-256-GCM key derived from a BA-specific salt.
- The Privacy Vault (SGL-2) is automatically activated for all windows matching
  healthcare application names (Epic, Cerner, athenahealth, etc.).

### 4.2 Encryption

| Data state | Mechanism |
|------------|-----------|
| At rest | AES-256-GCM (SEC-1) |
| In transit | TLS 1.3 (SEC-1) |
| Cross-device | Client-side E2E encryption — PHI channels are **disabled** |

### 4.3 Minimum Retention

PHI context signals: retained for the duration required by the BAA and then
automatically purged. Default: 6 years (45 CFR §164.530(j)).

---

## 5. Required Safeguards (§164.314(a)(2))

BA agrees to:

- [ ] Implement administrative, physical, and technical safeguards per §164.308–164.312.
- [ ] Ensure any subcontractors that create, receive, maintain, or transmit ePHI on
      BA's behalf agree to the same restrictions and conditions as BA.
- [ ] Report to CE any Security Incident (§164.304) of which BA becomes aware within
      **72 hours** of discovery.
- [ ] Report any Breach of Unsecured PHI as required by §164.410 within **60 days**.

---

## 6. Individual Rights (§164.524 – §164.528)

BA shall, within **30 days** of a request from CE:

- Provide CE access to PHI to meet CE's obligations under §164.524.
- Make available PHI for amendment per §164.526.
- Provide an accounting of disclosures per §164.528.

---

## 7. Term and Termination

- This Agreement is effective on the Effective Date and terminates when the underlying
  Service Agreement terminates.
- Upon termination, BA shall return or destroy all PHI received from, or created on
  behalf of, CE, if feasible. If return or destruction is not feasible, the protections
  of this Agreement extend to any retained PHI.

---

## 8. Miscellaneous

- **Governing Law:** Laws of *(jurisdiction)*, to the extent not preempted by HIPAA.
- **Amendment:** This Agreement may be amended only by a written instrument signed by
  both parties.
- **Interpretation:** Any ambiguity shall be resolved in favour of a meaning that
  permits CE to comply with HIPAA.

---

## 9. Signatures

| | Covered Entity | Business Associate |
|-|----------------|--------------------|
| **Name** | | |
| **Title** | | |
| **Signature** | | |
| **Date** | | |

---

*This template was prepared for PFPA v2.2-M. It does not constitute legal advice.
Consult a healthcare compliance attorney before executing.*
