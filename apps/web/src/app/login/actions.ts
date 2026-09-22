'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { login, logout, withTransaction, withTenant } from '@oncobrief/db';
import {
  clearSessionCookie,
  getSession,
  setSessionCookie,
  tenantCtx,
} from '@/lib/session';

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const h = await headers();
  const request = {
    ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  };

  const result = await withTransaction((q) => login(q, email, password, request));
  if (!result) {
    redirect('/login?error=credentials');
  }
  await setSessionCookie(result.token);
  redirect('/workspace');
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    try {
      await withTenant(tenantCtx(session), (q) => logout(q, session));
    } catch {
      /* best effort */
    }
  }
  await clearSessionCookie();
  redirect('/login');
}
