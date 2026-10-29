import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { can } from '@oncobrief/domain';
import { requireSession } from '@/lib/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const allowed = can(session.role, 'user:manage') || can(session.role, 'clinician:manage');
  if (!allowed) {
    forbidden();
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-rule-strong)] pb-4">
        <div>
          <span className="mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            Hospital Administration
          </span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Operations & Staff Governance</h1>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            Manage organization users, role permissions, oncology clinician profiles, hospital facilities and audit logs.
          </p>
        </div>
        <div className="mono text-xs text-[var(--color-ink-soft)]">
          Signed in as <strong className="text-[var(--color-ink)] uppercase">{session.role.replaceAll('_', ' ')}</strong>
        </div>
      </div>

      <nav
        aria-label="Admin navigation"
        className="mt-6 flex items-stretch gap-2 overflow-x-auto border-b border-[var(--color-rule-strong)] pb-px text-xs uppercase tracking-wider mono sm:flex-wrap"
      >
        <Link
          href="/admin"
          className="px-3.5 py-2 border-b-2 hover:bg-[var(--color-accent-soft)] transition-colors border-transparent hover:border-[var(--color-accent)]"
        >
          Overview
        </Link>
        <Link
          href="/admin/users"
          className="px-3.5 py-2 border-b-2 hover:bg-[var(--color-accent-soft)] transition-colors border-transparent hover:border-[var(--color-accent)]"
        >
          Staff & Roles
        </Link>
        <Link
          href="/admin/clinicians"
          className="px-3.5 py-2 border-b-2 hover:bg-[var(--color-accent-soft)] transition-colors border-transparent hover:border-[var(--color-accent)]"
        >
          Oncology Clinicians
        </Link>
        <Link
          href="/admin/departments"
          className="px-3.5 py-2 border-b-2 hover:bg-[var(--color-accent-soft)] transition-colors border-transparent hover:border-[var(--color-accent)]"
        >
          Departments & Facilities
        </Link>
        <Link
          href="/admin/settings"
          className="px-3.5 py-2 border-b-2 hover:bg-[var(--color-accent-soft)] transition-colors border-transparent hover:border-[var(--color-accent)]"
        >
          Hospital Settings & Audit
        </Link>
      </nav>

      <div className="mt-8">{children}</div>
    </div>
  );
}
