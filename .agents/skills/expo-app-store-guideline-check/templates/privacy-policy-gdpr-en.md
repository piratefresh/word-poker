# Template: Privacy Policy (GDPR — EN)

> This template is a starting point. Customize all sections marked with [PLACEHOLDER].
> It is recommended to review with a lawyer specialized in GDPR before publishing.
> Compatible with: GDPR (Regulation 2016/679), Apple App Store, Google Play Store.
> For LGPD (Brazil) compliance, use `templates/privacy-policy-en.md` or `templates/privacy-policy-pt-br.md`.

---

<!-- START OF PRIVACY POLICY — COPY FROM HERE -->

# Privacy Policy

**[APP NAME]**

*Last updated: [DATE — e.g.: March 29, 2026]*

---

## 1. Who We Are

**[COMPANY NAME]** ("we", "our", "us"), registered in **[EU COUNTRY]** under company number **[REGISTRATION NUMBER]**, located at **[REGISTERED ADDRESS]**, is the **Data Controller** for the application **[APP NAME]** ("Application").

In accordance with the General Data Protection Regulation (GDPR — Regulation 2016/679), we are responsible for determining the purposes and means of processing your personal data.

**Data Protection Officer (DPO):**
[IF DPO REQUIRED UNDER ART. 37 — remove this section if not applicable]
- Name: **[DPO NAME]**
- Email: **[dpo@yourcompany.com]**
- Address: **[DPO ADDRESS OR SAME AS COMPANY]**

**EU Representative** (if controller is outside EU/EEA):
[IF APPLICABLE — remove if company is in EU/EEA]
- **[EU REPRESENTATIVE NAME]**
- Email: **[representative@yourcompany.eu]**

---

## 2. Data We Collect

### 2.1 Data You Provide to Us

| Data | Purpose | Legal Basis (Art. 6) | Retention |
|------|---------|----------------------|-----------|
| Full name | Identification and personalization | Art. 6(1)(b) — contract | While account is active + [X] years |
| Email address | Login, notifications and communication | Art. 6(1)(b) — contract | While account is active + [X] years |
| Profile photo | Profile display | Art. 6(1)(a) — consent | While account is active |
| [ADD OTHER DATA] | [PURPOSE] | [LEGAL BASIS] | [RETENTION] |

### 2.2 Data Collected Automatically

| Data | Purpose | Legal Basis (Art. 6) | Retention |
|------|---------|----------------------|-----------|
| App usage data (screens visited, actions performed) | Service improvement and analytics | Art. 6(1)(f) — legitimate interests | [X] months |
| Device data (model, operating system, app version) | Technical support and diagnostics | Art. 6(1)(f) — legitimate interests | [X] months |
| Error and crash logs | Failure identification and correction | Art. 6(1)(f) — legitimate interests | [X] days |
| IP address | Security and fraud prevention | Art. 6(1)(f) — legitimate interests | [X] days |
| [IF LOCATION IS USED] Geographic location | [SPECIFIC PURPOSE] | Art. 6(1)(a) — consent | [RETENTION] |

### 2.3 Data We Do NOT Collect

We do not collect the following data:
- Passwords in plain text (we store only cryptographic hashes)
- Payment card data (managed entirely by our payment provider)
- Biometric data
- [LIST OTHERS IF RELEVANT]

---

## 3. How We Use Your Data

We use your personal data to:

1. **Provide and improve the service:** create and manage your account, process your requests
2. **Communication:** send service notifications, respond to support requests
3. **Security:** detect and prevent fraud, unauthorized access and abuse
4. **Analytics:** understand how the app is used to improve the experience (legitimate interest — see our LIA)
5. **Legal obligations:** comply with EU and member state laws
6. [IF APPLICABLE] **Marketing:** send communications about updates and offers (only with your explicit consent — Art. 6(1)(a))

---

## 4. Data Sharing

**We do not sell your personal data.** We may share information with:

### 4.1 Processors (Art. 28)

All processors are bound by a Data Processing Agreement (DPA) under GDPR Art. 28:

| Provider | Country | Purpose | Data Shared | Transfer Safeguard |
|----------|---------|---------|-------------|-------------------|
| [e.g.: Amazon Web Services (AWS)] | USA | Hosting and infrastructure | All stored data | Standard Contractual Clauses |
| [e.g.: Firebase / Google] | USA | Analytics and crash reporting | Usage data, error logs | Standard Contractual Clauses |
| [e.g.: Sentry] | USA | Error monitoring | Error logs, device data | Standard Contractual Clauses |
| [ADD OTHER SDKs/SERVICES] | | | | |

### 4.2 International Data Transfers (Art. 44–49)

Some providers are located outside the EU/EEA. We ensure transfers are protected by:
- **Standard Contractual Clauses** (SCCs) approved by the European Commission
- **Adequacy decisions** where applicable
- No transfer takes place without an appropriate safeguard

### 4.3 Legal Obligations

We may disclose your data when required by EU law, member state law, court order, or competent supervisory authority.

---

## 5. Your Rights (GDPR — Art. 15–22)

As a data subject, you have the following rights. We will respond within **30 calendar days** (extendable to 60 days for complex requests, with notice):

| Right | Article | How to Exercise | Response Time |
|-------|---------|-----------------|---------------|
| **Access** to your personal data | Art. 15 | [Profile > My Data] or email the DPO | Up to 30 days |
| **Rectification** of inaccurate or incomplete data | Art. 16 | [Profile > Edit Data] or email | Up to 30 days |
| **Erasure** ("right to be forgotten") | Art. 17 | [Settings > Delete Account] or email | Up to **30 days** |
| **Restriction** of processing | Art. 18 | Email the DPO | Up to 30 days |
| **Data portability** | Art. 20 | Email the DPO | Up to 30 days |
| **Object** to processing based on legitimate interests | Art. 21 | [Settings > Privacy] or email | Up to 30 days |
| Rights re: **automated decisions and profiling** | Art. 22 | Email the DPO | Up to 30 days |
| **Withdrawal of consent** | Art. 7(3) | [Settings > Privacy] | Immediate |

**To exercise your rights:** Contact us at **[dpo@yourcompany.com]** or through [Settings > Privacy > My Rights].

You also have the right to **lodge a complaint** with your national supervisory authority (see Section 12).

---

## 6. Account and Data Deletion

You can delete your account at any time:

**Within the app:** [Settings > Profile > Delete Account]

When deleting your account:
- Your personal data will be **permanently deleted within 30 days** (GDPR Art. 17)
- Anonymised data (not identifiable) may be retained for statistical purposes
- Data required by law will be retained for the mandatory period

---

## 7. Cookies and Similar Technologies

[IF APPLICABLE] We use the following tracking technologies, all subject to your consent where required:

- **Analytics:** [Firebase Analytics / Amplitude / etc.] to understand app usage
  - Legal basis: Art. 6(1)(a) — consent | Opt-out: [Settings > Privacy > Analytics]
- **Crash Reporting:** [Sentry / Crashlytics] to identify errors
  - Legal basis: Art. 6(1)(f) — legitimate interests | No personal data if configured correctly
- [LIST OTHER TECHNOLOGIES]

---

## 8. Data Security (Art. 32)

We implement appropriate technical and organisational measures:

- **Encryption in transit:** TLS 1.3 in all communications
- **Encryption at rest:** sensitive data stored in encrypted form
- **Pseudonymisation:** where possible, identifying data is separated from behavioural data
- **Restricted access:** only authorised personnel access personal data
- **Monitoring:** anomaly detection and access logging
- **Regular reviews:** periodic security audits and penetration testing

**In the event of a data breach** that is likely to result in a risk to your rights and freedoms, we will notify the relevant supervisory authority **within 72 hours** (Art. 33) and inform you **without undue delay** if the risk is high (Art. 34).

---

## 9. Children

[CHOOSE ONE OF THE OPTIONS BELOW:]

**Option A — App is NOT for children:**
This Application is not directed at children under the age of 16 (or the applicable age in your member state). We do not knowingly collect personal data from children. If we become aware that we have collected data from a child without verifiable parental consent, we will delete it promptly.

**Option B — App is for children (under 16):**
We require verifiable parental or guardian consent before collecting personal data from users under 16 years of age. We collect only the minimum data necessary and do not share children's data with third parties for advertising or profiling purposes.

---

## 10. Data Retention

We retain your personal data only as long as necessary for the purposes described in this Policy or as required by law:

| Data | Retention Period |
|------|----------------|
| Account data | While account is active + [X] years |
| Usage and analytics data | [X] months |
| Error logs | [X] days |
| [OTHER DATA] | [PERIOD] |

After the retention period, data is **securely deleted or anonymised**.

---

## 11. Changes to This Policy

We may update this Privacy Policy periodically. When there are significant changes:
- We will notify you by email and/or in-app notification **before** the changes take effect
- The "Last updated" date at the top of this document will be updated

Continued use of the Application after changes constitutes acceptance of the new policy.

---

## 12. Contact and Supervisory Authority

**For rights requests or privacy questions:**

**[COMPANY NAME]**
- Email: **[privacy@yourcompany.com]**
- [OPTIONAL] DPO: **[dpo@yourcompany.com]**
- Address: **[FULL REGISTERED ADDRESS]**

**You have the right to lodge a complaint** with your national data protection supervisory authority. The relevant authority depends on your EU/EEA country of residence:

| Country | Authority | Website |
|---------|-----------|---------|
| UK | ICO — Information Commissioner's Office | https://ico.org.uk |
| France | CNIL | https://www.cnil.fr |
| Germany | BfDI | https://www.bfdi.bund.de |
| Ireland | DPC — Data Protection Commission | https://www.dataprotection.ie |
| Netherlands | AP — Autoriteit Persoonsgegevens | https://www.autoriteitpersoonsgegevens.nl |
| [YOUR COUNTRY] | [AUTHORITY NAME] | [URL] |

Full list of EU supervisory authorities: https://www.edpb.europa.eu/about-edpb/about-edpb/members_en

---

*This Privacy Policy is governed by the General Data Protection Regulation (GDPR — Regulation 2016/679) of the European Parliament and of the Council.*

<!-- END OF PRIVACY POLICY -->

---

## Template Notes

### Available Legal Bases (GDPR Art. 6)
- **Art. 6(1)(a) — Consent:** for optional processing (marketing, optional analytics, location)
- **Art. 6(1)(b) — Contract:** for data necessary for the service (login, profile, orders)
- **Art. 6(1)(c) — Legal obligation:** for data required by EU or member state law
- **Art. 6(1)(d) — Vital interests:** rare — only if life is at risk
- **Art. 6(1)(e) — Public interest:** for public authorities or assigned tasks
- **Art. 6(1)(f) — Legitimate interests:** for security, fraud prevention, analytics — requires Legitimate Interests Assessment (LIA)

### Customization Checklist
- [ ] Replace all `[PLACEHOLDER]` with actual information
- [ ] Confirm whether DPO is mandatory under Art. 37 (large-scale processing, public authority, special categories)
- [ ] Add EU Representative if company is outside EU/EEA
- [ ] List ALL third-party processors with their DPA and transfer safeguard (verify with `scripts/check-data-safety.sh`)
- [ ] Define retention periods for each data type
- [ ] Configure the account deletion screen to complete within 30 days
- [ ] Update the supervisory authority table for your target countries
- [ ] Host at a public and permanent URL
- [ ] Review with a lawyer specialized in GDPR
- [ ] If targeting both Brazil and EU: combine with `templates/privacy-policy-en.md` sections
