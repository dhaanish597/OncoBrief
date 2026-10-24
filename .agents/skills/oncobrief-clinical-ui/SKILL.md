---
name: oncobrief-clinical-ui
description: >-
  Use this skill when designing, reviewing, styling, or updating OncoBrief clinical
  user interfaces, including Clinical Context layouts, card hierarchies, Times New Roman
  scoping, responsive clinical dashboards, accessibility compliance, and deduplication
  of clinical baseline presentations.
---

# OncoBrief Clinical UI

This skill governs the visual and layout design for clinical surfaces in OncoBrief, with particular focus on the **Clinical Context** page (`/patients/[id]/clinical-context`), expandable clinical category cards, patient baseline presentation, and accessibility.

OncoBrief is an evidence-first oncology operational platform. Its visual identity must convey evidence, provenance, verification, and auditability—**never** looking like a generic SaaS dashboard, a Kanban board, or a clinical decision-support assistant.

---

## 1. Core Principles & Non-Clinical Boundary

1. **Evidence-First Aesthetics**:
   - Use warm paper tones (`var(--color-paper)`, `var(--color-paper-raised)`) under dark ink (`var(--color-ink)`).
   - High information density with crisp border rules (`var(--color-rule)`, `var(--color-rule-strong)`).
   - State colors (`verified`, `extracted`, `conflicting`, `corrected`, `rejected`) must always pair with clear text labels and glyphs.
2. **Preserve the Clinical Boundary**:
   - Never display automated diagnostic conclusions, prognoses, or treatment recommendations.
   - Every summary card must display a boundary notice (e.g. `Non-clinical boundary preserved · No automated diagnoses`).
   - Distinguish verbatim extracted facts from derived values (such as BMI/BSA), explicitly labeling formulas and inputs.

---

## 2. Typography Rules & Times New Roman Scoping

### Strict Scope
- All typography within the **Clinical Context** UI (`apps/web/src/app/(app)/patients/[id]/clinical-context/page.tsx`), its child components (`apps/web/src/components/clinical/`), and associated chart overlays/tooltips must use **Times New Roman**:
  ```css
  font-family: 'Times New Roman', Times, serif;
  ```
- **CRITICAL**: Scope Times New Roman styling strictly to the Clinical Context route container and chart overlays. **Do NOT** change global body typography in `globals.css` or alter the public landing page (`apps/web/src/app/(landing)/`), which relies on its own design system.

### Font Hierarchy & Scale
| Level | Font Family | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Page Title** | Times New Roman | `1.5rem` (24px) | Bold / Semibold | `1.25` | Main page heading ("Clinical context") |
| **Section Headings** | Times New Roman | `1.125rem` (18px) | Semibold | `1.3` | Category headers, Explorer header |
| **Card Headers** | Times New Roman | `1.0rem` (16px) | Semibold | `1.35` | Expandable card titles, card section titles |
| **Card Body & Narrative** | Times New Roman | `0.875rem` (14px) | Regular | `1.5` | Documented diagnoses, pathology notes |
| **Secondary & Captions**| Times New Roman | `0.8125rem` (13px)| Regular / Italic| `1.4` | Helper descriptions, empty state notes |
| **Precision Data & Badges** | Monospace (`var(--font-mono)`) | `0.6875rem` - `0.75rem` (11-12px) | Medium | `1.2` | Numeric values with units, dates, verification badges, formulas |

> [!NOTE]
> Monospace font (`.mono`) is retained for tabular numbers, dates, formulas, and state badges to maintain alignment and readability of exact medical data.

---

## 3. Baseline Card Preservation & Duplicate Removal

Follow these exact requirements when refining the Clinical Context page:

### A. PRESERVE the Top Patient Overview Card
- **KEEP**: The top `Patient Overview & Documented Baseline` card (`PatientOverviewCard.tsx`) on `clinical-context/page.tsx`.
- This card provides vital anthropometrics (Age, Sex, Height, Weight, Blood Group, Allergies, ECOG status, Comorbidities) and derived BSA/BMI with full provenance and formula notes.

### B. REMOVE ONLY the Two Duplicate Presentations
1. **Remove Duplicate Filter in Universal Value Explorer**:
   - In `apps/web/src/components/clinical/UniversalValueExplorer.tsx`, remove the `{ id: 'vital_baseline', label: 'Baseline / Vitals' }` chip from the filter list.
   - Do NOT remove any other filters (`all`, `hematology`, `biochemistry`, `tumor_marker`, `pathology_biomarker`).
2. **Remove Duplicate Accordion in Clinical Cards Section**:
   - In `apps/web/src/components/clinical/ClinicalCardsSection.tsx`, remove the first accordion card:
     `<ExpandableClinicalCard title="Patient baseline" ...>`
   - Retain all other clinical category cards:
     - `Pathology and biomarkers`
     - `Latest documented treatment and follow-up`
     - `Recent laboratory results`
     - `Quick Insights`

---

## 4. Card Design, Spacing & Layout Structure

- **Container Wrapper**: Use `border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-5` for major sections.
- **Inner Data Cards**: Use `border border-[var(--color-rule)] bg-[var(--color-paper)] p-3` for grid tiles.
- **Section Dividers**: Subtle borders `border-b border-[var(--color-rule)] pb-3` with clear margins.
- **Responsive Layout**:
  - Desktop (≥1024px): Multi-column grids (`lg:grid-cols-4`, `md:grid-cols-3`).
  - Tablet (768px - 1023px): 2-column grids (`sm:grid-cols-2`).
  - Mobile (<768px): Single-column stack (`grid-cols-1`).
  - Tables and charts must be wrapped in `overflow-x-auto` to prevent viewport breakages.

---

## 5. Accessibility & Interaction Guidelines

1. **Semantic Structure**:
   - Every major card must have an accessible name using `<section aria-labelledby="...">` and `<h2 id="...">`.
2. **Color Contrast**:
   - All text must meet WCAG 2.1 AA contrast ratios (≥4.5:1 for body text, ≥3:1 for large text).
   - Use `var(--color-ink)` (`#1b1a17`) on paper backgrounds.
3. **Focus States**:
   - Interactive elements (buttons, links, expanders) must show a visible outline on `:focus-visible` (`outline: 2px solid var(--color-accent)`).
4. **Touch Targets**:
   - Clickable items, buttons, and filter chips must have minimum touch targets of 36x36px (preferably 44x44px on mobile).

---

## 6. Implementation Workflow

When applying changes guided by this skill:
1. **Inspect First**: Review `clinical-context/page.tsx`, `PatientOverviewCard.tsx`, `ClinicalCardsSection.tsx`, and `UniversalValueExplorer.tsx`.
2. **Make Minimal Changes**: Edit only the specific duplicate presentation items and style classes.
3. **Preserve Components**: Reuse `StateBadge`, `ExpandableClinicalCard`, and existing navigation paths.
4. **Execute Verification**:
   ```bash
   pnpm --filter @oncobrief/web typecheck
   pnpm --filter @oncobrief/web lint
   pnpm --filter @oncobrief/web test
   ```
5. **Report Changed Files**: Clearly list every file modified with line references.

For full typography and layout specifications, see [references/typography-and-layout.md](./references/typography-and-layout.md).
