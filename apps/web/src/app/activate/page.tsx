import Link from 'next/link';
import { getMigratorPool } from '@oncobrief/db';
import { acceptInvitationAction } from '@/lib/admin-actions';

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? '';

  let invitation: {
    email: string;
    displayName: string;
    role: string;
    orgName: string;
    isExpired: boolean;
  } | null = null;

  if (token) {
    const pool = getMigratorPool();
    const res = await pool.query<{
      email: string;
      display_name: string;
      role: string;
      org_name: string;
      expires_at: Date;
      accepted_at: Date | null;
    }>(
      `SELECT ui.email, ui.display_name, ui.role, o.name AS org_name, ui.expires_at, ui.accepted_at
       FROM user_invitation ui
       JOIN organization o ON o.id = ui.org_id
       WHERE ui.token = $1`,
      [token],
    );
    const row = res.rows[0];
    if (row && !row.accepted_at) {
      invitation = {
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        orgName: row.org_name,
        isExpired: row.expires_at.getTime() < Date.now(),
      };
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-paper)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <span className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">OncoBrief</span>
          </Link>
          <p className="mono mt-1 text-xs uppercase tracking-[0.2em] text-[var(--color-ink-soft)]">
            Account Activation
          </p>
        </div>

        <div className="mt-8 border border-[var(--color-rule-strong)] bg-[var(--color-paper-raised)] py-8 px-6 sm:px-10">
          {!token ? (
            <div className="text-center">
              <p className="text-sm text-rose-700 font-medium">Invalid or missing activation token.</p>
              <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                Please check the link provided in your invitation or contact your hospital administrator.
              </p>
              <div className="mt-6">
                <Link
                  href="/login"
                  className="mono text-xs uppercase tracking-wider underline text-[var(--color-accent)]"
                >
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : !invitation ? (
            <div className="text-center">
              <p className="text-sm text-rose-700 font-medium">
                This invitation has already been accepted or is no longer valid.
              </p>
              <div className="mt-6">
                <Link
                  href="/login"
                  className="mono text-xs uppercase tracking-wider underline text-[var(--color-accent)] font-medium"
                >
                  Proceed to Sign In →
                </Link>
              </div>
            </div>
          ) : invitation.isExpired ? (
            <div className="text-center">
              <p className="text-sm text-rose-700 font-medium">This invitation link has expired.</p>
              <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                Please request a renewed invitation link from your hospital administrator.
              </p>
            </div>
          ) : (
            <div>
              <div className="border-b border-[var(--color-rule)] pb-4 mb-5">
                <h2 className="text-lg font-semibold tracking-tight">Welcome, {invitation.displayName}</h2>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                  You have been invited to join <strong>{invitation.orgName}</strong> as a{' '}
                  <span className="uppercase mono font-medium">{invitation.role.replaceAll('_', ' ')}</span>.
                </p>
                <p className="mono mt-1 text-xs text-[var(--color-ink-soft)]">Account: {invitation.email}</p>
              </div>

              <form action={async (fd: FormData) => {
                'use server';
                const { redirect } = await import('next/navigation');
                const res = await acceptInvitationAction(fd);
                if (res.ok) {
                  redirect('/login?activated=true');
                } else {
                  redirect(`/activate?token=${encodeURIComponent(token)}&error=${encodeURIComponent(res.error || 'activation_failed')}`);
                }
              }} className="space-y-4">
                <input type="hidden" name="token" value={token} />

                {params.error && (
                  <div className="rounded border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-800">
                    Activation error: {params.error}
                  </div>
                )}

                <div>
                  <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="set-password">
                    Create Secure Password *
                  </label>
                  <input
                    id="set-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                </div>

                <div>
                  <label className="mono block text-[11px] uppercase tracking-wider text-[var(--color-ink-soft)]" htmlFor="confirm-password">
                    Confirm Password *
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Repeat password"
                    className="mt-1 w-full border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                  />
                </div>

                <button
                  type="submit"
                  className="mono w-full border border-[var(--color-rule-strong)] bg-[var(--color-accent)] px-4 py-2.5 text-xs uppercase tracking-wider text-white font-semibold hover:opacity-90"
                >
                  Activate Account & Sign In
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
