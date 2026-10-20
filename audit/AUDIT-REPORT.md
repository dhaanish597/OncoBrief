# OncoBrief — Codebase Audit

**Audited:** 2026-10-13
**Commit:** `58280d8` (2026-10-04, `main`) + one uncommitted edit to `apps/web/src/app/(app)/about/page.tsx`
**Method:** read every tracked file (275 files); ran install, typecheck, lint, both custom gates, all 5 test suites against a live Postgres, the production build, the Playwright suite, the Docker image, and both smoke tools; drove the local app and the deployed instance in a real browser at 375 / 768 / 1440 px.
**Read-only:** no tracked file was modified. `git status` at completion shows only the pre-existing `about/page.tsx` change. Build artifacts (`.next/`, `infra/build/`) and local demo data were regenerated; those are gitignored.

---

## a. Verdict

This is a real, working evidence-ledger application, not a mock-up. 429 automated tests pass, the full 19-step demo runs locally, and the documented CloudFront URL is genuinely live and serving a Bedrock-extracted ledger. The domain core (span validation, hash chain, conflict comparators, RBAC table, evidence state machine) is the strongest part and is properly unit-tested. The reconciliation room is excellent and delivers exactly what the pitch claims.

The single biggest problem: **CI has never once run a test.** All three GitHub Actions runs failed within 30 seconds at pnpm setup (`.github/workflows/ci.yml:31` conflicts with `package.json:6`), so install, typecheck, lint, the clinical-boundary gate, the branding gate, all 429 tests, the build and the Playwright demo flow have all been skipped on every commit. Every "PASS" in the verification docs is a manual local result with no automated enforcement behind it.

Underneath that: two RBAC permissions are defined, documented and unit-tested but never enforced (proven exploitable live), the assistant reports `grounded: true` with zero sources on a core question, the deployed instance cannot perform demo steps 12–18, and every authenticated screen horizontally overflows on mobile.

---

## b. Top 10 findings

| # | Finding | Evidence | Severity | Fix cost |
|---|---|---|---|---|
| 1 | **CI has never run a single test.** `pnpm/action-setup@v4` is given `version: 9` while `package.json` declares `packageManager: pnpm@9.15.4`; the action aborts with `Error: Multiple versions of pnpm specified`. All 8 subsequent steps report `skipped`. All 3 runs ever = failure. | `.github/workflows/ci.yml:31` vs `package.json:6`; `gh run view 37147166402` step conclusions | Critical | **Minutes** (delete the `version: 9` input) |
| 2 | **`audit:read` is not enforced.** The RBAC table restricts it to `org_admin` + `auditor`. Proven live: `coord.anita@rci.demo` (coordinator) and `records.deepak@rci.demo` (records_officer) each got HTTP 200 on `/patients/{id}/audit` and rendered all 43 audit events plus the hash-chain widget. | `packages/domain/src/policy/rbac.ts:56` defines it; `apps/web/src/app/(app)/patients/[id]/audit/page.tsx:15` calls `withSession` with no `can()` | High | **Minutes** |
| 3 | **`packet:export` is not enforced.** Proven live: `auditor.k@rci.demo` and `records.deepak@rci.demo`, neither of whom holds the permission, each downloaded the full 18,547-byte approved-packet JSON containing every evidence fact. | `packages/domain/src/policy/rbac.ts:54` defines it; `apps/web/src/app/api/v1/packets/[packetId]/export/route.ts:10-53` has no `can()` | High | **Minutes** |
| 4 | **The deployed instance cannot run demo steps 12–18.** `seed-aws.ts` never calls `assignChecklist` or `computeAndPersistReadiness`, so the deployed record map reads "No checklist has been assigned to this patient" with 0 gap tiles and readiness "Not assessed" — no missing document to show, no gap to create a task from. Continuity reads "No verified appointment fact on this record yet", so no patient message can be composed or approved. | `packages/db/src/seed-aws.ts` (no `assignChecklist`); verified live in-browser on the CloudFront URL | High | **Hours** |
| 5 | **9 of 14 documents on the deployed instance are stuck mid-pipeline** — 4 `received`, 3 `rendering`, 2 `ocr_running` — and 2 of the 5 `ready` ones produced 0 facts. The Sources page, whose entire point is curated record fragmentation, instead shows `synthetic-oncology-referral.pdf` **eight times** plus two `smoke-check.pdf` rows, i.e. accumulated debris from repeated admin-Lambda `e2e` and `smoke:api` runs against production. | Verified live; see `audit/screenshots/DEPLOYED-sources.png`. Debris source: `apps/worker/src/admin.ts:20-26`, `tools/api-smoke.ts:130` | High | **Hours** (reseed from a clean DB) |
| 6 | **Assistant returns `grounded: true` with `sources: []`** while its answer cites `[E1]`/`[E2]`. Reproducible on a freshly seeded DB for "which required documents are missing?". `retrieveEvidence` sets `documentId: ''` for an unsatisfied gap, the source-card filter drops every card, but `grounded` was already computed from the pre-filter evidence. The product's headline claim — every fact shows its source — fails on its own suggested question. | `apps/web/src/lib/assistant/orchestrator.ts:145` (`?? ''`), `:488` (`.filter(s => s.documentId !== '')`), `:455` (`grounded` computed pre-filter). Same shape at `:167` for continuity | High | **Hours** |
| 7 | **Every authenticated screen horizontally overflows on mobile.** At 375 px: `/workspace` and `/login`(authed) overflow by **266 px**, all 11 patient screens by 99–117 px. Two causes: the app header is a single-line `flex` with no `flex-wrap`, and the workspace table (616 px intrinsic, 7 columns) has no `overflow-x` container. Only the landing page is clean. | `apps/web/src/app/(app)/layout.tsx:12`; `apps/web/src/app/(app)/workspace/page.tsx:31`. Measured `scrollWidth` vs `innerWidth` on 13 routes at 3 widths | High | **Hours** |
| 8 | **The clinical-boundary CI gate scans almost nothing.** Its file scan filters to paths containing `/ui/`, `/vocab/` or `/labels` — but no `/ui/` directory and no `*labels*` file exists in the repo, so it only ever reads `packages/domain/src/vocab/*`. It never scans a page, a component, the LLM system prompt or the message templates. The README calls it "the CI-failing boundary scan"; it has also never run in CI (finding 1). | `tools/check-clinical-boundary.ts:73`; `find` for `*/ui/*` and `*labels*` returns nothing | High | **Hours** |
| 9 | **The presigned document URL points at a route that does not exist.** In the default `STORAGE_DRIVER=fs` config `presignGet` returns `/api/v1/storage/local?...`; that route is not implemented — verified HTTP 404. `verifyPresign` is dead code. `docs/security.md:41` claims "Reads are 60-second presigned GETs issued only after authorization". No UI consumes `document_url` at all, so **the original document is never displayed anywhere in the product** — the source inspector reconstructs text spans on a blank A4 div. | `packages/adapters/src/local-fs-storage.ts:44`, `:48`; `apps/web/src/app/api/v1/evidence/[id]/route.ts:91`; `curl /api/v1/storage/local` → 404 | High | **Hours** |
| 10 | **`Promise.all` shares one pooled pg client inside a transaction**, issuing concurrent queries on a single connection. Emits `DeprecationWarning: Calling client.query() when the client is already executing a query` on every patient page load (observed in the Playwright run), and **throws** under pg 9. | `apps/web/src/app/(app)/patients/[id]/layout.tsx:20`, `audit/page.tsx:16`, `continuity/page.tsx:19`, `lib/assistant/tools.ts:271`, `:321`; client handed over at `packages/db/src/client.ts:81` | Medium-High | **Hours** |

---

## c. Feature inventory

Full machine-readable inventory with entry points and notes: **`audit/feature-inventory.csv`** (81 rows, 7 columns).

| State | Count | | Area | Count |
|---|---|---|---|---|
| WORKING-VERIFIED | 38 | | Assistant | 10 |
| WORKING-BY-READING | 15 | | Evidence | 9 |
| PARTIAL | 13 | | Sources / Worker / Tooling | 7 each |
| BROKEN | 4 | | Packet / "Not built" | 5 each |
| DEAD | 4 | | Conflicts / Tasks | 4 each |
| STUB | 4 | | Public / Workspace / Twin / Continuity / Audit / Auth / Infra | 3 each |
| UNKNOWN | 2 | | Security | 2 |
| MOCKED/DEMO-ONLY | 1 | | **Total** | **81** |

The 4 **BROKEN** items are: the presigned document GET route (does not exist), the worker's local startup (exit 2), `pnpm smoke:api` (4/11 fail), and the CI `verify` job (never passed).

### Routes and endpoints (complete)

**Pages — 19 files, all render HTTP 200 authenticated; all 11 patient routes + `/about` + `/workspace` redirect 307 → `/login` anonymously (verified).**

| Route | State |
|---|---|
| `/` (landing) | WORKING-VERIFIED |
| `/login` | WORKING-VERIFIED |
| `/about` | WORKING-VERIFIED |
| `/workspace` | WORKING-VERIFIED |
| `/patients/[id]` → redirect to `/evidence` | WORKING-VERIFIED |
| `/patients/[id]/evidence` | WORKING-VERIFIED |
| `/patients/[id]/sources` | WORKING-VERIFIED |
| `/patients/[id]/sources/[documentId]` | WORKING-VERIFIED |
| `/patients/[id]/record-map` | WORKING-VERIFIED locally · empty on deployed |
| `/patients/[id]/conflicts` | PARTIAL (identical values rendered) |
| `/patients/[id]/conflicts/[conflictId]` | WORKING-VERIFIED |
| `/patients/[id]/tasks` | WORKING-VERIFIED |
| `/patients/[id]/packet` | WORKING-VERIFIED |
| `/patients/[id]/continuity` | WORKING-VERIFIED locally · blocked on deployed |
| `/patients/[id]/audit` | PARTIAL (no `audit:read` check) |

**API — 9 route handlers.** Only 2 use `resolveApiCaller` (Cognito-capable); the other 7 are cookie-only, so under `AUTH_MODE=cognito` they are unreachable for bearer clients.

| Endpoint | Auth | State |
|---|---|---|
| `GET /api/v1/evidence/[id]` | `resolveApiCaller` | WORKING-VERIFIED (401 anon, 404 unknown) |
| `POST /api/v1/patients/[id]/documents/upload-url` | `resolveApiCaller` + `document:upload` | PARTIAL — 501 in default config |
| `GET\|POST /api/v1/patients/[id]/documents/[documentId]/pages/[n]` | `getSession` only | WORKING-VERIFIED; `document:read_page` unenforced |
| `GET /api/v1/packets/[packetId]/export` | `getSession` only | PARTIAL — `packet:export` unenforced |
| `POST /api/v1/assistant/chat` | `getSession` | WORKING-VERIFIED |
| `GET /api/v1/assistant/conversations` | `getSession` | WORKING-VERIFIED (200 live) |
| `GET\|DELETE /api/v1/assistant/conversations/[id]` | `getSession` | WORKING-BY-READING |
| `POST /api/v1/assistant/voice/stt` | `getSession` | UNKNOWN — no size limit on the audio Blob |
| `POST /api/v1/assistant/voice/tts` | `getSession` | UNKNOWN |
| `/api/v1/storage/local` | — | **does not exist** (referenced by `local-fs-storage.ts:44`) |

**Server actions — 20 in `apps/web/src/lib/actions.ts`.** 17 have a UI consumer; 3 are DEAD (no consumer, but still reachable as server-action POSTs): `assignTaskAction` (`:186`), `waiveGapAction` (`:223`), `withdrawPacketAction` (`:330`). Three mutating actions have **no permission check**: `commentTaskAction` (`:213`), `refreshReadinessAction` (`:232`), and `taskStatusAction` (`:199`) gates on `task:create` and casts `toStatus` unvalidated (`:205`).

**Scripts — 22 in root `package.json`.** `smoke:api` fails 4/11 in the documented default config. `tools/smoke.ts` passes 13/13 but has no script entry and is not in CI (only documented at `README.md:180`).

### Feature flags and their current values

| Flag | Default | Read at | Effect |
|---|---|---|---|
| `STORAGE_DRIVER` | `fs` | `packages/db/src/env.ts:47` | `fs` ⇒ direct upload returns 501, presigned GET 404s |
| `QUEUE_DRIVER` | `memory` | `apps/worker/src/config.ts:81` | `memory` ⇒ worker exits code 2 |
| `EXTRACTION_DRIVER` | `rule` | `config.ts:86` | `bedrock` requires `BEDROCK_MODEL_ID` or throws |
| `AUTH_MODE` | `session` | `env.ts:73` | `cognito` ⇒ the 7 cookie-only endpoints become unreachable for bearer clients |
| `ONCOBRIEF_DEMO_MODE` | `true` | `env.ts:94` | Demo-fixture badges |
| `OCR_DRIVER` | documented `auto` | **never read** | Dead: `buildAsyncOcr` always returns Textract (`apps/worker/src/ports.ts:51`) |

### Env drift

**Read but undocumented in `.env.example`:** `AWS_DEFAULT_REGION`, `DB_NAME`, `DB_PORT`, `E2E_BASE_URL`, `E2E_DEPLOYED_CODE`, `E2E_SKIP_SERVER`, `SMOKE_BASE_URL`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `VITEST`.
**Documented but never read:** `OCR_DRIVER` (`.env.example:31`).
**Duplicated with conflicting values inside `.env.example`:** `STORAGE_S3_ENDPOINT`, `STORAGE_S3_REGION`, `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY`, `STORAGE_S3_FORCE_PATH_STYLE` all appear twice (lines 22–27 and 87–92); the second block wins.
**Not committed (correct):** no `.env`, `.tfvars` or `.tfstate` has ever been committed — verified across all 10 commits.

### Code-hygiene sweep

- **TODO/FIXME/HACK/XXX: zero.** The only `grep` hits are HTML `placeholder` attributes and one test fixture named `'stub'`.
- **No commented-out routes or dead blocks found.**
- **Error-swallowing `catch` blocks that matter:** `apps/web/src/app/api/v1/evidence/[id]/route.ts:45` (presign failure → `documentUrl = null`, masking finding 9), `apps/web/src/components/PageViewBeacon.tsx:21` (audit beacon failure silently dropped), `apps/web/src/app/login/actions.ts:35` (logout revoke failure swallowed — cookie is cleared but the session row stays valid until expiry).
- **Prompt injection is genuinely defended:** `apps/web/src/lib/assistant/prompt.ts:40` frames evidence as data, and `prompt.test.ts:55` feeds a malicious span.

---

## d. Don't demo this

**Broken**
1. `pnpm dev:worker` — exits code 2 immediately (`apps/worker/src/index.ts:30`). The async AWS pipeline cannot be shown running locally.
2. `pnpm smoke:api` — 7/11, exit 1, in the config the README calls "fine for local development".
3. Any presigned document link in `fs` mode — `/api/v1/storage/local` 404s.
4. CI — never green; do not open the Actions tab.

**Misleading on screen**
5. The reconciliation **queue** for the seeded `procedure.recorded` conflict: "SOURCES DISAGREE · 2 sources" next to two identical chips reading *modified radical mastectomy*. The detector is right (the dates differ, 2025-06-12 vs 2025-07-03) but the queue never shows the date. Open the **room** instead, which disambiguates correctly. Screenshot: `audit/screenshots/desktop-conflicts.png`.
6. Asking the assistant "what documents are missing?" — returns `grounded: true`, zero source cards, `[E1]`/`[E2]` markers that resolve to nothing.
7. Asking the assistant "what is the appointment date" — the answer leaks raw `documentId=<uuid>` strings into user-facing prose.
8. Any authenticated screen on a phone — horizontal scrollbar on all 12.
9. The deployed Sources page — 8 copies of one filename, 9 stuck ingestions.
10. The deployed record map and continuity tabs — both empty.

**Mocked / demo-only (honest, but say so out loud)**
11. Patient message delivery is simulated (`packages/adapters/src/simulated-delivery.ts:11`) and correctly labelled in the UI.
12. Local uploads use `FixtureOcrAdapter`, which **throws** for any page without a pre-supplied fixture (`packages/adapters/src/fixture-ocr.ts:16`) — do not upload an arbitrary scan locally.
13. Seeded "PDFs" are stored with `mime_type: text/plain` (verified in the DB).

**Stubs — schema only, zero code**
14. MFA/TOTP (`user_totp`), browser extension / SMART on FHIR (`extension_grant`), idempotency keys (`idempotency_key`), and `packet_event` (zero references anywhere).

**Dead — no UI**
15. Task assignment, gap waiving, packet withdrawal. Every task renders "unassigned".

---

## e. Design and UX audit

### Verdict on visual quality

**This reads as a designed product, not a component library bolted onto defaults.** The identity is coherent and unusual: warm paper (`#f7f4ee`) under near-black ink, zero border-radius anywhere, 1px rules instead of cards-with-shadows, monospace for machine-authored values, serif for document text, and offset hard shadows (`6px 6px 0`) on popovers. It deliberately avoids looking like a dashboard, and succeeds — the reconciliation room in particular is a genuinely well-designed screen. The landing page is a separate, more expressive visual language, correctly scoped to `.landing` so it cannot leak into the workspace (`globals.css:100-139`, and an E2E test pins the separation).

The three highest-payoff fixes for the least work:

1. **Add `flex-wrap` to the app header and wrap the workspace table in `overflow-x-auto`** (`(app)/layout.tsx:12`, `workspace/page.tsx:31`). Two class changes remove the horizontal scrollbar from all 12 authenticated screens.
2. **Raise the base type size.** 152 uses of `text-[11px]` and 17 of `text-[10px]` versus 28 of `text-sm` — the interface is overwhelmingly built from 10–11px type. Moving the 11px tier to 12–13px costs one find-and-replace and is the single biggest legibility win.
3. **Move the Ask OncoBrief launcher out of the content flow** (`AssistantLauncher.tsx:26`, `fixed bottom-5 right-5`). It currently overlaps page content on the evidence list and sits on top of Source B's document text in the reconciliation room on both desktop and mobile.

### Design system as implemented

**Colour — 21 tokens in `@theme` (`globals.css:9-42`).** 8 workspace, 6 state, 7 landing. `--color-state-rejected` and `--color-state-superseded` are two tokens with the identical value `#6b6b6b`.

**The system is only half-tokenised.** State *foreground* colours are tokens; state *background tints* are hardcoded hex, duplicated across 14 files:

| Literal | Meaning | Occurrences |
|---|---|---|
| `#fbe9e8` | conflicting tint | 4 (`evidence.tsx:12,92`, `record-map:45`, `audit:53`, `continuity:168`, `PatientTabs:50`) |
| `#e8f3ea` | verified tint | 4 (`evidence.tsx:11,90`, `record-map:47`, `EvidenceRow:148`, `conflicts/[id]:146`) |
| `#fdf3df` | extracted tint | 3 (`evidence.tsx:10,91`, `record-map:46`, `packet:105`) |
| `#eeeeee` | neutral tint | 4 (`evidence.tsx:14,15,94`, `record-map:48`) |
| `#e8eefb` | corrected tint | 2 (`evidence.tsx:13`, `EvidenceRow:230`) |
| `rgba(27,26,23,0.08)` | offset shadow | 3 (`EvidenceRow:94,201,235`) |
| `rgba(154,107,18,…)` | highlight | 2 (`sources/[documentId]:121,122`) — duplicates `SourcePaneView:24`'s `'154,107,18'` |

**Typography.** Two families via token (`--font-mono` system stack, `--font-serif` Iowan/Palatino) plus three Google fonts scoped to the landing (Geist, Geist Mono, Instrument Serif). There is **no type scale** — sizes are arbitrary one-offs in square brackets: `10px, 11px, 15px, xs, sm, lg, xl, 2xl, 3xl, 5xl`.

**Spacing, radii, shadows, breakpoints: no tokens at all.** Tailwind defaults throughout. Radius is consistently 0 (intentional and well-executed); the one exception is `rounded-full` on the tab count badges (`PatientTabs.tsx:47`).

**Icons: none.** No icon library is used in the workspace despite `lucide-react` being a declared dependency — glyphs are literal Unicode characters (`◌ ✓ ⚠ ✎ ✕ ⌫ □ ◐ ■ —`) and HTML entities (`&#128172;` 💬, `&#127908;` 🎤, `&#128196;` 📄). `lucide-react` appears to be an unused dependency in the app surfaces.

**Focus states: one global rule** (`globals.css:76`), a 2px accent outline at 8.47:1 contrast. Correct and sufficient; no component overrides it.

**Reduced motion: handled only inside `.landing`** (`globals.css:211-222`). The workspace has no `prefers-reduced-motion` block, though it also has almost no animation.

### Component inventory

| Component | File | Used by | Note |
|---|---|---|---|
| `EvidenceRow` + `RejectForm` + `CorrectForm` | `EvidenceRow.tsx:40,193,227` | evidence page, source inspector | 272 lines; mixes two disclosure idioms (see below) |
| `StateBadge`, `ConfidenceBand`, `MachineBadge`, `DemoBadge`, `OriginBadge`, `ReadinessBand`, `SectionHeading`, `EmptyFinding` | `evidence.tsx` | 10 screens | The real design-system primitives. Good. |
| `PatientTabs` | `PatientTabs.tsx:17` | patient layout | `<nav>` has no `aria-label` |
| `SourcePaneView` | `SourcePaneView.tsx:8` | reconciliation room only | **Near-duplicate** — see below |
| `PageViewBeacon` | `PageViewBeacon.tsx:10` | source inspector | |
| `DocumentUploadForm` | `DocumentUploadForm.tsx:20` | sources page | |
| `AssistantLauncher`, `AssistantPanel`, `SourceCard`, `useVoice` | `components/assistant/*` | app layout | `AssistantPanel` is 490 lines |
| 15 landing components | `components/landing/*` | landing page | Self-contained; `primitives.tsx` is their shared layer |

**Duplicate that should be one component:** `SourcePaneView.tsx:34-60` and `sources/[documentId]/page.tsx:104-130` implement the same absolutely-positioned span renderer with gratuitously different constants — `fontSize: '0.7rem'` vs `'0.72rem'`, highlight `rgba(...,0.22)` vs `0.28`, and the inspector hardcodes the rgb triple that `SourcePaneView` parameterises as `tone`. The inspector should use the component that already exists.

**Inconsistent disclosure idioms inside one row:** "why?" uses Radix Popover (focus management, Escape, click-outside, collision padding — correct), while Reject and Correct use native `<details>/<summary>` with `absolute right-0 z-40` panels (no focus trap, no Escape, no click-outside, and they clip on narrow viewports). `record-map/page.tsx:73` uses the `<details>` pattern too.

**Inconsistent label association:** `sources/page.tsx:96-111` correctly wraps controls in `<label>`; `EvidenceRow.tsx:205-214`, `:240-248`, `conflicts/[conflictId]/page.tsx:200-209` and `record-map/page.tsx:85-95` place a `<label>` as a *sibling* with no `htmlFor`.

### Per-screen state handling

**No `error.tsx`, `loading.tsx`, `not-found.tsx` or `global-error.tsx` exists anywhere in `apps/web/src/app`** — verified by `find`. Consequences: every one of the ~20 async server components streams with no skeleton or fallback, and a thrown server action (e.g. `throw new Error('forbidden:packet:approve')` from `actions.ts:43`) surfaces as the default Next.js error screen with no product framing. For a product whose thesis is "no consequential action happens silently", a permission denial currently produces an unstyled crash.

| Screen | Loading | Empty | Error | Partial data | Long content |
|---|---|---|---|---|---|
| Landing | n/a | n/a | missing | n/a | 12,932 px desktop / 15,792 px mobile |
| Login | none | n/a | **good** (`role="alert"`, `page.tsx:54-61`) | n/a | fine |
| Workspace | missing | **good** (`:77-83`, names the fix command) | missing | handles `null` readiness | no pagination |
| Evidence journey | missing | **good** (`EmptyFinding`) | missing | handles undated via "No date recorded" group | **47 rows, no pagination; 8,442 px on mobile** |
| Sources | missing | good | missing | shows `ingest_status` + `ingest_error` — **best partial-data handling in the app** | no pagination |
| Source inspector | missing | **good** ("No text layer for this page") | `notFound()` | good | fixed A4 height regardless of content |
| Conflicts queue | missing | good | missing | **poor — identical values, no discriminator** | fine |
| Reconciliation room | missing | n/a | `notFound()` | good | ~700 px dead white space per short pane |
| Record map | missing | good | missing | good (4 explicit statuses incl. `waived`) | fine |
| Tasks | missing | good | missing | "origin missing" fallback (`:187`) | no pagination |
| Packet | missing | good | missing | **excellent** — empty sections render deliberately | fine |
| Continuity | missing | good | missing | good — blocks approval and says why | N+1 query (`:25`) |
| Audit | missing | good | missing | good | **43 events, no pagination** |

### Accessibility

Measured in a real browser across 12 routes.

**Good:** heading order is clean on every screen (no skipped levels, exactly one `h1` each); one global visible focus style; no images so no alt-text debt; `aria-current="page"` on tabs; `aria-hidden` on decorative glyphs; `aria-label` on the provenance button and the launcher; the landing page has a skip link and 4 `aria-live` regions.

**Failures:**

1. **135 unlabeled form controls on the evidence page alone** (every `reason` textarea and `valueText` input), plus 4 on record-map, 4 in the reconciliation room, 4 on tasks, 1 on packet. Cause: sibling `<label>` with no `htmlFor` (`EvidenceRow.tsx:205`, `:240`), or placeholder-only (`tasks/page.tsx:92`, `packet/page.tsx:37`).
2. **No `<main>` landmark on 9 of 12 screens.** `patients/[id]/layout.tsx:37` renders a plain `<div>`. Only `/`, `/workspace` and `/about` have one.
3. **No `aria-live` region anywhere in the workspace.** Verify / reject / correct / approve / resolve all mutate and re-render with no announcement.
4. **Two unlabeled `<nav>` elements** per patient page (header nav + `PatientTabs`).
5. **No skip link** on any authenticated page.
6. **Colour-only encoding** in the workspace table (`workspace/page.tsx:63,69` — red numerals are the only signal) and in `StateBadge compact`/`ConfidenceBand`, where the sole accessible name is a `title` attribute (`evidence.tsx:25`, `:36`) — not keyboard-reachable and inconsistently announced.
7. `truncate` + `title` on fact values (`EvidenceRow.tsx:67`) hides content from keyboard users.

**Contrast vs WCAG AA (computed from the tokens):**

| Pair | Ratio | Verdict |
|---|---|---|
| `ink` on `paper` | 15.85:1 | AAA |
| `ink-soft` on `paper` | 8.54:1 | AAA |
| `accent` on `paper` | 8.47:1 | AAA |
| white on `accent` (buttons, launcher) | 9.30:1 | AAA |
| `state-corrected` / `conflicting` / `verified` / `rejected` on `paper` | 7.39 / 6.61 / 5.82 / 4.85:1 | AA–AAA |
| **`state-extracted` (`#9a6b12`) on `paper`** | **4.26:1** | **FAILS AA** (needs 4.5) — and this is the most-used state colour on the evidence page (45 unverified facts), rendered at 11px |
| same on its own `#fdf3df` tint | 4.25:1 | FAILS AA |
| **`rule-strong` (`#b9b0a0`) on `paper`** | **1.96:1** | **FAILS WCAG 1.4.11 (AA, 3:1 for UI boundaries)** — this is the border on every text input, select and textarea in the app |
| `rule` (`#dcd5c8`) on `paper` | 1.33:1 | FAILS 1.4.11 |
| **landing `sage` (`#8fa087`) on `ivory`** | **2.41:1** | **FAILS AA** — used as text at `readiness.tsx:107` |
| **landing `amber` (`#b9832b`) on `ivory`** | **2.86:1** | **FAILS AA** — used as 10px text at `evidence-bag.tsx:86`, `readiness.tsx:109,156`, `review.tsx:11` |
| landing `teal` / `alert` / `oxblood` on `ivory` | 5.34 / 5.47 / 9.62:1 | AA–AAA |

### Responsive behaviour

`scrollWidth` vs `innerWidth`, measured on 13 routes:

| Width | Result |
|---|---|
| **375 px (mobile)** | Landing clean. `/login`(authed→workspace) and `/workspace` **+266 px**. All 11 patient screens **+99 px**; `/audit` **+117 px**. |
| **768 px (tablet)** | All 13 routes clean. |
| **1440 px (desktop)** | All 13 routes clean. |

Independently corroborated by the screenshots: mobile captures render 948 px or 1282 px wide (CSS 474 / 641) instead of 750 (CSS 375).

Additional mobile breakage, visible in `audit/screenshots/mobile-room.png` and `mobile-inspector.png`: source-pane span text is **clipped at the right edge** — `whitespace-pre` + `maxWidth: 94%` inside `overflow-hidden` truncates lines mid-word ("…formalin on 13 June 20", "…slides at the next v"). The core "verify this fact against the source text" interaction does not work on a phone. The unauthenticated `/login` page is clean at 375 px.

---

## f. Docs vs reality

| Doc claim | Reality | Verdict |
|---|---|---|
| `README.md:18` "the CI-failing boundary scan in `tools/check-clinical-boundary.ts`" | It does `process.exit(1)` on violation, but its file scan covers only `packages/domain/src/vocab/*` (`:73` filters to `/ui/`, `/vocab/`, `/labels`; the first and third do not exist). It has also never executed in CI. | **Overstated** |
| `README.md:30` deployed at `https://dsc1vmsr4q09g.cloudfront.net` | **True.** HTTP 200, login works, 23 evidence rows, all 8 tabs 200, hash chain verified, zero console errors. | **Accurate** |
| `README.md:34` Pipeline is `S3 → SQS → Lambda → Textract → Bedrock → PostgreSQL` | **True and verified** — the deployed provenance popover reads `bedrock · apac.amazon.nova-pro-v1:0`. | **Accurate** |
| `README.md:37` "No password or secret is published here" | True of the README, but the demo password is a `defaultValue` in `login/page.tsx:86`, hardcoded at `e2e/deployed.spec.ts:18` and `tools/api-smoke.ts:24`, and printed by the seed. | **Misleading** |
| `README.md:51` "`cp .env.example .env` — defaults are fine for local development" | With those defaults `pnpm smoke:api` fails 4/11, direct upload returns 501, presigned GETs 404, and `pnpm dev:worker` exits code 2. | **Overstated** |
| `README.md:180` `npx tsx tools/smoke.ts` | Works, 13/13. But it is not a `package.json` script and not in CI. | **Accurate** |
| `docs/api.md:4-5` "Both run under a tenant transaction and **both check permissions server-side**" | The export route, the pages route and the audit page perform no permission check. Three server actions perform none either. | **False** |
| `docs/api.md:56-61` endpoint list | Complete — all 9 handlers including assistant and export are listed. | **Accurate** |
| `docs/security.md:12-14` "`org_id = NULL` is never true… cross-tenant fetches return **404**, never 403" | **Verified live** — the other tenant's patient returns 404. 37/41 tables have RLS + a policy. | **Accurate** |
| `docs/security.md:41` "Reads are 60-second presigned GETs issued only after authorization" | In the default `fs` driver the URL points at `/api/v1/storage/local`, which does not exist (404). Nothing in the UI consumes it. | **False in the default config** |
| `docs/security.md:70` "`metadata_json` never contains document text, verbatim quotes or patient names" | `redactMetadata` is a 11-key **denylist** (`audit.ts:77`). `filename` and `reason` are not in it — live audit rows contain `{"filename": "referral-letter.pdf"}`, and `reason` is free human text. | **Overstated** |
| `docs/security.md:33-35` three enforcement layers; "auditor holds no mutating permission; `org_admin` cannot verify, correct or approve" | The *table* is correct and pinned by 89 tests. But 5 of 17 permissions are never enforced; auditor and records_officer were proven able to export an approved packet and read the full audit trail. | **Overstated** |
| `CLAUDE.md` "The timeline is a VIEW over the evidence ledger. The timeline is not the core data model." | `timeline_event` is a real table, written by `ledger.ts:289` and read by `patients.ts:37,118`. It is a denormalised projection, not a SQL view. | **Outdated wording** |
| `CLAUDE.md` "encryption in transit" | CloudFront→ALB origin is `http-only` (`web/main.tf:376`) and the ALB listens on HTTP:80; DB connections use `rejectUnauthorized: false` (`client.ts:36`). | **Overstated** |
| `about/page.tsx` (committed) "**No LLM is used.** …the LLM boundary is specified but not wired." | False as committed — the assistant calls NVIDIA live and the deployed worker used Bedrock Nova Pro. The uncommitted working-tree edit corrects this accurately. | **False (fix uncommitted)** |
| `about/page.tsx` (working tree) "a model can never write an unanchored fact" | The gate proves the **quote** is a substring of the linked spans; it never checks that the **value** corresponds to the quote (`span-validation.ts:37`, `documents.ts:367`). A model may pair a real quote with an arbitrary value. | **Overstated** |
| `docs/final-submission-verification.md:103` "`SUBMISSION READY: YES`", all 18 rows PASS | Dated 2026-09-25 and point-in-time accurate, but the deployed instance now has 9 of 14 documents stuck, 8 copies of one file, no checklist and no verified appointment. | **Outdated** |
| `docs/final-submission-verification.md:95` "Playwright — deployed: PASS 5/5" | Those 5 tests are `test.skip` unless `E2E_DEPLOYED_CODE` is set; `pnpm test:e2e` reports "5 skipped" and CI never reaches them. | **Accurate but unenforced** |
| `docs/final-submission-verification.md:97` "Terraform: PASS … 0 to add/change/destroy after apply" | `fmt -check` + `validate` genuinely pass (the CI terraform job is green). The applied-state claim is unverifiable without AWS credentials. | **Partly UNKNOWN** |
| `docs/final-submission-verification.md:112-141` self-disclosed hardening gaps (static IAM user, unverified RDS TLS, root creds used, fixed DB password, no WAF) | All corroborated in code. Unusually honest. | **Accurate** |
| `packages/db/src/seed-aws.ts:23` "engineered to contain… a missing required insurance authorization" | The seeder never calls `assignChecklist`, so no `record_gap` row exists and nothing surfaces. | **False** |
| `apps/worker/src/index.ts:19-21` "Every handler is idempotent against the database" | Plausible and unit-tested (`document-ingest.test.ts`, `ocr-result.test.ts`), but the `idempotency_key` table built for this is entirely unused. | **Accurate, with dead scaffolding** |
| `docs/decisions/0013` object storage defaults to filesystem | Accurate, and ADRs 0001–0016 match the code as read. | **Accurate** |

---

## g. Data, security, infrastructure and runtime results

### Schema

**41 tables** across 7 ordered, idempotent migrations (`0001`–`0007`); `schema_migration` tracking and a `migration-runner`. Migrations applied cleanly from scratch. 37 tables carry RLS with exactly one policy each; 34 use `FORCE ROW LEVEL SECURITY`. Three auth-bootstrap reads go through narrowly-scoped `SECURITY DEFINER` functions because they must run before `app.org_id` exists.

**Tables the code no longer touches** (references only in the seed's truncate list, or nowhere):

| Table | Defined at | References |
|---|---|---|
| `user_totp` | `0002_schema.sql:81` | none — **also the only table with neither RLS nor a policy** |
| `idempotency_key` | `0002_schema.sql:593` | none |
| `extension_grant` | `0002_schema.sql:603` | none |
| `packet_event` | `0007_aws_ingestion.sql:74` | **zero, anywhere** |

No code was found referencing a column that no longer exists.

**Append-only enforcement — verified in the live database.** `oncobrief_app` holds only `INSERT, SELECT` on `evidence_fact`, `ledger_entry` and `audit_event`. **But `text_span` holds `UPDATE` and `DELETE`** — the provenance anchor that a verified, hash-chained fact cites is mutable by the application role, which undercuts the immutability story one level down. `ledger_counter` / `audit_counter` carry `org_id` and have no RLS, but `oncobrief_app` holds no grant on them at all, so they are not exposed.

**Indexes** are present on the hot paths (`evidence_fact` by document / patient / `(org_id, patient_id, slot_key)`, plus a unique `(org_id, id)` for composite FKs). `CHECK` constraints encode real invariants (e.g. `human_fact_has_author`).

### Security findings, by severity

| # | Severity | Finding | Location |
|---|---|---|---|
| 1 | **High** | `audit:read` unenforced — any role reads the full audit trail. **Proven live.** | `audit/page.tsx:15` |
| 2 | **High** | `packet:export` unenforced — any role downloads the full approved-packet JSON. **Proven live.** | `packets/[packetId]/export/route.ts:10` |
| 3 | **Medium** | `.env.example` is loaded as a fallback when `.env` is absent, and every `required()` call has a hardcoded default — so a deployment missing `.env` silently boots with the published `DATABASE_URL`, `DATABASE_MIGRATOR_URL` and `SESSION_COOKIE_SECRET` instead of failing. (Mitigated: the cookie is an opaque DB-backed token, so the "session secret" only signs filesystem storage URLs.) | `packages/db/src/env.ts:23,37,41,44` |
| 4 | **Medium** | Database TLS never verifies the server certificate. | `packages/db/src/client.ts:36` |
| 5 | **Medium** | CloudFront→ALB origin hop is plaintext HTTP; the ALB listener is HTTP:80. PHI traverses it unencrypted. (Mitigated: the ALB security group admits only the CloudFront managed prefix list, so the ALB is not directly reachable.) | `infra/modules/web/main.tf:278,376` |
| 6 | **Medium** | Web tier authenticates to S3/KMS with a **static IAM user access key** rather than the ECS task role. Long-lived credential. Permissions themselves are properly scoped. Self-disclosed. | `infra/modules/web/main.tf` (`aws_iam_user.web_storage`, `aws_iam_access_key.web_storage`) |
| 7 | **Medium** | Live AWS account id `375546530800` hardcoded in committed Terraform (plus Cognito pool `ap-south-1_Ypc1KbaV7`, client id, API Gateway id, CloudFront id, ECR URI across 4 docs). Reconnaissance aid, not a secret. | `infra/environments/dev/versions.tf:17`; `docs/aws-deployment-status.md`, `docs/final-submission-verification.md`, `docs/e2e-verification-report.md` |
| 8 | **Medium** | Audit metadata redaction is a denylist; `filename` and free-text `reason` flow through unredacted and are rendered verbatim in the audit UI. | `packages/db/src/services/audit.ts:77`; `audit/page.tsx:92-94` |
| 9 | **Medium** | Unbounded request bodies: the in-process upload action buffers the whole file with no size cap, and the STT route reads the audio Blob with no cap. The presigned route *does* cap at 25 MB. | `apps/web/src/lib/actions.ts:260-261`; `voice/stt/route.ts:26-32` |
| 10 | **Low** | Demo credentials committed and pre-filled on a publicly deployed login form. | `login/page.tsx:73,86`; `e2e/deployed.spec.ts:18`; `tools/api-smoke.ts:23-24` |
| 11 | **Low** | 3 mutating server actions have no permission check (`commentTaskAction`, `refreshReadinessAction`), and `taskStatusAction` gates on the wrong permission and casts `toStatus` without server-side validation. | `actions.ts:199,205,213,232` |
| 12 | **Low** | `login()` only evaluates `candidates[0]`, so an email present in two orgs can only ever authenticate against the first. | `packages/db/src/services/auth.ts:73-83` |
| 13 | **Low** | Logout revoke failure is swallowed; the cookie is cleared but the session row stays valid until expiry. | `apps/web/src/app/login/actions.ts:35` |
| 14 | **Low** | `user_totp` has neither RLS nor a policy. No live exposure (the table is dead), but it is a trap for whoever wires MFA. | `0002_schema.sql:81` |

**Checked and clean:** no secrets in git history (`.env`, `*.tfvars`, `*.tfstate` never committed, verified across all 10 commits); no SQL injection — every query uses parameter placeholders, with no string interpolation into SQL found; cross-tenant IDOR correctly returns 404 not 403; S3 CORS is scoped to the CloudFront origin, not `*`; S3 public access blocked, SSE-KMS, versioned; RDS not publicly accessible; secrets in Secrets Manager and injected as ECS container secrets; prompt injection defended and tested; the LLM never chooses the patient or the navigation target.

### Correctness risks

1. **Concurrent queries on one pooled client** — 5 sites (finding 10). Latent breakage on pg 9.
2. **N+1 query** — `continuity/page.tsx:25` awaits `listMessageVariables` once per message inside a `for` loop.
3. **No pagination or limit anywhere** — evidence journey (47 rows today), audit trail (43), sources, tasks, conflicts are all unbounded `SELECT`s rendered in full.
4. **No error boundaries** — a thrown server action produces an unstyled Next.js error page.
5. **Unhandled rejection by design** — `PageViewBeacon.tsx:21` drops audit-write failures; `evidence/[id]/route.ts:45` masks storage failures.
6. **Correction keeps a stale anchor** — `EvidenceRow.tsx:239` resubmits the original `verbatimQuote` with the corrected value, so the quote no longer supports what is displayed.
7. **Unvalidated enum cast at a trust boundary** — `actions.ts:205` casts a form field straight to `TaskStatus`; `actions.ts:160-167` derives task origin from an untrusted field with a silent `else` default.

### Infrastructure state

**Defined in IaC:** ~90 resources across 10 modules — `vpc` (NAT, S3 endpoint), `rds` (Postgres 16, private), `s3` (versioned, SSE-KMS, public access blocked, lifecycle), `sqs` (2 queues + 2 DLQs + SNS for Textract completion + queue policies), `lambda` (worker + admin, event source mapping), `api_gateway` (HTTP API + Cognito authorizer), `cognito` (pool, 5 role groups, SPA client, domain), `iam` (3 roles), `monitoring` (3 alarms + dashboard), `web` (ECR, ALB, ECS Fargate, CloudFront, Secrets Manager). Bootstrap module provisions the TLS-enforced state bucket.

**Real request path, end to end:**
`Browser → CloudFront (HTTPS, AWS-owned cert, redirect-to-https) → ALB (HTTP:80, SG admits only the CloudFront prefix list) → ECS Fargate Next.js (private subnets) → RDS Postgres 16 (private) + S3 (private, SSE-KMS) → S3 ObjectCreated → SQS → Lambda worker → Textract → SNS → SQS → Lambda worker → Bedrock Nova Pro → span gate → evidence ledger`

**Where the path breaks:** not at the edge — the web tier is fully functional and verified. It breaks **inside the async pipeline**: 9 of 14 deployed documents never completed ingestion (4 `received` = never picked up, 3 `rendering`, 2 `ocr_running` = Textract never returned or `OCR_MAX_POLLS` exhausted). The two documents that completed with 0 facts suggest extraction ran and promoted nothing. Diagnosing this needs CloudWatch logs and the DLQ depths, which I cannot reach.

**Is there a working deployed URL?** **Yes** — `https://dsc1vmsr4q09g.cloudfront.net`, verified live and working for demo steps 1–11 and 19. The shortest path to a *complete* demo on it is to call `assignChecklist` + `computeAndPersistReadiness` in `seed-aws.ts`, verify one appointment fact, and reseed from a clean database to clear the 9 stuck documents and the 8 duplicate uploads.

**CI/CD:** two jobs. `terraform` **passes** (`fmt -recursive -check` and `validate`). `verify` has **never passed** in 3 attempts. There is no deployment pipeline — `infra/modules/web/main.tf` takes a `web_image_tag` variable, so image build and push are manual.

### Runtime command results

| Command | Result |
|---|---|
| `pnpm typecheck` | **PASS** — 6/6 projects, zero errors (strict, `noUncheckedIndexedAccess`) |
| `npx eslint .` | **PASS** — exit 0, zero warnings (`no-explicit-any` is `error`) |
| `pnpm boundary:check` | **PASS** — "clinical boundary scan: clean" (scope is narrow, see finding 8) |
| `pnpm branding:check` | **PASS** — "branding scan: clean" |
| `pnpm demo:reset` | **PASS** — 7 migrations, 3 patients, 17 documents, 75 facts, 2 conflicts, 18 gaps, 2 tasks, 0 extraction rejections |
| `packages/domain` tests | **PASS 301/301** (9 files) — incl. 124 evidence-state-machine, 89 RBAC, 18 conflict, 14 hash-chain, 14 span-validation |
| `packages/adapters` tests | **PASS 24/24** (4 files) — sigv4, S3, Textract, Bedrock |
| `packages/db` tests | **PASS 33/33** (4 files) — ledger, security/RLS, chat, Cognito. **Fails with `ECONNREFUSED 5432` without Postgres** |
| `apps/web` tests | **PASS 45/45** (5 files) — orchestrator, classify, navigation, prompt, providers |
| `apps/worker` tests | **PASS 26/26** (5 files) |
| **Total** | **PASS 429/429** with Postgres running |
| `pnpm --filter @oncobrief/web build` | **PASS** — compiled in 24.2s, 26 routes. Note `eslint: { ignoreDuringBuilds: true }` (`next.config.ts:21`) → "Skipping linting" |
| `pnpm --filter @oncobrief/web test:e2e` | **22 passed, 5 skipped** in 47.2s. The 5 skipped are all of `deployed.spec.ts` |
| `pnpm --filter @oncobrief/worker build` | **PASS** — `index.js` 309.3 kB, `admin.js` 318.0 kB |
| `pnpm --filter @oncobrief/worker start` | **FAIL, exit 2** — `QUEUE_DRIVER=memory is for tests only` |
| `pnpm smoke:api` (local, default config) | **FAIL 7/11, exit 1** — upload-url 501; invalid-JSON, unsupported-type and unknown-patient all 501 instead of 400/415/404 |
| `npx tsx tools/smoke.ts` | **PASS 13/13** |
| `docker build -t oncobrief-audit-test .` | **PASS**, exit 0 |
| `docker run` the image | **PASS** — "Ready in 1601ms"; `/` 200, `/login` 200, `/workspace` 307 |
| Unauthenticated route sweep (18 paths) | **PASS** — 12 pages 307→`/login`, 3 APIs 401, `/api/v1/storage/local` **404**, unknown route 404 |
| Authenticated route sweep (13 paths) | **PASS** — all 200; unknown patient id 404 |
| Cross-tenant probe (other org's patient) | **PASS** — 404, not 403 |
| Deployed instance (read-only browse) | **PASS** — login, workspace, 23 evidence rows, 8 tabs 200, chain verified, 0 console errors |
| `gh run list` | **3 runs, 3 failures.** `verify` dies at pnpm setup; `terraform` passes |

---

## h. Unknowns

| # | Unknown | Why | Exact step to resolve |
|---|---|---|---|
| 1 | Whether the dev Terraform stack matches the committed IaC (the "0 to add/change/destroy" claim) | The dev backend is remote S3; only the bootstrap state is local. No AWS credentials in this environment. | `cd infra/environments/dev && terraform init && terraform plan` with credentials for account `375546530800` |
| 2 | Why 9 of 14 deployed documents are stuck | Needs CloudWatch logs and SQS/DLQ metrics. | Read `/aws/lambda/oncobrief-dev-worker` logs and `ApproximateNumberOfMessagesVisible` on both DLQs; or invoke the admin Lambda with `{"action":"document-status","documentId":"…"}` |
| 3 | Whether Sarvam STT/TTS work | A `SARVAM_API_KEY` is present locally but I did not post audio, and there is no automated test for either route. | `curl -b "ob_session=…" -F audio=@sample.wav -F languageCode=en-IN localhost:3000/api/v1/assistant/voice/stt`, and POST `{"text":"hello"}` to `/tts` |
| 4 | Whether the worker's SQS consumer loop runs correctly | It exits code 2 locally; the deployed path runs as a Lambda (`lambda.ts`), not via `index.ts`'s polling loop, so `index.ts:119-159` has never been executed anywhere I can observe. | `docker compose --profile aws up -d` then `AWS_ENDPOINT_URL=http://localhost:4566 QUEUE_DRIVER=sqs STORAGE_DRIVER=s3 pnpm dev:worker` |
| 5 | Whether Cognito bearer auth works against the live pool | 8 integration tests pass with mocked JWKS; not exercised end-to-end here. | Obtain an IdToken from pool `ap-south-1_Ypc1KbaV7` and `curl -H "Authorization: Bearer …"` against `/api/v1/evidence/{id}` on the deployed URL |
| 6 | Whether the deployed presigned-PUT upload still works | Testing it would write another document to the live demo database, which I declined to do. | With `E2E_DEPLOYED_CODE` set, run `deployed.spec.ts` against a reseeded instance |
| 7 | Whether `admin.ts`'s 11 actions behave as documented | Requires `aws lambda invoke` inside the VPC. | `aws lambda invoke --function-name oncobrief-dev-admin --payload '{"action":"probe"}' out.json` |
| 8 | Real test coverage percentage | No coverage tooling is configured in any `vitest.config.ts`. | Add `--coverage` with `@vitest/coverage-v8` and run per package. Qualitatively: the domain package is thoroughly tested (301 tests over pure logic); the **UI layer has zero component tests** — `apps/web`'s 45 tests cover only `lib/assistant/*`, and no page, component or server action is unit-tested. |

### A note on what the tests do and don't cover

The 429 passing tests are substantive, not trivial — the evidence state machine is exercised across 124 cases, RBAC cell by cell across 89, and the hash chain and span gate each get 14 including tamper cases. But the coverage is shaped like a pyramid with no top: **every finding in the Top 10 lives in a layer the tests do not reach.** The RBAC suite asserts the permission *table* and would still pass with all 17 permissions unenforced; no test calls the export route or the audit page as a non-privileged role. Combined with finding 1 — none of it runs in CI — the test suite's reassurance is weaker than its numbers suggest.

---

## Artefacts

- `audit/feature-inventory.csv` — 81 features with state, confidence, entry point, key files, notes
- `audit/screenshots/` — 34 PNGs: every screen at desktop (1440) and mobile (375), the reconciliation room, source inspector, provenance popover, assistant panel, and 4 captures of the live deployed instance
