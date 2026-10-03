'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/landing/cn'
import { NAV_LINKS, ROUTES } from '@/lib/landing/data'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.4}>
        <rect x="4" y="3" width="13" height="17" />
        <path d="M8 8h5M8 12h5" />
        <circle cx="17" cy="17" r="4" fill="var(--color-oxblood)" stroke="none" />
      </svg>
      <span className="font-mono text-[13px] font-medium uppercase tracking-[0.22em]">OncoBrief</span>
    </span>
  )
}

export function Nav() {
  const { scrollY } = useScroll()
  const [solid, setSolid] = useState(false)
  const [open, setOpen] = useState(false)
  useMotionValueEvent(scrollY, 'change', (v) => setSolid(v > 40))

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500',
        solid || open ? 'border-b border-ink/10 bg-ivory/95 backdrop-blur-sm' : 'border-b border-transparent',
      )}
    >
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 md:px-10">
        <a href="#top" className="text-ink" aria-label="OncoBrief home">
          <Logo />
        </a>
        <ul className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="group relative font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:text-ink"
              >
                {l.label}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-oxblood transition-all duration-300 group-hover:w-full" />
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <a
            href={ROUTES.explore}
            data-cursor="enter"
            className="hidden bg-ink px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ivory transition-colors hover:bg-oxblood sm:inline-block"
          >
            Explore platform
          </a>
          <button
            type="button"
            className="p-2 lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open ? (
          <motion.ul
            key="menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-ink/10 px-5 lg:hidden"
          >
            {[...NAV_LINKS, { label: 'Explore platform', href: ROUTES.explore }].map((l, i) => (
              <li key={l.label} className="border-b border-ink/10 last:border-0">
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-baseline justify-between py-4 font-serif text-3xl"
                >
                  {l.label}
                  <span className="font-mono text-[10px] text-ink-soft">{String(i + 1).padStart(2, '0')}</span>
                </a>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
