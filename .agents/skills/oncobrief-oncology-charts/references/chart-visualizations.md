# Oncology Chart Visualizations Technical Guide

This reference document details the technical implementation of interactive clinical charts, anti-collision rendering, tooltip overlays, and categorical timelines in OncoBrief.

---

## 1. SVG Scaling & Geometry Calculations

In `ObservationChart.tsx`, SVG layout coordinates are derived from dynamic data bounds:

```typescript
const chartHeight = isExpanded ? 420 : 250;
const padding = { top: 30, right: 40, bottom: 50, left: 60 };
const width = 800;
const plotWidth = width - padding.left - padding.right;
const plotHeight = chartHeight - padding.top - padding.bottom;
```

### Y-Axis Normalization
```typescript
const yMin = Math.max(0, dataMin - paddingRange);
const yMax = dataMax + paddingRange;
const normY = (val - yMin) / (yMax - yMin || 1);
const cy = padding.top + (1 - normY) * plotHeight;
```

### X-Axis Date Normalization & Collision Avoidance
```typescript
// Detect multiple tests on the same calendar day
const sameDateCounts = new Map<string, number>();
for (const p of points) {
  sameDateCounts.set(p.dateStr, (sameDateCounts.get(p.dateStr) || 0) + 1);
}

// Compute normalized X with anti-collision offset
const baseNormX = timeSpan === 0 ? 0.5 : (p.time - minTime) / timeSpan;
const totalOnDate = sameDateCounts.get(p.dateStr) || 1;
const offset = totalOnDate > 1 ? (currentIdx - (totalOnDate - 1) / 2) * 0.025 : 0;
const normX = Math.max(0.04, Math.min(0.96, baseNormX + offset));
const cx = padding.left + normX * plotWidth;
```

---

## 2. Source-Specific Reference Range Shading

When the source document provides numerical reference boundaries (`sourceRefRange.low` and `sourceRefRange.high`):

```tsx
<defs>
  <linearGradient id="refRangeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stopColor="#2e7d32" stopOpacity="0.12" />
    <stop offset="100%" stopColor="#2e7d32" stopOpacity="0.04" />
  </linearGradient>
</defs>

<rect
  x={padding.left}
  y={yHigh}
  width={plotWidth}
  height={Math.max(1, yLow - yHigh)}
  fill="url(#refRangeGrad)"
/>
<line x1={padding.left} y1={yHigh} x2={width - padding.right} y2={yHigh} stroke="#2e7d32" strokeDasharray="4 3" />
<line x1={padding.left} y1={yLow} x2={width - padding.right} y2={yLow} stroke="#2e7d32" strokeDasharray="4 3" />
<text x={width - padding.right - 5} y={yHigh - 4} textAnchor="end" fill="#2e7d32" className="text-[10px]">
  Max Ref: {sourceRefRange.high}
</text>
<text x={width - padding.right - 5} y={yLow + 12} textAnchor="end" fill="#2e7d32" className="text-[10px]">
  Min Ref: {sourceRefRange.low}
</text>
```

---

## 3. Interactive Tooltip Contract

When a user hovers over an observation point or focuses it via keyboard:
```tsx
<div
  role="tooltip"
  className="absolute z-30 border border-[var(--color-rule-strong)] bg-white p-3 shadow-md text-xs pointer-events-none"
  style={{ left: tooltipX, top: tooltipY }}
>
  <div className="flex items-center justify-between gap-2 border-b border-[var(--color-rule)] pb-1 mb-1.5">
    <span className="font-semibold text-[var(--color-ink)]">{analyteLabel}</span>
    <StateBadge state={obs.state} compact />
  </div>
  <dl className="mono grid grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5 text-[11px]">
    <dt className="text-[var(--color-ink-soft)]">Observed</dt>
    <dd className="font-medium text-[var(--color-ink)]">{obs.observedOn || obs.documentDate || 'Unstated'}</dd>
    
    <dt className="text-[var(--color-ink-soft)]">Result</dt>
    <dd className="font-bold text-[var(--color-ink)]">
      {obs.valueText} {obs.unitText || ''} {obs.flag ? `[Flag: ${obs.flag}]` : ''}
    </dd>
    
    <dt className="text-[var(--color-ink-soft)]">Ref Range</dt>
    <dd className="text-[var(--color-ink-soft)]">{obs.referenceRange?.text || 'Not reported'}</dd>
    
    <dt className="text-[var(--color-ink-soft)]">Source File</dt>
    <dd className="truncate text-[var(--color-ink)]" title={obs.documentName}>{obs.documentName}</dd>
    
    <dt className="text-[var(--color-ink-soft)]">Page</dt>
    <dd className="text-[var(--color-ink)]">{obs.pageNumber ? `Page ${obs.pageNumber}` : '—'}</dd>
  </dl>
</div>
```

---

## 4. Categorical & Milestone Visualizations

For non-numeric tests (e.g. ER, PR, HER2, histology, blood group), render a chronological milestone card sequence:

```tsx
<div className="space-y-2">
  {categoricalObs.map((obs) => (
    <div key={obs.id} className="flex items-center justify-between border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
      <div>
        <span className="mono text-[11px] text-[var(--color-ink-soft)]">{obs.observedOn || obs.documentDate}</span>
        <h5 className="font-semibold text-sm text-[var(--color-ink)]">{obs.canonicalLabel}: {obs.valueText}</h5>
        <p className="doc-text text-xs italic text-[var(--color-ink-soft)] mt-0.5">“{obs.verbatimQuote}”</p>
      </div>
      <div className="flex items-center gap-2">
        <StateBadge state={obs.state} compact />
        <Link
          href={`/patients/${patientId}/sources/${obs.documentId}?fact=${obs.id}${obs.pageNumber ? `&page=${obs.pageNumber}` : ''}`}
          className="mono text-xs text-[var(--color-accent)] underline decoration-dotted"
        >
          {obs.documentName}
        </Link>
      </div>
    </div>
  ))}
</div>
```
