'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/landing/cn'
import { MaskHeadline, Reveal, SectionMark } from './primitives'

const COLUMNS = ['Document', 'Source phrase', 'Fact', 'Task', 'Review'] as const

const CHAINS = [
  {
    tone: 'teal',
    cells: [
      { k: 'SRC-0412 · p.2 · v2', v: 'Histopathology report' },
      { k: 'Line 14', v: '“…sections show invasive ductal carcinoma…”' },
      { k: 'EV-1042', v: 'Histology (as reported)' },
      { k: 'No task', v: 'Linked, nothing outstanding' },
      { k: 'Verified', v: 'Dr. R. Iyer · 02-15 08:10' },
    ],
  },
  {
    tone: 'alert',
    cells: [
      { k: 'SRC-0398 · p.1 · v1', v: 'CT chest / abdomen' },
      { k: 'Header', v: '“Date of study: 10/02/2026”' },
      { k: 'EV-1043', v: 'Study date — conflicts with referral' },
      { k: 'TSK-221', v: 'Confirm date · Records coordinator' },
      { k: 'Conflict', v: 'Awaiting resolution' },
    ],
  },
  {
    tone: 'amber',
    cells: [
      { k: 'SRC-0421 · p.1 · v1', v: 'Referral letter' },
      { k: 'Para 1', v: '“…for specialist opinion following abnormal imaging”' },
      { k: 'EV-1044', v: 'Referral reason' },
      { k: 'TSK-224', v: 'Clinician to review reason' },
      { k: 'Pending', v: 'In review queue' },
    ],
  },
] as const

const TONE = {
  teal: { text: 'text-teal', bg: 'bg-teal', stroke: 'var(--color-teal)' },
  alert: { text: 'text-alert', bg: 'bg-alert', stroke: 'var(--color-alert)' },
  amber: { text: 'text-amber', bg: 'bg-amber', stroke: 'var(--color-amber)' },
}

export function DocToFact() {
  const [active, setActive] = useState<number | null>(null)

  return (
    <section id="how-it-works" className="relative border-y border-ink/15 bg-[#efe9dd] py-24 md:py-36">
      <div className="mx-auto max-w-[1440px] px-5 md:px-10">
        <SectionMark index="03" label="Document → fact" meta="Provenance" />
        <MaskHeadline
          className="mt-5 max-w-5xl text-[2.6rem] uppercase sm:text-6xl lg:text-7xl xl:text-8xl"
          lines={['Every fact points', <span key="b">back to its <span className="italic normal-case text-oxblood">source.</span></span>]}
        />
        <Reveal className="mt-6 max-w-xl">
          <p className="leading-relaxed text-ink-soft text-pretty">
            Hover a chain to trace it. A fact is never free-floating: it carries the exact phrase, page and version it
            came from, the task it created, and the human decision on it.
          </p>
        </Reveal>

        <div className="mt-14 hidden grid-cols-5 gap-6 border-b border-ink/20 pb-3 md:grid" aria-hidden>
          {COLUMNS.map((c, i) => (
            <span key={c} className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
              <span className="text-oxblood">{String(i + 1).padStart(2, '0')}</span> {c}
            </span>
          ))}
        </div>

        <ol className="mt-6 flex flex-col gap-4 md:mt-2 md:gap-0">
          {CHAINS.map((chain, ci) => {
            const tone = TONE[chain.tone]
            const on = active === ci
            const dim = active !== null && !on
            return (
              <li
                key={ci}
                data-cursor="trace"
                tabIndex={0}
                onPointerEnter={() => setActive(ci)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(ci)}
                onBlur={() => setActive(null)}
                className={cn(
                  'relative grid gap-3 border border-ink/15 bg-ivory/60 p-4 outline-none transition-opacity duration-300 md:grid-cols-5 md:gap-6 md:border-x-0 md:border-t-0 md:bg-transparent md:px-0 md:py-8',
                  dim && 'opacity-30',
                )}
              >
                <svg
                  className="pointer-events-none absolute left-0 top-1/2 hidden h-px w-full overflow-visible md:block"
                  viewBox="0 0 100 1"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <motion.line
                    x1="0"
                    x2="100"
                    y1="0.5"
                    y2="0.5"
                    stroke={tone.stroke}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    className="dash-flow"
                    initial={false}
                    animate={{ opacity: on ? 0.9 : 0 }}
                  />
                </svg>
                {chain.cells.map((cell, i) => (
                  <motion.div
                    key={i}
                    className={cn(
                      'relative flex gap-3 md:flex-col md:gap-2',
                      i > 0 && 'border-t border-ink/10 pt-3 md:border-0 md:pt-0',
                    )}
                    animate={{ y: on ? -2 : 0 }}
                    transition={{ delay: on ? i * 0.05 : 0 }}
                  >
                    <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft md:hidden">
                      {COLUMNS[i]}
                    </span>
                    <div
                      className={cn(
                        'relative z-[1] flex-1 bg-[#efe9dd] md:pr-3',
                        i === 1 && on && 'outline outline-1 outline-offset-4 outline-teal',
                      )}
                    >
                      <span
                        className={cn(
                          'flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]',
                          i >= 3 ? tone.text : 'text-ink-soft',
                        )}
                      >
                        <motion.span
                          className={cn('size-1.5 rounded-full', on ? tone.bg : 'bg-ink/30')}
                          animate={{ scale: on ? [1, 1.6, 1] : 1 }}
                          transition={{ delay: i * 0.08, duration: 0.4 }}
                        />
                        {cell.k}
                      </span>
                      <span className={cn('mt-1 block text-pretty', i === 1 ? 'font-serif text-lg italic md:text-xl' : 'text-sm md:text-base')}>
                        {cell.v}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
