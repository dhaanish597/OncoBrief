'use client'

import { useEffect, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'

const LABELS: Record<string, string> = {
  open: 'Open',
  trace: 'Trace',
  inspect: 'Inspect',
  enter: 'Enter',
}

export function EvidenceCursor() {
  const reduce = useReducedMotion()
  const [enabled, setEnabled] = useState(false)
  const [label, setLabel] = useState<string | null>(null)
  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const sx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.4 })
  const sy = useSpring(y, { stiffness: 500, damping: 40, mass: 0.4 })

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)')
    setEnabled(mq.matches)
    const onChange = () => setEnabled(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const onMove = (e: PointerEvent) => {
      x.set(e.clientX)
      y.set(e.clientY)
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-cursor]')
      setLabel(target?.dataset.cursor ?? null)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [enabled, x, y])

  if (!enabled || reduce) return null

  const text = label ? LABELS[label] : null

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[100]"
      style={{ x: sx, y: sy }}
    >
      <motion.div
        className="-translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-ink/60"
        animate={{
          width: text ? 64 : 10,
          height: text ? 64 : 10,
          backgroundColor: text ? 'rgba(27,26,23,0.92)' : 'rgba(27,26,23,0)',
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        {text ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ivory">{text}</span>
        ) : null}
      </motion.div>
    </motion.div>
  )
}
