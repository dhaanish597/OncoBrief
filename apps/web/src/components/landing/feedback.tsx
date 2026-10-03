'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/landing/cn'
import { EASE, MaskHeadline, Meta, Reveal, SectionMark } from './primitives'
import { Asclepius } from './sketches'

const LOOPS = [
  { key: 'patient', label: 'Patient feedback', sample: '“I didn’t know my scan had arrived.” → Received-documents view added to patient journey.' },
  { key: 'nurse', label: 'Nurse correction', sample: 'Medication spelling corrected on SRC-0377 → OCR dictionary updated for that template.' },
  { key: 'doctor', label: 'Doctor review', sample: 'Rejected extraction on page header → layout rule tightened for that lab’s report format.' },
  { key: 'missing', label: 'Missing-doc issue', sample: 'Follow-up plans often absent → request task now auto-suggested at intake.' },
  { key: 'workflow', label: 'Workflow improvement', sample: 'Conflicts surfaced earlier → coordinator review moved two days before consult.' },
] as const

const R = 40

export function Feedback() {
  const reduce = useReducedMotion()
  const [active, setActive] = useState(0)
  // `active` is only ever assigned from an index into LOOPS.
  const loop = LOOPS[active]!

  return (
    <section id="feedback" className="relative overflow-hidden py-24 md:py-36">
      <div className="mx-auto grid max-w-[1440px] items-center gap-12 px-5 md:px-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionMark index="08" label="Feedback loops" meta="Pilot learning" />
          <MaskHeadline
            className="mt-5 text-[2.6rem] uppercase sm:text-6xl lg:text-7xl"
            lines={['Every correction', <span key="i" className="italic normal-case text-oxblood">teaches the system.</span>]}
          />
          <Reveal className="mt-6 max-w-md">
            <p className="leading-relaxed text-ink-soft text-pretty">
              Pilot feedback from patients, nurses and doctors flows back into extraction rules and workflow — reviewed
              and versioned like everything else. Examples below are illustrative.
            </p>
          </Reveal>
          <div className="mt-10 min-h-[120px] border-t-2 border-ink pt-5" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={loop.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                <Meta className="text-oxblood">{loop.label}</Meta>
                <p className="mt-2 font-serif text-2xl leading-snug">{loop.sample}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[560px] lg:col-span-6 lg:col-start-7">
          <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-ink)" strokeOpacity={0.2} strokeWidth={0.3} />
            <circle cx="50" cy="50" r={R - 8} fill="none" stroke="var(--color-ink)" strokeOpacity={0.12} strokeWidth={0.25} strokeDasharray="0.6 1.4" />
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke="var(--color-oxblood)"
              strokeWidth={0.5}
              strokeDasharray="10 241.3"
              className={reduce ? undefined : 'slow-spin'}
              style={{ transformOrigin: '50% 50%', animationDuration: '14s' }}
            />
          </svg>
          <div className="absolute inset-[30%] flex flex-col items-center justify-center rounded-full border border-ink/20 bg-bone text-center">
            <Asclepius className="w-8 text-ink/40" />
            <span className="mt-2 font-serif text-xl leading-none md:text-2xl">Next consult</span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">better briefed</span>
          </div>
          {LOOPS.map((l, i) => {
            const angle = (i / LOOPS.length) * Math.PI * 2 - Math.PI / 2
            const x = 50 + Math.cos(angle) * R
            const y = 50 + Math.sin(angle) * R
            const on = active === i
            return (
              <button
                key={l.key}
                type="button"
                data-cursor="trace"
                onClick={() => setActive(i)}
                onPointerEnter={() => setActive(i)}
                aria-pressed={on}
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <motion.span
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] sm:text-[10px]',
                    on ? 'border-ink bg-ink text-ivory' : 'border-ink/30 bg-ivory text-ink',
                  )}
                  animate={{ scale: on ? 1.06 : 1 }}
                >
                  <span className={cn('size-1.5 rounded-full', on ? 'bg-[#d9a3a7]' : 'bg-oxblood')} />
                  {l.label}
                </motion.span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
