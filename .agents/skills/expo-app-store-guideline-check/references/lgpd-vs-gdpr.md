# LGPD vs GDPR — Comparison Guide for Mobile Apps

> Last updated: 2026-03-29
> For full details: see `references/lgpd-privacy.md` and `references/gdpr-privacy.md`

> **LEGAL NOTICE:** This comparison is a technical reference. Consult a lawyer
> specialised in data protection for complete legal compliance in either jurisdiction.

---

## When to Use Which

| Your Target Market | Use |
|-------------------|-----|
| Brazil only | `references/lgpd-privacy.md` + `templates/privacy-policy-pt-br.md` or `templates/privacy-policy-en.md` |
| EU/EEA only | `references/gdpr-privacy.md` + `templates/privacy-policy-gdpr-en.md` |
| Brazil + EU/EEA | Both references + this comparison + `templates/privacy-policy-gdpr-en.md` (add PT-BR section for Brazilian users) |

---

## Key Differences

| Area | LGPD (Brazil) | GDPR (EU/EEA) |
|------|--------------|----------------|
| **Regulation** | Law 13.709/2018 | Regulation 2016/679 |
| **Supervisory authority** | ANPD | Per member state (ICO, CNIL, BfDI, etc.) |
| **Principles** | 10 (Art. 6º) | 7 (Art. 5) |
| **Legal bases** | 5 (Art. 7º) | 6 (Art. 6) — adds vital interests + public interest |
| **Consent** | Free, informed, unambiguous (Art. 8º) | Same + must be demonstrable (Art. 7) |
| **Data subject rights response** | **15 days** (Art. 18) | **30 days** (extendable to 60) |
| **Account deletion** | No specified timeline | **30 days** (Art. 17) |
| **DPO appointment** | **Always mandatory** for controllers (Art. 41) | **Conditional** — large-scale, public authorities, special categories (Art. 37) |
| **Breach notification to authority** | "Reasonable time" to ANPD (Art. 48) | **72 hours** to supervisory authority (Art. 33) |
| **DPIA** | Not explicitly required | **Mandatory** for high-risk processing (Art. 35) |
| **Data Processing Agreement** | Not explicitly required | **Mandatory** with all processors (Art. 28) |
| **Legitimate Interest Assessment** | Not explicitly required | **Required** for Art. 6(1)(f) processing |
| **Children** | Under 18: parental consent; under 12: specific parental consent (Art. 14) | Under 16 (or 13 per member state) needs parental consent (Art. 8) |
| **International transfer** | Art. 33 — adequacy or contractual clauses | Art. 44–49 — adequacy, SCCs, BCRs, derogations |
| **Maximum fines** | 2% of revenue in Brazil, max R$50M per infraction | 4% of global annual revenue **or** €20M (whichever is higher) |
| **Right to restriction** | Not explicitly defined | Explicitly defined (Art. 18) |
| **Right to object** | Implicit via revocation of consent | Explicit right (Art. 21) |

---

## Shared Requirements

These requirements must be met for compliance with **both** LGPD and GDPR:

- Privacy Policy at a public URL and accessible within the app
- Explicit consent before collecting non-essential data
- Separate consent per purpose (marketing ≠ analytics ≠ essential)
- No pre-ticked consent checkboxes
- Account deletion accessible within the app
- Data export/portability mechanism
- DPO (or equivalent contact) identified and publicly reachable
- Encryption in transit (TLS 1.2+) and at rest for sensitive data
- Passwords hashed (never plain text)
- No sensitive data in production logs
- Data Processing Agreements with third-party SDKs
- Documented incident response process
- Privacy Policy reviewed when new features/data are added

---

## Dual-Compliance Strategy

When targeting both Brazil and EU, **default to the stricter requirement**:

| Area | Stricter Rule | Why |
|------|--------------|-----|
| Rights response time | **15 days** (LGPD) | Shorter than GDPR's 30 days |
| Account deletion | **30 days** (GDPR) | LGPD has no specified timeline |
| Breach notification | **72 hours** (GDPR) | LGPD says "reasonable time" |
| DPO | **Always appoint** (LGPD) | LGPD is unconditional |
| DPIA | **Always do for high-risk** (GDPR) | LGPD has no explicit requirement |
| DPA with processors | **Always sign** (GDPR) | LGPD has no explicit requirement |
| Children | **Under 13** parental consent (conservative) | Covers both LGPD's "under 12" and lowest GDPR member state age |

### Recommended Privacy Policy Structure for Dual-Market Apps

```
## Your Rights

### If you are in Brazil (LGPD — Art. 18)
[LGPD rights table with 15-day response]

### If you are in the EU/EEA (GDPR — Art. 15–22)
[GDPR rights table with 30-day response]
```

Or use the unified table with footnotes indicating jurisdiction-specific timelines.

---

## Items That Differ and Require Dual Implementation

### 1. Privacy Policy
- Must cover **both** sets of legal bases (LGPD Art. 7 and GDPR Art. 6)
- Must reference both ANPD and the relevant EU supervisory authority
- Response timelines should be specified per jurisdiction (or use the stricter 15 days)

### 2. Incident Response
- Maintain **two notification templates**: one for ANPD (LGPD Art. 48) and one for EU supervisory authority (GDPR Art. 33 — 72h deadline)
- Internal tracking must capture discovery time for the 72h GDPR clock

### 3. DPA with Processors
- Many providers have standard GDPR DPAs. Sign them. They usually also satisfy LGPD requirements.
- For Brazilian-only processors: request a data processing addendum even if they don't have a GDPR DPA template

### 4. Children
- If your app may be used by children: implement the most restrictive age gate (13+ with parental consent below)
- Document which member state age threshold you are applying if distributing in specific EU countries

---

## Fines Comparison

| | LGPD | GDPR |
|-|------|------|
| **Tier 1** | Warning | Up to €10M or 2% global revenue |
| **Tier 2** | Simple fine up to 2% of company's gross revenue in Brazil, max **R$50M per infraction** | Up to €20M or **4% global annual revenue** |
| **Other sanctions** | Partial/total suspension of operations, deletion of data | Temporary/permanent ban on processing, erasure orders |

---

## References

- `references/lgpd-privacy.md` — LGPD full reference
- `references/gdpr-privacy.md` — GDPR full reference
- `templates/privacy-policy-en.md` — Privacy Policy template (LGPD, EN)
- `templates/privacy-policy-pt-br.md` — Privacy Policy template (LGPD, PT-BR)
- `templates/privacy-policy-gdpr-en.md` — Privacy Policy template (GDPR, EN)
- [ANPD — Orientation Guides](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes)
- [EDPB — Consistency and Guidance](https://www.edpb.europa.eu/edpb_en)
