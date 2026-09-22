import type { EvidenceStateValue } from '@oncobrief/domain';

/**
 * Shared evidence primitives (architecture §22.3). The Evidence Chip is the
 * atomic unit: a value is never rendered without its state, its confidence band
 * and a pointer to its source.
 */

const STATE_STYLE: Record<EvidenceStateValue, { fg: string; bg: string; glyph: string; label: string }> = {
  extracted: { fg: 'var(--color-state-extracted)', bg: '#fdf3df', glyph: '◌', label: 'unverified' },
  verified: { fg: 'var(--color-state-verified)', bg: '#e8f3ea', glyph: '✓', label: 'verified' },
  conflicting: { fg: 'var(--color-state-conflicting)', bg: '#fbe9e8', glyph: '⚠', label: 'conflicting' },
  corrected: { fg: 'var(--color-state-corrected)', bg: '#e8eefb', glyph: '✎', label: 'corrected' },
  rejected: { fg: 'var(--color-state-rejected)', bg: '#eeeeee', glyph: '✕', label: 'rejected' },
  superseded: { fg: 'var(--color-state-superseded)', bg: '#eeeeee', glyph: '⌫', label: 'superseded' },
};

export function StateBadge({ state, compact = false }: { state: string; compact?: boolean }) {
  const s = STATE_STYLE[state as EvidenceStateValue] ?? STATE_STYLE.extracted;
  return (
    <span
      data-testid={`state-${state}`}
      className="mono inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-[11px] uppercase tracking-wide"
      style={{ color: s.fg, backgroundColor: s.bg, borderColor: s.fg }}
      title={s.label}
    >
      <span aria-hidden>{s.glyph}</span>
      {compact ? null : <span>{s.label}</span>}
    </span>
  );
}

export function ConfidenceBand({ band }: { band: string }) {
  const marks = band === 'high' ? '●●●' : band === 'medium' ? '●●○' : '●○○';
  return (
    <span className="mono text-[11px] text-[var(--color-ink-soft)]" title={`${band} confidence`}>
      {marks}
    </span>
  );
}

export function MachineBadge({ kind }: { kind: string }) {
  if (kind === 'human') {
    return (
      <span className="mono border border-[var(--color-ink-soft)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide">
        human-authored
      </span>
    );
  }
  if (kind === 'fixture') {
    return (
      <span className="mono border border-[var(--color-rule-strong)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">
        fixture
      </span>
    );
  }
  return (
    <span className="mono border border-dashed border-[var(--color-rule-strong)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">
      machine-extracted
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="mono border border-[var(--color-accent)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--color-accent)]">
      demo fixture
    </span>
  );
}

export function OriginBadge({ origin }: { origin: string }) {
  const label: Record<string, string> = {
    internal_hospital: 'Internal hospital',
    external_hospital: 'External hospital',
    diagnostic_lab: 'Diagnostic lab',
    imaging_centre: 'Imaging centre',
    patient_upload: 'Patient upload',
  };
  return (
    <span className="mono text-[11px] text-[var(--color-ink-soft)]">
      {label[origin] ?? origin.replaceAll('_', ' ')}
    </span>
  );
}

/** The record-readiness band. Never a score (architecture §9.3). */
export function ReadinessBand({ band }: { band: string | null }) {
  const map: Record<string, { fg: string; bg: string; label: string }> = {
    ready: { fg: 'var(--color-state-verified)', bg: '#e8f3ea', label: 'Record ready' },
    gaps: { fg: 'var(--color-state-extracted)', bg: '#fdf3df', label: 'Gaps to close' },
    blocked: { fg: 'var(--color-state-conflicting)', bg: '#fbe9e8', label: 'Blocked' },
  };
  const s = map[band ?? ''] ?? { fg: 'var(--color-ink-soft)', bg: '#eeeeee', label: 'Not assessed' };
  return (
    <span
      data-testid="readiness-band"
      className="inline-flex items-center gap-2 border px-2 py-1 text-xs font-medium"
      style={{ color: s.fg, backgroundColor: s.bg, borderColor: s.fg }}
    >
      {s.label}
    </span>
  );
}

export function SectionHeading({
  title,
  count,
  danger,
}: {
  title: string;
  count?: number;
  danger?: boolean;
}) {
  return (
    <h2 className="flex items-baseline gap-3 border-b border-[var(--color-rule-strong)] pb-2">
      <span className="text-sm font-semibold uppercase tracking-[0.14em]">{title}</span>
      {typeof count === 'number' ? (
        <span
          className="mono text-xs"
          style={{ color: danger ? 'var(--color-state-conflicting)' : 'var(--color-ink-soft)' }}
        >
          {count}
        </span>
      ) : null}
    </h2>
  );
}

export function EmptyFinding({ children }: { children: React.ReactNode }) {
  return (
    <p className="mono border border-dashed border-[var(--color-rule-strong)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
      {children}
    </p>
  );
}

export function factTypeLabel(factType: string): string {
  return factType.replaceAll('.', ' · ').replaceAll('_', ' ');
}

export function documentTypeLabel(type: string | null): string {
  if (!type) return 'unclassified';
  return type.replaceAll('_', ' ');
}
