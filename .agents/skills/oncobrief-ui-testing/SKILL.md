---
name: oncobrief-ui-testing
description: >-
  Use this skill when authoring, running, or verifying tests for OncoBrief clinical
  interfaces, chart interactions, hover tooltips, keyboard/touch accessibility, responsive
  layouts, duplicate presentation elimination, and clinical boundary compliance.
---

# OncoBrief UI Testing

This skill provides test suites, assertion patterns, and verification runbooks for OncoBrief UI surfaces, focusing on clinical charts, tooltip accuracy, keyboard/touch accessibility, responsive layouts, and regression safeguarding.

---

## 1. Test Architecture Overview

OncoBrief employs a multi-tiered testing strategy:
1. **Unit & Logic Tests (Vitest)**:
   - `packages/domain/test/`: State transitions, span validation, derived metrics, hash chains, RBAC.
   - `apps/web/src/lib/`: Reconciliation, security regressions, assistant grounding.
2. **End-to-End Tests (Playwright)**:
   - `apps/web/e2e/`: Authenticated user flows, document inspection, evidence verification, conflict resolution.
3. **Safety & Policy Scans**:
   - `tools/check-clinical-boundary.ts`: Verifies non-clinical boundaries across all code surfaces.
   - `tools/validate-branding.ts`: Verifies no stale branding leaks into public or workspace pages.

---

## 2. Test Specifications by Requirement

### A. Chart Hover Tooltip Accuracy
Tests must assert that hovering over any observation data point renders an accessible tooltip containing:
- [x] Actual observed date
- [x] Exact result value
- [x] Unit of measurement
- [x] Source reference range
- [x] Source abnormality flag (`H`, `L`, `CRITICAL`, or `NORMAL`)
- [x] Source document filename
- [x] Page number
- [x] Verification state badge

### B. Point Click & Navigation Test
Tests must assert that:
- Clicking a chart point selects it and highlights the point with an outer indicator ring.
- Clicking the source report link navigates to:
  ```text
  /patients/[id]/sources/[documentId]?fact=[factId]&page=[pageNumber]
  ```
- The Source Inspector loads with the exact page and highlighted text span.

### C. Keyboard & Touch Accessibility Tests
- **Keyboard Navigation**:
  - Assert that data points can be focused via `Tab`.
  - Assert `aria-label` exposes analyte name, value, unit, date, and flag.
  - Assert pressing `Enter` or `Space` selects the point or opens the provenance card.
- **Touch Testing**:
  - Simulate viewport touch event (`hasTouch: true`).
  - Tap a data point; assert that the provenance inspector opens without hover dependencies.

### D. Duplicate Removal Assertion
Tests must assert that:
- The top `Patient Overview & Documented Baseline` card is present and visible on `/patients/[id]/clinical-context`.
- The `Baseline / Vitals` category filter is **NOT** present in the Universal Value Explorer filters.
- The `Patient baseline` accordion card is **NOT** present in `Documented Clinical Categories & Quick Insights`.

### E. Responsive Layout & Typography Scoping
- Test viewports:
  - Mobile: 375x667 (`iPhone SE`)
  - Tablet: 768x1024 (`iPad Mini`)
  - Desktop: 1280x800
- Verify no unexpected horizontal window scrollbars (`document.documentElement.scrollWidth <= window.innerWidth`).
- Verify that Times New Roman font is applied within `.clinical-context-scope` and chart overlays, and does **not** override the public landing page or core workspace navigation.

---

## 3. Standard Verification Runbook

Run these commands in order before submitting any UI changes:

```bash
# 1. Typecheck the entire monorepo
pnpm typecheck

# 2. Lint and safety boundary scan
pnpm lint

# 3. Unit test suite
pnpm test

# 4. Playwright End-to-End Suite (requires local or test server)
pnpm --filter @oncobrief/web test:e2e
```

---

## 4. Implementation Workflow

1. **Inspect Existing Tests**: Review `apps/web/e2e/demo-flow.spec.ts` and `vitest.config.ts`.
2. **Author Scoped Tests**: Add test assertions for chart tooltips, keyboard focus, and deduplication.
3. **Execute Tests**: Run `pnpm test` and Playwright tests locally.
4. **Report Results**: Document test outputs, passes, failures, and all changed files.

For complete Playwright assertion snippets and Vitest examples, see [references/test-guidelines.md](./references/test-guidelines.md).
