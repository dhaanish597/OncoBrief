'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/landing/cn'
import { EASE, MaskHeadline, Meta, Reveal, SectionMark } from './primitives'
import { Pen } from './sketches'

const ACTIONS = [
  { key: 'verified', label: 'Verify', stamp: 'Verified', color: 'text-teal border-teal', bar: 'bg-teal', log: 'Verified against source p.3' },
  { key: 'corrected', label: 'Correct', stamp: 'Corrected', color: 'text-amber border-amber', bar: 'bg-amber', log: 'Corrected 1 item · new version v2 kept with v1' },
  { key: 'rejected', label: 'Reject', stamp: 'Rejected', color: 'text-ink-soft border-ink-soft', bar: 'bg-ink-soft', log: 'Rejected · extraction not used in brief' },
  { key: 'escalated', label: 'Escalate', stamp: 'Escalated', color: 'text-alert border-alert', bar: 'bg-alert', log: 'Escalated to consultant for review' },
] as const

type ActionKey = (typeof ACTIONS)[number]['key']

export function Review() {
  const [decision, setDecision] = useState<ActionKey | null>(null)
  const [log, setLog] = useState<{ id: number; text: string }[]>([
    { id: 0, text: 'Extracted from SRC-0377 p.3 · queued for review' },
  ])
  const a = ACTIONS.find((x) => x.key === decision)

  const decide = (k: ActionKey) => {
    const act = ACTIONS.find((x) => x.key === k)!
    setDecision(k)
    setLog((l) => [{ id: Date.now(), text: act.log }, ...l].slice(0, 4))
  }

  return (
    <section id="review" className="relative border-t border-ink/15 bg-bone py-24 md:py-36">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 md:px-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionMark index="07" label="Human review" meta="Every fact" />
          <MaskHeadline
            className="mt-5 text-[2.6rem] uppercase sm:text-6xl lg:text-7xl"
            lines={['A person', 'signs off.', <span key="i" className="italic normal-case text-oxblood">Always.</span>]}
          />
          <Reveal className="mt-6 max-w-md">
            <p className="leading-relaxed text-ink-soft text-pretty">
              Nothing extracted is used until someone verifies, corrects, rejects or escalates it. Every decision is
              versioned and attributed — try it.
            </p>
          </Reveal>
          <Pen className="mt-10 hidden w-24 text-ink/30 lg:block" />
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          <div className="paper relative p-6 md:p-10">
            <div className="flex items-center justify-between">
              <Meta>EV-1045 · SRC-0377 · p.3 · v1</Meta>
              <Meta>Reviewer · Dr. R. Iyer</Meta>
            </div>
            <h3 className="mt-6 font-serif text-4xl leading-none md:text-5xl">Current medications</h3>
            <p className="mt-2 text-ink-soft">4 items listed on discharge summary, section 5.</p>
            <ul className="mt-6 border-t border-ink/15" aria-hidden>
              {['Item A — as listed', 'Item B — as listed', 'Item C — spelling unclear', 'Item D — as listed'].map((m, i) => (
                <li key={m} className="flex items-center justify-between border-b border-ink/10 py-2.5 text-sm">
                  <span className={cn(i === 2 && decision === 'corrected' && 'line-through opacity-50')}>{m}</span>
                  <span className="font-mono text-[10px] text-ink-soft">L{18 + i}</span>
                </li>
              ))}
            </ul>

            <AnimatePresence>
              {a ? (
                <motion.span
                  key={a.key}
                  initial={{ opacity: 0, scale: 2, rotate: -24 }}
                  animate={{ opacity: 1, scale: 1, rotate: -10 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className={cn(
                    'pointer-events-none absolute right-6 top-20 border-[3px] px-3 py-1.5 font-mono text-sm font-medium uppercase tracking-[0.2em] md:right-10 md:text-base',
                    a.color,
                  )}
                  aria-hidden
                >
                  {a.stamp}
                </motion.span>
              ) : null}
            </AnimatePresence>

            <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Review decision">
              {ACTIONS.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  aria-pressed={decision === x.key}
                  onClick={() => decide(x.key)}
                  className={cn(
                    'relative overflow-hidden border border-ink py-3 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors',
                    decision === x.key ? 'bg-ink text-ivory' : 'hover:bg-ink/5',
                  )}
                >
                  {x.label}
                  <span className={cn('absolute inset-x-0 bottom-0 h-0.5', x.bar)} aria-hidden />
                </button>
              ))}
            </div>

            <div className="mt-8">
              <Meta>Audit trail</Meta>
              <ol className="mt-3 flex flex-col gap-1.5" aria-live="polite">
                <AnimatePresence initial={false}>
                  {log.map((l, i) => (
                    <motion.li
                      key={l.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: i === 0 ? 1 : 0.55, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: EASE }}
                      className="flex gap-3 font-mono text-xs"
                    >
                      <span className="text-ink-soft">v{log.length - i}</span>
                      <span>{l.text}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
