import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { loginAction } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect('/workspace');
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <div className="grid gap-14 md:grid-cols-[1.1fr_1fr] md:items-center">
        <section>
          <Link
            href="/"
            className="mono text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
          >
            ← Back to overview
          </Link>
          <p className="mono mt-4 text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
            Health-a-thon 2026 · Cancer care track
          </p>
          <h1 className="mt-3 text-5xl font-semibold tracking-tight">OncoBrief</h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--color-ink-soft)]">
            A source-verified oncology record-readiness platform. Fragmented documents become a
            structured evidence ledger, and every displayed fact keeps its source page, its exact
            text and the human who confirmed it.
          </p>

          <dl className="mono mt-10 grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
            {[
              ['Evidence ledger', 'the source of truth'],
              ['Provenance', 'page · span · reviewer'],
              ['Reconciliation', 'human-only, never silent'],
              ['Boundary', 'no diagnosis · no treatment advice'],
            ].map(([term, gloss]) => (
              <div key={term} className="border-t border-[var(--color-rule)] pt-2">
                <dt className="text-[var(--color-ink)]">{term}</dt>
                <dd className="text-[var(--color-ink-soft)]">{gloss}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] p-8">
          <h2 className="text-sm uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            Sign in
          </h2>
          {error ? (
            <p
              role="alert"
              className="mt-4 border border-[var(--color-state-conflicting)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm"
            >
              Sign-in failed. Check the credentials and try again. The attempt was recorded.
            </p>
          ) : null}

          <form action={loginAction} className="mt-6 space-y-5">
            <label className="block">
              <span className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
                Email
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                defaultValue="dr.rao@rci.demo"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mono text-xs uppercase tracking-wider text-[var(--color-ink-soft)]">
                Password
              </span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                defaultValue="oncobrief-demo"
                className="mt-1 w-full border border-[var(--color-rule-strong)] bg-white px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="w-full bg-[var(--color-ink)] px-4 py-2.5 text-sm font-medium text-[var(--color-paper)] hover:bg-[var(--color-accent)]"
            >
              Open the workspace
            </button>
          </form>

          <p className="mono mt-6 text-xs leading-relaxed text-[var(--color-ink-soft)]">
            Demo data only. Synthetic patients, badged in the interface. No real patient
            information is present.
          </p>
        </section>
      </div>
    </main>
  );
}
