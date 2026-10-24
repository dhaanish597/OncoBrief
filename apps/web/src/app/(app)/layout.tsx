import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { logoutAction } from '@/app/login/actions';
import { AssistantLauncher } from '@/components/assistant/AssistantLauncher';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:border-2 focus:border-[var(--color-accent)] focus:bg-[var(--color-paper-raised)] focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:text-[var(--color-ink)] focus:shadow-md"
      >
        Skip to main content
      </a>
      <header
        role="banner"
        className="no-print border-b border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)]"
      >
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-2.5 sm:px-6 sm:py-3">
          <div className="flex items-center gap-5">
            <Link href="/workspace" className="flex items-baseline gap-2" aria-label="OncoBrief Home">
              <span className="text-lg font-semibold tracking-tight">OncoBrief</span>
              <span className="mono hidden text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-soft)] sm:inline">
                evidence ledger
              </span>
            </Link>

            <nav
              aria-label="Main navigation"
              className="mono flex items-center gap-4 text-xs uppercase tracking-wider text-[var(--color-ink-soft)]"
            >
              <Link href="/workspace" className="hover:text-[var(--color-ink)]">
                Workspace
              </Link>
              <Link href="/about" className="hover:text-[var(--color-ink)]">
                What this is
              </Link>
            </nav>
          </div>

          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <div className="mono text-right text-[11px] leading-tight text-[var(--color-ink-soft)]">
              <span className="block font-medium uppercase text-[var(--color-ink)]">
                {session.role.replaceAll('_', ' ')}
              </span>
              <span className="block text-[10px] text-[var(--color-ink-soft)]">hospital session</span>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Sign out of workspace"
                className="mono border border-[var(--color-rule-strong)] px-2.5 py-1 text-xs uppercase tracking-wider hover:bg-[var(--color-accent-soft)] sm:px-3 sm:py-1.5"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <AssistantLauncher />
    </div>
  );
}
