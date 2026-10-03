import { ArrowDownRight, ArrowRight } from 'lucide-react'
import { ROUTES } from '@/lib/landing/data'
import { HeroVisual } from './hero-visual'
import { MaskHeadline, Reveal } from './primitives'

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-24 md:pt-28">
      <div className="line-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="relative mx-auto max-w-[1440px] px-5 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/15 pb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
          <span>Brief Nº 0412 — Pre-consult evidence</span>
          <span className="hidden md:inline">06 sources · 06 facts · 2 open tasks</span>
          <span className="text-oxblood">Assistive · Not diagnostic</span>
        </div>

        <div className="grid gap-12 py-10 lg:grid-cols-12 lg:gap-8 lg:py-14">
          <div className="flex flex-col lg:col-span-5">
            <MaskHeadline
              as="h1"
              className="text-[15vw] uppercase sm:text-[11vw] lg:text-[5.6vw] 2xl:text-[84px]"
              lines={[
                'The consult',
                'starts before',
                'the patient',
                <span key="w" className="italic normal-case text-oxblood">
                  walks in.
                </span>,
              ]}
            />
            <Reveal delay={0.4} className="mt-8 max-w-md">
              <p className="text-lg leading-relaxed text-ink-soft text-pretty">
                <span className="font-mono text-sm uppercase tracking-[0.12em] text-ink">OncoBrief</span> turns
                scattered oncology records into a source-linked, reviewable journey.
              </p>
            </Reveal>
            <Reveal delay={0.55} className="mt-8 flex flex-wrap gap-3">
              <a
                href={ROUTES.explore}
                data-cursor="enter"
                className="group inline-flex items-center gap-3 bg-ink px-5 py-4 font-mono text-xs uppercase tracking-[0.16em] text-ivory transition-colors hover:bg-oxblood"
              >
                Explore OncoBrief
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </a>
              <a
                href={ROUTES.howItWorks}
                data-cursor="enter"
                className="group inline-flex items-center gap-3 border border-ink px-5 py-4 font-mono text-xs uppercase tracking-[0.16em] transition-colors hover:bg-ink hover:text-ivory"
              >
                See how it works
                <ArrowDownRight className="size-4 transition-transform group-hover:translate-y-0.5" aria-hidden />
              </a>
            </Reveal>
            <dl className="mt-auto hidden grid-cols-3 gap-4 border-t border-ink/15 pt-5 lg:grid">
              {[
                ['Read', 'OCR + layout'],
                ['Identify', 'Class + version'],
                ['Extract', 'Facts + tasks'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-oxblood">{k}</dt>
                  <dd className="mt-1 text-sm text-ink-soft">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <Reveal delay={0.2} className="lg:col-span-7">
            <HeroVisual />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
