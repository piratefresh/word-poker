# LGPD and Privacy — Reference for Mobile Apps

> Last updated: 2026-03-28
> Law 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm
> ANPD: https://www.gov.br/anpd/pt-br

> **LEGAL NOTICE:** This document provides technical references for LGPD compliance.
> It does not replace specialized legal advice. Consult a lawyer for complete legal compliance.

---

## The 10 LGPD Principles (Art. 6º)

### 1. Purpose
- Data collected only for **specific, explicit, and legitimate** purposes
- Do not use data for purposes incompatible with what was informed
- **Application in apps:** declare in the Privacy Policy exactly what each data is for

### 2. Adequacy
- Processing compatible with the purposes informed to the data subject
- Context of processing must be consistent with what the user expects
- **Application in apps:** do not use location data collected for navigation for marketing purposes

### 3. Necessity (Data Minimization)
- Collect only the **minimum necessary** data for the declared purpose
- Fundamental principle: if you don't need it, don't collect it
- **Application in apps:** do not request camera permission if the app doesn't use the camera

### 4. Free Access
- Data subject has the right to access their data **freely, at any time**
- Easy and unobstructed access
- **Application in apps:** accessible "View my data" button, preferably within the app

### 5. Data Quality
- Data must be **accurate, clear, relevant, and up-to-date**
- Mechanism for the data subject to correct incorrect data
- **Application in apps:** functional profile editing screen, outdated data must be updateable

### 6. Transparency
- **Clear, precise, and easily accessible** information about processing
- Identification of the controller and DPO
- **Application in apps:** Privacy Policy in clear language, accessible in the app menu

### 7. Security
- Technical and administrative measures to **protect data** from unauthorized access
- Prevention of destruction, loss, alteration, improper disclosure
- **Application in apps:** encryption, HTTPS, secure storage, no exposed API keys

### 8. Prevention
- Measures to **prevent harm** to the data subject
- Adopt measures before incidents occur
- **Application in apps:** regular security audits, pentests, incident monitoring

### 9. Non-Discrimination
- Non-discriminatory processing based on personal data
- Prohibited use of data for unlawful, abusive discrimination, or against vulnerable groups
- **Application in apps:** do not use profile data to illegally refuse services

### 10. Accountability
- Demonstrate adoption of effective compliance measures
- Document processing activities
- **Application in apps:** maintain Record of Processing Activities (ROPA)

---

## Legal Bases for Processing (Art. 7º)

Each data collection operation needs a legal basis:

| Legal Basis | When to Use |
|-----------|-------------|
| **Consent** | Optional processing (marketing, optional analytics) |
| **Contract execution** | Data necessary for the service (e.g., email for login) |
| **Legal obligation** | Data required by law |
| **Legitimate interest** | Security, fraud prevention, service improvements |
| **Credit protection** | Credit scores |

### Consent (Art. 8º)
- Must be **free, informed, and unambiguous**
- **Highlighted** — not buried in a block of text
- For specific purposes — not "I consent to everything"
- **Revocable at any time** with the same ease as giving consent
- **Cannot be pre-checked** (opt-out does not constitute consent)

---

## Data Subject Rights (Art. 18)

The app must provide mechanisms to exercise these rights:

| Right | Response Period | How to Implement |
|---------|-------------------|------------------|
| Confirmation of processing | 15 days | "My Data" screen |
| Access to data | 15 days | Data export or view |
| Data correction | No specific deadline | Profile editing |
| Anonymization / Blocking | No specific deadline | Account suspension button |
| Portability | No specific deadline | Export in readable format |
| Data deletion | No specific deadline | **Account Deletion** |
| Consent revocation | Immediate | Consent toggle |
| Review of automated decisions | 15 days | Contact channel |

### Account Deletion — Technical Implementation
- **Mandatory for app stores:** Apple (mandatory since 2023) and Google (strongly recommended)
- Must be accessible **within the app** (not just via email)
- Delete or anonymize **all data** (including backups, except legal obligations)
- Confirm deletion via email/notification

---

## Technical Requirements for Apps

### Privacy Policy
**Mandatory minimum content:**
- Data collected and purpose for each
- Legal basis for each type of processing
- Sharing with third parties (name SDKs and partners)
- Data retention (how long each data is kept)
- Data subject rights and how to exercise them
- How to contact the DPO
- How to request data deletion
- Date of last update

**Where to make available:**
- Public URL (for App Store Connect and Google Play Console)
- Within the app (accessible without login)
- On registration/onboarding screen (before collecting data)

### Consent — Recommended UX
```
Onboarding screen:
[Clear title]
[Description of what is collected and why]
[Link to full Privacy Policy]
[Button: "Agree and Continue"]
[Button: "View privacy settings"]
```

Never:
- Pre-select consent
- Hide the option to refuse
- Make it difficult to revoke consent

### Technical Security
- **Encryption in transit:** TLS 1.2+ (HTTPS mandatory)
- **Encryption at rest:** for sensitive data (use expo-secure-store)
- **Minimum access:** principle of least privilege for APIs/databases
- **Logs:** no personal data in production logs
- **Backups:** retention and deletion policy in backups
- **Authentication:** hashed passwords (bcrypt/Argon2), do not store in plain text
- **Tokens:** limited validity, secure renewal

### DPO (Data Protection Officer) — Art. 41
- Mandatory for data controllers
- Can be an individual, legal entity, or service provider
- Must be publicly identified (name and contact in Privacy Policy)
- Direct communication channel with data subjects and ANPD

### Incident Notification — Art. 48
- In case of breach or unauthorized access:
- Notify **ANPD** within a reasonable time (72h is European reference, LGPD does not specify)
- Notify **affected data subjects** if it can cause relevant harm
- Include: nature of data, affected subjects, measures taken

---

## Children and Adolescents (Art. 14)

- Data of minors under 18 years: **consent from parents or legal guardians**
- Children (up to 12 years): processing only with **specific consent** from parents
- No data collection beyond the minimum necessary for participation
- No sharing with third parties without parental consent

---

## International Data Transfer (Art. 33)

If data is sent to servers outside Brazil (AWS, Google Cloud, Firebase, etc.):
- Destination country must have adequate protection level (Art. 33, I) **or**
- Standard contractual clauses with the provider **or**
- Specific and highlighted consent from the data subject

**In practice:** Most major providers (AWS, GCP, Azure, Firebase) have
certifications and contractual clauses that meet this requirement. Document it.

---

## LGPD vs Apple/Google Requirements

| Requirement | LGPD | Apple | Google Play |
|-----------|------|-------|-------------|
| Privacy Policy | Mandatory | Mandatory | Mandatory |
| Account Deletion | Mandatory (deletion) | Mandatory (since 2023) | Strongly recommended |
| Consent | Mandatory (legal bases) | ATT for tracking | Data Safety disclosure |
| Access to data | Mandatory (15 days) | Not specified | Not specified |
| DPO | Mandatory | Not required | Not required |
| Incident notification | Mandatory | Not specified | Not specified |

---

## LGPD Compliance Checklist

- [ ] Complete Privacy Policy, in the local language, accessible in the app and via public URL
- [ ] Data mapping (what data, why, for how long, with whom)
- [ ] Documented legal basis for each type of processing
- [ ] Explicit consent before collecting non-essential data
- [ ] Privacy/consent management screen in the app
- [ ] Functional and accessible account deletion within the app
- [ ] Mechanism for accessing user data
- [ ] Data export mechanism (portability)
- [ ] DPO identified in Privacy Policy with contact channel
- [ ] Encryption of sensitive data at rest and in transit
- [ ] Defined and implemented data retention policy
- [ ] Documented incident response process
- [ ] Data processing contracts with third parties (SDKs, APIs)
- [ ] Periodic compliance review (at least annual)

---

## Resources

- [Law 13.709/2018 (LGPD)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm)
- [ANPD — Orientation Guides](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes)
- [ANPD — Resolution CD/ANPD nº 4/2023 (Enforcement)](https://www.gov.br/anpd/pt-br)
- [ISO/IEC 27001](https://www.iso.org/isoiec-27001-information-security.html) — security reference
