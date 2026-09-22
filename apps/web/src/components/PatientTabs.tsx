'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { segment: string; label: string; badgeKey?: 'conflicts' | 'gaps' | 'tasks' }[] = [
  { segment: 'evidence', label: 'Evidence journey' },
  { segment: 'sources', label: 'Sources' },
  { segment: 'conflicts', label: 'Reconciliation', badgeKey: 'conflicts' },
  { segment: 'record-map', label: 'Record map' },
  { segment: 'tasks', label: 'Tasks' },
  { segment: 'packet', label: 'Packet' },
  { segment: 'continuity', label: 'Continuity' },
  { segment: 'audit', label: 'Audit' },
];

export function PatientTabs({
  patientId,
  badges,
}: {
  patientId: string;
  badges: { conflicts: number; gaps: number; tasks: number };
}) {
  const pathname = usePathname();

  return (
    <nav className="no-print flex flex-wrap items-stretch border-b border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
      {TABS.map((tab) => {
        const href = `/patients/${patientId}/${tab.segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const count = tab.badgeKey ? badges[tab.badgeKey] : 0;
        return (
          <Link
            key={tab.segment}
            href={href}
            data-testid={`tab-${tab.segment}`}
            aria-current={active ? 'page' : undefined}
            className="mono flex items-center gap-2 border-b-2 px-4 py-2.5 text-[11px] uppercase tracking-wider transition-colors"
            style={{
              borderBottomColor: active ? 'var(--color-accent)' : 'transparent',
              color: active ? 'var(--color-ink)' : 'var(--color-ink-soft)',
            }}
          >
            {tab.label}
            {count > 0 ? (
              <span
                className="rounded-full px-1.5 text-[10px]"
                style={{
                  backgroundColor:
                    tab.badgeKey === 'conflicts' ? '#fbe9e8' : 'var(--color-accent-soft)',
                  color:
                    tab.badgeKey === 'conflicts'
                      ? 'var(--color-state-conflicting)'
                      : 'var(--color-ink)',
                }}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
