# ONCOBRIEF — AUTONOMOUS TDD EXECUTION PROTOCOL (`TDD_EXECUTION_PROTOCOL.md`)

- **Protocol Version:** 3.0
- **Target Repository:** `/Users/dhaanish/Documents/OncoBrief`
- **Target Branch:** `feat/v4-assessment-remediation`
- **Scope:** Governs autonomous execution of `TASK-01.01` through `TASK-04.01` defined in `MASTER_IMPLEMENTATION_PLAN.md` and `IMPLEMENTATION_TASKS.csv`.

---

## 1. Deterministic Task State Machine

Every atomic task (`TASK-01.01` .. `TASK-04.01`) MUST transition strictly through the following state machine:

```
┌───────────────┐
│  NOT_STARTED  │
└───────┬───────┘
        │ 1. Read task spec & verify defect still exists in current code
        ▼
┌───────────────────┐
│ RED_TEST_WRITTEN  │
└───────┬───────────┘
        │ 2. Execute targeted test command; confirm it FAILS for the expected reason
        ▼
┌───────────────────┐
│   RED_CONFIRMED   │
└───────┬───────────┘
        │ 3. Write minimal production code fix in scoped files
        ▼
┌───────────────────┐
│   IMPLEMENTING    │◄───────────────────────────┐
└───────┬───────────┘                            │
        │ 4. Run targeted unit/adapter test      │ (If test fails & retry_count <= 3:
        ▼                                        │  diagnose root cause & adjust fix)
┌───────────────────┐                            │
│       GREEN       ├────────────────────────────┘
└───────┬───────────┘
        │ 5. Refactor cleanly; run package integration, boundary, typecheck & E2E tests
        ▼
┌────────────────────────┐
│  INTEGRATION_VERIFIED  │
└───────┬────────────────┘
        │ 6. All acceptance criteria & DoD satisfied; record evidence in tracker
        ▼
┌───────────────┐
│     DONE      │
└───────────────┘
```

### Additional Exception & Escalation States
- **`REGRESSED`**: Entered immediately if a previously passing unit, integration, boundary, typecheck, or E2E test fails after a change. The agent MUST return to `IMPLEMENTING` until all regressions are resolved.
- **`REQUIRES_EXTERNAL_VERIFICATION`**: Entered when all local unit, contract, database, and browser E2E tests pass, but a live external provider call (e.g., live Sarvam API over the internet or live NHA ABDM Sandbox) cannot be executed due to missing credentials or network sandbox restrictions. The agent MUST record the exact reproducible verification command and proceed to the next task.
- **`BLOCKED`**: Entered only if an unresolvable environment or dependency failure persists after `MAX_RETRIES = 3` distinct root-cause repair attempts.

---

## 2. Executable Autonomous Loop Pseudocode

```python
def execute_master_plan(tasks):
    while has_pending_tasks(tasks):
        task = select_next_dependency_ready_task(tasks)
        if not task:
            break

        # Step 1: Inspect & Verify Defect
        read_task_specification(task)
        if is_already_satisfied_and_tested(task):
            record_evidence(task, status="DONE")
            continue

        # Step 2: TDD RED Phase
        write_or_update_regression_test(task.red_tests)
        transition(task, "RED_TEST_WRITTEN")

        red_run = run_command(task.targeted_test_cmd)
        if red_run.exit_code == 0:
            # A passing test before the fix is NOT a valid RED regression test!
            tighten_test_assertion_to_capture_defect(task.red_tests)
            red_run = run_command(task.targeted_test_cmd)
            assert red_run.exit_code != 0, f"{task.id}: RED test must fail before implementation"
        transition(task, "RED_CONFIRMED", evidence=red_run.stderr)

        # Step 3: TDD GREEN Phase (Bounded Retry Loop)
        retry_count = 0
        while retry_count <= 3:
            transition(task, "IMPLEMENTING")
            apply_minimal_fix(task.files, task.green_implementation)
            green_run = run_command(task.targeted_test_cmd)
            if green_run.exit_code == 0:
                transition(task, "GREEN", evidence=green_run.stdout)
                break
            retry_count += 1
            diagnose_failure_and_adjust_strategy(green_run.stderr, attempt=retry_count)

        if task.state != "GREEN":
            transition(task, "BLOCKED", blocker_report=green_run.stderr)
            continue

        # Step 4: TDD REFACTOR & Integration Verification Phase
        refactor_safely_preserving_contracts(task.files)
        integration_run = run_command(task.integration_test_cmd)
        typecheck_run = run_command("pnpm -r --no-bail typecheck")
        boundary_run = run_command("pnpm boundary:check && pnpm branding:check")

        if any(r.exit_code != 0 for r in [integration_run, typecheck_run, boundary_run]):
            transition(task, "REGRESSED")
            resolve_regressions(task)
            continue

        transition(task, "INTEGRATION_VERIFIED")
        record_evidence(task, status="DONE")

    # Step 5: Phase & Final Full-Suite Gate (TASK-04.01)
    run_full_verification_gate()
```

---

## 3. Phase Sequencing & Dependency Order

### Phase 1 — Sarvam Voice, WAV Assembly & 11-Locale Continuity (`PHASE-01`)
1. **`TASK-01.01`** (`packages/adapters/src/sarvam-voice.ts`, `packages/adapters/test/sarvam-voice-contracts.test.ts`): Fix `normalizeLanguageCode()` and `'or-IN'` → `'od-IN'` provider mapping.
2. **`TASK-01.02`** (`packages/adapters/src/sarvam-voice.ts`, `packages/adapters/test/sarvam-voice-contracts.test.ts`): Implement `mergeWavBase64Chunks()` for multi-chunk TTS responses.
3. **`TASK-01.03`** (`apps/web/src/app/api/v1/assistant/voice/stt/route.ts`, `apps/web/src/lib/scoped-tts.ts`, `apps/web/src/components/assistant/useVoice.ts`, `apps/web/src/lib/tts-scope.test.ts`): Wire retry helpers, enforce RBAC + 10 MB cap on STT route, and fix browser STT/TTS fallbacks in `useVoice.ts`.
4. **`TASK-01.04`** (`packages/db/src/services/messages.ts`, `packages/db/src/services/opd-flow.ts`, `apps/web/src/lib/scoped-tts.ts`, `apps/web/src/components/ContinuityAudioPlayer.tsx`): Wire 11-locale template resolution into continuity TTS preview and ground `offerOpdSlot` messages in `message_variable_source`.
- **Phase 1 Gate Command:**
  ```bash
  pnpm --filter @oncobrief/adapters test && pnpm --filter @oncobrief/db test continuity-grounding.test.ts && pnpm --filter @oncobrief/web test tts-scope.test.ts
  ```

### Phase 2 — Sarvam Document Intelligence, Indic Extraction & Two-Stage Provenance Gate (`PHASE-02`)
5. **`TASK-02.01`** (`packages/adapters/src/sarvam-vision-ocr.ts`, `packages/adapters/src/ocr-routing.ts`, `packages/adapters/test/ocr-correctness.test.ts`): Restore deleted `SarvamVisionOcrAdapter` tests, gate `fallbackOnError` on `driver === 'auto'`, and support top-level `pages` in `getResults()`.
6. **`TASK-02.02`** (`packages/adapters/src/rule-based-extractor.ts`, `packages/db/src/services/documents.ts`, `apps/web/src/lib/actions.ts`, `apps/web/src/components/DocumentUploadForm.tsx`, `packages/adapters/test/indic-extraction.test.ts`): Add upload language selector, propagate `language` to `deps.ocr.extractDocument()`, and add Hindi/Tamil clinical extraction patterns to `RuleBasedExtractor`.
7. **`TASK-02.03`** (`packages/adapters/src/local-multimodal-ocr.ts`, `apps/web/src/components/DocumentUploadForm.tsx`, `apps/web/src/components/ProcessingStatusCard.tsx`): Remove Strategy C raw-byte ASCII scraping, remove 4.0s artificial upload `setTimeout` delays, and display truthful OCR engine labels.
8. **`TASK-02.04`** (`packages/domain/src/provenance/span-validation.ts`, `packages/db/src/services/ledger.ts`, `packages/db/test/two-stage-span-gate.test.ts`): Extend `validateCandidateProvenance()` to all 9 `FactValue` union variants and invoke it inside `insertFact()`.
- **Phase 2 Gate Command:**
  ```bash
  pnpm --filter @oncobrief/domain test && pnpm --filter @oncobrief/adapters test && pnpm --filter @oncobrief/db test two-stage-span-gate.test.ts ocr-routing.test.ts ocr-ingestion.test.ts
  ```

### Phase 3 — Clinical Boundary UI Governance, Complete Demo Seed & Provider Transparency (`PHASE-03`)
9. **`TASK-03.01`** (`packages/db/src/env.ts`, `packages/db/src/services/tumor-board.ts`, `apps/web/src/app/(app)/tumor-board/page.tsx`, `apps/web/src/lib/env-and-governance.test.ts`): Fix `EXTRACTION_DRIVER` env lookup and add verified `stagingFactId` selector to `/tumor-board`.
10. **`TASK-03.02`** (`packages/db/src/seed.ts`, `packages/db/test/seed-completeness.test.ts`): Add all 16 missing tables to `TRUNCATE_TABLES`, fix `'ananya.mukhopadhyay@rci.invalid'` → `'dr.ananya@rci.demo'`, and seed `clinic_session`, `encounter`, `encounter_note_version`, `tumor_board_meeting`, and `tumor_board_case` inside `seed()`.
11. **`TASK-03.03`** (`apps/web/src/app/api/v1/system/providers/route.ts`, `apps/web/src/app/(app)/patients/[id]/continuity/page.tsx`): Dynamic `verificationTier` reporting in `/api/v1/system/providers`.
- **Phase 3 Gate Command:**
  ```bash
  pnpm boundary:check && pnpm branding:check && pnpm --filter @oncobrief/db test seed-completeness.test.ts remediation-0020.test.ts wave1-governance-and-sync.test.ts milestone-b.test.ts && pnpm --filter @oncobrief/web test env-and-governance.test.ts
  ```

### Phase 4 — Full Multi-Layer Verification & Demo Acceptance Gate (`PHASE-04`)
12. **`TASK-04.01`**: Execute the complete 5-layer test campaign and all 20+ Playwright E2E specs:
  ```bash
  pnpm boundary:check
  pnpm branding:check
  pnpm -r --no-bail typecheck
  pnpm db:migrate
  pnpm db:seed
  pnpm test
  pnpm --filter @oncobrief/web build
  pnpm --filter @oncobrief/web exec playwright test
  ```

---

## 4. Prohibited Shortcuts & Root-Cause Failure Handling

1. **Never Delete or Weaken Existing Tests:** Removing `describe()` or `it()` blocks (as happened previously in `ocr-correctness.test.ts`) is strictly prohibited.
2. **Never Use Unconditional `catch {}` to Mask Provider Bugs:** Adapter fallbacks must only activate when configured (`driver === 'auto'` or `fallbackOnError === true`) and must preserve accurate `engine` metadata on spans/responses.
3. **Never Claim `DONE` Without Running the Verification Command:** Every task transition to `DONE` requires recording the exact command executed, exit code `0`, and test counts.
4. **Preserve Dirty Working-Tree Additions:** Do not run `git reset --hard`, `git clean -fd`, or `git checkout -- .`. All 102 existing working-tree modifications/additions on `feat/v4-assessment-remediation` must be preserved and built upon surgically.
