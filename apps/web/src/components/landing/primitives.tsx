'use client'

import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/landing/cn'
import { STATUS_STYLES, type EvidenceStatus } from '@/lib/landing/data'

const EASE = [0.22, 1, 0.36, 1] as const

export function MaskHeadline({
  lines,
  className,
  as: Tag = 'h2',
  delay = 0,
}: {
  lines: React.ReactNode[]
  className?: string
  as?: 'h1' | 'h2' | 'h3'
  delay?: number
}) {
  const reduce = useReducedMotion()
  const MotionTag = motion[Tag]
  return (
    <MotionTag
      className={cn('font-serif tracking-[-0.02em] text-balance', className, 'leading-[0.9]')}
      initial={reduce ? false : 'hidden'}
      whileInView="shown"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
    >
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.06em]">
          <motion.span
            className="block"
            variants={{ hidden: { y: '105%' }, shown: { y: '0%' } }}
            transition={{ duration: 0.9, ease: EASE, delay: delay + i * 0.08 }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </MotionTag>
  )
}

export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  y?: number
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -5% 0px' }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

export function SectionMark({
  index,
  label,
  meta,
  tone = 'dark',
}: {
  index: string
  label: string
  meta?: string
  tone?: 'dark' | 'light'
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em]',
        tone === 'dark' ? 'text-ink-soft' : 'text-ivory/60',
      )}
    >
      <span className={tone === 'dark' ? 'text-oxblood' : 'text-ivory'}>{index}</span>
      <span className={cn('h-px w-10', tone === 'dark' ? 'bg-ink/30' : 'bg-ivory/30')} aria-hidden />
      <span>{label}</span>
      {meta ? <span className="hidden sm:inline opacity-60">/ {meta}</span> : null}
    </div>
  )
}

export function StatusPill({ status, className }: { status: EvidenceStatus; className?: string }) {
  const s = STATUS_STYLES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
        s.text,
        s.border,
        status === 'SUPERSEDED' && 'line-through decoration-1',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', s.dot)} aria-hidden />
      {status}
    </span>
  )
}

export function Meta({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft', className)}>
      {children}
    </span>
  )
}

export { EASE }
