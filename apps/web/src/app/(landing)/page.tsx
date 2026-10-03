import { EvidenceCursor } from '@/components/landing/cursor'
import { DocToFact } from '@/components/landing/doc-to-fact'
import { EvidenceBag } from '@/components/landing/evidence-bag'
import { Feedback } from '@/components/landing/feedback'
import { Hero } from '@/components/landing/hero'
import { Ledger } from '@/components/landing/ledger'
import { Nav } from '@/components/landing/nav'
import { Problem } from '@/components/landing/problem'
import { Readiness } from '@/components/landing/readiness'
import { Review } from '@/components/landing/review'
import { FinalCta, Footer, Safety } from '@/components/landing/safety'
import { Surfaces } from '@/components/landing/surfaces'

/**
 * The public landing page. Signed in or not, this is what `/` renders; the
 * "Open workspace" call to action points at /workspace, which redirects an
 * anonymous visitor to /login on its own.
 */
export default function Page() {
  return (
    <>
      <EvidenceCursor />
      <Nav />
      <main>
        <Hero />
        <Problem />
        <EvidenceBag />
        <DocToFact />
        <Ledger />
        <Readiness />
        <Surfaces />
        <Review />
        <Feedback />
        <Safety />
        <FinalCta />
      </main>
      <Footer />
    </>
  )
}
