'use client';

import { useState, useMemo, useId, useRef } from 'react';
import type { StructuredObservation } from '@oncobrief/domain';

export function areUnitsComparable(unitA?: string | null, unitB?: string | null): boolean {
  if (!unitA && !unitB) return true;
  if (!unitA || !unitB) return false;
  const a = unitA.trim().toLowerCase().replace(/\s+/g, '');
  const b = unitB.trim().toLowerCase().replace(/\s+/g, '');
  if (a === b) return true;

  // Synonymous units
  const equivalents: [string, string][] = [
    ['/ul', 'cells/mcl'],
    ['/ul', 'cells/cu.mm'],
    ['/ul', '/mcl'],
    ['cells/mcl', 'cells/cu.mm'],
    ['g/dl', 'gm/dl'],
    ['mg/dl', 'mg%'],
    ['u/l', 'iu/l'],
  ];

  for (const [x, y] of equivalents) {
    if ((a === x && b === y) || (a === y && b === x)) return true;
  }

  return false;
}

export interface TreatmentEventItem {
  id: string;
  kind: 'procedure' | 'cycle' | 'appointment' | 'followup';
  label: string;
  date: string;
  state: string;
  sourceDocumentId: string;
  sourceDocumentName: string;
  sourcePageNumber: number | null;
  factId: string;
}

export function ObservationChart({
  observations,
  analyteLabel,
  treatmentEvents = [],
  isCompact = false,
}: {
  observations: StructuredObservation[];
  analyteLabel: string;
  treatmentEvents?: TreatmentEventItem[];
  isCompact?: boolean;
}) {
  const chartUid = useId().replace(/:/g, '');
  const gradientId = `refRangeGrad-${chartUid}`;
  const [dateFilter, setDateFilter] = useState<'all' | '1y' | '90d' | '30d'>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTreatments, setShowTreatments] = useState(true);
  const [hoveredTreatmentId, setHoveredTreatmentId] = useState<string | null>(null);

  // Filter numeric observations only
  const numericObs = useMemo(() => {
    return observations.filter((o) => typeof o.numericValue === 'number' && Number.isFinite(o.numericValue));
  }, [observations]);

  // Primary unit & incompatible unit check
  const primaryUnit = numericObs[0]?.unitText || '';
  const incompatibleUnits = useMemo(() => {
    const units = new Set<string>();
    for (const o of numericObs) {
      if (o.unitText && !areUnitsComparable(primaryUnit, o.unitText)) {
        units.add(o.unitText);
      }
    }
    return [...units];
  }, [numericObs, primaryUnit]);

  // Plot only points with compatible units to avoid combining incompatible scales
  const compatibleObs = useMemo(() => {
    return numericObs.filter((o) => areUnitsComparable(primaryUnit, o.unitText));
  }, [numericObs, primaryUnit]);

  // Date range filtering
  const filteredObs = useMemo(() => {
    if (dateFilter === 'all') return compatibleObs;

    const now = new Date();
    const cutoff = new Date();
    if (dateFilter === '1y') cutoff.setFullYear(now.getFullYear() - 1);
    else if (dateFilter === '90d') cutoff.setDate(now.getDate() - 90);
    else if (dateFilter === '30d') cutoff.setDate(now.getDate() - 30);

    return compatibleObs.filter((o) => {
      const d = o.observedOn || o.documentDate;
      if (!d) return true;
      return new Date(d) >= cutoff;
    });
  }, [compatibleObs, dateFilter]);

  // Source-specific reference range (prioritizing latest observation with both bounds)
  const sourceRefRange = useMemo(() => {
    for (let i = filteredObs.length - 1; i >= 0; i--) {
      const r = filteredObs[i]?.referenceRange;
      if (r?.low !== undefined && r?.high !== undefined && r.high > r.low) {
        return r;
      }
    }
    // Fallback: any observation with at least one bound
    for (let i = filteredObs.length - 1; i >= 0; i--) {
      if (filteredObs[i]?.referenceRange?.low !== undefined || filteredObs[i]?.referenceRange?.high !== undefined) {
        return filteredObs[i]!.referenceRange;
      }
    }
    return undefined;
  }, [filteredObs]);

  // A ref range is only valid when both bounds are present and non-negative
  const hasValidRefRange =
    sourceRefRange?.low !== undefined &&
    sourceRefRange?.high !== undefined &&
    sourceRefRange.low >= 0 &&
    sourceRefRange.high > sourceRefRange.low;

  // SVG dimensions — fixed readable height, no expand/contract
  const chartHeight = isCompact ? 180 : 300;
  const padding = isCompact
    ? { top: 25, right: 40, bottom: 44, left: 52 }
    : { top: 36, right: 74, bottom: 50, left: 62 };
  const width = 840;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // Calculate bounds for SVG scaling
  const chartData = useMemo(() => {
    if (filteredObs.length === 0) return null;

    const values = filteredObs.map((o) => o.numericValue!);
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);

    if (hasValidRefRange && sourceRefRange?.low !== undefined) minVal = Math.min(minVal, sourceRefRange.low);
    if (hasValidRefRange && sourceRefRange?.high !== undefined) maxVal = Math.max(maxVal, sourceRefRange.high);

    const range = maxVal - minVal || (maxVal > 0 ? maxVal * 0.2 : 10);
    const yMin = Math.max(0, minVal - range * 0.15);
    const yMax = maxVal + range * 0.15;

    // Parse dates to timestamp
    const datePoints = filteredObs.map((o, idx) => {
      const dStr = o.observedOn || o.documentDate || `2025-01-${String(idx + 1).padStart(2, '0')}`;
      const time = new Date(dStr).getTime();
      return {
        obs: o,
        time: Number.isNaN(time) ? idx * 86400000 : time,
        dateStr: dStr,
      };
    });

    const times = datePoints.map((p) => p.time);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeSpan = maxTime - minTime || 1;

    // Detect repeated measurements on same date
    const sameDateCounts = new Map<string, number>();
    const sameDateOffsets = new Map<string, number>();
    for (const p of datePoints) {
      sameDateCounts.set(p.dateStr, (sameDateCounts.get(p.dateStr) || 0) + 1);
    }

    const points = datePoints.map((p, idx) => {
      const totalOnDate = sameDateCounts.get(p.dateStr) || 1;
      const currentIdx = sameDateOffsets.get(p.dateStr) || 0;
      sameDateOffsets.set(p.dateStr, currentIdx + 1);

      // Normalize time with micro-offset for same-date repeated tests
      const baseNormX = timeSpan === 1 ? 0.5 : (p.time - minTime) / timeSpan;
      const offset = totalOnDate > 1 ? (currentIdx - (totalOnDate - 1) / 2) * 0.03 : 0;
      const normX = Math.max(0.04, Math.min(0.96, baseNormX + offset));
      const normY = (p.obs.numericValue! - yMin) / (yMax - yMin || 1);

      const cx = padding.left + normX * plotWidth;
      const cy = padding.top + (1 - normY) * plotHeight;

      // Find any relevant treatment event on or near this date
      const matchingTreatment = treatmentEvents.find((te) => {
        if (!te.date) return false;
        return te.date === p.dateStr || te.date.startsWith(p.dateStr.slice(0, 10));
      });

      return {
        ...p,
        normX,
        normY,
        cx,
        cy,
        idx,
        isRepeated: totalOnDate > 1,
        matchingTreatment,
      };
    });

    // Correlate treatment events that fall within the time window
    const rawPlottedTreatments = treatmentEvents
      .filter((te) => te.date)
      .map((te, tIdx) => {
        const tTime = new Date(te.date).getTime();
        if (Number.isNaN(tTime)) return null;
        if (tTime < minTime - 86400000 * 2 || tTime > maxTime + 86400000 * 2) return null;
        const normX = Math.max(0.04, Math.min(0.96, (tTime - minTime) / timeSpan));
        const x = padding.left + normX * plotWidth;
        return {
          ...te,
          badgeLabel: `T${tIdx + 1}`,
          tTime,
          x,
        };
      })
      .filter(Boolean) as (TreatmentEventItem & { badgeLabel: string; tTime: number; x: number })[];

    rawPlottedTreatments.sort((a, b) => a.tTime - b.tTime);

    // Stagger vertical event labels if two events occur within 24px of each other
    let lastYOffset = 0;
    const plottedTreatments = rawPlottedTreatments.map((t, idx, arr) => {
      let yOffset = 0;
      if (idx > 0) {
        const prev = arr[idx - 1]!;
        if (Math.abs(t.x - prev.x) < 26) {
          yOffset = lastYOffset === 0 ? 16 : 0;
        }
      }
      lastYOffset = yOffset;
      return {
        ...t,
        yOffset,
      };
    });

    return {
      points,
      yMin,
      yMax,
      minTime,
      maxTime,
      plottedTreatments,
    };
  }, [filteredObs, sourceRefRange, hasValidRefRange, treatmentEvents, padding.left, padding.top, plotWidth, plotHeight]);

  // Does any visible point fall outside the ref range?
  const hasOutOfRange = chartData?.points.some((pt) => {
    const rf = pt.obs.referenceRange;
    const v = pt.obs.numericValue;
    return (
      pt.obs.flag === 'H' || pt.obs.flag === 'L' || pt.obs.flag === 'CRITICAL' ||
      (hasValidRefRange && rf?.high !== undefined && v !== null && v !== undefined && v > rf.high) ||
      (hasValidRefRange && rf?.low !== undefined && v !== null && v !== undefined && v < rf.low)
    );
  });

  // No tooltip — activeObsPoint and selectedObs intentionally removed

  return (
    <div
      ref={containerRef}
      className="relative border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-4 select-none"
    >
      {/* Chart Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            Chronological Trend
          </span>
          <h4 className="cc-card-title text-[var(--color-ink)]">
            {analyteLabel} {primaryUnit ? `(${primaryUnit})` : ''}
          </h4>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date range filter */}
          <div className="mono flex border border-[var(--color-rule-strong)] bg-white text-[11px]">
            {(['all', '1y', '90d', '30d'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDateFilter(mode)}
                className={`px-2.5 py-1 uppercase transition-colors ${
                  dateFilter === mode
                    ? 'bg-[var(--color-ink)] text-white font-medium'
                    : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
                }`}
              >
                {mode === 'all' ? 'All' : mode.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Toggle Treatment Milestones */}
          {treatmentEvents.length > 0 && !isCompact ? (
            <button
              type="button"
              onClick={() => setShowTreatments((prev) => !prev)}
              className={`mono border px-2.5 py-1 text-[11px] uppercase transition-colors ${
                showTreatments
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium'
                  : 'border-[var(--color-rule-strong)] bg-white text-[var(--color-ink-soft)]'
              }`}
              title="Toggle treatment milestones overlay"
            >
              {showTreatments ? '✓ Treatments' : '+ Treatments'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Incompatible unit warning if present */}
      {incompatibleUnits.length > 0 ? (
        <div className="mt-3 border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="cc-body text-xs">
            ⚠ Incompatible units detected in records ({incompatibleUnits.join(', ')} vs {primaryUnit}).
            To prevent inaccurate charting, only results measured in {primaryUnit} are plotted in this series.
          </p>
        </div>
      ) : null}

      {/* Missing reference range notice — only shown when no valid range was reported */}
      {!hasValidRefRange && chartData && (
        <div className="cc-metadata mt-2 text-xs italic text-[var(--color-ink-soft)]">
          ℹ No valid reference range was reported by the source documents for this analyte. No normal-range band is displayed.
        </div>
      )}

      {/* SVG Chart Area */}
      {chartData && chartData.points.length > 0 ? (
        <div className="relative mt-3 w-full overflow-x-auto">
          <div style={{ minWidth: '600px' }}>
            <svg
              viewBox={`0 0 ${width} ${chartHeight}`}
              className="w-full select-none"
              style={{ height: `${chartHeight}px` }}
              role="img"
              aria-label={`Chronological trend chart for ${analyteLabel}`}
            >
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#24734D" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#24734D" stopOpacity="0.08" />
                </linearGradient>
              </defs>

              {/* Reference Range Shaded Band — only rendered when a valid range exists */}
              {hasValidRefRange && sourceRefRange?.low !== undefined && sourceRefRange?.high !== undefined ? (
                (() => {
                  const yLow =
                    padding.top +
                    (1 - (sourceRefRange.low - chartData.yMin) / (chartData.yMax - chartData.yMin)) *
                      plotHeight;
                  const yHigh =
                    padding.top +
                    (1 - (sourceRefRange.high - chartData.yMin) / (chartData.yMax - chartData.yMin)) *
                      plotHeight;
                  const bandHeight = Math.max(1, yLow - yHigh);

                  const labelYHigh = Math.max(padding.top + 12, yHigh - 4);
                  const labelYLow = Math.max(labelYHigh + 16, yLow + 12);

                  return (
                    <g>
                      <rect
                        x={padding.left}
                        y={yHigh}
                        width={plotWidth}
                        height={bandHeight}
                        fill={`url(#${gradientId})`}
                      />
                      <line
                        x1={padding.left}
                        y1={yHigh}
                        x2={width - padding.right}
                        y2={yHigh}
                        stroke="var(--color-ref-green)"
                        strokeDasharray="5 3"
                        strokeWidth="1.2"
                      />
                      <line
                        x1={padding.left}
                        y1={yLow}
                        x2={width - padding.right}
                        y2={yLow}
                        stroke="var(--color-ref-green)"
                        strokeDasharray="5 3"
                        strokeWidth="1.2"
                      />
                      <g>
                        <rect
                          x={width - padding.right - 114}
                          y={labelYHigh - 11}
                          width={114}
                          height={14}
                          fill="rgba(255,253,249,0.93)"
                          rx="2"
                        />
                        <text
                          x={width - padding.right - 5}
                          y={labelYHigh}
                          textAnchor="end"
                          fill="var(--color-ref-green)"
                          style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '10px', fontWeight: 600 }}
                        >
                          Max Ref: {sourceRefRange.high} {primaryUnit}
                        </text>
                      </g>
                      <g>
                        <rect
                          x={width - padding.right - 114}
                          y={labelYLow - 11}
                          width={114}
                          height={14}
                          fill="rgba(255,253,249,0.93)"
                          rx="2"
                        />
                        <text
                          x={width - padding.right - 5}
                          y={labelYLow}
                          textAnchor="end"
                          fill="var(--color-ref-green)"
                          style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '10px', fontWeight: 600 }}
                        >
                          Min Ref: {sourceRefRange.low} {primaryUnit}
                        </text>
                      </g>
                    </g>
                  );
                })()
              ) : null}

              {/* Horizontal Gridlines & Y-Axis Labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                const val = chartData.yMin + pct * (chartData.yMax - chartData.yMin);
                const y = padding.top + (1 - pct) * plotHeight;
                return (
                  <g key={pct}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={width - padding.right}
                      y2={y}
                      stroke="var(--color-rule)"
                      strokeWidth="1"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3}
                      textAnchor="end"
                      fill="var(--color-ink-soft)"
                      className="mono text-[10px]"
                    >
                      {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(val < 10 ? 1 : 0)}
                    </text>
                  </g>
                );
              })}

              {/* Treatment Milestones — orange star markers below x-axis */}
              {showTreatments &&
                chartData.plottedTreatments.map((t) => {
                  const isHv = hoveredTreatmentId === t.id;
                  const starY = chartHeight - padding.bottom + 15 + t.yOffset;

                  return (
                    <g
                      key={t.id}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredTreatmentId(t.id)}
                      onMouseLeave={() => setHoveredTreatmentId(null)}
                    >
                      {/* Orange star icon only — no vertical line */}
                      <text
                        x={t.x}
                        y={starY}
                        textAnchor="middle"
                        fill={isHv ? '#b45309' : '#d97706'}
                        style={{ fontSize: isHv ? '14px' : '12px', userSelect: 'none' }}
                      >
                        ★
                      </text>
                    </g>
                  );
                })}

              {/* Connecting Trend Line */}
              {chartData.points.length > 1 ? (
                <polyline
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={chartData.points.map((p) => `${p.cx},${p.cy}`).join(' ')}
                />
              ) : null}

              {/* Data Points */}
              {chartData.points.map((p, pIdx) => {
                const isHigh =
                  p.obs.flag === 'H' ||
                  p.obs.flag === 'CRITICAL' ||
                  (hasValidRefRange && sourceRefRange?.high !== undefined && p.obs.numericValue! > sourceRefRange.high);
                const isLow =
                  p.obs.flag === 'L' ||
                  (hasValidRefRange && sourceRefRange?.low !== undefined && p.obs.numericValue! < sourceRefRange.low);

                // All out-of-range points are red; in-range points use accent blue
                let pointColor = 'var(--color-accent)';
                if (isHigh || isLow) pointColor = 'var(--color-abnormal)';

                // Check distance to previous/next point to prevent overlapping labels
                const prev = chartData.points[pIdx - 1];
                const next = chartData.points[pIdx + 1];
                const isDense =
                  (prev && Math.abs(p.cx - prev.cx) < 45) || (next && Math.abs(p.cx - next.cx) < 45);
                const shouldShowValueLabel = !isDense || pIdx % 2 === 0;

                // X-axis date decimation: show date if spaced out or first/last
                const isFirst = pIdx === 0;
                const isLast = pIdx === chartData.points.length - 1;
                const dateDistance = prev ? p.cx - prev.cx : 100;
                const shouldShowDate = isFirst || isLast || dateDistance >= 65;

                return (
                  <g
                    key={p.idx}
                    aria-label={`${p.obs.canonicalLabel}: ${p.obs.valueText} ${p.obs.unitText || ''} on ${p.dateStr}${p.obs.flag ? `, flag ${p.obs.flag}` : ''}`}
                  >
                    {/* Point Circle */}
                    <circle
                      cx={p.cx}
                      cy={p.cy}
                      r={5}
                      fill="white"
                      stroke={pointColor}
                      strokeWidth="2.5"
                    />

                    {/* Protective pill background and value label above point */}
                    {shouldShowValueLabel && (
                      <g>
                        <rect
                          x={p.cx - 26}
                          y={p.cy - 21}
                          width={52}
                          height={14}
                          rx={2}
                          fill="rgba(255, 253, 249, 0.94)"
                          stroke="var(--color-rule)"
                          strokeWidth="0.5"
                        />
                        <text
                          x={p.cx}
                          y={p.cy - 10}
                          textAnchor="middle"
                          fill={(isHigh || isLow) ? 'var(--color-abnormal)' : 'var(--color-ink)'}
                          style={{ fontFamily: 'Times New Roman, Times, serif', fontSize: '10px', fontWeight: 700 }}
                        >
                          {p.obs.valueText}
                        </text>
                      </g>
                    )}

                    {/* X-axis date tick label */}
                    {shouldShowDate && (
                      <text
                        x={p.cx}
                        y={chartHeight - padding.bottom + 16}
                        textAnchor="middle"
                        fill="var(--color-ink-soft)"
                        className="mono text-[9px]"
                      >
                        {p.dateStr}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Chart Legend */}
          {!isCompact && (
            <div
              className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[var(--color-rule)] pt-2.5 px-1"
              style={{ fontFamily: 'Times New Roman, Times, serif' }}
            >
              {hasValidRefRange && (
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-soft)]">
                  <span className="inline-block h-3 w-5 border border-[var(--color-ref-green)] rounded-sm" style={{ background: 'rgba(36,115,77,0.18)' }} />
                  Normal Range
                </span>
              )}
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-soft)]">
                <span className="inline-flex items-center gap-0.5">
                  <span className="inline-block h-[2px] w-4 rounded" style={{ background: 'var(--color-accent)' }} />
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 bg-white" style={{ borderColor: 'var(--color-accent)' }} />
                </span>
                {analyteLabel}
              </span>
              {hasOutOfRange && (
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-soft)]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[var(--color-abnormal)] bg-white" />
                  Out of Range (H / L)
                </span>
              )}
              {showTreatments && chartData.plottedTreatments.length > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-soft)]">
                  <span className="text-[#d97706] text-sm leading-none">★</span>
                  Treatment Event
                </span>
              )}
            </div>
          )}

          {/* Treatment milestone detail list below legend */}
          {showTreatments && chartData.plottedTreatments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pt-1.5">
              <span className="mono text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)] mr-1">Milestones:</span>
              {chartData.plottedTreatments.map((t) => {
                const isHv = hoveredTreatmentId === t.id;
                return (
                  <span
                    key={t.id}
                    onMouseEnter={() => setHoveredTreatmentId(t.id)}
                    onMouseLeave={() => setHoveredTreatmentId(null)}
                    className={`mono inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] transition-colors cursor-pointer ${
                      isHv
                        ? 'border-[#d97706] bg-[#d97706]/10 text-[#92400e]'
                        : 'border-[var(--color-rule)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-paper)]'
                    }`}
                  >
                    <span className="text-[#d97706]">★</span>
                    <span>{t.date}</span>
                    <span className="font-medium text-[var(--color-ink-soft)]">· {t.label}</span>
                  </span>
                );
              })}
            </div>
          )}


        </div>
      ) : (
        <div className="mt-6 p-6 text-center text-xs text-[var(--color-ink-soft)]">
          No comparable numeric observations in selected date filter
        </div>
      )}
    </div>
  );
}
