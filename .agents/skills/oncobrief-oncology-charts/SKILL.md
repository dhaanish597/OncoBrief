---
name: oncobrief-oncology-charts
description: >-
  Use this skill when implementing, extending, reviewing, or styling interactive
  oncology charts in OncoBrief, including longitudinal analyte trends, source-specific
  reference-range shading, abnormality indicators, multi-marker comparisons, dynamic test
  search, treatment timelines, point hover tooltips, click-to-source navigation, and
  accessible SVG visualizations.
---

# OncoBrief Oncology Charts

This skill governs the architecture, visualization patterns, and interaction contracts for clinical charts in OncoBrief, centered on `ObservationChart.tsx`, `UniversalValueExplorer.tsx`, and related clinical visualizations.

---

## 1. Absolute Data Grounding & Truthfulness

1. **Actual Observations Only**:
   - All visualizations must plot **only actual available observations** extracted from OCR and validated by the Evidence Ledger.
   - **NEVER** fabricate, simulate, or extrapolate clinical data points.
   - If a patient has only 1 observation, display a single distinct point with a documented baseline indicator—never draw a synthetic slope or trend line.
   - If observations have incompatible units (e.g. `g/dL` vs `mmol/L`), do not plot them on a shared numeric axis. Provide an explicit incompatibility notice and plot only compatible subsets using `areUnitsComparable(...)`.
2. **Dynamic Analyte Catalog Support**:
   - Do **NOT** hardcode a unique chart component for every biomarker or laboratory test.
   - Use the dynamic analyte catalog (`ANALYTE_CATALOG`) and `canonicalizeAnalyte(...)` from `@oncobrief/domain`.
   - Any new test recognized or extracted from medical records must automatically render within the appropriate chart type.

---

## 2. Mandatory Interaction Contracts

### A. Point Hover Interaction (Tooltip)
Hovering over each observation point must reveal an interactive tooltip card displaying:
1. **Actual Observed Date** (or document date if observation date is unstated).
2. **Exact Measured Result** (verbatim text value and formatted numeric result).
3. **Unit of Measurement** (e.g. `g/dL`, `mg/dL`, `U/L`, `/uL`, `%`).
4. **Source-Specific Reference Range** (both verbatim text and parsed `low` - `high` bounds).
5. **Source-Reported Abnormality Flag** (`H`, `L`, `CRITICAL`, `NORMAL`).
6. **Original Source Document Filename** (e.g. `DEMO-001-CBC-2025-01-14.pdf`).
7. **Source Page Number** (e.g. `Page 2`).
8. **Verification Status** (`extracted`, `verified`, `conflicting`, `corrected`, `rejected`) displayed with `StateBadge`.

### B. Point Click Interaction (Source Navigation)
- Clicking an observation point must open its original source report using OncoBrief's standard navigation:
  ```tsx
  `/patients/${patientId}/sources/${obs.documentId}?fact=${obs.id}${obs.pageNumber ? `&page=${obs.pageNumber}` : ''}`
  ```
- This triggers the Source Inspector, highlighting the exact OCR text span supporting the value.

### C. Keyboard & Touch Accessibility
- **Keyboard Navigation**: Each chart data point must be focusable (`tabIndex={0}`, `role="button"` or `role="graphics-symbol"`), support `aria-label` describing the test, date, value, unit, and abnormality flag, and activate the tooltip/source on `Enter` or `Space`.
- **Touch Interaction**: On mobile and touch screens, tapping an observation point reveals the complete provenance card and an "Open Original Report" action button without requiring mouse hover.

---

## 3. Visualization Types by Observation Category

| Observation Category | Supported Analytes / Examples | Visualization Method | Visual Components & Indicators |
| :--- | :--- | :--- | :--- |
| **Numeric Observations (Labs)** | Haemoglobin, Platelets, Creatinine, Bilirubin, LDH, Electrolytes | Longitudinal SVG Trend Line + Data Points | Shaded reference-range band, gridlines, H/L colored point rings, value labels |
| **Quantitative Biomarkers** | CA 15-3, CEA, CA-125, Ki-67 (%) | Trend Line / Stepped Milestone Chart | Cutoff threshold lines, reference shading, flagged points |
| **Categorical Biomarkers** | ER, PR, HER2 (IHC/FISH), Blood Group | Discrete Timeline Status Strips | Horizontal milestone timeline, receptor status chips, verification state |
| **Pathology / Molecular** | Histology, Tumor Grade, Genomic Alterations | Chronological Milestone Cards | Date-anchored cards linking specimen date to documented pathology findings |
| **Treatment Milestones** | Surgeries, Chemotherapy Cycles, Radiation | Correlated Timeline Milestones | Vertical milestone markers or synchronized track beneath lab trend curves |
| **Multi-Marker Comparisons** | ANC vs WBC, Total vs Direct Bilirubin | Synchronized Multi-Series Overlay | Multi-colored trend lines with unified compatible scale and dual legend |

---

## 4. Layout, Anti-Collision & Aesthetics

1. **Times New Roman Typography**:
   - Scope all chart titles, axis labels, legends, callouts, and tooltip typography to **Times New Roman**:
     ```css
     font-family: 'Times New Roman', Times, serif;
     ```
   - Monospace font (`.mono`) is used strictly for exact numbers, dates, and units inside badges.
2. **Preventing Overlapping Content**:
   - **Label Collision Prevention**: Do not render all value labels simultaneously if points are dense; stagger labels, offset repeated same-date tests, or display labels on hover/focus.
   - **Repeated Same-Date Tests**: Compute horizontal micro-offsets (`offset = (currentIdx - (total - 1) / 2) * jitter`) so multiple tests collected on the same day remain distinctly visible and selectable.
   - **X-Axis Date Staggering**: Decimate date tick labels when points exceed available width, showing dates for first, last, and milestone points.
3. **Date Range Filtering**:
   - Provide standard date filters: **All**, **1 Year** (`1y`), **90 Days** (`90d`), **30 Days** (`30d`).
   - Automatically recalculate min/max values and X/Y scales on filter changes.
4. **Expandable Mode & Zoom/Pan**:
   - Provide an expand toggle (`isExpanded`) that enlarges chart height from 250px to 420px+ for detailed inspection.
   - Wrap SVG in an `overflow-x-auto` container with min-width to support small viewports without shrinking below readability.

---

## 5. Implementation Workflow

When modifying or authoring charts:
1. **Inspect Existing Files**: Review `ObservationChart.tsx`, `UniversalValueExplorer.tsx`, and `packages/domain/src/clinical/observation-types.ts`.
2. **Make Minimal Scoped Edits**: Keep changes focused on chart rendering, tooltip data contracts, and event listeners.
3. **Reuse Existing Patterns**: Reuse `StateBadge`, `parseReferenceRange`, and `parseSourceFlag`.
4. **Run Verification Commands**:
   ```bash
   pnpm --filter @oncobrief/web typecheck
   pnpm --filter @oncobrief/web test
   ```
5. **Report Changed Files**: Document all modified components and test status.

For full SVG layout math and multi-analyte specifications, see [references/chart-visualizations.md](./references/chart-visualizations.md).
