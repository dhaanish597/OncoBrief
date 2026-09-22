import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { logoutAction } from '@/app/login/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]">
        <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-6 py-3">
          <Link href="/workspace" className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight">OncoBrief</span>
            <span className="mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
              evidence ledger
            </span>
          </Link>

          <nav className="mono flex items-center gap-5 text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
            <Link href="/workspace" className="hover:text-[var(--color-ink)]">
              Workspace
            </Link>
            <Link href="/about" className="hover:text-[var(--color-ink)]">
              What this is
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <span className="mono text-right text-[11px] leading-tight text-[var(--color-ink-soft)]">
              <span className="block text-[var(--color-ink)]">
                {session.role.replaceAll('_', ' ')}
              </span>
              <span className="block">{session.orgId.slice(0, 8)}…</span>
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="mono border border-[var(--color-rule-strong)] px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
