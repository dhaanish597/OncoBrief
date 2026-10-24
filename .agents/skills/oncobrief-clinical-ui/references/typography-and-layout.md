# Clinical Context Typography & Layout Reference Guide

This document provides technical reference specifications for styling and structuring the Clinical Context page in OncoBrief.

## 1. Scoped Times New Roman Implementation

To prevent leaking serif styling into other parts of the workspace or the public landing page, create a scoped CSS class or Tailwind wrapper.

### Recommended CSS Scoping
In `apps/web/src/app/globals.css` (or a dedicated CSS module / utility class):

```css
/* Scoped strictly to clinical context container and chart overlays */
.clinical-context-scope {
  font-family: 'Times New Roman', Times, serif;
}

.clinical-context-scope h1,
.clinical-context-scope h2,
.clinical-context-scope h3,
.clinical-context-scope h4,
.clinical-context-scope h5,
.clinical-context-scope p,
.clinical-context-scope span:not(.mono),
.clinical-context-scope a:not(.mono),
.clinical-context-scope th:not(.mono),
.clinical-context-scope td:not(.mono) {
  font-family: 'Times New Roman', Times, serif;
}

/* Retain monospace font for exact values, units, dates, and state badges */
.clinical-context-scope .mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

### Font Size System
- **H1 (Page Header)**: `text-2xl font-bold` (~24px)
- **H2 (Section Titles)**: `text-lg font-semibold` (~18px)
- **H3 (Card Header / Group)**: `text-base font-semibold` (~16px)
- **H4 (Subheadings / Table Headers)**: `text-sm font-semibold` (~14px)
- **Body Text**: `text-sm font-normal` (~14px)
- **Secondary / Helper Text**: `text-xs font-normal text-[var(--color-ink-soft)]` (~12-13px)
- **Monospace Values & Badges**: `mono text-[11px] or text-xs` (~11-12px)

---

## 2. Duplicate Removal Details

### File: `apps/web/src/components/clinical/UniversalValueExplorer.tsx`
Locate the category filter list:
```tsx
// BEFORE:
{[
  { id: 'all', label: 'All Tests' },
  { id: 'hematology', label: 'Hematology' },
  { id: 'biochemistry', label: 'Biochemistry' },
  { id: 'tumor_marker', label: 'Tumour Markers' },
  { id: 'vital_baseline', label: 'Baseline / Vitals' },
  { id: 'pathology_biomarker', label: 'Biomarkers' },
]}

// AFTER:
{[
  { id: 'all', label: 'All Tests' },
  { id: 'hematology', label: 'Hematology' },
  { id: 'biochemistry', label: 'Biochemistry' },
  { id: 'tumor_marker', label: 'Tumour Markers' },
  { id: 'pathology_biomarker', label: 'Biomarkers' },
]}
```

### File: `apps/web/src/components/clinical/ClinicalCardsSection.tsx`
Locate and remove the `<ExpandableClinicalCard title="Patient baseline" ...>` block and its preview text computation:
- Remove `cards.baseline` accordion from the rendered list.
- Retain the other 4 cards: `pathology`, `treatment`, `recentLabs`, `quickInsights`.
- The top `PatientOverviewCard` handles all documented baseline values in full detail.

---

## 3. Grid & Spacing Standards

- **Page Section Spacing**: `space-y-8`
- **Card Padding**: `p-5` for top-level cards, `p-3` or `p-4` for child tiles.
- **Grid Gaps**: `gap-4` between metric cards.
- **Border Rules**:
  - Outermost border: `border border-[var(--color-rule-strong)]`
  - Internal dividers: `border-b border-[var(--color-rule)]`
  - Tile borders: `border border-[var(--color-rule)]`
- **Backgrounds**:
  - Section container: `bg-[var(--color-paper-raised)]` (`#fffdf9`)
  - Internal card tile: `bg-[var(--color-paper)]` (`#f7f4ee`) or `bg-white` for selected items.
