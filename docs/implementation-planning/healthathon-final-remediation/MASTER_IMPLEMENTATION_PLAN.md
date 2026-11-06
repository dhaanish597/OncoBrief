# ONCOBRIEF — MASTER TEST-DRIVEN IMPLEMENTATION PLAN

- **Plan Version:** 3.0 (Post-Re-Audit Definitive TDD Specification)
- **Date:** 2026-11-01
- **Repository:** `/Users/dhaanish/Documents/OncoBrief`
- **Target Branch:** `feat/v4-assessment-remediation` (HEAD `7b2edec145a9efe88f7f3928e6de975743ce33ca` + 102 working-tree changes)
- **Hackathon Alignment:** Health-a-thon 2026 ([Official Portal](https://healthathon.reskilll.com/), [Participant Guide](https://healthathon.reskilll.com/guide), [Koita Foundation](https://www.koitafoundation.org/health-a-thon)) — Cancer Care Track (Use Case 02 Consultation Readiness, Use Case 04 Clinic Operations & OPD Flow, Use Case 05 Doctor Productivity & Knowledge Assistant, and Caregiver Administrative Care Continuity).

---

## 1. Executive Summary

Our independent re-audit of `/Users/dhaanish/Documents/OncoBrief` on `2026-11-01` revealed a critical finding: while a multi-wave remediation (`TASK-001` through `TASK-026` on branch `feat/v4-assessment-remediation`) modified 65 tracked files and added 37 untracked paths on top of commit `7b2edec`, **only 5 of the 18 defects from the previous Gemini Sarvam evaluation (`HEALTHATHON_SARVAM_EVALUATION_2026-10-30.md`) are fully fixed**, **4 are only partially fixed**, **9 remain completely unaddressed**, and **8 new defects** (including a `P0` clinical-safety gap where Stage B value-in-quote provenance validation `validateCandidateProvenance()` is never called in `insertFact()`, and a test regression that deleted all 381 lines of `SarvamVisionOcrAdapter` unit tests from `packages/adapters/test/ocr-correctness.test.ts`) exist in the current working tree.

This **Master Implementation Plan** defines **4 dependency-ordered phases** containing **12 atomic, test-driven tasks (`TASK-01.01` through `TASK-04.01`)** that resolve every remaining defect without rewriting or destabilizing the strong foundations already present in the working tree.

---

## 2. Current-State Diagnosis & What Must Not Be Rewritten

### 2.1 Verified Working Foundations (Preserve Intact)
1. **Universal PostgreSQL Row-Level Security (`0003_rls.sql`, `0020_remediation_rls_and_governance.sql`, `0021_wave2_complete_scope.sql`):** All V1–V4 and Milestone A/B tenant tables enforce `ENABLE + FORCE ROW LEVEL SECURITY` with null-safe `NULLIF(current_setting('app.org_id', true), '')::uuid` policies.
2. **CVE-2025-29927 Edge Middleware (`apps/web/src/middleware.ts`):** Blocks `x-middleware-subrequest` spoofing with `HTTP 403` and enforces session/Bearer auth.
3. **Canonical Readiness Worklist (`packages/domain/src/twin/readiness.ts`, `apps/web/src/app/(app)/workspace/page.tsx`):** Computes and filters `'ready' | 'gaps' | 'blocked' | 'none'` accurately.
4. **Multi-Report Scan Packet Segmentation (`packages/db/src/services/documents.ts:352-391`, `0021_wave2_complete_scope.sql`):** Persists `segmentDocumentPacket()` results in `document_subpacket` and renders sub-report badges on `/patients/[id]/sources`.
5. **Audible Offline PCM WAV Fallback (`packages/adapters/src/sarvam-voice.ts:283-330`, `ContinuityAudioPlayer.tsx:11-56`):** Synthesizes an audible 16-bit PCM WAV prosodic triad (`maxAmplitude > 12000`) when `SARVAM_API_KEY` is unavailable.
6. **Ask OncoBrief Co-Pilot State Graph, Productivity Studio, `[G#]` Guideline Viewer, ABDM Fidelius ECDH & Manifest V3 Extension (`apps/extension/`, `orchestrator.ts`, `ProductivityStudio.tsx`, `sources/page.tsx`):** All wired and working.

### 2.2 Confirmed Active Defects Requiring Remediation (`TASK-01.01` – `TASK-04.01`)
1. **`P0` Voice Locale Bug (`HIST-10`, `HIST-11` → `TASK-01.01`):** `normalizeLanguageCode()` in `packages/adapters/src/sarvam-voice.ts:64-69` lowercases `'hi-IN'` to `'hi-in'` before checking `SUPPORTED_LANGUAGES` (`'hi-IN'`), returning `false` and **forcing 100% of Sarvam STT and TTS calls to `'en-IN'`**. Additionally, Odia is `'or-IN'` internally instead of mapping to `'od-IN'` in outbound Sarvam API payloads.
2. **`P1` Multi-Chunk WAV Corruption (`HIST-12` → `TASK-01.02`):** `sarvamTts()` (`sarvam-voice.ts:212`) runs `data.audios?.join('')`, leaving mid-stream `=` base64 padding and embedded 44-byte RIFF/WAVE headers in chunks `1..N`.
3. **`P1` STT/TTS Retry Wiring, STT Route Guards & Browser Fallback (`HIST-13`, `HIST-14` → `TASK-01.03`):** `sarvamSttWithRetry()` and `sarvamTtsWithRetry()` are unused dead code; `/api/v1/assistant/voice/stt/route.ts` lacks `can(session.role, 'patient:read')` and a 10 MB file size cap; `useVoice.ts` does not fall back to browser `SpeechRecognition` when `/stt` fails and restricts browser TTS to `candidate.localService === true`.
4. **`P0` Continuity Cross-Locale Text Synthesis & Ungrounded OPD Offer Messages (`HIST-06`, `NEW-05` → `TASK-01.04`):** Selecting Tamil (`ta-IN`) in `ContinuityAudioPlayer` on an English reminder sends `languageCode='ta-IN'` to `scoped-tts.ts`, which still synthesizes English `message.bodyRendered` without rendering the Tamil template or returning `localizedText`. Furthermore, `offerOpdSlot()` (`opd-flow.ts:435-465`) inserts `patient_message` rows with hardcoded English text and zero `message_variable_source` rows, causing `checkMessageGate()` to fail with `HTTP 409`.
5. **`P0` Deleted `SarvamVisionOcrAdapter` Tests & Unconditional `try/catch` (`HIST-07`, `HIST-15`, `NEW-02`, `NEW-03` → `TASK-02.01`):** `packages/adapters/test/ocr-correctness.test.ts` deleted all 381 lines of `SarvamVisionOcrAdapter` tests, and `sarvam-vision-ocr.ts:237-262` added an unconditional `try/catch` that masks errors even when `driver === 'sarvam'`.
6. **`P0` Missing Upload Language Propagation & English-Only `RuleBasedExtractor` (`HIST-16` → `TASK-02.02`):** `DocumentUploadForm.tsx` has no language selector, `documents.ts:563` omits `language`, and `RuleBasedExtractor` extracts 0 facts from Hindi or Tamil oncology reports.
7. **`P0` Fake Upload `setTimeout` Stepper, Hardcoded `"Sarvam Vision"` Labels & Strategy C Raw-Byte Scraping (`HIST-17`, `NEW-06` → `TASK-02.03`):** `DocumentUploadForm.tsx:199-231` runs 4.0s of artificial `setTimeout` delays claiming `"Extracting tabular text spans with Sarvam Vision…"`, `ProcessingStatusCard.tsx:373` hardcodes `"Sarvam Vision (OCR): Active"`, and `local-multimodal-ocr.ts:482` Strategy C scans raw binary bytes for ASCII strings.
8. **`P0` Unwired Stage B Provenance Gate `validateCandidateProvenance()` (`NEW-01` → `TASK-02.04`):** `insertFact()` in `packages/db/src/services/ledger.ts:226` only calls `validateSpans()` (Stage A). `validateCandidateProvenance()` (Stage B value-in-quote entailment) is never called in production and does not unpack `FactValue` union variants.
9. **`P1` Unanchored Staging UI on `/tumor-board` & `EXTRACTION_DRIVER` Env Bug (`HIST-09`, `NEW-08` → `TASK-03.01`):** `tumor-board/page.tsx:258, 390` lacks a `stagingFactId` selector and uses clinical-decision placeholders, and `packages/db/src/env.ts:104` reads `EXTRACTOR_DRIVER` instead of `EXTRACTION_DRIVER`.
10. **`P0` Empty Milestone B Encounters & Tumor Board on Fresh Seed (`HIST-08`, `NEW-04` → `TASK-03.02`):** `seed()` in `packages/db/src/seed.ts` seeds 0 `clinic_session`, 0 `encounter`, 0 `tumor_board_meeting`, and 0 `tumor_board_case` rows; `bootstrapDemo()` line 1256 still queries non-existent `'ananya.mukhopadhyay@rci.invalid'`; and `TRUNCATE_TABLES` omits 16 tables.
11. **`P2` Hardcoded Provider Verification Tier (`NEW-07` → `TASK-03.03`):** `/api/v1/system/providers/route.ts` hardcodes `verificationTier: 'Contract/Sandbox Verified'` even when credentials are absent.

---

## 3. Target Architecture & Key Engineering Decisions

| Decision Area | Current Implementation & Weakness | Proposed Target Design | Why Preferable & Failure/Rollback Behavior |
| :--- | :--- | :--- | :--- |
| **1. Sarvam Voice Language Normalization & Odia Mapping (`TASK-01.01`)** | `normalizeLanguageCode()` lowercases the entire string (`'hi-in'`) and checks `SUPPORTED_LANGUAGES` (`'hi-IN'`), always returning `'en-IN'`. Odia is `'or-IN'` in UI/DB while Sarvam API expects `'od-IN'`. | Canonicalize `<lang.toLowerCase()>-<region.toUpperCase()>` and short codes (`'hi'` → `'hi-IN'`, `'ta'` → `'ta-IN'`, `'or'`/`'od'` → `'or-IN'`) inside `normalizeLanguageCode()`, and add `toSarvamApiLanguageCode()` mapping `'or-IN'` → `'od-IN'` in outbound `sarvamStt` and `sarvamTts` payloads. | Preserves backward compatibility with existing UI/DB `'or-IN'` records while sending `'od-IN'` to Sarvam's REST API and preserving all 11 locales. |
| **2. Multi-Chunk WAV Merging (`TASK-01.02`)** | `data.audios?.join('')` concatenates base64 strings directly, corrupting WAV playback after chunk 0. | `mergeWavBase64Chunks(chunks)` decodes each chunk to a `Buffer`, keeps chunk 0's 44-byte RIFF/WAVE header, strips bytes `0..43` from chunks `1..N` (when prefixed with `'RIFF'`), updates uint32LE `ChunkSize` at offset 4 and `Subchunk2Size` at offset 40, and re-encodes to base64. | Produces a single standards-compliant RIFF WAVE file playable in all browsers without external FFmpeg dependencies. |
| **3. Cross-Locale Continuity Voice Preview (`TASK-01.04`)** | `scopedTts('continuity')` always reads `message.bodyRendered` (e.g., English) even when the user selects `ta-IN` in `ContinuityAudioPlayer`. | Add `resolveMessageTextForLocale(q, messageId, languageCode)` in `messages.ts`: after verifying `checkMessageGate(q, messageId)`, if `languageCode` differs from `message.locale`, render the matching approved `message_template` (or `ELEVEN_LOCALE_TEMPLATES`) for `(templateCode, targetShortLocale)` using the message's verified `variables_json`, and return `localizedText` + audio. | Guarantees zero clinical hallucination because only pre-approved native-script templates and verified variables are synthesized. |
| **4. Sarvam OCR Error Handling & `OCR_DRIVER=auto` Routing (`TASK-02.01`)** | `SarvamVisionOcrAdapter` has an unconditional `try/catch` that swallows errors even when `driver === 'sarvam'`, and its unit tests were deleted. | Add `fallbackOnError?: boolean` to `SarvamVisionConfig` (set `true` only when `config.driver === 'auto'` in `ocr-routing.ts`, `false` when `driver === 'sarvam'`), support top-level `pages` or `documents[0].pages` in `getResults()`, and restore the full `SarvamVisionOcrAdapter` test suite in `ocr-correctness.test.ts`. | Keeps `SarvamVisionOcrAdapter` contract-strict when tested or configured explicitly, while ensuring `OCR_DRIVER=auto` never crashes live uploads if the external API is unreachable. |
| **5. Two-Stage Provenance Safety Gate (`TASK-02.04`)** | `insertFact()` only calls `validateSpans()` (Stage A). `validateCandidateProvenance()` (Stage B) is never called and doesn't handle `FactValue` union types. | Extend `validateCandidateProvenance()` to unpack all 9 `FactValue` union kinds (`date`, `appointment`, `lab`, `medication`, `procedure`, `facility`, `identifier`, `cycle`, `text`) and invoke it inside `insertFact()` immediately after `validateSpans()`. | Closes the hallucination loophole where an extractor attaches a real quote to a fabricated date or lab number. |

---

## 4. Prioritized Workstreams & Track Classification

In accordance with the official Health-a-thon 2026 schedule (Build Sprint: 10 October – 7 November 2026; Finale: 28 November 2026):
- **Track A — Submission-Critical (`P0`):** `TASK-01.01`, `TASK-01.04`, `TASK-02.01`, `TASK-02.02`, `TASK-02.03`, `TASK-02.04`, `TASK-03.02`, `TASK-04.01`.
- **Track B — High-Value Quality & Resilience (`P1` / `P2`):** `TASK-01.02`, `TASK-01.03`, `TASK-03.01`, `TASK-03.03`.
- **Track C — Optional Enhancements:** Bounded live Sarvam provider contract test (`RUN_LIVE_SARVAM_CONTRACT=1` in `TASK-04.01`).
- **Track D — Post-Hackathon Hospital Pilot (Explicitly Deferred):** Live NHA Production ABDM Gateway credentials, live hospital Telecom/DLT SMS registration, and standalone Android Patient Mobile App (`oncobrief-patient-app` in `docs/plans/PATIENT_MOBILE_*.md`).

---

## 5. Detailed Atomic Tasks (`PHASE-01` through `PHASE-04`)

### PHASE-01: Sarvam Voice, WAV Assembly & 11-Locale Continuity Remediation

---

#### `TASK-01.01` — Fix `normalizeLanguageCode()` Case-Sensitivity Bug & Odia (`or-IN` ↔ `od-IN`) Provider Mapping

- **A. Problem and Rationale:**
  - *What is wrong:* In `packages/adapters/src/sarvam-voice.ts:64-69`, `normalizeLanguageCode(code)` runs `const normalized = code.toLowerCase().replace(/_/g, '-')` (`'hi-IN'` → `'hi-in'`, `'ta-IN'` → `'ta-in'`) and then calls `isSupportedLanguage(normalized)` against `SUPPORTED_LANGUAGES` (`['en-IN', 'hi-IN', 'ta-IN', ...]`). Because `'hi-in' !== 'hi-IN'`, `isSupportedLanguage()` **always returns `false`**, and line 68 returns `'en-IN'`. Every call to `sarvamStt()` (`line 88`) and `sarvamTts()` (`line 178`) sends `'en-IN'`. Additionally, Sarvam's STT (`saaras:v3`) and TTS (`bulbul:v3`) endpoints expect `'od-IN'` for Odia rather than `'or-IN'`.
  - *Previously reported:* Yes (`HIST-10`, `HIST-11` in `HEALTHATHON_SARVAM_EVALUATION_2026-10-30.md`).
- **B. Exact Implementation Target:**
  - *Files:* `packages/adapters/src/sarvam-voice.ts`, `packages/adapters/src/sarvam-translation.ts`, `packages/adapters/test/sarvam-voice-contracts.test.ts`.
  - *Functions:* `normalizeLanguageCode(code: string): SupportedLanguage`, `export function toSarvamApiLanguageCode(code: string): string`, `sarvamStt()`, `sarvamTts()`.
- **C. TDD — RED:**
  - Create `packages/adapters/test/sarvam-voice-contracts.test.ts`:
    1. Test `normalizeLanguageCode` across all 11 BCP-47 codes (`'en-IN'`, `'hi-IN'`, `'ta-IN'`, `'te-IN'`, `'kn-IN'`, `'ml-IN'`, `'bn-IN'`, `'mr-IN'`, `'gu-IN'`, `'pa-IN'`, `'or-IN'`), lowercase (`'hi-in'`, `'ta-in'`), underscore (`'ta_IN'`), Odia alias (`'od-IN'`, `'od'`), and 2-letter short codes (`'hi'`, `'ta'`, `'te'`, `'bn'`, `'mr'`, `'kn'`, `'ml'`, `'gu'`, `'pa'`, `'or'`). Assert each returns its exact `SupportedLanguage` (not `'en-IN'`).
    2. Mock `globalThis.fetch` and call `sarvamStt({ audioData: Buffer.from('RIFF....'), languageCode: 'ta-IN' })` and `sarvamTts({ text: 'வணக்கம்', languageCode: 'ta-IN' })` and `sarvamTts({ text: 'ନମସ୍କାର', languageCode: 'or-IN' })`. Assert outbound STT `FormData.get('language_code') === 'ta-IN'` and outbound TTS JSON `target_language_code === 'ta-IN'` (and `'od-IN'` for Odia).
    3. Run `pnpm --filter @oncobrief/adapters test sarvam-voice-contracts.test.ts` → **Confirm RED failure** (`expected 'en-IN' to be 'ta-IN'`).
- **D. TDD — GREEN:**
  - In `packages/adapters/src/sarvam-voice.ts`:
    ```ts
    const SHORT_TO_BCP47: Record<string, SupportedLanguage> = {
      en: 'en-IN',
      hi: 'hi-IN',
      ta: 'ta-IN',
      te: 'te-IN',
      kn: 'kn-IN',
      ml: 'ml-IN',
      bn: 'bn-IN',
      mr: 'mr-IN',
      gu: 'gu-IN',
      pa: 'pa-IN',
      or: 'or-IN',
      od: 'or-IN',
    };

    export function normalizeLanguageCode(code: string): SupportedLanguage {
      if (!code || typeof code !== 'string') return 'en-IN';
      const cleaned = code.trim().replace(/_/g, '-');
      if (isSupportedLanguage(cleaned)) return cleaned;
      const lower = cleaned.toLowerCase();
      if (SHORT_TO_BCP47[lower]) return SHORT_TO_BCP47[lower]!;
      if (lower === 'od-in') return 'or-IN';
      const parts = lower.split('-');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const candidate = `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
        if (candidate === 'od-IN') return 'or-IN';
        if (isSupportedLanguage(candidate)) return candidate;
        if (SHORT_TO_BCP47[parts[0]]) return SHORT_TO_BCP47[parts[0]]!;
      }
      return 'en-IN';
    }

    export function toSarvamApiLanguageCode(code: string): string {
      const normalized = normalizeLanguageCode(code);
      return normalized === 'or-IN' ? 'od-IN' : normalized;
    }
    ```
  - In `sarvamStt()` (`sarvam-voice.ts:88, 120`): compute `const languageCode = normalizeLanguageCode(options.languageCode ?? 'en-IN');` and append `formData.append('language_code', toSarvamApiLanguageCode(languageCode));`.
  - In `sarvamTts()` (`sarvam-voice.ts:178, 182`): compute `const languageCode = normalizeLanguageCode(options.languageCode);` and set `target_language_code: toSarvamApiLanguageCode(languageCode)`.
- **E. TDD — REFACTOR:**
  - Delegate `toBcp47IndicCode()` in `packages/adapters/src/sarvam-translation.ts` directly to `normalizeLanguageCode()` so there is a single source of truth across `@oncobrief/adapters`.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/adapters test`.
- **G. Definition of Done:**
  - `normalizeLanguageCode()` returns the exact `SupportedLanguage` for all 11 languages across BCP-47, lowercase, underscore, and 2-letter inputs; `sarvamStt` and `sarvamTts` send the exact language code (`'ta-IN'`, `'hi-IN'`, `'od-IN'`) in outbound HTTP payloads.
- **H. Dependencies & Risk:**
  - *Prerequisites:* None. *Effort:* 30 mins. *Rollback:* `git checkout -- packages/adapters/src/sarvam-voice.ts`.

---

#### `TASK-01.02` — Implement `mergeWavBase64Chunks()` for Multi-Chunk Sarvam TTS Audio

- **A. Problem and Rationale:**
  - *What is wrong:* In `packages/adapters/src/sarvam-voice.ts:212`, `const audioBase64 = data.audios?.join('') ?? data.audio_base64 ?? '';` concatenates raw base64 strings when Sarvam TTS returns multiple audio chunks in `data.audios`. Base64 strings with `=` padding cannot be concatenated as strings, and each WAV chunk begins with a 44-byte RIFF/WAVE header whose byte lengths only cover chunk 0.
  - *Previously reported:* Yes (`HIST-12`).
- **B. Exact Implementation Target:**
  - *Files:* `packages/adapters/src/sarvam-voice.ts`, `packages/adapters/test/sarvam-voice-contracts.test.ts`.
  - *Functions:* `export function mergeWavBase64Chunks(chunks: string[]): string`, called in `sarvamTts()`.
- **C. TDD — RED:**
  - In `packages/adapters/test/sarvam-voice-contracts.test.ts`, generate two base64 WAV chunks (`chunk1`, `chunk2`) where each has a 44-byte RIFF header and 402 bytes of PCM data (so base64 has `==` padding). Mock `fetch` to return `{ audios: [chunk1, chunk2] }`. Call `sarvamTts(...)`, decode `result.audioBase64` to `Buffer`, and assert:
    1. `buf.byteLength === 44 + 804`.
    2. `buf.readUInt32LE(4) === 36 + 804`.
    3. `buf.readUInt32LE(40) === 804`.
    4. `buf.indexOf('RIFF', 4, 'ascii') === -1`.
  - Run test → **Confirm RED failure** (`buf.indexOf('RIFF', 4) !== -1` and invalid length).
- **D. TDD — GREEN:**
  - Implement `mergeWavBase64Chunks(chunks: string[]): string` in `packages/adapters/src/sarvam-voice.ts`:
    - Filter non-empty chunks; if 0 chunks return `''`; if 1 chunk return `chunks[0]!`.
    - Decode each chunk via `Buffer.from(c, 'base64')`.
    - If chunk 0 is at least 44 bytes and starts with `'RIFF'` and `'WAVE'`, take chunk 0's first 44 bytes as header, extract PCM slices from chunk `0..N` (stripping 44 bytes from any chunk that starts with `'RIFF'`), concatenate all PCM buffers, write `36 + totalPcmBytes` at offset 4 (`writeUInt32LE`) and `totalPcmBytes` at offset 40 (`writeUInt32LE`), and return `Buffer.concat([header, totalPcm]).toString('base64')`.
- **E. TDD — REFACTOR:**
  - Export `mergeWavBase64Chunks` from `packages/adapters/src/index.ts`.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/adapters test`.
- **G. Definition of Done:**
  - Single-chunk and multi-chunk `data.audios` responses from `sarvamTts` decode into a single valid RIFF WAVE buffer with updated `ChunkSize` and `Subchunk2Size` fields and zero embedded headers.
- **H. Dependencies & Risk:**
  - *Prerequisites:* `TASK-01.01`. *Effort:* 35 mins.

---

#### `TASK-01.03` — Wire Retry Helpers, Harden STT Endpoint (`RBAC` + `10 MB` Limit), and Fix `useVoice.ts` Fallbacks

- **A. Problem and Rationale:**
  - *What is wrong:* `sarvamSttWithRetry()` (`sarvam-voice.ts:234`) and `sarvamTtsWithRetry()` (`sarvam-voice.ts:255`) have 0 callers; `apps/web/src/app/api/v1/assistant/voice/stt/route.ts` does not check `can(session.role, 'patient:read')` or cap `arrayBuffer.byteLength` (allowing unbounded memory allocation); and `apps/web/src/components/assistant/useVoice.ts` fails to fall back to `startBrowserRecognition()` when `/stt` fails (`lines 252-265`) and requires `candidate.localService === true` for browser TTS (`line 316`).
  - *Previously reported:* Yes (`HIST-13`, `HIST-14`).
- **B. Exact Implementation Target:**
  - *Files:* `apps/web/src/app/api/v1/assistant/voice/stt/route.ts`, `apps/web/src/lib/scoped-tts.ts`, `apps/web/src/components/assistant/useVoice.ts`, `apps/web/src/lib/tts-scope.test.ts`.
- **C. TDD — RED:**
  - Add unit/route tests in `apps/web/src/lib/tts-scope.test.ts` verifying:
    1. `POST /api/v1/assistant/voice/stt` rejects a ` Blob` of `10 * 1024 * 1024 + 1` bytes with HTTP `413` (`audio_too_large`).
    2. `scopedTts` retries once when `fetch` returns HTTP `503` on the first attempt and `200 OK` on the second attempt.
  - Run `pnpm --filter @oncobrief/web test tts-scope.test.ts` → **Confirm RED failure**.
- **D. TDD — GREEN:**
  - In `apps/web/src/app/api/v1/assistant/voice/stt/route.ts`:
    - Import `can` from `@oncobrief/domain` and `sarvamSttWithRetry` from `@oncobrief/adapters`.
    - Check `if (!can(session.role, 'patient:read')) return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });`.
    - Check `const MAX_STT_BYTES = 10 * 1024 * 1024; if (file.size > MAX_STT_BYTES) return NextResponse.json({ error: { code: 'audio_too_large' } }, { status: 413 });` before `file.arrayBuffer()`.
    - Call `await sarvamSttWithRetry({ audioData: Buffer.from(arrayBuffer), languageCode, mimeType, filename }, 1)`.
  - In `apps/web/src/lib/scoped-tts.ts:51`: replace `sarvamTts` with `sarvamTtsWithRetry({ text: resolved.text, languageCode }, 1)`.
  - In `apps/web/src/components/assistant/useVoice.ts`:
    - In `recorder.onstop` `catch` block (`lines 252-265`), set `setSarvamAvailable(false)` and if `getBrowserRecognition()` is available, invoke `startBrowserRecognition()` and set a status notice instead of dead-ending on error.
    - In `speakWithBrowser` (`line 316`), select `voices.find(c => c.localService && ...) ?? voices.find(c => c.lang.toLowerCase().split('-')[0] === languageCode.toLowerCase().split('-')[0])` and if no voice object matches, still allow `utterance.lang = languageCode; window.speechSynthesis.speak(utterance)` (matching `ContinuityAudioPlayer.tsx`).
- **E. TDD — REFACTOR:**
  - Pass `retryDelayMs` option (`default = 300ms`) to `sarvamSttWithRetry` and `sarvamTtsWithRetry` so retries are fast in both production and unit tests.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/web test tts-scope.test.ts` and `pnpm --filter @oncobrief/adapters test`.
- **G. Definition of Done:**
  - `stt/route.ts` enforces `patient:read` (403) and `<= 10 MB` (413); both STT and TTS routes use `sarvamSttWithRetry` / `sarvamTtsWithRetry`; `useVoice.ts` falls back to browser STT/TTS when Sarvam is unavailable.
- **H. Dependencies & Risk:**
  - *Prerequisites:* `TASK-01.01`, `TASK-01.02`. *Effort:* 40 mins.

---

#### `TASK-01.04` — Wire 11-Locale Template Resolution & Translation into Continuity Voice Preview and Fix `offerOpdSlot` Message Grounding

- **A. Problem and Rationale:**
  - *What is wrong:*
    1. On `/patients/[id]/continuity`, `ContinuityAudioPlayer.tsx` lets the user select any of the 11 Indic languages (`ta-IN`, `hi-IN`, `te-IN`, etc.) and click `Generate & Preview Voice Note`. However, `scopedTts('continuity')` (`apps/web/src/lib/scoped-tts.ts:39`) returns `message.bodyRendered` verbatim (which is English for `DEMO-003`'s delivered reminder!). Thus, selecting `ta-IN` asks Sarvam Bulbul to read English words with a Tamil voice instead of rendering the approved Tamil template!
    2. In `packages/db/src/services/opd-flow.ts:435-485`, `offerOpdSlot(..., { notifyPatient: true })` queries `message_template` with `locale = 'en-IN'` (which fails to match `'en'` in `message_template`), writes a hardcoded English `bodyRendered`, and **never inserts rows into `message_variable_source`**, causing `checkMessageGate()` to fail with `message_content_not_grounded` (`HTTP 409`)!
  - *Previously reported:* Yes (`HIST-06`) + newly discovered `NEW-05`.
- **B. Exact Implementation Target:**
  - *Files:* `packages/db/src/services/messages.ts`, `packages/db/src/services/opd-flow.ts`, `apps/web/src/lib/scoped-tts.ts`, `apps/web/src/components/ContinuityAudioPlayer.tsx`, `packages/db/test/continuity-grounding.test.ts`, `apps/web/src/lib/tts-scope.test.ts`.
- **C. TDD — RED:**
  - In `apps/web/src/lib/tts-scope.test.ts`:
    1. Compose and approve an English `appointment_reminder` message (`locale = 'en'`). Call `POST /api/v1/continuity/tts` with `languageCode: 'ta-IN'`. Assert the response (`200` or `503`) contains `localizedText` in Tamil (`உங்கள் மருத்துவ சந்திப்பு`) with the patient's verified `appointment_date` substituted, and if Sarvam TTS is called, the outbound `text` payload is the Tamil text (NOT the English `bodyRendered`). Fails under current code (`text` is English).
  - In `packages/db/test/continuity-grounding.test.ts`:
    2. Call `offerOpdSlot(q, { ..., notifyPatient: true })` and then call `checkMessageGate(q, res.offerMessageId!)`. Assert `{ ok: true, blockers: [] }`. Fails under current code (`blockers: ['message_content_not_grounded']`).
- **D. TDD — GREEN:**
  - 1. In `packages/db/src/services/messages.ts`, export `resolveLocalizedMessageText(q: Querier, messageId: string, targetLanguageCode: string): Promise<{ text: string; locale: string } | null>`:
    - Load `m.org_id, m.patient_id, m.locale, m.variables_json, m.body_rendered, t.code AS template_code, t.allowed_variables` from `patient_message m JOIN message_template t ON t.id = m.template_id`.
    - Run `resolveVariableSources()` to obtain the authoritative verified `variables` map.
    - Normalize `targetLanguageCode` via `normalizeLanguageCode(targetLanguageCode)` (e.g., `'ta-IN'`) and extract its 2-letter code (`'ta'`, or `'or'` for `'or-IN'`).
    - If `m.locale === targetLanguageCode || m.locale === shortCode`, return `{ text: m.body_rendered, locale: targetLanguageCode }`.
    - Otherwise, query `message_template` for `(org_id = m.org_id, code = m.template_code, locale IN (shortCode, targetLanguageCode))` (falling back to `ELEVEN_LOCALE_TEMPLATES[template_code]?.[targetLanguageCode]`), render it via `renderTemplate(targetBodyTemplate, allowedVariables, authoritativeValues)`, and return `{ text: rendered.body, locale: targetLanguageCode }`.
  - 2. In `apps/web/src/lib/scoped-tts.ts`:
    - For `scope === 'continuity'`, after `checkMessageGate(q, message.id)` succeeds, call `const localized = await resolveLocalizedMessageText(q, message.id, languageCode)` and use `localized?.text ?? message.bodyRendered`.
    - Include `localizedText: resolved.text, languageCode` in both the `200 OK` JSON response and the `503` fallback JSON response.
  - 3. In `apps/web/src/components/ContinuityAudioPlayer.tsx`:
    - Add state `const [localizedPreviewText, setLocalizedPreviewText] = useState<string | null>(null);`.
    - When `/api/v1/continuity/tts` responds (200 or 503), set `setLocalizedPreviewText(data.localizedText ?? payload.fallbackText ?? null)` and render a clean `<p data-testid="continuity-localized-preview" className="doc-text mt-2 border-l-2 border-[var(--color-accent)] pl-2.5 text-xs text-[var(--color-ink)]">{localizedPreviewText}</p>` whenever `localizedPreviewText` is non-null.
  - 4. In `packages/db/src/services/opd-flow.ts:435-485`:
    - Resolve short locale (`const shortLocale = (info.primary_language || 'en-IN').split('-')[0]?.toLowerCase() || 'en'`).
    - Look up `message_template` where `org_id = $1 AND code = 'opd_slot_offer_v1' AND locale IN ($2, $3)` (or `'en'`), render it via `renderTemplate()` with `{ appointment_date: `${info.clinic_date} ${info.slot_start_time.slice(0, 5)}`, appointment_location: info.room_label, records_office_phone: '+91 00000 00000' }`, and insert the 3 corresponding literal rows into `message_variable_source` so `checkMessageGate()` passes!
- **E. TDD — REFACTOR:**
  - Ensure `composeMessage()` and `listMessageTemplates()` work seamlessly with both 2-letter (`'ta'`) and BCP-47 (`'ta-IN'`) locale codes.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/db test continuity-grounding.test.ts && pnpm --filter @oncobrief/web test tts-scope.test.ts`.
- **G. Definition of Done:**
  - Selecting any of the 11 languages in `ContinuityAudioPlayer` synthesizes and displays native-script text grounded in the message's verified variables; `offerOpdSlot` notifications pass `checkMessageGate()`.
- **H. Dependencies & Risk:**
  - *Prerequisites:* `TASK-01.01`, `TASK-01.03`. *Effort:* 60 mins.

---

### PHASE-02: Sarvam Document Intelligence, Indic Extraction & Two-Stage Provenance Gate

---

#### `TASK-02.01` — Restore `SarvamVisionOcrAdapter` Unit Tests & Move `OCR_DRIVER=auto` Fallback to `ocr-routing.ts`

- **A. Problem and Rationale:**
  - *What is wrong:*
    1. `packages/adapters/test/ocr-correctness.test.ts` was overwritten in the working tree, deleting all 381 lines of `SarvamVisionOcrAdapter` tests.
    2. `packages/adapters/src/sarvam-vision-ocr.ts:237-262` wrapped `processDocument()` in an unconditional `try / catch { return this.fallback.extractDocument(input); }`, causing `SarvamVisionOcrAdapter` to silently swallow all HTTP/validation errors even when explicitly configured as `driver: 'sarvam'`.
    3. `getResults()` (`sarvam-vision-ocr.ts:176-182`) rejects valid Sarvam JSON responses if `pages` is returned at the top level (`result.pages`) rather than nested inside `result.documents[0].pages`.
  - *Previously reported:* Yes (`HIST-07`, `HIST-15`) + newly discovered `NEW-02`, `NEW-03`.
- **B. Exact Implementation Target:**
  - *Files:* `packages/adapters/src/sarvam-vision-ocr.ts`, `packages/adapters/src/ocr-routing.ts`, `packages/adapters/test/ocr-correctness.test.ts`, `packages/db/test/ocr-routing.test.ts`.
- **C. TDD — RED:**
  - In `packages/adapters/test/ocr-correctness.test.ts`, restore the `SarvamVisionOcrAdapter` test suite alongside the `LocalMultimodalOcrAdapter` pixel tests:
    1. 23-page PDF batching (`splitPdfIntoBatches`) preserving page content and ordering (`1..23`).
    2. `transcodeIfNeeded` rejecting `image/tiff` with `ocr_unsupported_media`.
    3. Full `/doc-ai/v1/job/digitise` → `/status` → `/results` lifecycle with `language: 'ta-IN'` and normalized `[0, 1]` bounding boxes.
    4. Top-level `pages` envelope support in `getResults()`.
    5. Strict error propagation when `new SarvamVisionOcrAdapter({ apiKey: 'test', minIntervalMs: 0 })` (`fallbackOnError` not enabled) encounters HTTP `500` or `ocr_sarvam_page_count_mismatch`.
    6. Resilient fallback to `LocalMultimodalOcrAdapter` when `createOcrAdapter({ driver: 'auto', sarvam: { apiKey: 'test', minIntervalMs: 0, fetchImpl: failingFetch } })` (`fallbackOnError: true`) encounters a provider failure on a valid PDF.
  - Run `pnpm --filter @oncobrief/adapters test ocr-correctness.test.ts` → **Confirm RED failure** on test (5) because `SarvamVisionOcrAdapter` currently swallows errors unconditionally.
- **D. TDD — GREEN:**
  - In `packages/adapters/src/sarvam-vision-ocr.ts`:
    - Add `fallbackOnError?: boolean;` to `SarvamVisionConfig`.
    - In `extractDocument()` and `extract()`, only catch and delegate to `this.fallback` when `this.config.fallbackOnError === true` (or when `isStructured` is true for FHIR/JSON/DICOM/text). When `this.config.fallbackOnError` is falsy (e.g., `driver === 'sarvam'`), rethrow the error!
    - In `getResults()`, support `const sourcePages = (Array.isArray(documents) && documents.length === 1 ? documents[0]?.pages : undefined) ?? (Array.isArray(result['pages']) ? (result['pages'] as Json[]) : undefined);`.
  - In `packages/adapters/src/ocr-routing.ts`:
    - When `config.driver === 'auto' && config.sarvam?.apiKey`, pass `{ ...config.sarvam, fallbackOnError: true }` to `new SarvamVisionOcrAdapter(...)`.
    - When `config.driver === 'sarvam'`, pass `{ ...config.sarvam, fallbackOnError: config.sarvam.fallbackOnError ?? false }`.
- **E. TDD — REFACTOR:**
  - Clean up duplicate helper imports in `ocr-correctness.test.ts`.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/adapters test ocr-correctness.test.ts && pnpm --filter @oncobrief/db test ocr-routing.test.ts`.
- **G. Definition of Done:**
  - All restored `SarvamVisionOcrAdapter` tests and `LocalMultimodalOcrAdapter` pixel tests pass; `driver: 'sarvam'` enforces strict error contracts while `driver: 'auto'` falls back to `LocalMultimodalOcrAdapter`.
- **H. Dependencies & Risk:**
  - *Prerequisites:* None. *Effort:* 45 mins.

---

#### `TASK-02.02` — Plumb Document Language Through Upload Pipeline & Add Hindi/Tamil Extraction to `RuleBasedExtractor`

- **A. Problem and Rationale:**
  - *What is wrong:* `DocumentUploadForm.tsx` has no language selector; `uploadDocumentAction` (`actions.ts:500-523`) and `ingestDocument()` (`documents.ts:563-570`) never pass `language` to `deps.ocr.extractDocument()`; and `RuleBasedExtractor` (`rule-based-extractor.ts`) only matches English regex labels, extracting **0 facts** from Hindi or Tamil oncology reports.
  - *Previously reported:* Yes (`HIST-16`).
- **B. Exact Implementation Target:**
  - *Files:* `packages/adapters/src/rule-based-extractor.ts`, `packages/db/src/services/documents.ts`, `apps/web/src/lib/actions.ts`, `apps/web/src/components/DocumentUploadForm.tsx`, `packages/adapters/test/indic-extraction.test.ts`.
- **C. TDD — RED:**
  - Create `packages/adapters/test/indic-extraction.test.ts`:
    1. Construct a Hindi oncology report span list (`रिपोर्ट तिथि: 14/05/2025`, `एमआरएन: RCI-7781`, `हीमोग्लोबिन: 11.2 g/dL`, `प्लेटलेट्स: 185000 /uL`, `निदान: इनवेसिव डक्टल कार्सिनोमा`, `चरण: Stage IIA`, `अपॉइंटमेंट: 22/05/2025`) and a Tamil oncology report span list (`அறிக்கை தேதி: 14/05/2025`, `MRN: RCI-7781`, `ஹீமோகுளோபின்: 11.2 g/dL`, `தட்டணுக்கள்: 185000 /uL`, `நோய் கண்டறிதல்: மார்பக புற்றுநோய்`, `நிலை: Stage IIA`, `சந்திப்பு: 22/05/2025`).
    2. Call `new RuleBasedExtractor().extract(...)` on each and assert `candidates.length >= 6`, including `document.date` (`2025-05-14`), `identifier.mrn` (`RCI-7781`), `lab_result.as_written` (`Hemoglobin = 11.2 g/dL`, `Platelets = 185000 /uL`), `diagnosis_text.as_written`, `stage_text.as_written`, and `appointment.recorded` (`2025-05-22`), and assert every candidate's `verbatimQuote` is an exact substring of its span.
    3. Run `pnpm --filter @oncobrief/adapters test indic-extraction.test.ts` → **Confirm RED failure** (only English `MRN` matches; Hindi/Tamil dates, labs, diagnosis, stage, and appointments return 0 matches).
- **D. TDD — GREEN:**
  - 1. In `packages/adapters/src/rule-based-extractor.ts`:
    - Add Devanagari/Tamil digit normalization helper (`०-९` and `௦-௯` → `0-9` for parsed ISO dates/numbers while preserving `verbatimQuote` untouched).
    - Expand date label patterns to match `(?:Date|Specimen\s*Date|Report\s*Date|Collection\s*Date|Date\s*of\s*Presentation|रिपोर्ट\s*तिथि|नमूना\s*तिथि|दिनांक|तिथि|அறிக்கை\s*தேதி|தேதி|நாள்)`.
    - Expand MRN label pattern to match `(?:MRN|एमआरएन|மருத்துவ\s*பதிவு\s*எண்)`.
    - Expand follow-up and appointment patterns to match `(?:appointment|अपॉइंटमेंट|अगली\s*मुलाकात|अनुवर्ती|சந்திப்பு|அடுத்த\s*சந்திப்பு)(?:\s*(?:on|dated|scheduled on|दिनांक|तिथि|தேதி|:))?\s*(${DATE_PATTERN_SRC})`.
    - Expand diagnosis and stage patterns to match `(?:Diagnosis|Histological\s*Diagnosis|Histopathology\s*Diagnosis|Impression|निदान|रोग\s*निदान|நோய்\s*கண்டறிதல்)` and `(?:Stage(?:\s*as\s*documented)?|Documented\s*Stage|Pathological\s*Stage|चरण|स्टेज|நிலை)`.
    - Add a dictionary of common Hindi and Tamil lab/vital labels (`हीमोग्लोबिन` / `ஹீமோகுளோபின்` → `'Hemoglobin'`, `प्लेटलेट्स` / `प्लेटलेट` / `தட்டணுக்கள்` → `'Platelets'`, `श्वेत रक्त कोशिका` / `डब्ल्यूबीसी` / `வெள்ளை அணுக்கள்` → `'WBC'`, `क्रिएटिनिन` / `கிரியேட்டினைன்` → `'Creatinine'`, `बिलीरुबिन` / `பிலிருபின்` → `'Bilirubin'`, `वजन` / `எடை` → `'Weight'`, `ऊंचाई` / `உயரம்` → `'Height'`) so Indic lab lines (`<IndicLabel> : <Number> <Unit>`) extract with canonical English `value.name` (so longitudinal flowsheets group them with English labs!) and exact native-script `verbatimQuote`.
  - 2. In `packages/db/src/services/documents.ts`:
    - Add `language?: string;` to ` ingestDocument(q, deps, documentId, fixturePages, options?: { language?: string })` and pass `language: options?.language ?? process.env['OCR_LANGUAGE'] ?? 'en-IN'` to `deps.ocr.extractDocument(...)`.
  - 3. In `apps/web/src/components/DocumentUploadForm.tsx` and `apps/web/src/lib/actions.ts`:
    - Render a labeled `<select id="upload-document-language" name="language" defaultValue="en-IN" data-testid="upload-language-select">` in `DocumentUploadForm.tsx` using `SUPPORTED_LOCALES`.
    - Read `const language = optionalStr(fd, 'language') ?? 'en-IN'` in `uploadDocumentAction` (`actions.ts:500-523`) and pass `{ language }` to `ingestDocument()`.
- **E. TDD — REFACTOR:**
  - Keep Indic label mapping in a clean constant map `INDIC_LAB_NAME_MAP` in `rule-based-extractor.ts`.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/adapters test indic-extraction.test.ts` and `pnpm --filter @oncobrief/db test ocr-ingestion.test.ts`.
- **G. Definition of Done:**
  - Hindi and Tamil pathology/lab reports extract dates, MRNs, labs, diagnoses, stages, and appointments with 100% span validation; `DocumentUploadForm` exposes a labeled language selector that propagates to `deps.ocr.extractDocument()`.
- **H. Dependencies & Risk:**
  - *Prerequisites:* `TASK-02.01`. *Effort:* 60 mins.

---

#### `TASK-02.03` — Remove Artificial Upload `setTimeout` Stepper, Hardcoded `"Sarvam Vision"` Labels & Strategy C Raw-Byte Scraping

- **A. Problem and Rationale:**
  - *What is wrong:*
    1. `DocumentUploadForm.tsx:199-231` runs 4.0 seconds of hardcoded `setTimeout` delays with `"Extracting tabular text spans with Sarvam Vision…"` while `DocumentUploadForm.tsx:307` says `"OCR: LocalMultimodal + Pixel Engine"`, and `ProcessingStatusCard.tsx:58, 122, 373` hardcodes `12.5s` and `"Sarvam Vision (OCR): Active"`.
    2. `local-multimodal-ocr.ts:482-498` ("Strategy C") scans raw binary image buffers for ASCII substrings matching clinical words, fabricating text from binary headers if an image is unreadable.
  - *Previously reported:* Yes (`HIST-17`) + `NEW-06`.
- **B. Exact Implementation Target:**
  - *Files:* `packages/adapters/src/local-multimodal-ocr.ts`, `apps/web/src/components/DocumentUploadForm.tsx`, `apps/web/src/components/ProcessingStatusCard.tsx`, `apps/web/src/app/(app)/patients/[id]/sources/page.tsx`, `packages/adapters/test/ocr-correctness.test.ts`.
- **C. TDD — RED:**
  - In `packages/adapters/test/ocr-correctness.test.ts`, pass a corrupt/non-decodable PNG header followed by raw bytes `'RAW_BINARY_STREAM_Hemoglobin_12.0_g/dL'` (not inside a valid PNG `tEXt` chunk or valid `IDAT` bitmap) to `new LocalMultimodalOcrAdapter().extract(...)`. Assert `result.plainText === ''` and `result.spans.length === 0`. Fails under current Strategy C (`local-multimodal-ocr.ts:482`).
- **D. TDD — GREEN:**
  - 1. In `packages/adapters/src/local-multimodal-ocr.ts:482-498`, remove Strategy C so `extractImage()` only extracts from (a) genuine pixel OCR (`recognizeRasterImagePixels`) or (b) valid structured PNG `tEXt`/`zTXt`/`iTXt` or JPEG `COM`/`APP1` segments.
  - 2. In `apps/web/src/components/DocumentUploadForm.tsx`:
    - Add `ocrEngineLabel?: string;` prop (passed from `sources/page.tsx` based on `getOcr().name === 'sarvam-vision' ? 'Sarvam Vision (Doc AI v1)' : getOcr().name === 'textract' ? 'AWS Textract' : 'LocalMultimodal + Pixel Engine'`).
    - Remove the 4,000ms `setTimeout` sleep chain in `runStepSequence()`; advance `processingStep` based on actual upload initiation and server action completion, using `ocrEngineLabel` in the status text and passing `ocrEngineLabel` and real measured `elapsedSeconds` to `<ProcessingStatusCard />`.
  - 3. In `apps/web/src/components/ProcessingStatusCard.tsx`:
    - Accept `ocrEngineLabel?: string` and `elapsedSeconds?: number` props (defaulting to `'LocalMultimodal + Pixel Engine'` and `0.8` instead of hardcoded `'Sarvam Vision (OCR)'` and `12.5`).
- **E. TDD — REFACTOR:**
  - Ensure `data-testid="processing-status-card"` and step labels remain compatible with `apps/web/e2e/unknown-design-parity.spec.ts`.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/adapters test ocr-correctness.test.ts`.
- **G. Definition of Done:**
  - Strategy C raw-byte scraping is removed; `DocumentUploadForm` and `ProcessingStatusCard` contain zero artificial `setTimeout` sleeps or hardcoded `"Sarvam Vision"` claims when running local OCR.
- **H. Dependencies & Risk:**
  - *Prerequisites:* `TASK-02.01`. *Effort:* 40 mins.

---

#### `TASK-02.04` — Wire Stage B Value-in-Quote Provenance Entailment (`validateCandidateProvenance`) into `insertFact()`

- **A. Problem and Rationale:**
  - *What is wrong:* `insertFact()` in `packages/db/src/services/ledger.ts:226` only calls `validateSpans(input.verbatimQuote, spans)` (Stage A: quote is a substring of span). It **never calls `validateCandidateProvenance()` (Stage B: structured value is entailed by quote)**! Furthermore, `validateCandidateProvenance()` in `packages/domain/src/provenance/span-validation.ts:297-318` does not handle `FactValue` discriminated union objects (`{ kind: 'date', date }`, `{ kind: 'lab', name, valueText, unitText }`, `{ kind: 'medication', name, doseText }`, etc.).
  - *Previously reported:* Newly discovered `P0` clinical-safety defect (`NEW-01`).
- **B. Exact Implementation Target:**
  - *Files:* `packages/domain/src/provenance/span-validation.ts`, `packages/domain/src/provenance/span-validation.test.ts`, `packages/db/src/services/ledger.ts`, `packages/db/test/two-stage-span-gate.test.ts`.
- **C. TDD — RED:**
  - 1. In `packages/domain/src/provenance/span-validation.test.ts`, add tests passing `FactValue` union objects to `validateCandidateProvenance()`:
    - `{ kind: 'lab', name: 'Hemoglobin', valueText: '6.2', numericValue: 6.2, unitText: 'g/dL' }` with `verbatimQuote: 'Hemoglobin: 11.4 g/dL'` → assert `valid === false` and `stageFailed === 'STAGE_B'`.
    - `{ kind: 'date', date: '2026-12-31' }` with `verbatimQuote: 'Report Date: 14 May 2025'` → assert `valid === false` and `stageFailed === 'STAGE_B'`.
    - `{ kind: 'medication', name: 'Cisplatin', doseText: '50 mg' }` with `verbatimQuote: 'Tamoxifen 20 mg daily'` → assert `valid === false` and `stageFailed === 'STAGE_B'`.
  - 2. Create `packages/db/test/two-stage-span-gate.test.ts` calling `insertFact()` with a real persisted `text_span` (`'Hemoglobin: 11.4 g/dL on 14 May 2025'`) and a contradictory value (`{ kind: 'lab', name: 'Hemoglobin', valueText: '6.2', unitText: 'g/dL' }`). Assert `res.ok === false` and `res.reason === 'value_not_entailed'`.
  - Run tests → **Confirm RED failure** (`validateCandidateProvenance` returns `valid: true` on `FactValue` union objects and `insertFact` returns `ok: true`!).
- **D. TDD — GREEN:**
  - 1. In `packages/domain/src/provenance/span-validation.ts`:
    - Update `verifyTokensOrVocabInQuote(value, quote)` to support Unicode letters/digits (`/\p{L}|\p{N}/u`) so Hindi and Tamil strings are tokenized properly.
    - In `validateCandidateProvenance()`, handle `FactValue` discriminated union objects (when `typeof val === 'object' && val !== null && 'kind' in val`):
      - `kind === 'date' || kind === 'appointment'`: check `verifyDateInQuote(val.date, quote)` (allowing Devanagari/Tamil digit normalization).
      - `kind === 'lab'`: check `verifyLabValueInQuote({ value: val.valueText, unit: val.unitText }, quote)` (exempting synthetic derived demographic age/sex only when `val.valueText` token or `'Female'/'Male'/'F'/'M'` is in quote).
      - `kind === 'identifier'`: check `verifyTokensOrVocabInQuote(val.value, quote)`.
      - `kind === 'medication'`: check `verifyTokensOrVocabInQuote(val.name, quote) && (!val.doseText || verifyLabValueInQuote(val.doseText, quote))`.
      - `kind === 'procedure' || kind === 'facility'`: check `verifyTokensOrVocabInQuote(val.name, quote)`.
      - `kind === 'cycle'`: check `verifyTokensOrVocabInQuote(val.label, quote)`.
      - `kind === 'text'`: check `verifyTokensOrVocabInQuote(val.text, quote)`.
  - 2. In `packages/db/src/services/ledger.ts`:
    - Add `'value_not_entailed'` to `InsertFactResult`'s union of failure reasons.
    - In `insertFact()`, include `ocr_confidence` in the `SELECT id, document_id, page_id, text, ocr_confidence FROM text_span` query, call `validateCandidateProvenance({ factType: input.factType, value: input.value, verbatimQuote: input.verbatimQuote, spanIds: input.spanIds }, spans)`, and if `!provenanceCheck.valid`, return `{ ok: false, reason: provenanceCheck.stageFailed === 'STAGE_B' ? 'value_not_entailed' : 'span_mismatch', detail: provenanceCheck.reason }`.
    - If `provenanceCheck.minOcrConfidence !== undefined && provenanceCheck.minOcrConfidence < 0.85`, cap `confidenceRaw` / `band` to `'low'` so `verifyEvidenceBatch` refuses 2-click batch sign-off and forces individual clinician review!
- **E. TDD — REFACTOR:**
  - Verify all existing seed fixtures (`DEMO_001_DOCS`, `DEMO_002_DOCS`, `DEMO_003_DOCS`), FHIR bundles (`tmc_diagnostic`, `aiims_mcode`), and Hindi/Tamil extraction candidates pass both Stage A and Stage B.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/domain test span-validation.test.ts && pnpm --filter @oncobrief/db test two-stage-span-gate.test.ts`.
- **G. Definition of Done:**
  - `insertFact()` enforces both Stage A and Stage B across all 9 `FactValue` kinds, rejects contradictory values with `reason: 'value_not_entailed'`, routes `<0.85` OCR confidence spans away from batch auto-verification, and passes all domain and DB tests.
- **H. Dependencies & Risk:**
  - *Prerequisites:* `TASK-02.02`. *Effort:* 50 mins.

---

### PHASE-03: Clinical Boundary UI Governance, Complete Demo Seed & Provider Transparency

---

#### `TASK-03.01` — Add `stagingFactId` Selector to `/tumor-board` UI & Fix `EXTRACTION_DRIVER` Env Lookup

- **A. Problem and Rationale:**
  - *What is wrong:*
    1. `apps/web/src/app/(app)/tumor-board/page.tsx:258, 390` renders free-text `clinicalStaging` (`placeholder="e.g. cT2aN1M0 Stage IIB"`) and `recommendationNotes` (`placeholder="Board treatment recommendations, trial eligibility..."`) without any `stagingFactId` or `citedFactIds` selector.
    2. `packages/db/src/env.ts:104` reads `process.env.EXTRACTOR_DRIVER`, ignoring `EXTRACTION_DRIVER` defined in `.env` and `.env.example`.
  - *Previously reported:* Yes (`HIST-09`) + `NEW-08`.
- **B. Exact Implementation Target:**
  - *Files:* `packages/db/src/env.ts`, `packages/db/src/services/tumor-board.ts`, `apps/web/src/app/(app)/tumor-board/page.tsx`, `apps/web/src/lib/env-and-governance.test.ts`.
- **C. TDD — RED:**
  - Create `apps/web/src/lib/env-and-governance.test.ts` asserting:
    1. When `process.env.EXTRACTION_DRIVER = 'rule'` and `EXTRACTOR_DRIVER` is unset, `env.extractorDriver === 'rule'`.
    2. `apps/web/src/app/(app)/tumor-board/page.tsx` renders `name="stagingFactId"` with an explicit `<label htmlFor>` and contains zero occurrences of `'trial eligibility'` or `'Board treatment recommendations'`.
  - Run test → **Confirm RED failure**.
- **D. TDD — GREEN:**
  - 1. In `packages/db/src/env.ts:104`, change `return (process.env.EXTRACTION_DRIVER ?? process.env.EXTRACTOR_DRIVER ?? 'auto') as 'auto' | 'bedrock' | 'rule';`.
  - 2. In `packages/db/src/services/tumor-board.ts`, export `listVerifiedPatientStagingFacts(q: Querier, orgId: string)` returning verified/corrected stage, diagnosis, and procedure facts (`id`, `patient_id`, `fact_type`, `value_normalized`, `verbatim_quote`).
  - 3. In `apps/web/src/app/(app)/tumor-board/page.tsx`:
    - Load `stagingFacts = await listVerifiedPatientStagingFacts(q, s.orgId)`.
    - In both the Register Case form and Update Case form, add a labeled `<select id="tb-staging-fact" name="stagingFactId">` allowing the clinician/coordinator to anchor documented staging directly to a verified Evidence Ledger fact.
    - Replace clinical-decision placeholders with `'Documented Stage (Anchored to Verified Ledger Fact)'` and `'Multidisciplinary Operational & Care-Coordination Consensus'`.
- **E. TDD — REFACTOR:**
  - Export `listVerifiedPatientStagingFacts` from `packages/db/src/index.ts`.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/web test env-and-governance.test.ts && pnpm boundary:check`.
- **G. Definition of Done:**
  - `/tumor-board` forms include labeled `stagingFactId` selectors, pass `pnpm boundary:check` and WCAG label checks, and `env.extractorDriver` honors `EXTRACTION_DRIVER`.
- **H. Dependencies & Risk:**
  - *Prerequisites:* None. *Effort:* 35 mins.

---

#### `TASK-03.02` — Complete Milestone A/B Seeding in `seed.ts`, Fix `ananya.mukhopadhyay@rci.invalid`, and Complete `TRUNCATE_TABLES`

- **A. Problem and Rationale:**
  - *What is wrong:*
    1. `seed()` in `packages/db/src/seed.ts` never seeds `clinic_session`, `encounter`, `encounter_participant`, `encounter_note_version`, `tumor_board_meeting`, or `tumor_board_case`.
    2. `bootstrapDemo()` (`seed.ts:1256`) queries `SELECT id FROM app_user WHERE email = 'ananya.mukhopadhyay@rci.invalid' LIMIT 1`, which returns `undefined` because the seeded user is `'dr.ananya@rci.demo'`.
    3. `TRUNCATE_TABLES` (`seed.ts:40-88`) omits 16 tables added in migrations `0013`–`0021`.
  - *Previously reported:* Yes (`HIST-08`) + `NEW-04`.
- **B. Exact Implementation Target:**
  - *Files:* `packages/db/src/seed.ts`, `packages/db/test/seed-completeness.test.ts`.
- **C. TDD — RED:**
  - Create `packages/db/test/seed-completeness.test.ts` that runs `setupFixtures()` (which calls `seed()`) and queries `clinic_session`, `appointment`, `opd_appointment_slot`, `opd_waitlist_entry`, `encounter`, `encounter_participant`, `encounter_note_version`, `tumor_board_meeting`, and `tumor_board_case` in `org1`. Assert each table has `rowCount >= 1`, `tumor_board_case.staging_fact_id IS NOT NULL`, and `encounter_note_version.cited_fact_ids` is non-empty.
  - Run `pnpm --filter @oncobrief/db test seed-completeness.test.ts` → **Confirm RED failure** (`clinic_session`, `encounter`, `tumor_board_meeting`, `tumor_board_case` all have `0` rows!).
- **D. TDD — GREEN:**
  - 1. Add all 16 missing tables (`ingestion_job`, `abdm_patient_link`, `abdm_consent_request`, `abdm_consent_artifact`, `abdm_data_transfer`, `opd_slot_event`, `clinic_session`, `clinician_unavailability`, `appointment`, `appointment_status_history`, `encounter`, `encounter_participant`, `encounter_note_version`, `tumor_board_meeting`, `tumor_board_case`, `document_subpacket`) to `TRUNCATE_TABLES` in `packages/db/src/seed.ts:40-88`.
  - 2. Inside `seed()` (after appointment and guideline seeding around line 1115):
    - Insert a `clinic_session` for `userId['dr.rao@rci.demo']`.
    - Insert an active `encounter` + `encounter_participant` + ledger-anchored `encounter_note_version` (referencing `packet.packetId` and verified `readyFacts` of `p3` `DEMO-003`).
    - Lookup a verified stage/diagnosis/procedure fact on `p3` (`DEMO-003`), insert a scheduled `tumor_board_meeting` (`'RCI Multidisciplinary Oncology Tumor Board'`), and insert a `tumor_board_case` for `p3` with `staging_fact_id` and `cited_fact_ids` populated!
  - 3. In `bootstrapDemo()` (`seed.ts:1256`), replace `'ananya.mukhopadhyay@rci.invalid'` with `'dr.ananya@rci.demo'`.
- **E. TDD — REFACTOR:**
  - Ensure `seed()` and `bootstrapDemo()` use identical non-diagnostic coordination wording that passes `validate_tumor_board_case_governance()` and `validate_encounter_note_governance()`.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/db test seed-completeness.test.ts && pnpm --filter @oncobrief/db test milestone-b.test.ts`.
- **G. Definition of Done:**
  - A fresh `pnpm db:seed` populates all V4 and Milestone A/B tables (`>= 1` row each) with ledger-anchored `encounter_note_version` and `tumor_board_case` records, and `bootstrapDemo()` contains zero references to `.invalid` emails.
- **H. Dependencies & Risk:**
  - *Prerequisites:* `TASK-02.04`, `TASK-03.01`. *Effort:* 45 mins.

---

#### `TASK-03.03` — Dynamic Verification Tier Reporting in `/api/v1/system/providers`

- **A. Problem and Rationale:**
  - *What is wrong:* `apps/web/src/app/api/v1/system/providers/route.ts:48-167` hardcodes `verificationTier: 'Contract/Sandbox Verified'` across all 8 ports even when `credentialsPresent` is `false`.
  - *Previously reported:* Newly discovered `NEW-07`.
- **B. Exact Implementation Target:**
  - *Files:* `apps/web/src/app/api/v1/system/providers/route.ts`, `apps/web/src/lib/env-and-governance.test.ts`.
- **C. TDD — RED:**
  - In `apps/web/src/lib/env-and-governance.test.ts`, call `GET()` from `apps/web/src/app/api/v1/system/providers/route.ts` with `AWS_ACCESS_KEY_ID=''` and `SARVAM_API_KEY='test-key'`. Assert that ports with `credentialsPresent === false` report `verificationTier: 'Local Deterministic Fallback — Contract Verified'` while ports with `credentialsPresent === true` report `verificationTier: 'Configured — Contract Verified (Live Ready)'`.
- **D. TDD — GREEN:**
  - Update `ProviderCapabilityStatus['verificationTier']` and `getRuntimeProviderStatuses()` in `apps/web/src/app/api/v1/system/providers/route.ts` to compute `verificationTier` dynamically from `credentialsPresent` and `activeMode`.
- **E. TDD — REFACTOR:**
  - None needed.
- **F. Integration Verification:**
  - Run `pnpm --filter @oncobrief/web test env-and-governance.test.ts`.
- **G. Definition of Done:**
  - `/api/v1/system/providers` dynamically distinguishes configured cloud providers from local deterministic fallbacks.
- **H. Dependencies & Risk:**
  - *Prerequisites:* `TASK-01.01`, `TASK-02.03`. *Effort:* 20 mins.

---

### PHASE-04: Full Multi-Layer Verification, Live Provider Contract Check & Demo Acceptance Gate

---

#### `TASK-04.01` — Full 5-Layer Verification Suite, Live Sarvam Contract Harness & E2E Regression Gate

- **A. Problem and Rationale:**
  - *What is wrong:* All unit, integration, database, boundary, accessibility, mobile viewport, and E2E tests—plus an opt-in bounded live Sarvam API contract test—must be executed against the final integrated codebase on the host machine to satisfy all 8 Final Application Quality Gates.
- **B. Exact Implementation Target:**
  - *Files:* `packages/adapters/test/live-sarvam-contract.test.ts`, `apps/web/e2e/phase5-continuity-voice.spec.ts`.
- **C. TDD — RED:**
  - 1. In `apps/web/e2e/phase5-continuity-voice.spec.ts`, add an assertion that selecting `ta-IN` in `ContinuityAudioPlayer` and clicking `Generate & Preview Voice Note` displays `data-testid="continuity-localized-preview"` containing Tamil script (`உங்கள் மருத்துவ சந்திப்பு`) and sends `languageCode: 'ta-IN'` in the `/api/v1/continuity/tts` request.
  - 2. Create `packages/adapters/test/live-sarvam-contract.test.ts` (gated by `process.env.RUN_LIVE_SARVAM_CONTRACT === '1'` so normal `pnpm test` remains 100% deterministic and offline-safe) that performs 3 bounded synthetic calls when `SARVAM_API_KEY` is set:
    - `sarvamTts({ text: 'உங்கள் மருத்துவ சந்திப்பு நாளை காலை 10 மணிக்கு உள்ளது.', languageCode: 'ta-IN' })` → verifies HTTP 200, valid RIFF WAVE header, and `byteLength > 1000`.
    - `sarvamStt({ audioData: generatedWavBuffer, languageCode: 'en-IN', mimeType: 'audio/wav' })` → verifies HTTP 200 and schema `{ transcript, languageCode }`.
    - `new SarvamTranslationAdapter().translate({ text: 'Your appointment is on 15 May 2025.', sourceLanguageCode: 'en-IN', targetLanguageCode: 'hi-IN' })` → verifies HTTP 200 and Devanagari output.
- **D. TDD — GREEN:**
  - Execute the complete verification suite on the host:
    1. `pnpm boundary:check`
    2. `pnpm branding:check`
    3. `pnpm -r --no-bail typecheck`
    4. `pnpm db:migrate && pnpm db:seed`
    5. `pnpm test`
    6. `RUN_LIVE_SARVAM_CONTRACT=1 pnpm --filter @oncobrief/adapters test live-sarvam-contract.test.ts` (when network + funded `SARVAM_API_KEY` are available)
    7. `pnpm --filter @oncobrief/web build`
    8. `pnpm --filter @oncobrief/web exec playwright test`
- **E. TDD — REFACTOR:**
  - Update final verification evidence report with actual measured durations, test counts, and commit SHA.
- **F. Integration Verification:**
  - All 8 commands above exit `0`.
- **G. Definition of Done:**
  - All 8 Final Application Quality Gates (Section 8 below) are satisfied with recorded evidence.
- **H. Dependencies & Risk:**
  - *Prerequisites:* `TASK-01.01`..`TASK-03.03`. *Effort:* 45 mins.

---

## 6. Dependencies & Critical-Path Schedule

```
PHASE-01 (Voice & Continuity)          PHASE-02 (OCR, Indic & Provenance)       PHASE-03 (Governance & Seed)
─────────────────────────────          ──────────────────────────────────       ────────────────────────────
TASK-01.01 (normalizeLanguageCode)     TASK-02.01 (Restore Sarvam OCR tests)    TASK-03.01 (Tumor Board UI & env)
   ├──► TASK-01.02 (WAV chunk merge)      ├──► TASK-02.02 (Indic Extraction)       │
   │       └──► TASK-01.03 (Retries/UI)   │       └──► TASK-02.04 (Stage B Gate)───┼──► TASK-03.02 (Complete Seed)
   └──────────► TASK-01.04 (11-Locale)    └──► TASK-02.03 (Honest Upload UI)───────┴──► TASK-03.03 (Provider Status)
                     │                                        │                               │
                     └────────────────────────────────────────┴───────────────────────────────┘
                                                              │
                                                              ▼
                                           PHASE-04: TASK-04.01 (Full Verification Gate)
```

- **Parallelizable Starting Tasks (No Prerequisites):** `TASK-01.01`, `TASK-02.01`, and `TASK-03.01` touch completely disjoint files and can execute in parallel immediately.
- **Total Estimated Engineering Effort:** ~6.5 – 7.5 hours sequential, or ~3.5 hours across 3 parallel tracks.

---

## 7. Regression Prevention Safeguards

To prevent coding-agent failure modes observed in prior waves:
1. **Never Overwrite Existing Test Suites:** When adding tests to `packages/adapters/test/ocr-correctness.test.ts`, append or merge suites—never delete existing `describe()` blocks (`NEW-02` safeguard).
2. **Inspect Outbound Payloads in Mocked Tests:** Every adapter test (`sarvamStt`, `sarvamTts`, `SarvamVisionOcrAdapter`, `SarvamTranslationAdapter`) must assert on the exact outbound URL, headers, and serialized JSON/FormData fields (`target_language_code`, `language_code`, `language`, `model`), not merely that a mocked response was returned (`HIST-10` safeguard).
3. **Test Non-English Locales Explicitly:** Every voice, translation, and OCR test suite must test at least `'hi-IN'`, `'ta-IN'`, and `'or-IN'` (`'od-IN'`), never just `'en-IN'`.
4. **Enforce Negative Provenance Tests:** `two-stage-span-gate.test.ts` must always assert that a valid quote paired with a contradictory structured `FactValue` is rejected (`NEW-01` safeguard).
5. **Enforce Seed Completeness Assertions:** `seed-completeness.test.ts` must verify `rowCount >= 1` on every V4 and Milestone A/B table after `seed()` (`HIST-08` / `NEW-04` safeguard).

---

## 8. Final Application Quality Gates

Before declaring OncoBrief implementation complete, all 8 gates must pass:
1. **Gate 1 — Build & Test Health:** `pnpm boundary:check`, `pnpm branding:check`, `pnpm -r typecheck`, `pnpm --filter @oncobrief/web build`, `pnpm test`, and `pnpm --filter @oncobrief/web exec playwright test` exit `0` with `0` failed tests.
2. **Gate 2 — Sarvam Integration:** `normalizeLanguageCode()` preserves all 11 locales, maps `'or-IN'` → `'od-IN'` in Sarvam API calls, merges multi-chunk WAVs cleanly, and restores all `SarvamVisionOcrAdapter` tests.
3. **Gate 3 — Source-Grounded Data:** Both Stage A (`validateSpans`) and Stage B (`validateCandidateProvenance`) are enforced inside `insertFact()`.
4. **Gate 4 — Clinical Safety & Privacy:** `ENABLE + FORCE RLS` holds on 100% of tenant tables, CVE-2025-29927 middleware spoofing returns `403`, and `/tumor-board` + `/encounters` bind to verified Evidence Ledger facts.
5. **Gate 5 — End-to-End User Experience:** Selecting Tamil (`ta-IN`) or Hindi (`hi-IN`) in `ContinuityAudioPlayer` displays and synthesizes native-script reminder text; `DocumentUploadForm` and `ProcessingStatusCard` display honest provider names and real durations.
6. **Gate 6 — Fresh Environment Reproducibility:** `pnpm db:migrate && pnpm db:seed` populates all V4 and Milestone A/B tables (`clinic_session`, `appointment`, `opd_appointment_slot`, `encounter`, `tumor_board_meeting`, `tumor_board_case`) with `>= 1` row each.
7. **Gate 7 — Demo Readiness:** All 6 end-to-end workflows (Workflows A–F in `TEST_AND_DEMO_ACCEPTANCE_MATRIX.md`) pass in Chromium with both live-ready and audible offline fallback paths verified.
8. **Gate 8 — Final Evidence:** Actual command outputs, test counts, durations, live-provider status, and final commit SHA are recorded.
