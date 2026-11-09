# GDPR and Privacy — Reference for Mobile Apps

> Last updated: 2026-03-29
> GDPR text: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679
> EDPB guidelines: https://www.edpb.europa.eu/edpb_en

> **LEGAL NOTICE:** This document provides technical references for GDPR compliance.
> It does not replace specialized legal advice. Consult a lawyer for complete legal compliance.

---

## The 7 GDPR Principles (Art. 5)

### 1. Lawfulness, Fairness and Transparency
- Processing must have a **valid legal basis** (Art. 6), be fair to the data subject, and be transparent
- Data subjects must know what data is collected, why, and by whom
- **Application in apps:** clear Privacy Policy accessible before data collection; no hidden data use

### 2. Purpose Limitation
- Data collected for **specified, explicit and legitimate purposes**
- Must not be further processed in a manner incompatible with those purposes
- **Application in apps:** location for navigation cannot be repurposed for advertising without new consent

### 3. Data Minimisation
- Only data that is **adequate, relevant and limited** to what is necessary
- "If you don't need it, don't collect it"
- **Application in apps:** do not request camera permission if the app doesn't use the camera

### 4. Accuracy
- Personal data must be **accurate and kept up to date**
- Inaccurate data must be erased or corrected without delay
- **Application in apps:** functional profile editing screen; mechanism to report inaccurate data

### 5. Storage Limitation
- Data kept in identifiable form only **as long as necessary** for the purpose
- Must define and enforce retention periods
- **Application in apps:** automated deletion after inactivity period; documented retention schedule

### 6. Integrity and Confidentiality
- Appropriate **security** of personal data — protection against accidental loss, destruction, damage, unauthorised access
- **Application in apps:** encryption, HTTPS, secure storage, no exposed API keys, access controls

### 7. Accountability
- Controller is **responsible** for compliance and must be able to **demonstrate** it
- Document processing activities, train staff, implement policies
- **Application in apps:** maintain Record of Processing Activities (ROPA), document DPIA results

---

## Legal Bases for Processing (Art. 6)

Each data collection operation must have a valid legal basis:

| Legal Basis | When to Use |
|-------------|-------------|
| **Consent** (Art. 6(1)(a)) | Optional processing (marketing, optional analytics) |
| **Contract** (Art. 6(1)(b)) | Data necessary to perform the service (e.g., email for login) |
| **Legal obligation** (Art. 6(1)(c)) | Data required by EU/member state law |
| **Vital interests** (Art. 6(1)(d)) | Rare — only when life is at risk |
| **Public interest** (Art. 6(1)(e)) | Public authorities or tasks in public interest |
| **Legitimate interests** (Art. 6(1)(f)) | Security, fraud prevention, service improvements — requires LIA |

### Consent (Art. 7)
- Must be **freely given, specific, informed and unambiguous**
- Requires a **clear affirmative act** — silence, pre-ticked boxes, or inactivity do not constitute consent
- Controller must be able to **demonstrate** that consent was given
- Must be **distinguishable** from other matters (separate checkbox, not buried in T&Cs)
- **Withdrawable at any time** with the same ease as giving consent
- **Cannot condition service** on consent to non-necessary processing

### Legitimate Interests Assessment (LIA) — Art. 6(1)(f)
Required before relying on legitimate interests:
1. **Purpose test:** is there a legitimate interest?
2. **Necessity test:** is processing necessary for that purpose?
3. **Balancing test:** does it override the data subject's interests or rights?
Document the LIA and make it available if questioned by a supervisory authority.

---

## Data Subject Rights (Art. 15–22)

The app must provide mechanisms to exercise these rights. Response deadline: **30 calendar days** (extendable to 60 days for complex requests, with notice).

| Right | Article | How to Implement |
|-------|---------|-----------------|
| Right of access | Art. 15 | "My Data" screen or export request |
| Right to rectification | Art. 16 | Profile editing screen |
| Right to erasure ("right to be forgotten") | Art. 17 | Account deletion — within **30 days** |
| Right to restriction of processing | Art. 18 | Processing pause while dispute is resolved |
| Notification obligation | Art. 19 | Inform recipients of rectification/erasure |
| Right to data portability | Art. 20 | Export in machine-readable format (JSON/CSV) |
| Right to object | Art. 21 | Toggle to opt-out of legitimate interest processing |
| Rights re: automated decisions | Art. 22 | Human review option for profiling decisions |

### Account Deletion — Technical Implementation
- **Mandatory for app stores:** Apple (mandatory since 2023) and Google (strongly recommended)
- Must be accessible **within the app** (not just via email)
- Delete or anonymise **all data** within **30 days** (GDPR Art. 17)
- Confirm deletion via email/notification

---

## Technical Requirements for Apps

### Privacy Policy
**Mandatory minimum content (Art. 13/14):**
- Identity and contact details of the controller (and DPO if appointed)
- Purposes and **legal basis** for each processing activity
- Legitimate interests pursued (if using Art. 6(1)(f))
- Recipients or categories of recipients
- International transfers and safeguards used
- Retention periods for each data type
- All data subject rights and how to exercise them
- Right to withdraw consent at any time
- Right to lodge a complaint with a supervisory authority
- Whether provision of data is statutory/contractual/required for contract
- Existence of automated decision-making including profiling

**Where to make available:**
- Public URL (for App Store Connect and Google Play Console)
- Within the app (accessible without login)
- At registration/onboarding screen (before collecting data)

### Consent — Recommended UX
```
Onboarding screen:
[Clear title]
[Description of what is collected and why]
[Link to full Privacy Policy]
[Individual toggles for optional purposes: Analytics / Marketing]
[Button: "Continue"]
```

Never:
- Pre-select consent toggles (opt-out does not count)
- Bundle consent for multiple purposes into one checkbox
- Make refusal harder than acceptance
- Deny service for refusal of non-necessary processing

### Technical Security (Art. 32)
- **Encryption in transit:** TLS 1.2+ (HTTPS mandatory)
- **Encryption at rest:** for sensitive data (use expo-secure-store)
- **Pseudonymisation:** separate identifying data from behavioural data where possible
- **Minimum access:** principle of least privilege for APIs/databases
- **Logs:** no personal data in production logs
- **Backups:** retention and deletion policy applied to backups
- **Authentication:** hashed passwords (bcrypt/Argon2), never plain text
- **Tokens:** limited validity, secure renewal

### DPO (Data Protection Officer) — Art. 37–39

DPO is **mandatory** when:
- Public authority or body (regardless of data types)
- Large-scale, regular and systematic monitoring of data subjects
- Large-scale processing of **special categories** of data (health, biometric, etc.)

For other controllers: DPO is **optional but recommended**.

If appointed:
- Publicly identified (name and contact details published)
- Direct reporting line to highest management
- Cannot receive instructions about performance of tasks
- Direct communication channel with supervisory authority

### Breach Notification (Art. 33–34)
- Notify **supervisory authority** within **72 hours** of becoming aware (Art. 33)
- Notify **affected data subjects** "without undue delay" if high risk to their rights (Art. 34)
- Notification must include: nature of breach, categories and approximate number of affected persons, likely consequences, measures taken or proposed
- Document all breaches (even those not requiring notification)

### DPIA — Data Protection Impact Assessment (Art. 35)

**Mandatory** when processing is likely to result in high risk:
- Systematic and extensive **profiling** with significant effects
- Large-scale processing of **special category** data (health, biometric, race, religion, etc.)
- Systematic monitoring of a **publicly accessible area** at large scale

Process:
1. Describe the processing and its purposes
2. Assess necessity and proportionality
3. Identify and assess risks to data subjects
4. Identify measures to address those risks
5. Consult DPO (if appointed)
6. Consult supervisory authority if residual risk remains high (prior consultation, Art. 36)

### Data Processing Agreements (Art. 28)

**Mandatory** written contract with every data processor (any third party that processes data on your behalf):
- Firebase, AWS, Sentry, Amplitude, branch/Adjust, payment providers, email providers
- Contract must specify: subject matter and duration, nature and purpose of processing, type of personal data, categories of data subjects, obligations and rights of the controller

---

## Children (Art. 8)

- Processing of children's data based on consent is **only lawful** if the child is **16 years or older**
- Member states may lower this to **13 years** (UK: 13, Germany: 16, Spain: 14, France: 15)
- For younger children: consent must be **given or authorised by the holder of parental responsibility**
- Controller must make **reasonable efforts** to verify parental consent
- **Practical minimum age:** design for 16+ unless you verify age and obtain parental consent

---

## International Data Transfer (Art. 44–49)

If data is sent to servers outside the EU/EEA:

| Mechanism | Description |
|-----------|-------------|
| **Adequacy decision** (Art. 45) | Country deemed adequate by European Commission (e.g., Japan, Canada, UK post-Brexit) |
| **Standard Contractual Clauses** (Art. 46(2)(c)) | EC-approved contract templates — most common for US providers (AWS, Google, Firebase) |
| **Binding Corporate Rules** (Art. 47) | For intra-group transfers within multinational companies |
| **Derogations** (Art. 49) | Explicit consent, contract performance, public interest — only for occasional transfers |

**In practice:** Most major cloud providers (AWS, GCP, Azure, Firebase) offer SCCs. Execute them and document the transfer in your Privacy Policy.

---

## GDPR vs Apple/Google Requirements

| Requirement | GDPR | Apple | Google Play |
|-------------|------|-------|-------------|
| Privacy Policy | Mandatory | Mandatory | Mandatory |
| Account Deletion | 30 days (Art. 17) | Mandatory (since 2023) | Strongly recommended |
| Consent | Mandatory (legal bases) | ATT for tracking | Data Safety disclosure |
| Access to data | 30 days (Art. 15) | Not specified | Not specified |
| DPO | Conditional (Art. 37) | Not required | Not required |
| Breach notification | 72h to authority (Art. 33) | Not specified | Not specified |
| DPIA | Mandatory (high-risk) | Not required | Not required |

---

## GDPR Compliance Checklist

- [ ] Privacy Policy with all mandatory Art. 13/14 elements accessible in the app and via public URL
- [ ] Privacy Policy available in language(s) of target EU member states
- [ ] Data mapping: what data, legal basis, purpose, retention period, recipients
- [ ] Documented legal basis for each processing activity (Art. 6)
- [ ] Legitimate Interest Assessment (LIA) documented for any Art. 6(1)(f) processing
- [ ] Explicit consent obtained before collecting non-essential data
- [ ] Separate consent per purpose (marketing ≠ analytics ≠ essential)
- [ ] Consent records kept (who consented, when, to what)
- [ ] Privacy/consent management screen in the app
- [ ] Account deletion within 30 days, accessible within the app
- [ ] All data subject rights implementable (access, rectification, portability, objection, restriction)
- [ ] DPO appointment assessed; if required, appointed and publicly identified
- [ ] Data Processing Agreements (DPA) signed with all processors (Art. 28)
- [ ] DPIA conducted for any high-risk processing (Art. 35)
- [ ] 72-hour breach notification procedure documented and tested
- [ ] International transfer mechanism in place (SCCs or adequacy) and documented
- [ ] Children's age restriction or parental consent mechanism in place
- [ ] Record of Processing Activities (ROPA) maintained (Art. 30)

---

## Resources

- [GDPR Full Text (EUR-Lex)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679)
- [EDPB — European Data Protection Board](https://www.edpb.europa.eu/edpb_en)
- [ICO UK — GDPR Guidance](https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/)
- [CNIL France — GDPR Guide](https://www.cnil.fr/en/gdpr-developers-guide)
- [ISO/IEC 27001](https://www.iso.org/isoiec-27001-information-security.html) — security reference
