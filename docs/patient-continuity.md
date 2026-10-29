# OncoBrief — Patient Continuity, Caregivers & Multilingual Delivery

## 1. Vision & Ethical Standards

Oncology treatment plans can be overwhelming for patients and families. Instructions regarding chemotherapy cycles, hydration protocols, appointment preparation, and follow-up tests are frequently misunderstood.

OncoBrief Bridges the Care Continuity Gap:
1. **Caregiver Network**: Patients can designate family caregivers (with recorded consent) to receive parallel appointment reminders and clinical instructions.
2. **Language Inclusivity**: Supports regional languages (Hindi, Tamil, Telugu, Kannada, Bengali, Marathi, Gujarati) alongside English.
3. **Multimodal Delivery**: Delivers text messages and natural-sounding voice notes (TTS) tailored for elderly patients or those with low literacy.
4. **Clinician Authorization**: Outbound messages are drafted automatically from approved consultation packets and encounter instructions, but **must be signed and approved by the attending clinician** prior to delivery.

---

## 2. Caregiver Consent & Revocation Model

- **Explicit Consent Recording**: When adding a caregiver (`registerCaregiver`), the system records who authorized the consent (`consent_recorded_by`) and timestamps it.
- **Immediate Revocation Guarantee**: A patient or coordinator can revoke caregiver access at any time (`revokeCaregiverConsent`). The database immediately sets `is_active = false`, records `revoked_at` and `revoked_by`, and updates `audit_event`.
- **Zero-Leak Outbox Filtering**: Outbound dispatches in `deliverMessage` check `is_active = true` in real-time. Revoked caregivers receive **zero** subsequent dispatches.

---

## 3. Multidisciplinary Tumor Board Meetings (`/tumor-board`)

Tumor boards bring together medical, surgical, and radiation oncologists, radiologists, and pathologists to review complex cases and establish treatment consensus.

### Features
1. **Meeting Administration**: Schedule tumor board sessions with meeting date, time, location/teleconference room, and designated moderator.
2. **Case Presentation Registration**: Link a patient, the approved consultation packet, and the presenting clinician.
3. **Four-Point Clinical Verification Checklist**:
   - `Histology Verified`: Confirms pathological diagnosis and biomarker status (ER/PR/HER2, EGFR, ALK, PD-L1).
   - `Imaging Verified`: Confirms recent CT, PET-CT, or MRI scans have been reviewed.
   - `Staging Verified`: Formulates consensus TNM clinical/pathological stage.
   - `Genomics Verified`: Confirms molecular/NGS findings where indicated.
4. **Consensus Documentation**: Records discussion summary, multidisciplinary recommendations, and next action items for the care coordinator.
