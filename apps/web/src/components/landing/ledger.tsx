'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, X } from 'lucide-react'
import { cn } from '@/lib/landing/cn'
import { LEDGER_ROWS, STATUS_STYLES, type LedgerRow } from '@/lib/landing/data'
import { EASE, MaskHeadline, Meta, Reveal, SectionMark, StatusPill } from './primitives'

function Drawer({ row, onClose }: { row: LedgerRow; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-ink/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ledger-drawer-title"
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-lg flex-col overflow-y-auto bg-ivory shadow-2xl"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <div className="flex items-center justify-between border-b border-ink/15 px-6 py-4">
          <Meta>
            {row.id} · {row.sourceId} · {row.page} · {row.version}
          </Meta>
          <button ref={closeRef} type="button" onClick={onClose} className="p-1" aria-label="Close inspector">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex flex-col gap-8 p-6">
          <div>
            <Meta>Fact</Meta>
            <h3 id="ledger-drawer-title" className="mt-2 font-serif text-4xl leading-none">
              {row.fact}
            </h3>
            <p className="mt-2 text-ink-soft">{row.value}</p>
            <StatusPill status={row.review} className="mt-4" />
          </div>

          <div>
            <Meta>Source document — {row.sourceTitle}</Meta>
            <div className="paper relative mt-3 p-5">
              <div className="mb-4 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                <span>{row.sourceId}</span>
                <span>
                  {row.page} · {row.version}
                </span>
              </div>
              <div className="flex flex-col gap-2" aria-hidden>
                {[92, 100, 74].map((w, i) => (
                  <span key={i} className="h-1.5 bg-ink/10" style={{ width: `${w}%` }} />
                ))}
              </div>
              <p className="my-4 font-serif text-lg leading-relaxed">
                {row.context[0]}
                <motion.mark
                  className="relative bg-transparent px-0.5 text-ink"
                  initial={{ backgroundSize: '0% 100%' }}
                  animate={{ backgroundSize: '100% 100%' }}
                  transition={{ duration: 0.8, delay: 0.5, ease: EASE }}
                  style={{
                    backgroundImage: `linear-gradient(color-mix(in oklab, var(--color-teal) 25%, transparent), color-mix(in oklab, var(--color-teal) 25%, transparent))`,
                    backgroundRepeat: 'no-repeat',
                  }}
                >
                  {row.phrase}
                </motion.mark>
                {row.context[1]}
              </p>
              <div className="flex flex-col gap-2" aria-hidden>
                {[100, 60].map((w, i) => (
                  <span key={i} className="h-1.5 bg-ink/10" style={{ width: `${w}%` }} />
                ))}
              </div>
              <span className="ocr-brackets pointer-events-none absolute inset-2" aria-hidden />
            </div>
          </div>

          {row.task ? (
            <div className="border-l-2 border-amber pl-4">
              <Meta>Open task</Meta>
              <p className="mt-1">{row.task}</p>
            </div>
          ) : null}

          <div>
            <Meta>Audit history</Meta>
            <ol className="mt-3 border-l border-ink/20">
              {row.audit.map((a, i) => (
                <motion.li
                  key={i}
                  className="relative pb-4 pl-5 last:pb-0"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                >
                  <span className="absolute -left-[4.5px] top-1.5 size-2 rounded-full border border-ink bg-ivory" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                    {a.at} · {a.who}
                  </span>
                  <p className="text-sm">{a.what}</p>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </motion.aside>
    </>
  )
}

export function Ledger() {
  const [open, setOpen] = useState<LedgerRow | null>(null)

  return (
    <section id="ledger" className="relative py-24 md:py-36">
      <div className="mx-auto max-w-[1440px] px-5 md:px-10">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <SectionMark index="04" label="Evidence ledger" meta="Inspect" />
            <MaskHeadline
              className="mt-5 text-[2.6rem] uppercase sm:text-6xl lg:text-7xl xl:text-8xl"
              lines={['One ledger.', <span key="i" className="italic normal-case text-oxblood">Every receipt.</span>]}
            />
          </div>
          <Reveal className="md:col-span-4 md:col-start-9">
            <p className="leading-relaxed text-ink-soft text-pretty">
              Open any row to see the source page, the highlighted phrase, its review state and the full audit trail.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 border-t-2 border-ink">
          <div
            className="hidden grid-cols-[1.2fr_2fr_1fr_0.6fr_0.6fr_1fr_1.4fr_auto] gap-4 border-b border-ink/20 py-3 lg:grid"
            aria-hidden
          >
            {['Evidence', 'Fact', 'Source', 'Page', 'Ver.', 'Review', 'Task', ''].map((h) => (
              <Meta key={h}>{h}</Meta>
            ))}
          </div>
          <ul>
            {LEDGER_ROWS.map((r, i) => (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.6, ease: EASE }}
              >
                <button
                  type="button"
                  data-cursor="inspect"
                  onClick={() => setOpen(r)}
                  className="group relative grid w-full grid-cols-2 gap-x-4 gap-y-2 border-b border-ink/15 py-5 text-left outline-none transition-colors hover:bg-bone/70 focus-visible:bg-bone lg:grid-cols-[1.2fr_2fr_1fr_0.6fr_0.6fr_1fr_1.4fr_auto] lg:items-center lg:gap-4"
                >
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 transition-transform duration-300 group-hover:scale-y-100',
                      STATUS_STYLES[r.review].dot,
                    )}
                    aria-hidden
                  />
                  <span className="font-mono text-xs text-ink-soft transition-transform group-hover:translate-x-2">
                    {r.id}
                  </span>
                  <span className="col-span-2 row-start-2 lg:col-span-1 lg:row-start-auto">
                    <span className="block font-serif text-2xl leading-tight">{r.fact}</span>
                    <span className="block text-sm text-ink-soft">{r.value}</span>
                  </span>
                  <span className="hidden font-mono text-xs lg:block">{r.sourceId}</span>
                  <span className="hidden font-mono text-xs lg:block">{r.page}</span>
                  <span className="hidden font-mono text-xs lg:block">{r.version}</span>
                  <span className="justify-self-end lg:justify-self-start">
                    <StatusPill status={r.review} />
                  </span>
                  <span className="col-span-2 text-sm text-ink-soft lg:col-span-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] lg:hidden">
                      {r.sourceId} · {r.page} · {r.version} —{' '}
                    </span>
                    {r.task ?? '—'}
                  </span>
                  <ArrowUpRight
                    className="hidden size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 lg:block"
                    aria-hidden
                  />
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
      <AnimatePresence>{open ? <Drawer key={open.id} row={open} onClose={() => setOpen(null)} /> : null}</AnimatePresence>
    </section>
  )
}
