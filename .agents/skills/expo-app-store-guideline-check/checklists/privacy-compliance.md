# Privacy Compliance Checklist

> Version: 1.1 | Updated: 2026-03-29
> Covers: LGPD (Brazil) + GDPR (EU/EEA) + Apple App Store + Google Play Store

---

## 1. Privacy Policy

### Existence and Accessibility
- [ ] Privacy Policy exists at a public and permanent URL
- [ ] Privacy Policy accessible **within the app** (no login required)
- [ ] Link to Privacy Policy on onboarding/registration screen
- [ ] URL configured in App Store Connect (Apple)
- [ ] URL configured in Google Play Console
- [ ] Privacy Policy in **Portuguese** (for Brazilian users) `[LGPD]`
- [ ] Privacy Policy available in the **language(s) of target EU member states** `[GDPR]`

### Privacy Policy Content
- [ ] Collected data explicitly listed
- [ ] Purpose of use for each type of data
- [ ] Legal basis for each processing activity (LGPD Art. 7 / GDPR Art. 6)
- [ ] Sharing with third parties (list SDKs and partners)
- [ ] Data retention policy (how long each data is kept)
- [ ] Data subject rights explained
- [ ] How to exercise each right (clear instruction)
- [ ] DPO/Data Protection Officer name and contact
- [ ] Procedure in case of security incident
- [ ] Date of last update
- [ ] Information about international transfer (if data goes outside Brazil) `[LGPD]`
- [ ] International transfer safeguard documented (SCCs, adequacy) `[GDPR]`
- [ ] DPIA reference or indication if high-risk processing `[GDPR]`
- [ ] DPA (Data Processing Agreement) mentioned for each processor `[GDPR]`
- [ ] Legitimate Interest Assessment documented where LI is the legal basis `[GDPR]`

---

## 2. Consent

- [ ] Consent requested **before** collecting non-essential data
- [ ] Consent in **highlight** (not buried in text)
- [ ] Clear description of what is being authorized
- [ ] Link to full Privacy Policy at the moment of consent
- [ ] Option to **refuse** equally accessible as the option to accept
- [ ] No pre-checked consent checkboxes
- [ ] Mechanism for **revoking** consent in the app
- [ ] App works (with reduced functionality) for those who refuse optional data
- [ ] Separate consent per purpose (marketing ≠ analytics ≠ essential)

---

## 3. Collected Data — Inventory

For each collected data, verify:

| Data | Collected? | Legal Basis | Purpose | Retention | Shared with |
|------|-----------|-------------|---------|----------|-------------|
| Email | | | | | |
| Name | | | | | |
| Location | | | | | |
| Photos/Videos | | | | | |
| Usage data | | | | | |
| Device ID | | | | | |
| Crash logs | | | | | |
| Push tokens | | | | | |

- [ ] Data inventory filled out and updated
- [ ] Each data has defined legal basis
- [ ] No data collected without clear purpose

---

## 4. Data Subject Rights

### Data Access
- [ ] User can view their data within the app **OR**
- [ ] Access request mechanism (max 15 days response `[LGPD]` / 30 days `[GDPR]`)
- [ ] Response in readable format

### Data Correction
- [ ] User can edit their profile and basic data
- [ ] Process to correct data not in the app (contact DPO)

### Data Deletion (Account Deletion)
- [ ] **Deletion feature within the app** (required by Apple and LGPD)
- [ ] Deletion removes **all** user data (including backups, subject to legal obligation)
- [ ] Clear deletion period (immediate or up to 30 days)
- [ ] Deletion confirmation sent via email/notification
- [ ] Option to export data before deleting (portability)

### Portability
- [ ] Data export available (JSON, CSV or readable format)
- [ ] Process documented and communicated in Privacy Policy

### GDPR-Specific Rights `[GDPR]`
- [ ] Right to **restriction of processing** available (Art. 18)
- [ ] Right to **object** to legitimate interest processing available (Art. 21)
- [ ] Notification to recipients of rectification/erasure (Art. 19)
- [ ] Human review available for automated decision-making (Art. 22)

### Consent Revocation
- [ ] Marketing/analytics toggle in settings
- [ ] Immediate action after revocation
- [ ] App doesn't ask for consent again immediately

---

## 5. Data Security

- [ ] HTTPS on all API endpoints
- [ ] Sensitive data encrypted at rest (expo-secure-store)
- [ ] Passwords with hash (bcrypt/Argon2) — never plain text
- [ ] Tokens with limited validity and secure renewal
- [ ] No personal data in production logs
- [ ] No sensitive data in AsyncStorage
- [ ] Minimum access to APIs (principle of least privilege)
- [ ] Security review performed before each major release

---

## 6. Third-Party SDKs

- [ ] List of all SDKs that collect user data
- [ ] DPA (Data Processing Agreement) signed with each processor
- [ ] Privacy settings of each SDK verified

**Common SDKs — verify:**
- [ ] Firebase Analytics: data retention configuration, disable for minors
- [ ] Firebase Crashlytics: are crash data anonymized?
- [ ] Amplitude/Mixpanel: user deletion API available?
- [ ] Sentry: PII scrubbing configuration active
- [ ] Google Ads/AdMob: compliance with Families Policy (if app for children)
- [ ] Branch/Adjust/Appsflyer: data processing agreement signed

---

## 7. Children and Adolescents (if applicable)

- [ ] App rating indicates target audience (with or without minors)
- [ ] If app for minors: minimal data collection
- [ ] If app for minors: no third-party behavioral advertising
- [ ] Parental consent for minors under 12 years `[LGPD]` / under 16 years (or 13 per member state) `[GDPR]`
- [ ] COPPA compliance verified (if distributed in the US)

---

## 8. DPO (Data Protection Officer)

- [ ] DPO identified (individual or legal entity) — mandatory for LGPD controllers `[LGPD]`
- [ ] DPO appointment assessed: required for large-scale processing, public authorities, or special categories (Art. 37) `[GDPR]`
- [ ] DPO name in Privacy Policy
- [ ] DPO email/contact in Privacy Policy and within the app
- [ ] Contact channel with ANPD configured `[LGPD]`
- [ ] Contact channel with relevant supervisory authority configured `[GDPR]`
- [ ] DPO trained on applicable data protection obligations

---

## 9. Incident Response

- [ ] Documented process for responding to data breaches
- [ ] Person responsible for coordinating incident response defined
- [ ] ANPD notification checklist available (no specified deadline) `[LGPD]`
- [ ] **72-hour notification process** to supervisory authority documented `[GDPR]`
- [ ] Internal discovery timestamp captured (starts 72h GDPR clock)
- [ ] User notification template available (for high-risk breaches)
- [ ] Active security monitoring (anomaly alerts)

---

## 10. Review and Maintenance

- [ ] Privacy Policy reviewed with each release containing new data/features
- [ ] Privacy Policy with visible "last updated" date
- [ ] Annual compliance review scheduled
- [ ] Process for notifying users when Privacy Policy changes
- [ ] Record of processing activities (ROPA) maintained internally

---

## Final Verification

- [ ] Scan with `bash scripts/scan-project.sh .` and resolve CRITICAL items
- [ ] Consult the appropriate Privacy Policy template for generation/review
- [ ] Confirm that Data Safety (Google) and Privacy Labels (Apple) are consistent with Privacy Policy
- [ ] Lawyer specialized in LGPD reviewed the documents (recommended) `[LGPD]`
- [ ] Lawyer specialized in GDPR reviewed the documents (recommended) `[GDPR]`

---

## References

- `references/lgpd-privacy.md` — LGPD full reference
- `references/gdpr-privacy.md` — GDPR full reference
- `references/lgpd-vs-gdpr.md` — Side-by-side comparison and dual-compliance strategy
- `templates/privacy-policy-en.md` — Privacy Policy template (LGPD, EN)
- `templates/privacy-policy-pt-br.md` — Privacy Policy template (LGPD, PT-BR)
- `templates/privacy-policy-gdpr-en.md` — Privacy Policy template (GDPR, EN)
- [ANPD — Orientation Guides](https://www.gov.br/anpd/pt-br/documentos-e-publicacoes)
- [LGPD — Law 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm)
- [GDPR Full Text](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- [EDPB — Guidance and Guidelines](https://www.edpb.europa.eu/edpb_en)
