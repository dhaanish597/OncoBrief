'use client'

import { useEffect, useState } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { cn } from '@/lib/landing/cn'
import { RECORD_DOCS, STATUS_STYLES, type EvidenceStatus } from '@/lib/landing/data'
import { DocThumb } from './doc-thumb'
import { CTRing, Stethoscope, Microscope } from './sketches'
import { EASE } from './primitives'

const PHASES = ['Scattered', 'Scanned', 'Structured', 'Connected', 'Evidence ledger'] as const

const DOCS = RECORD_DOCS.slice(0, 6)

const FACTS: { label: string; status: EvidenceStatus }[] = [
  { label: 'Histology · p.2', status: 'VERIFIED' },
  { label: 'Study date · p.1', status: 'CONFLICT' },
  { label: 'Referral reason', status: 'PENDING' },
  { label: 'Medications · p.3', status: 'VERIFIED' },
  { label: 'Clinic note · OCR', status: 'PENDING' },
  { label: 'Cycle record · v3', status: 'VERIFIED' },
]

const SCATTER = [
  { x: 4, y: 10, r: -8 },
  { x: 37, y: 1, r: 5 },
  { x: 70, y: 9, r: -3 },
  { x: 9, y: 57, r: 6 },
  { x: 41, y: 50, r: -6 },
  { x: 71, y: 60, r: 8 },
]

const GRID = DOCS.map((_, i) => ({ x: i % 2 === 0 ? 2 : 25, y: 2 + Math.floor(i / 2) * 33.5, r: 0 }))

const NODE = (i: number) => ({ x: 70, y: 9 + i * 16.4 })
const ROW = (i: number) => ({ x: 55, y: 20 + i * 12.6 })

// SCATTER, GRID and FACTS are each DOCS.length long, so the per-document
// lookups in docBox(), linkPath() and the fact list are always in range.
function docBox(phase: number, i: number) {
  if (phase <= 1) {
    const p = SCATTER[i]!
    return { left: `${p.x}%`, top: `${p.y}%`, width: '25%', height: '32%', rotate: phase === 1 ? p.r / 2 : p.r }
  }
  const g = GRID[i]!
  return { left: `${g.x}%`, top: `${g.y}%`, width: '21%', height: '29%', rotate: 0 }
}

function linkPath(phase: number, i: number) {
  const g = GRID[i]!
  const sx = g.x + 21
  const sy = g.y + 14.5
  const end = phase === 4 ? ROW(i) : NODE(i)
  const ex = end.x
  const ey = phase === 4 ? end.y : end.y
  const mx = (sx + ex) / 2
  return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`
}

function Layer({
  mx,
  my,
  depth,
  className,
  children,
}: {
  mx: MotionValue<number>
  my: MotionValue<number>
  depth: number
  className?: string
  children: React.ReactNode
}) {
  const x = useTransform(mx, (v) => v * depth)
  const y = useTransform(my, (v) => v * depth)
  return (
    <motion.div className={cn('absolute inset-0', className)} style={{ x, y }}>
      {children}
    </motion.div>
  )
}

export function HeroVisual() {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const mx = useSpring(rawX, { stiffness: 80, damping: 20 })
  const my = useSpring(rawY, { stiffness: 80, damping: 20 })

  useEffect(() => {
    if (reduce) {
      setPhase(4)
      return
    }
    if (paused) return
    const t = setTimeout(() => setPhase((p) => (p + 1) % PHASES.length), phase === 4 ? 4200 : 2400)
    return () => clearTimeout(t)
  }, [phase, paused, reduce])

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    rawX.set(((e.clientX - r.left) / r.width - 0.5) * 2)
    rawY.set(((e.clientY - r.top) / r.height - 0.5) * 2)
  }

  const showLinks = phase >= 3
  const showNodes = phase >= 3

  return (
    <div className="relative">
      <div
        className="relative aspect-[4/5] w-full select-none sm:aspect-[5/4] lg:aspect-[16/13]"
        onPointerMove={onMove}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => {
          setPaused(false)
          setHovered(null)
          rawX.set(0)
          rawY.set(0)
        }}
        role="img"
        aria-label="Animated illustration: scattered oncology documents are scanned, structured, connected to extracted facts and organised into an evidence ledger."
      >
        <Layer mx={mx} my={my} depth={-18} className="pointer-events-none">
          <CTRing className="slow-spin absolute -right-[6%] -top-[8%] w-[52%] text-ink/[0.08]" />
          <Stethoscope className="absolute -bottom-[4%] -left-[4%] w-[34%] rotate-12 text-ink/[0.12]" />
          <Microscope className="absolute bottom-[2%] right-[40%] w-[16%] text-ink/[0.08]" />
          <div className="dot-grid absolute inset-[8%] opacity-50" />
        </Layer>

        <Layer mx={mx} my={my} depth={7}>
          <svg
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {DOCS.map((d, i) => {
              const status = FACTS[i]!.status
              const color =
                status === 'CONFLICT' ? 'var(--color-alert)' : status === 'PENDING' ? 'var(--color-amber)' : 'var(--color-teal)'
              return (
                <motion.path
                  key={d.id}
                  initial={false}
                  animate={{
                    d: linkPath(phase === 4 ? 4 : 3, i),
                    opacity: showLinks ? (hovered === null || hovered === i ? 1 : 0.2) : 0,
                  }}
                  transition={{ duration: 0.9, ease: EASE, delay: showLinks ? i * 0.06 : 0 }}
                  stroke={color}
                  strokeWidth={hovered === i ? 2 : 1.1}
                  vectorEffect="non-scaling-stroke"
                  fill="none"
                />
              )
            })}
          </svg>

          <AnimatePresence>
            {phase === 4 ? (
              <motion.div
                key="ledger"
                className="absolute border border-ink/80 bg-ivory"
                style={{ left: '53%', top: '6%', width: '45%', height: '88%' }}
                initial={{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
                animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                <div className="flex items-center justify-between border-b border-ink/80 bg-ink px-2 py-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-ivory sm:text-[9px]">
                  <span>Evidence ledger</span>
                  <span className="opacity-60">6 facts · 6 sources</span>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {FACTS.map((f, i) => {
            const pos = phase === 4 ? ROW(i) : NODE(i)
            const s = STATUS_STYLES[f.status]
            return (
              <motion.button
                type="button"
                key={f.label}
                data-cursor="trace"
                onPointerEnter={() => setHovered(i)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                tabIndex={showNodes ? 0 : -1}
                aria-label={`${f.label}: ${f.status}`}
                className={cn(
                  'absolute flex -translate-y-1/2 items-center gap-1.5 text-left font-mono text-[8px] uppercase tracking-[0.1em] sm:text-[10px]',
                  phase === 4 ? 'border-b border-ink/15 px-2' : '',
                )}
                initial={false}
                animate={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: phase === 4 ? '41%' : '28%',
                  opacity: showNodes ? 1 : 0,
                  scale: hovered === i ? 1.04 : 1,
                }}
                style={{ pointerEvents: showNodes ? 'auto' : 'none', height: phase === 4 ? '12.6%' : 'auto' }}
                transition={{ duration: 0.8, ease: EASE, delay: showNodes ? 0.2 + i * 0.05 : 0 }}
              >
                <span
                  className={cn(
                    'relative flex size-2.5 shrink-0 items-center justify-center rounded-full border',
                    s.border,
                    hovered === i && s.dot,
                  )}
                >
                  <span className={cn('size-1 rounded-full', s.dot)} />
                </span>
                <span className="truncate text-ink">{f.label}</span>
                {phase === 4 ? <span className={cn('ml-auto shrink-0', s.text)}>{f.status}</span> : null}
              </motion.button>
            )
          })}

          {DOCS.map((d, i) => (
            <motion.div
              key={d.id}
              className="absolute text-[6px] sm:text-[8px] lg:text-[9px]"
              initial={false}
              animate={docBox(phase, i)}
              transition={{ duration: 1, ease: EASE, delay: i * 0.04 }}
              style={{ zIndex: hovered === i ? 20 : 10 }}
            >
              <div
                tabIndex={0}
                data-cursor="open"
                onPointerEnter={() => setHovered(i)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                className="group relative size-full outline-none focus-visible:ring-2 focus-visible:ring-teal"
              >
                <DocThumb kind={d.kind} id={d.id} version={d.version} />
                {phase >= 1 ? (
                  <motion.span
                    className="ocr-brackets pointer-events-none absolute -inset-1"
                    initial={{ opacity: 0, scale: 1.08 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: i * 0.08 }}
                  />
                ) : null}
                {phase === 1 && !reduce ? (
                  <span
                    className="pointer-events-none absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-transparent via-teal/35 to-transparent"
                    style={{ animation: `scan-sweep 1.8s ${i * 0.12}s ease-in-out both` }}
                  />
                ) : null}
                <AnimatePresence>
                  {hovered === i ? (
                    <motion.dl
                      key="meta"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0 grid grid-cols-[auto_1fr] content-center gap-x-2 gap-y-1 bg-ink/95 p-[0.9em] font-mono text-[1em] uppercase tracking-[0.08em] text-ivory"
                    >
                      <dt className="opacity-50">Source</dt>
                      <dd className="truncate">{d.id}</dd>
                      <dt className="opacity-50">Page</dt>
                      <dd>{d.page}</dd>
                      <dt className="opacity-50">Version</dt>
                      <dd>{d.version}</dd>
                      <dt className="opacity-50">Status</dt>
                      <dd className={STATUS_STYLES[d.status].text.replace('text-ink-soft', 'text-ivory/60')}>
                        {d.status}
                      </dd>
                    </motion.dl>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </Layer>
      </div>

      <ol className="mt-5 grid grid-cols-5 gap-1" aria-label="Pipeline stage">
        {PHASES.map((p, i) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => {
                setPhase(i)
                setPaused(true)
              }}
              aria-current={phase === i ? 'step' : undefined}
              className="group flex w-full flex-col gap-2 text-left"
            >
              <span className="relative h-px w-full overflow-hidden bg-ink/15">
                <motion.span
                  className="absolute inset-y-0 left-0 bg-oxblood"
                  initial={false}
                  animate={{ width: phase >= i ? '100%' : '0%' }}
                  transition={{ duration: 0.6, ease: EASE }}
                />
              </span>
              <span
                className={cn(
                  'font-mono text-[9px] uppercase tracking-[0.14em] transition-colors sm:text-[10px]',
                  phase === i ? 'text-ink' : 'text-ink-soft/70 group-hover:text-ink',
                )}
              >
                <span className="text-oxblood">{String(i + 1).padStart(2, '0')}</span>{' '}
                <span className="hidden sm:inline">{p}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
