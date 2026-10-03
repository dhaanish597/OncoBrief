import { ArrowRight } from 'lucide-react'
import { ROUTES } from '@/lib/landing/data'
import { Logo } from './nav'
import { MaskHeadline, Reveal, SectionMark } from './primitives'
import { PathologySlide, Scanner, CalendarSketch } from './sketches'

const PRINCIPLES = [
  ['Assistive, not diagnostic.', 'OncoBrief organises records. It does not diagnose, stage, recommend or decide treatment.'],
  ['Every fact has a receipt.', 'Source, page and version travel with each extracted fact. No source, no fact.'],
  ['Uncertainty is visible.', 'Low-confidence OCR, conflicts and missing documents are flagged — never smoothed over.'],
  ['Humans approve.', 'Nothing reaches a brief until a person verifies, corrects, rejects or escalates it.'],
  ['Nothing is silently overwritten.', 'Newer versions supersede older ones; history and audit trail are retained.'],
  ['Patient views are reviewed.', 'Plain-language content is released by staff, not generated straight to patients.'],
] as const

export function Safety() {
  return (
    <section id="safety" className="relative py-24 md:py-36">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 md:px-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <SectionMark index="09" label="Safety" meta="Principles" />
            <MaskHeadline
              className="mt-5 text-[2.6rem] uppercase sm:text-6xl lg:text-6xl xl:text-7xl"
              lines={['Built to be', <span key="i" className="italic normal-case text-oxblood">checked.</span>]}
            />
            <PathologySlide className="mt-10 hidden w-40 text-ink/30 lg:block" />
          </div>
        </div>
        <ol className="lg:col-span-7 lg:col-start-6">
          {PRINCIPLES.map(([t, d], i) => (
            <li key={t} className="border-t border-ink/20 last:border-b">
              <Reveal className="grid gap-3 py-8 md:grid-cols-[4rem_1fr] md:py-10">
                <span className="font-mono text-xs text-oxblood">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="font-serif text-3xl leading-none md:text-4xl">{t}</h3>
                  <p className="mt-3 max-w-xl leading-relaxed text-ink-soft text-pretty">{d}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-ink py-24 text-ivory md:py-40">
      <Scanner className="pointer-events-none absolute -left-10 bottom-10 w-72 text-ivory/10 md:w-96" />
      <CalendarSketch className="pointer-events-none absolute -right-6 top-10 w-48 text-ivory/10 md:w-72" />
      <div className="relative mx-auto max-w-[1440px] px-5 md:px-10">
        <SectionMark index="10" label="Begin" tone="light" />
        <MaskHeadline
          className="mt-6 text-[13vw] uppercase md:text-[9vw] 2xl:text-[150px]"
          lines={['Build the brief', <span key="i" className="italic normal-case text-[#d9a3a7]">before the consult.</span>]}
        />
        <Reveal className="mt-12 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <p className="max-w-md leading-relaxed text-ivory/70 text-pretty">
            See how OncoBrief turns a bag of records into a reviewable, source-linked journey for clinicians,
            coordinators and patients.
          </p>
          <a
            href={ROUTES.workspace}
            data-cursor="enter"
            className="group inline-flex items-center gap-4 self-start bg-ivory px-7 py-5 font-mono text-xs uppercase tracking-[0.18em] text-ink transition-colors hover:bg-[#d9a3a7]"
          >
            Open workspace
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </a>
        </Reveal>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="bg-ink text-ivory">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 border-t border-ivory/15 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-10">
        <Logo />
        <p className="max-w-xl font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-ivory/55">
          Assistive software for organising medical records. Not a medical device for diagnosis or treatment decisions.
          Sample data shown is fictional.
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ivory/55">© 2026 OncoBrief</span>
      </div>
    </footer>
  )
}
