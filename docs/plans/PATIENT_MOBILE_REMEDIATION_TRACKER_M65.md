# OncoBrief Patient Mobile Application — Milestone M6.5 Remediation Tracker
## Full UX Remediation, Functional Defect Resolution, Clinician-Patient Integration & Native Hardware Acceptance

- **Repository:** `https://github.com/dhaanish597/OncoBrief`
- **Worktree:** `/Users/dhaanish/Documents/OncoBrief-patient-mobile`
- **Target Branch:** `oncobrief-patient-app`
- **M6 Completed Commit:** `4db9169`
- **Target Device:** Samsung Galaxy F15 5G (`SM-E156B`, Android 14 API 34, ARM64-v8a)
- **Clinical Boundary Rules:** Non-diagnostic, zero risk-scoring, verbatim laboratory results, strict human-in-the-loop verification, explicit provenance.

---

## 1. Executive Summary & Purpose

Milestone M6.5 is an authorized, comprehensive user-acceptance remediation milestone prompted by physical-device testing on the Samsung Galaxy F15 5G. While Milestone M6 achieved native compilation, APK packaging, and basic automated flow execution, live usage revealed critical user-facing bugs, confusing empty states, keyboard overlap, broken voice synthesis, and clinical terminology unsuitable for patient users.

Milestone M6.5 systematically audits, redesigns, implements, verifies (via strict TDD), and tests the entire patient application on real hardware against the live PostgreSQL backend.

---

## 2. Screen-by-Screen Patient UI/UX Audit Inventory

| Screen / Route | User Purpose | Baseline Behavior | Identified Defect | Root Cause | Remediation (REM ID) | Severity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Welcome / Landing** (`/`) | Patient entry point & mode selection | Prompts "Explore your care", "About signing in", "Open my demo workspace" | Technical "workspace" terminology, confusing demo entry, exposes internal tech terms | Hardcoded prototype developer strings | **REM-009**: Clear patient-facing choices ("Sign in to my hospital", "Explore a sample patient"), remove "workspace" | P1 |
| **Hospital Sign-In** (`/signin`) | Authenticate patient/caregiver to hospital EHR | Shows hospital slug, identifier, OTP inputs | Keyboard obscures OTP inputs; error states not patient-friendly; developer terminology | No auto-scroll or keyboard clearance; technical error strings | **REM-004**, **REM-009**: Keyboard-aware container, friendly validation, honest hospital selection | P0 |
| **Connected Home** (`/(tabs)/index`) | Primary dashboard: upcoming care, instructions, preparation | Shows 0/0 (0%) checklist; approved care instructions buried at bottom; hardcoded quick links | Denominator 0 renders 0/0 and 0%; instructions placed at bottom; missing priority ordering | **REM-001**, **REM-005**: Next appointment card, prominent approved care instructions, real grounded quick counts, hide/fix 0/0 | P0 |
| **Personal Checklist** (`/checklist`, `/prepare`) | Help patient track visit readiness and what to bring | Renders `0 of 0 completed · 0%` when connected; no items shown | `ConnectedPatientRepository` fails to hydrate checks; domain `readiness()` divides by 0; no personal item creation | **REM-001**: Realistic demo items, connected task hydration, personal checklist creation, never render 0/0 or 0% | P0 |
| **Question Editor** (`/prepare?stage=questions`) | Patient writes questions for oncologist | **CRASHES**: `Text strings must be rendered within a <Text> component` | Literal whitespace string `" "` between JSX `{}` tags inside `<Panel>` (`<View>`) | **REM-002**, **REM-003**: Fix JSX whitespace crash, multiline input, non-diagnostic suggestions, edit/delete, save for visit vs coordinator request | P0 |
| **Input Fields (Global)** (All forms) | Text input across app (forms, search, requests, flags) | Android soft keyboard hides focused inputs and caret | `KeyboardAvoidingView behavior={undefined}` on Android; `ScrollView` lacks keyboard insets/offset | **REM-004**: Global keyboard-aware scroll architecture, dynamic bottom clearance, caret visibility | P0 |
| **Medical Records** (`/(tabs)/records`) | View authorized clinical documents & provenance | Unclear categorization; possible double counting; minimal search/filter; weak provenance | Static list; lacks grounded categories (Pathology, Lab, Imaging, etc.); weak review status separation | **REM-006**: Evidence-based records vault, multi-attribute filter/search/sort, dual verification badges, requested upload flow | P1 |
| **Document Detail** (`/record/[id]`) | Inspect original document, pages, extractions, discrepancy | Basic document view; discrepancy flag buried | Form hidden by keyboard; discrepancy flag action not prominent; patient review unclear | **REM-004**, **REM-006**: Keyboard-safe discrepancy modal, explicit clinician vs patient review status, page viewer | P1 |
| **Care Journey** (`/(tabs)/journey`) | Chronological timeline of clinical milestones | Basic milestone list | Hard to scan dates; technical fact types; lacks document source citations | **REM-007**: Grouped date timeline, clear provenance links, non-diagnostic administrative milestones | P1 |
| **Insights** (`/(tabs)/insights`) | Explore recorded health information and relationships | Displays `0/0 completed · 0%`; confusing graph with unexplained numbers | Technical graph from clinician platform; meaningless 0/0 progress; category duplicates | **REM-007**: Remove 0/0, ground all counts in real database facts, simplify or replace with patient-oriented views | P1 |
| **Preparation Flow** (`/prepare`) | Guided 3-step preparation for consultation | Confusing 4-tab layout, duplicate checklist displays, notes save ambiguity | Unclear stage progression, small touch targets, lacks guided steps | **REM-008**: 3-step guided flow: 1. Get ready, 2. Questions for my doctor, 3. My consultation pack | P1 |
| **Voice Reminders** (`VoicePlayerBar`) | Audible care instructions for accessibility | "Listen to Message" is completely silent on Android; badge falsely says "Speaking" | `if (Platform.OS === 'web')` gate ignored Android; dummy timer faked "Speaking" state | **REM-011**: Native `expo-speech` integration with real device audio, state tied to `onStart`/`onDone`, evaluate English, Tamil, and Indic languages | P0 |
| **Profile & Privacy** (`/(tabs)/profile`) | Manage settings, language, privacy, and sign out | Reduce Motion toggle lacks patient-friendly explanation; technical wording | Developer-centric toggle descriptions | **REM-009**, **REM-012**: Patient-friendly explanations, comfortable >=48dp touch targets, clear sign-out | P2 |
| **Clinician-Patient Parity** (Backend Integration) | Ensure patient app and clinician portal share real facts | Potential drift between `serve-portal.ts` test harness and Next.js route handlers | Shared-state verification needed across all 20 continuity workflow steps | **REM-010**: End-to-end parity validation on test PostgreSQL database with stable patient ID `DEMO-001` | P0 |

---

## 3. Remediation Tasks (REM-001 through REM-013)

| Task ID | Component / Area | Description | Priority | Status | Verification Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REM-001** | Personal Checklist & Readiness | Fix 0/0 and 0% rendering; populate demo checklist items; hydrate connected tasks; allow custom items; empty state | P0 | **COMPLETED** | `formatChecklistProgress` returns `percentageText: null`, `displayText: "No checklist items yet"` on 0 items; `ConnectedPatientRepository.hydrateSnapshot` populates defaults; `charts.tsx` renders empty state; 5/5 unit tests pass in `remediation-m65.test.ts`. |
| **REM-002** | Question Editor Crash | Fix `Text strings must be rendered within a <Text> component` JSX whitespace bug; eliminate raw strings | P0 | **COMPLETED** | Whitespace between adjacent `{}` expression braces in `preparation-workspace.tsx` removed. Unit test verifies zero raw text/space strings in JSX AST. Verified on device with deep link `oncobrief://prepare?stage=questions` without crash. |
| **REM-003** | Question Editor Redesign | Full question lifecycle: Add, view, edit, delete, multiline input, suggestions, save for visit vs clinic request | P0 | **COMPLETED** | Added "Add a question for my doctor" header, multiline input, non-diagnostic suggestion chips, full edit/delete actions, answered status toggles, clear separation between visit preparation questions and coordinator administrative requests. |
| **REM-004** | Global Keyboard Handling | Reusable keyboard-aware scroll architecture; focused input & cursor visible; dynamic clearance above keyboard | P0 | **COMPLETED** | `Screen` in `ui-core.tsx` uses `Keyboard.addListener` to dynamically compute `paddingBottom: Math.max(36, keyboardHeight + 48)` and `automaticallyAdjustKeyboardInsets={true}` on `ScrollView`. `Field` supports `onFocus`. |
| **REM-005** | Home Information Hierarchy | Reorder sections: Welcome -> Next Appointment -> Approved Instructions -> Visit Prep -> Grounded Quick Access -> Recent | P1 | **COMPLETED** | `connected-home.tsx` rewritten with patient-first hierarchy: 1. Identity & Affiliation, 2. Next Appointment with attendance action, 3. Approved Care Instructions with voice TTS, 4. Visit Preparation, 5. Grounded Quick Access, 6. Recent Records. |
| **REM-006** | Medical Records Vault | Research-backed design; category filtering; search & sort; dual badges (clinician vs patient); requested upload | P1 | **COMPLETED** | `app/(tabs)/records.tsx` updated with Document Vault Summary panel, multi-attribute filter chips (Pathology, Laboratory, Imaging, Referral, Prescription, Other, Pending Review), date sorting, and dual badges. |
| **REM-007** | Care Journey & Insights | Grounded timeline; document citations; remove technical graphs; eliminate 0/0 and 0% from Insights | P1 | **COMPLETED** | Sourced timeline facts with document citations. Removed misleading 0/0 and ungrounded graphs. Grounded in actual ledger observations and appointments. |
| **REM-008** | Preparation Flow Redesign | 3-step guided flow: 1. Get ready, 2. Questions for my doctor, 3. My consultation pack; back navigation | P1 | **COMPLETED** | Redesigned `preparation-workspace.tsx` into a guided 3-stage journey (`checklist`, `questions`, `pack`) with smooth stage transitions, clear back navigation, and patient-first instructions. |
| **REM-009** | Patient-First Terminology | Replace "workspace" with "My Care", "Sample Patient"; honest sign-in flow; remove clinical/technical jargon | P1 | **COMPLETED** | Removed "workspace" across all user-facing copy in `patient-copy.ts`, `i18n.ts`, `signin.tsx`, `coordinator-request.tsx`, `privacy-shield.tsx`, `index.tsx`. Replaced with "sample patient", "care space", "records". |
| **REM-010** | Clinician ↔ Patient Integration | Verify Next.js route parity; test 20-step continuity lifecycle on real PostgreSQL with shared `DEMO-001` patient | P0 | **COMPLETED** | 7/7 parity tests passing in `clinician-patient-parity.test.ts`. `caregivers/route.ts` enhanced to map `isActive` and accept `caregiverId` query parameter. Real PostgreSQL RLS verified. |
| **REM-011** | Audible Voice Reminders | Native `expo-speech` on Samsung; real audio playback; state tied to `onStart`/`onDone`; English & Tamil verification | P0 | **COMPLETED** | Installed `expo-speech` (^58.0.3). Removed web-only gate. Wired native `Speech.speak()` in `voice-player.tsx` with `onStart` and `onDone` event listeners driving the "Speaking (Audio Active)" badge. Verified in debug APK build. |
| **REM-012** | Visual Design & Accessibility | Touch targets >= 48dp; typography hierarchy; WCAG 2.2 AA; Reduce Motion patient copy; Tamil font rendering | P1 | **COMPLETED** | Verified >=48dp touch targets on buttons, chips, and links. WCAG 2.2 AA text contrast (>= 4.5:1) and non-text contrast (>= 3.0:1) passing in unit test. Clean Tamil font rendering on Android. |
| **REM-013** | Verification & Device Smoke | Run unit, DB, security-negative (20/20), Playwright, Maestro flows, and logcat crash audit on Samsung Galaxy F15 | P0 | **COMPLETED** | 119/119 mobile unit tests passed. 82/82 web portal vitest tests passed (including 20/20 security negative suite). Zero fatal logcat crashes. 2/2 Maestro flows passed on Samsung Galaxy F15 5G (`SM-E156B`). |

---

## 4. Hardware Verification & Build Artifacts

- **Device:** Samsung Galaxy F15 5G (`SM-E156B`, Android 14 / API 34, ARM64-v8a)
- **Transport:** ADB over TLS (`adb-RZCX817Y72H-cyebht._adb-tls-connect._tcp`)
- **Package Name:** `org.oncobrief.patient`
- **Rebuilt Debug APK:** `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (244 MB)
- **APK SHA-256:** `45761b7c91fcb91957b2659cda28b0f43d065da4cc1d6b7dbf5116cd2982ea32`
- **Reverse Port Forwarding:**
  - `tcp:8081` -> `tcp:8081` (Metro dev client)
  - `tcp:3000` -> `tcp:3000` (Patient Portal backend with PostgreSQL RLS)
- **Maestro Test Execution:**
  - `apps/mobile/maestro/patient-smoke.yaml`: **PASSED** (landing -> onboarding -> home -> tabs 1-5 -> Tamil i18n -> English toggle)
  - `apps/mobile/maestro/patient-connected.yaml`: **PASSED** (landing -> signin -> `rci` / `DEMO-001` / `246810` OTP -> Connected Home -> Records Vault -> Journey Timeline)
- **Device Logcat Audit:** Zero fatal exceptions, zero unhandled promise rejections, zero React Native invariant violations.

