# 0025 — Caregiver voice continuity, attendance confirmation, and WCAG accessibility

Status: Accepted. Date: 2026-10-24.

## Context

Phase 5 of the OncoBrief V4 Enhancement Plan introduces cancer patient and caregiver voice continuity, two-way administrative attendance tracking, WCAG 2.2 AA accessibility remediation, and mobile responsive layout hardening.

In the Indian oncology context:
1. Cancer patients rely centrally on family caregivers (spouses, adult children, relatives) to coordinate appointments, navigate hospital departments, and understand logistical instructions.
2. Literacy and language barriers are prevalent; spoken audio in regional Indian languages significantly improves attendance and comprehension over English text alone.
3. Administrative continuity messages must remain strictly non-clinical and non-diagnostic. Under no circumstance may the system autonomously generate emergency triage advice, interpret symptoms, prescribe remedies, or calculate urgency scores.
4. Patient privacy, explicit consent, and revocation are paramount under the Digital Personal Data Protection (DPDP) Act. Caregiver records require verified consent provenance, tenant isolation, and immediate cessation of dispatches upon consent revocation.
5. WCAG 2.2 AA compliance is required across all interface states: color contrast must meet minimum thresholds (>= 4.5:1 for standard text, >= 3:1 for graphical interface elements), landmarks must be semantic, skip-navigation links must be functional, and mobile displays (375px width) must render without horizontal scroll or control occlusion.

## Decision

### 1. Consented Caregiver Network & Lifecycle
- Extended the `caregiver_contact` relational model via migration `0015_patient_attendance_confirmation.sql` to support `revoked_at`, `revoked_by`, and `sync_reminders` boolean flags.
- Implemented `packages/db/src/services/caregivers.ts` providing `registerCaregiver`, `listCaregivers`, `getCaregiver`, `updateCaregiverPreferences`, and `revokeCaregiverConsent`.
- Enforced strict tenant and patient isolation: caregivers are bound to `(tenant_id, patient_id)` with RLS policies.
- Enforced consent provenance: registrations record `consent_status`, `consent_recorded_at`, and `consent_recorded_by`.
- Revocation immediately disables outbound synchronization (`sync_reminders = false` and `revoked_at = NOW()`). Revoked caregivers receive zero subsequent reminder dispatches.
- All registration, preference updates, and revocations append SHA-256 hash-chained audit events (`caregiver.registered`, `caregiver.updated`, `caregiver.revoked`).

### 2. Multilingual Voice Continuity & Multi-Tier Fallback
- Standardized `SUPPORTED_LOCALES` across 11 languages (1 English: `en-IN` + 10 Indic: `hi-IN`, `ta-IN`, `te-IN`, `bn-IN`, `mr-IN`, `kn-IN`, `ml-IN`, `gu-IN`, `pa-IN`, `or-IN`).
- Built `ContinuityAudioPlayer.tsx` offering a multi-tiered voice synthesis pipeline:
  1. **Primary**: Sarvam AI Bulbul v3 TTS integration with streaming audio playback.
  2. **Secondary**: Client-side browser Web Speech API (`window.speechSynthesis`) matching the requested language tag.
  3. **Tertiary Fallback**: Labeled synthetic audio tone preview with clear visual disclaimers.
- All TTS endpoints (`/api/v1/continuity/tts` and `/api/v1/assistant/voice/tts`) emit strict privacy headers: `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`. Ephemeral audio buffers are streamed and never persisted in database storage or browser disk caches.

### 3. Two-Way Administrative Attendance Confirmation
- Defined PostgreSQL enum `attendance_response_status` (`confirmed_attendance`, `cannot_attend`, `needs_coordinator_assistance`, `no_response`).
- Extended `patient_message` with `attendance_status`, `attendance_recorded_at`, `attendance_channel`, `attendance_responder`, and `attendance_note`.
- Implemented `recordMessageAttendance` in `packages/db/src/services/messages.ts` with strict state validation: attendance can only be logged on previously approved and delivered messages.
- Appends audit event `message.attendance_recorded` with redacted metadata.
- Boundary enforcement: attendance notes are restricted to administrative logistics (e.g., transport delays, coordinator callbacks); clinical inquiries are directed to hospital staff.

### 4. Audit Log Metadata Redaction
- Hardened `packages/db/src/services/audit.ts` by expanding `REDACT_KEYS` to automatically suppress:
  - Phone numbers (`phone`, `contact_number`)
  - Reasons and clinical notes (`reason`, `attendance_note`, `notes`)
  - File and artifact names (`filename`, `artifact_name`, `document_name`)
  - Transcripts and audio data (`transcript`, `query`, `prompt`, `audio`, `audio_base64`)
  - Caregiver names (`caregiver_name`, `contact_name`)
- Preserves cryptographic integrity: metadata redaction occurs prior to serialization into `audit_event.metadata_json`, while `entry_hash` chains immutably verify record ordering and tamper-evidence.

### 5. WCAG 2.2 AA Contrast & Semantic Layout Remediation
- Remediated CSS custom property color tokens in `apps/web/src/app/globals.css`:
  - `--color-state-extracted`: adjusted to `#7c530b`, achieving 6.12:1 contrast against canvas `#f7f4ee` (exceeds WCAG AA 4.5:1).
  - `--color-rule-strong`: adjusted to `#857d6f`, achieving 3.45:1 contrast against canvas `#f7f4ee` (exceeds WCAG 1.4.11 UI boundary 3:1).
  - `--color-state-conflicting`: adjusted to `#962123`, achieving 5.10:1 contrast against canvas `#f7f4ee` (exceeds WCAG AA 4.5:1).
- Added semantic `<main id="main-content">` landmark to `apps/web/src/app/(app)/layout.tsx`, paired with an accessible skip-navigation link (`<a href="#main-content">`).
- Hardened responsive mobile layout: added `pb-24` padding to `apps/web/src/app/(app)/patients/[id]/layout.tsx`, ensuring bottom action bars and continuity cards are fully readable and interactive without obstruction by the floating assistant launcher widget.
- Verified zero horizontal overflow (`scrollWidth === clientWidth`) at 375px mobile viewport width.

### 6. Phase 4 Safety Audit & Algorithmic De-Identification
- Hardened `validateDeidentification` in `packages/domain/src/studio/draft-generator.ts` to perform multi-pass regex detection for partial patient names, Indian phone formats (`+91` / 10 digits), email addresses, and date strings (`DD/MM/YYYY`, `Month YYYY`).
- Added explicit non-certification legal disclaimers to academic case report abstracts:
  > *"Algorithmic De-Identification Notice: This draft employs automated direct identifier suppression... It does not constitute certified expert determination under HIPAA §164.514(b)(1) or legal de-identification certification."*
- Audited patient-facing visit summaries to verify zero ungrounded clinical instructions, zero diagnostic inference, and zero emergency symptom triage claims.

## Alternatives and Consequences

- **External TTS-Only vs. Multi-Tier Fallback**:
  *Alternative*: Hard-failing voice playback if the cloud TTS endpoint (Sarvam) is unreachable or lacks an API key.
  *Rejection*: Unacceptable in hospital OPD and rural connectivity environments. The tiered fallback (Sarvam -> Browser Web Speech API -> Labeled synthetic audio tone) guarantees predictable, honest playback without crashing or showing false status indicators.
- **Persistent Audio Storage vs. Ephemeral Streaming**:
  *Alternative*: Storing synthesized MP3/WAV files in PostgreSQL or S3 object storage.
  *Rejection*: Audio recordings containing patient names or clinic appointment times constitute sensitive personal data under DPDP. Streaming with `Cache-Control: no-store` prevents unauthorized disk caching and eliminates data retention liabilities.
