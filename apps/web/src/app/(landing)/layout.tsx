import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';

/**
 * The public surface at `/`.
 *
 * The landing's typefaces and visual scope are applied on a wrapper element
 * rather than on <html>, so nothing the workspace depends on is inherited or
 * overridden. The workspace's --font-mono/--font-serif keep their system
 * stacks; the landing's are applied by scope in globals.css.
 *
 * See docs/decisions/0016-landing-page-integration.md
 */

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OncoBrief — the consult starts before the patient walks in',
  description:
    'OncoBrief turns scattered oncology records into a source-linked, reviewable evidence ledger. Assistive, not diagnostic.',
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f3eee4',
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`landing ${geist.variable} ${geistMono.variable} ${instrument.variable}`}>
      {children}
    </div>
  );
}
