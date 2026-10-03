'use client'

import { useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react'
import { cn } from '@/lib/landing/cn'
import { KIND_LABEL, RECORD_DOCS } from '@/lib/landing/data'
import { DocThumb } from './doc-thumb'
import { EASE, MaskHeadline, SectionMark } from './primitives'

const STAGES = ['Chaos', 'Classified', 'Source-linked', 'Structured'] as const
const DOCS = RECORD_DOCS.slice(0, 6)

const CHAOS = [
  { x: 6, y: 10, r: -14 },
  { x: 30, y: 30, r: 9 },
  { x: 54, y: 6, r: -5 },
  { x: 18, y: 52, r: 12 },
  { x: 58, y: 46, r: -10 },
  { x: 77, y: 20, r: 7 },
]
const COLUMNS = [6, 41, 76] as const
const GRID = DOCS.map((_, i) => ({ x: COLUMNS[i % 3]!, y: i < 3 ? 6 : 52, r: 0 }))
const TIMELINE_RANK = [4, 2, 5, 1, 3, 0]

// CHAOS, GRID and TIMELINE_RANK are each DOCS.length long, so the per-document
// lookups in box() and below are always in range.
function box(stage: number, i: number) {
  if (stage === 0) {
    const p = CHAOS[i]!
    return { left: `${p.x}%`, top: `${p.y}%`, width: '18%', height: '36%', rotate: p.r }
  }
  if (stage < 3) {
    const g = GRID[i]!
    return { left: `${g.x}%`, top: `${g.y}%`, width: '18%', height: '36%', rotate: 0 }
  }
  const k = TIMELINE_RANK[i]!
  return { left: `${1.5 + k * 16.6}%`, top: '14%', width: '14%', height: '30%', rotate: 0 }
}

export function Problem() {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const [stage, setStage] = useState(reduce ? 3 : 0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (reduce) return
    setStage(v < 0.22 ? 0 : v < 0.48 ? 1 : v < 0.74 ? 2 : 3)
  })

  const timeline = [...DOCS].sort((a, b) => a.received.localeCompare(b.received))

  return (
    <section id="problem" ref={ref} className="relative h-[280vh] bg-bone md:h-[320vh]">
      <div className="sticky top-0 mx-auto flex h-[100svh] max-w-[1440px] flex-col px-5 pb-6 pt-20 md:px-10 md:pb-10 md:pt-24">
        <div className="grid gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <SectionMark index="01" label="The problem" meta="Pre-consult" />
            <MaskHeadline
              className="mt-5 text-[2.6rem] uppercase sm:text-6xl lg:text-7xl xl:text-8xl"
              lines={['The scramble', 'before the consult']}
            />
          </div>
          <div className="md:col-span-5">
            <p className="max-w-md text-sm leading-relaxed text-ink-soft text-pretty md:text-base">
              Pathology from one lab, imaging from another, a faxed referral, a discharge summary, a chemotherapy
              sheet and a handwritten note. Someone has to find, read and reconcile them — every time.
            </p>
            <ol className="mt-6 flex gap-4" aria-label="Problem stage">
              {STAGES.map((s, i) => (
                <li
                  key={s}
                  className={cn(
                    'font-mono text-[10px] uppercase tracking-[0.14em] transition-colors',
                    stage === i ? 'text-oxblood' : stage > i ? 'text-ink' : 'text-ink-soft/50',
                  )}
                >
                  <span aria-hidden>{stage > i ? '✓ ' : stage === i ? '● ' : '○ '}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="relative mt-6 min-h-0 w-full flex-1 md:mt-8">
          <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />

          <svg
            className="pointer-events-none absolute inset-0 size-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {DOCS.map((d, i) => {
              const g = GRID[i]!
              const sx = g.x + 9
              const sy = i < 3 ? g.y + 36 : g.y
              return (
                <motion.path
                  key={d.id}
                  d={`M ${sx} ${sy} L ${sx} 47 L 50 47`}
                  stroke="var(--color-teal)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  fill="none"
                  initial={false}
                  animate={{ opacity: stage === 2 ? 1 : 0 }}
                  transition={{ duration: 0.8, ease: EASE, delay: i * 0.05 }}
                />
              )
            })}
            <motion.line
              x1="0"
              x2="100"
              y1="58"
              y2="58"
              stroke="var(--color-ink)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              initial={false}
              animate={{ opacity: stage === 3 ? 1 : 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            />
          </svg>

          <AnimatePresence>
            {stage === 2 ? (
              <motion.div
                key="hub"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute left-1/2 top-[47%] z-10 -translate-x-1/2 -translate-y-1/2 bg-teal px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ivory sm:text-[10px]"
              >
                Patient record · 6 sources
              </motion.div>
            ) : null}
          </AnimatePresence>

          {stage === 3 ? (
            <div className="absolute inset-x-0 top-[58%]" aria-hidden>
              {timeline.map((d, k) => (
                <motion.div
                  key={d.id}
                  className="absolute top-0 flex flex-col items-start"
                  style={{ left: `${1.5 + k * 16.6}%` }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + k * 0.08 }}
                >
                  <span className="h-3 w-px bg-ink" />
                  <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink sm:text-[10px]">
                    {d.received.slice(5, 10)}
                  </span>
                  <span className="hidden font-mono text-[9px] uppercase tracking-[0.1em] text-ink-soft sm:block">
                    {KIND_LABEL[d.kind]}
                  </span>
                </motion.div>
              ))}
            </div>
          ) : null}

          {DOCS.map((d, i) => (
            <motion.div
              key={d.id}
              className="absolute z-[5] text-[5px] sm:text-[7px] lg:text-[9px]"
              initial={false}
              animate={box(stage, i)}
              transition={{ duration: 0.9, ease: EASE, delay: i * 0.03 }}
            >
              <DocThumb kind={d.kind} id={d.id} version={d.version} />
              <AnimatePresence>
                {stage >= 1 && stage < 3 ? (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute -top-2 left-2 bg-ink px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-ivory sm:text-[9px]"
                  >
                    {KIND_LABEL[d.kind]}
                  </motion.span>
                ) : null}
                {stage === 2 ? (
                  <motion.span
                    initial={{ opacity: 0, scale: 1.6, rotate: -14 }}
                    animate={{ opacity: 1, scale: 1, rotate: -8 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.2 + i * 0.06 }}
                    className="absolute bottom-[12%] right-[6%] border border-teal px-1 py-0.5 font-mono text-[7px] uppercase tracking-[0.1em] text-teal sm:text-[9px]"
                  >
                    {d.id} · linked
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ))}

          <AnimatePresence>
            {stage === 3 ? (
              <motion.p
                key="msg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: EASE, delay: 0.4 }}
                className="absolute inset-x-0 bottom-0 font-serif text-3xl uppercase leading-none sm:text-5xl lg:text-6xl"
              >
                The record exists. <span className="italic text-oxblood">The journey doesn&apos;t.</span>
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}
