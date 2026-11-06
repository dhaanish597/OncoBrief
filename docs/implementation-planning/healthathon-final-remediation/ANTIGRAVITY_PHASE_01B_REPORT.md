# ONCOBRIEF — ANTIGRAVITY IMPLEMENTATION REPORT (PHASE 01B)

- **Date:** 2026-11-02 (`2026-11-02T16:51:00+05:30`)
- **Author:** Autonomous Principal Full-Stack Engineer, Healthcare AI Safety Engineer, Sarvam AI Integration Specialist & TDD Lead
- **Environment:** Antigravity CLI / Node.js v24.21.0 / pnpm 9.15.4 / macOS Darwin
- **Repository:** `/Users/dhaanish/Documents/OncoBrief`
- **Active Branch:** `feat/v4-assessment-remediation`
- **Committed Base HEAD SHA:** `7b2edec145a9efe88f7f3928e6de975743ce33ca`
- **Execution Scope:** `TASK-01.03` & `TASK-01.04` (Completing Phase 01: Sarvam Voice, WAV Assembly & 11-Locale Continuity Remediation)

---

## 1. Execution Summary

### 1.1 Branch & Working-Tree Status
- **Branch:** `feat/v4-assessment-remediation` (preserved without destructive Git operations).
- **Committed HEAD Commit:** `7b2edec145a9efe88f7f3928e6de975743ce33ca` (`feat(operations): implement Milestone A and B oncology operations and management`).
- **Working-Tree Integrity:**
  - Zero uncommitted files or changes discarded (`git reset --hard`, `git clean -fd`, `git checkout -- .` were never executed).
  - All pre-existing modified tracked files (`66`) and untracked paths (`38`) from previous development were completely preserved.
  - Phase 01A contract tests (`packages/adapters/test/sarvam-voice-contracts.test.ts` 15/15) verified passing before and after Phase 01B changes.

### 1.2 Tasks Completed in This Phase
| Task ID | Priority | Description | Red Tests | Green Implementation | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`TASK-01.03`** | `P1_HIGH` | STT endpoint security (`patient:read`, 10MB upload cap), retry handling (`sarvamSttWithRetry`, `sarvamTtsWithRetry`), and browser voice fallbacks in `useVoice.ts` (remove `localService === true` restriction). | `apps/web/src/lib/tts-scope.test.ts` | `stt/route.ts`, `scoped-tts.ts`, `useVoice.ts` | **DONE** |
| **`TASK-01.04`** | `P0_CRITICAL` | 11-locale caregiver voice preview resolution (`resolveLocalizedMessageText`) in `messages.ts` and `scoped-tts.ts`, UI preview in `ContinuityAudioPlayer.tsx`, and source-grounded OPD slot offers in `opd-flow.ts` so `checkMessageGate()` passes with 0 blockers. | `packages/db/test/continuity-grounding.test.ts`, `apps/web/src/lib/tts-scope.test.ts` | `render.ts`, `messages.ts`, `opd-flow.ts`, `scoped-tts.ts`, `ContinuityAudioPlayer.tsx` | **DONE** |

---

## 2. Code Changes in Detail

### 2.1 `packages/domain/src/messages/render.ts` (`TASK-01.04`)
- **Problem:** `ALLOWED_LITERAL_VARIABLES` permitted `'clinic_name'`, `'hospital_name'`, `'records_office_phone'`, `'clinic_contact'`, and `'appointment_location'`, but lacked `'appointment_date'`. When administrative OPD slot offers were created with literal slot dates (e.g. `'2030-02-15 at 14:00'`), `checkMessageApprovalGate` failed with `Variable "appointment_date" is not an allowed literal variable.`
- **Change:** Added `'appointment_date'` to `ALLOWED_LITERAL_VARIABLES`.
- **Clinical Governance Boundary:** Preserves the closed allowlist. Only administrative constants (dates, locations, phone numbers, facility names) can have `source_kind: 'literal'`. All clinical statements (diagnoses, stage, lab values, prescriptions) still strictly require verified/corrected evidence facts from the Evidence Ledger.

### 2.2 `packages/db/src/services/messages.ts` (`TASK-01.04`)
- **Problem:** When a caregiver requested an audio preview in an Indic language (e.g. Tamil `ta-IN`), the backend had no mechanism to look up or render the approved template for that language with the message's verified variables.
- **Change:** Implemented and exported `resolveLocalizedMessageText(q, messageId, targetLanguageCode)`:
  1. Calls `checkMessageGate(q, messageId)` first. If gate fails or message is withdrawn, immediately returns `null` (zero leakage of ungrounded or withdrawn content).
  2. Compares normalized target language code with message locale. If identical, returns the authoritative `body_rendered`.
  3. Queries `message_template` for the organization's approved template in the target language (matching exact or short locale).
  4. Falls back to `ELEVEN_LOCALE_TEMPLATES[templateCode]` from `@oncobrief/adapters`.
  5. Renders the template using `renderTemplate(bodyTemplate, allowedVars, msg.variables_json)` using the verified substituted variables.
  6. Returns `{ text: rendered.body, locale: normalizedTarget, templateCode: msg.template_code }`.

### 2.3 `packages/db/src/services/opd-flow.ts` (`TASK-01.04`)
- **Problem:** `offerOpdSlot` with `notifyPatient: true` hardcoded an English string into `bodyRendered` without rendering the template body and inserted zero rows into `message_variable_source`. Consequently, `checkMessageGate(q, offerMessageId)` failed with `message_content_not_grounded` and missing variable sources, blocking message approval and delivery with HTTP 409.
- **Change:**
  1. Updated template resolution to search for `code = 'opd_slot_offer_v1'` with locale preference.
  2. Populated administrative variables: `appointment_date`, `appointment_location`, and `records_office_phone`.
  3. Rendered the template with `renderTemplate(tpl.body_template, tpl.allowed_variables, variables)`.
  4. Stored `variables_json` and rendered body into `patient_message`.
  5. Inserted rows into `message_variable_source` with `source_kind: 'literal'` for each variable.
  6. Verified that `checkMessageGate(q, offerMessageId)` now passes with `{ ok: true, blockers: [] }`.

### 2.4 `apps/web/src/app/api/v1/assistant/voice/stt/route.ts` (`TASK-01.03`)
- **Problem:**
  1. The route lacked role-based authorization: unprivileged roles lacking `patient:read` (e.g. `platform_admin`) could post audio.
  2. No upload size check was performed before allocating the full `file.arrayBuffer()` into Node.js memory.
  3. Used un-retried `sarvamStt()` instead of `sarvamSttWithRetry()`.
- **Change:**
  1. Added `can(session.role, 'patient:read')` check; returns HTTP 403 `forbidden` on failure.
  2. Enforced `file.size > 10 * 1024 * 1024` (10 MiB limit) BEFORE calling `file.arrayBuffer()`; returns HTTP 413 `audio_too_large`.
  3. Enforced `file.size < 100` and `arrayBuffer.byteLength < 100`; returns HTTP 400 `audio_too_short`.
  4. Switched to `sarvamSttWithRetry(..., 1)` to automatically absorb transient 429/503 network glitches from Sarvam.

### 2.5 `apps/web/src/lib/scoped-tts.ts` (`TASK-01.03`, `TASK-01.04`)
- **Problem:**
  1. Scoped TTS called `sarvamTts()` directly rather than `sarvamTtsWithRetry()`.
  2. Continuity voice previews read `message.bodyRendered` verbatim, causing Sarvam to synthesize English text even when the user requested Tamil, Hindi, or Bengali.
  3. Responses did not return `localizedText`.
- **Change:**
  1. For `scope === 'continuity'`, calls `resolveLocalizedMessageText(q, message.id, languageCode)`.
  2. Dispatches the resolved native-script text to `sarvamTtsWithRetry({ text: resolved.text, languageCode }, 1)`.
  3. Returns `localizedText: resolved.text` and `languageCode` on both HTTP 200 and HTTP 503 fallback responses.

### 2.6 `apps/web/src/components/assistant/useVoice.ts` (`TASK-01.03`)
- **Problem:**
  1. `speakWithBrowser()` filtered voices strictly with `candidate.localService === true`, which caused voice synthesis to fail on browsers where Indic voices are network/system voices.
  2. A failure during `transcribeWithSarvam()` set an error message and left the user stranded instead of falling back to browser speech recognition.
- **Change:**
  1. In `speakWithBrowser()`: searches voices prioritizing exact locale match then language prefix match without requiring `localService === true`. If no specific voice is installed, sets `utterance.lang = languageCode` and allows browser default speech synthesis to proceed.
  2. In `recorder.onstop` and fallback recording paths: when `transcribeWithSarvam()` throws, sets `setSarvamAvailable(false)` and immediately triggers `startBrowserRecognition()` as transparent fallback.

### 2.7 `apps/web/src/components/ContinuityAudioPlayer.tsx` (`TASK-01.04`)
- **Problem:** The player did not show the localized text script to the caregiver or clinician previewing the voice note, making it impossible to read the verified native-script message before dispatch.
- **Change:**
  1. Added `localizedText` state.
  2. Captured `data.localizedText` from HTTP 200 and fallback HTTP 503 payloads.
  3. Added `<div data-testid="localized-preview-text">` displaying the source-grounded native-script reminder text.
  4. On language selection change in the dropdown, resets `localizedText`, `audioUrl`, `provider`, and `statusMessage` so the preview accurately reflects the newly selected locale.

---

## 3. Strict TDD Protocol Evidence

### 3.1 RED Phase Confirmation

#### Test 1: `packages/db/test/continuity-grounding.test.ts`
- **Command:** `pnpm --filter @oncobrief/db test continuity-grounding.test.ts`
- **Exit Code:** `1`
- **Observed Failures:**
  ```text
  FAIL test/continuity-grounding.test.ts > continuity authoritative evidence binding > offerOpdSlot with notifyPatient: true creates a source-grounded message that passes checkMessageGate (TASK-01.04)
  AssertionError: expected false to be true
  > 79 |       expect(gate.ok).toBe(true);
       |                       ^

  FAIL test/continuity-grounding.test.ts > continuity authoritative evidence binding > resolveLocalizedMessageText resolves multi-locale templates and rejects ungrounded or withdrawn messages (TASK-01.04)
  TypeError: resolveLocalizedMessageText is not a function
  > 107 |         const resolvedHi = await resolveLocalizedMessageText(c, approvedId, 'hi-IN');
        |                                  ^
  ```

#### Test 2: `apps/web/src/lib/tts-scope.test.ts`
- **Command:** `pnpm --filter @oncobrief/web test tts-scope.test.ts`
- **Exit Code:** `1`
- **Observed Failures:**
  ```text
  FAIL src/lib/tts-scope.test.ts > STT endpoint security and retry (TASK-01.03) > rejects roles lacking patient:read with 403 forbidden
  AssertionError: expected 200 to be 403

  FAIL src/lib/tts-scope.test.ts > STT endpoint security and retry (TASK-01.03) > rejects audio uploads exceeding 10MB with 413 before buffer allocation
  AssertionError: expected 200 to be 413

  FAIL src/lib/tts-scope.test.ts > STT endpoint security and retry (TASK-01.03) > uses sarvamSttWithRetry and returns valid transcript
  AssertionError: expected 'Direct STT transcript' to be 'Patient has pain'

  FAIL src/lib/tts-scope.test.ts > Continuity 11-locale TTS voice preview (TASK-01.04) > resolves localized message text and invokes sarvamTtsWithRetry with target language
  AssertionError: expected 'audio' to be 'retry_audio'
  ```

---

### 3.2 GREEN Phase Confirmation

#### Test 1: `packages/db/test/continuity-grounding.test.ts`
- **Command:** `pnpm --filter @oncobrief/db test continuity-grounding.test.ts`
- **Exit Code:** `0`
- **Result:**
  ```text
  ✓ test/continuity-grounding.test.ts (6) 517ms
    ✓ continuity authoritative evidence binding (6)
      ✓ derives rendered dates from the same patient source rather than editable form text
      ✓ revalidates persisted rendered content before approval and dispatch
      ✓ rejects literal-only messages for a patient outside the session tenant
      ✓ rejects attaching a message to a different patient packet
      ✓ offerOpdSlot with notifyPatient: true creates a source-grounded message that passes checkMessageGate (TASK-01.04)
      ✓ resolveLocalizedMessageText resolves multi-locale templates and rejects ungrounded or withdrawn messages (TASK-01.04)

  Test Files  1 passed (1)
  Tests  6 passed (6)
  Duration  845ms
  ```

#### Test 2: `packages/db/test/opd-flow.test.ts`
- **Command:** `pnpm --filter @oncobrief/db test opd-flow.test.ts`
- **Exit Code:** `0`
- **Result:**
  ```text
  ✓ test/opd-flow.test.ts (22) 874ms
  Test Files  1 passed (1)
  Tests  22 passed (22)
  Duration  1.22s
  ```

#### Test 3: `apps/web/src/lib/tts-scope.test.ts`
- **Command:** `pnpm --filter @oncobrief/web test tts-scope.test.ts`
- **Exit Code:** `0`
- **Result:**
  ```text
  ✓ src/lib/tts-scope.test.ts (17)
    ✓ TTS authoritative scope (8)
    ✓ returns only gate-validated server text for a provider fallback
    ✓ blocks saved assistant speech after source withdrawal
    ✓ STT endpoint security and retry (TASK-01.03) (6)
      ✓ reports configured status on GET
      ✓ rejects unauthenticated STT requests with 401
      ✓ rejects roles lacking patient:read with 403 forbidden
      ✓ rejects audio uploads exceeding 10MB with 413 before buffer allocation
      ✓ rejects audio uploads under 100 bytes with 400 audio_too_short
      ✓ uses sarvamSttWithRetry and returns valid transcript
    ✓ Continuity 11-locale TTS voice preview (TASK-01.04) (1)
      ✓ resolves localized message text and invokes sarvamTtsWithRetry with target language

  Test Files  1 passed (1)
  Tests  17 passed (17)
  Duration  392ms
  ```

---

## 4. Multi-Layer Quality Gate Verification

All quality gates were executed and passed cleanly:

1. **Sarvam Voice & Adapter Contract Tests:**
   - Command: `pnpm --filter @oncobrief/adapters test`
   - Exit Code: `0`
   - Output: `14 passed (14 test files, 99 passed tests)` including `sarvam-voice-contracts.test.ts` (15/15) and `sarvam-translation-and-voice.test.ts` (3/3).
2. **Domain Logic & Governance Tests:**
   - Command: `pnpm --filter @oncobrief/domain test`
   - Exit Code: `0`
   - Output: `21 passed (21 test files, 576 passed tests)` including `messages-and-boundary.test.ts` (17/17).
3. **Web Application Unit & Security Tests:**
   - Command: `pnpm --filter @oncobrief/web test`
   - Exit Code: `0`
   - Output: `19 passed (19 test files, 225 passed tests)`.
4. **Clinical Boundary Static Scan:**
   - Command: `pnpm boundary:check`
   - Exit Code: `0`
   - Output: `clinical boundary scan: clean`
5. **Product Branding Static Scan:**
   - Command: `pnpm branding:check`
   - Exit Code: `0`
   - Output: `branding scan: clean — "OncoBrief" is the only product name in shipped surfaces`
6. **Monorepo-Wide TypeScript Check:**
   - Command: `pnpm -r --no-bail typecheck`
   - Exit Code: `0`
   - Scope: 6 of 6 workspace projects checked (`@oncobrief/domain`, `@oncobrief/ports`, `@oncobrief/adapters`, `@oncobrief/db`, `@oncobrief/worker`, `@oncobrief/web`) with zero type errors in 2.7s.

---

## 5. Implementation Tasks Progress Table

| Task ID | Phase | Priority | Status | Description |
| :--- | :--- | :--- | :--- | :--- |
| `TASK-01.01` | Phase 01 | P0 | **DONE** | Fix `normalizeLanguageCode()` case sensitivity & Odia (`or-IN` ↔ `od-IN`) provider mapping. |
| `TASK-01.02` | Phase 01 | P1 | **DONE** | Fix multi-chunk Sarvam TTS audio response handling and format-aware WAV assembly (`mergeWavBase64Chunks`). |
| `TASK-01.03` | Phase 01 | P1 | **DONE** | STT endpoint security (`patient:read`, 10MB cap), retry handling (`sarvamSttWithRetry`), and browser voice fallbacks. |
| `TASK-01.04` | Phase 01 | P0 | **DONE** | 11-locale caregiver voice preview resolution, UI preview, and source-grounded OPD slot offers. |
| `TASK-02.01` | Phase 02 | P0 | NOT_STARTED | Sarvam Vision OCR adapter test restoration, error propagation & routed auto-fallback. |
| `TASK-02.02` | Phase 02 | P0 | NOT_STARTED | 11-language document upload selector and RuleBasedExtractor Hindi/Tamil oncology patterns. |
| `TASK-02.03` | Phase 02 | P0 | NOT_STARTED | Remove artificial 4s upload delays and Strategy C raw-byte ASCII scraping. |
| `TASK-02.04` | Phase 02 | P0 | NOT_STARTED | Stage B provenance validator for FactValue discriminated union variants & insertFact gate. |
| `TASK-03.01` | Phase 03 | P1 | NOT_STARTED | Verified stage/diagnosis selector in /tumor-board and EXTRACTION_DRIVER env fix. |
| `TASK-03.02` | Phase 03 | P0 | NOT_STARTED | Complete database seed including all migration 0013-0021 tables and dr.ananya references. |
| `TASK-03.03` | Phase 03 | P2 | NOT_STARTED | Dynamic provider verificationTier reporting in system API and Continuity badges. |
| `TASK-04.01` | Phase 04 | P0 | NOT_STARTED | Final multi-layer verification campaign, live provider check & demo acceptance gate. |

**Phase 01 status: 4 of 4 tasks (100%) completed and verified.**
