import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OncoBrief — source-verified record readiness',
  description:
    'An evidence-first oncology operations platform. Every displayed fact shows its source; every consequential action requires human approval.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
