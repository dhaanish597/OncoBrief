import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ValidatedSession } from '@oncobrief/db';
import { SUPPORTED_LOCALES } from '@/lib/locales';

const { getSessionState, setSessionState } = vi.hoisted(() => {
  let session: ValidatedSession | null = null;
  return {
    getSessionState: () => session,
    setSessionState: (s: ValidatedSession | null) => {
      session = s;
    },
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/session', () => ({
  getSession: vi.fn(async () => getSessionState()),
}));

import { POST as ttsPost } from '@/app/api/v1/assistant/voice/tts/route';

describe('Phase 5 Caregiver Voice Continuity & WCAG Accessibility Unit Verification', () => {
  beforeEach(() => {
    setSessionState(null);
  });

  it('verifies exact 11 supported locales: 1 English and 10 Indic languages', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(11);

    const english = SUPPORTED_LOCALES.filter((l) => l.group === 'English');
    expect(english).toHaveLength(1);
    expect(english[0]?.code).toBe('en-IN');

    const indic = SUPPORTED_LOCALES.filter((l) => l.group.includes('Indic'));
    expect(indic).toHaveLength(10);

    const indicCodes = indic.map((l) => l.code);
    expect(indicCodes).toContain('hi-IN');
    expect(indicCodes).toContain('ta-IN');
    expect(indicCodes).toContain('te-IN');
    expect(indicCodes).toContain('bn-IN');
    expect(indicCodes).toContain('mr-IN');
    expect(indicCodes).toContain('kn-IN');
    expect(indicCodes).toContain('ml-IN');
    expect(indicCodes).toContain('gu-IN');
    expect(indicCodes).toContain('pa-IN');
    expect(indicCodes).toContain('or-IN');
  });

  it('validates WCAG 2.2 AA contrast ratios for updated design tokens', () => {
    // Relative luminance calculator per W3C WCAG 2.1 / 2.2 specifications
    function luminance(hex: string): number {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const adjust = (val: number) => (val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4));
      return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b);
    }

    function contrastRatio(hex1: string, hex2: string): number {
      const l1 = luminance(hex1);
      const l2 = luminance(hex2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    const paperBg = '#f7f4ee';

    // --color-state-extracted: darkened from #9a6b12 (4.26:1) to #7c530b
    const extractedContrast = contrastRatio('#7c530b', paperBg);
    expect(extractedContrast).toBeGreaterThanOrEqual(4.5); // Passes WCAG AA 4.5:1

    // --color-rule-strong: darkened from #b9b0a0 (1.96:1) to #857d6f
    const ruleStrongContrast = contrastRatio('#857d6f', paperBg);
    expect(ruleStrongContrast).toBeGreaterThanOrEqual(3.0); // Passes WCAG 1.4.11 UI component 3:1

    // --color-state-conflicting: #962123
    const conflictContrast = contrastRatio('#962123', paperBg);
    expect(conflictContrast).toBeGreaterThanOrEqual(4.5); // Passes WCAG AA 4.5:1
  });

  it('enforces authentication and 11-locale allow-list on the TTS synthesis route', async () => {
    // Unauthenticated -> 401
    const unauthRes = await ttsPost(
      new Request('http://localhost/api/v1/assistant/voice/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Hello', languageCode: 'en-IN' }),
      }),
    );
    expect(unauthRes.status).toBe(401);

    // Authenticated with unsupported locale -> 400 unsupported_language_code
    setSessionState({
      sessionId: 'sess-1',
      userId: 'u-1',
      orgId: 'org-1',
      role: 'coordinator',
      expiresAt: new Date(Date.now() + 3600_000),
      tokenHash: Buffer.from('hash'),
    });

    const badLocaleRes = await ttsPost(
      new Request('http://localhost/api/v1/assistant/voice/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Hello', languageCode: 'fr-FR' }),
      }),
    );
    expect(badLocaleRes.status).toBe(400);
    const badLocaleBody = await badLocaleRes.json();
    expect(badLocaleBody.error.code).toBe('unsupported_locale');
  });
});
