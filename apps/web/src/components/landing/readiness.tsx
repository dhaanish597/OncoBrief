'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/landing/cn'
import { EASE, MaskHeadline, Meta, Reveal, SectionMark } from './primitives'

type GapState = 'gap' | 'task' | 'owned'

interface Step {
  key: string
  label: string
  mark: '✓' | '!' | '?'
  detail: string
  gap?: { action: string; task: string; owner: string }
}

const STEPS: Step[] = [
  { key: 'path', label: 'Pathology', mark: '✓', detail: 'SRC-0412 · v2 · verified' },
  { key: 'img', label: 'Imaging', mark: '✓', detail: 'SRC-0398 · v1 · linked' },
  {
    key: 'ref',
    label: 'Referral',
    mark: '!',
    detail: 'Date conflicts with imaging',
    gap: { action: 'Create task', task: 'TSK-221 · Reconcile study date', owner: 'Records coordinator' },
  },
  { key: 'dis', label: 'Discharge', mark: '✓', detail: 'SRC-0377 · v1 · verified' },
  {
    key: 'fu',
    label: 'Follow-up',
    mark: '?',
    detail: 'Plan not received',
    gap: { action: 'Create task', task: 'TSK-226 · Request follow-up plan', owner: 'Clinic secretary' },
  },
]

export function Readiness() {
  const [gaps, setGaps] = useState<Record<string, GapState>>({ ref: 'gap', fu: 'gap' })
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const createTask = (key: string) => {
    setGaps((g) => ({ ...g, [key]: 'task' }))
    timers.current.push(setTimeout(() => setGaps((g) => ({ ...g, [key]: 'owned' })), 900))
  }

  const owned = Object.values(gaps).filter((s) => s === 'owned').length
  const allOwned = owned === 2

  return (
    <section id="workflow" className="relative overflow-hidden bg-ink py-24 text-ivory md:py-36">
      <div className="line-grid pointer-events-none absolute inset-0 opacity-[0.08] invert" aria-hidden />
      <div className="relative mx-auto max-w-[1440px] px-5 md:px-10">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <SectionMark index="05" label="Consultation readiness" meta="Pathway" tone="light" />
            <MaskHeadline
              className="mt-5 text-[2.6rem] uppercase sm:text-6xl lg:text-7xl xl:text-8xl"
              lines={['Know what’s missing', <span key="b" className="italic normal-case text-[#d9a3a7]">before it&apos;s needed.</span>]}
            />
          </div>
          <Reveal className="md:col-span-4">
            <p className="leading-relaxed text-ivory/70 text-pretty">
              Readiness is a checklist of evidence, not a clinical judgement. Gaps become tasks with an owner, so the
              brief is complete — or honestly incomplete — before the consult.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 flex flex-col gap-2 border-y border-ivory/15 py-5 sm:flex-row sm:items-center sm:justify-between">
          <Meta className="text-ivory/60">Consult packet · Brief Nº 0412</Meta>
          <div className="flex items-center gap-4">
            <div className="flex gap-1" aria-hidden>
              {STEPS.map((s) => {
                const st = gaps[s.key]
                return (
                  <span
                    key={s.key}
                    className={cn(
                      'h-2 w-8 transition-colors duration-500',
                      !s.gap ? 'bg-sage' : st === 'owned' ? 'bg-amber' : 'border border-ivory/40',
                    )}
                  />
                )
              })}
            </div>
            <span className="font-mono text-xs uppercase tracking-[0.14em]" aria-live="polite">
              3 / 5 evidenced · {allOwned ? 'all gaps owned' : `${2 - owned} unowned gap${2 - owned === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>

        <ol className="relative mt-12 grid gap-10 md:grid-cols-5 md:gap-4">
          <motion.span
            className="pointer-events-none absolute left-[10%] right-[10%] top-6 hidden h-px origin-left bg-ivory/35 md:block"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: EASE }}
            aria-hidden
          />
          {STEPS.map((s, i) => {
            const st = s.gap ? gaps[s.key] : null
            const markColor =
              s.mark === '✓'
                ? 'border-sage text-sage'
                : st === 'owned'
                  ? 'border-amber text-amber'
                  : s.mark === '!'
                    ? 'border-alert text-[#e46a5f]'
                    : 'border-dashed border-ivory/60 text-ivory'
            return (
              <motion.li
                key={s.key}
                className="relative flex gap-5 md:flex-col md:items-center md:text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.12, duration: 0.6, ease: EASE }}
              >
                <motion.span
                  className={cn(
                    'relative z-[1] flex size-12 shrink-0 items-center justify-center rounded-full border bg-ink font-mono text-lg transition-colors duration-500',
                    markColor,
                  )}
                  animate={st === 'gap' ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={st === 'gap' ? { duration: 2, repeat: Infinity } : {}}
                >
                  {st === 'owned' ? '→' : s.mark}
                </motion.span>
                <div className="flex flex-col md:items-center">
                  <span className="font-serif text-3xl leading-none">{s.label}</span>
                  <span className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ivory/55">{s.detail}</span>
                  {s.gap ? (
                    <div className="mt-4 min-h-[76px] md:w-full">
                      <AnimatePresence mode="wait">
                        {st === 'gap' ? (
                          <motion.button
                            key="btn"
                            type="button"
                            data-cursor="enter"
                            onClick={() => createTask(s.key)}
                            exit={{ opacity: 0, y: -6 }}
                            className="border border-ivory/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors hover:bg-ivory hover:text-ink"
                          >
                            {s.gap.action}
                          </motion.button>
                        ) : (
                          <motion.div
                            key="task"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="border-l-2 border-amber bg-ivory/[0.06] px-3 py-2 text-left"
                          >
                            <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
                              {st === 'task' ? 'Task created…' : 'Owner assigned'}
                            </span>
                            <span className="mt-1 block text-sm">{s.gap.task}</span>
                            <AnimatePresence>
                              {st === 'owned' ? (
                                <motion.span
                                  key="owner"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-ivory/60"
                                >
                                  {s.gap.owner}
                                </motion.span>
                              ) : null}
                            </AnimatePresence>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : null}
                </div>
              </motion.li>
            )
          })}
        </ol>

        <div className="mt-12 flex flex-wrap gap-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ivory/55">
          <span>Missing → Create task → Owner assigned</span>
          <button
            type="button"
            onClick={() => setGaps({ ref: 'gap', fu: 'gap' })}
            className="underline decoration-ivory/30 underline-offset-4 hover:text-ivory"
          >
            Reset pathway
          </button>
        </div>
      </div>
    </section>
  )
}
