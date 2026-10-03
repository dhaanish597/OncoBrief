'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/landing/cn'
import { KIND_LABEL, RECORD_DOCS, STATUS_STYLES } from '@/lib/landing/data'
import { DocThumb } from './doc-thumb'
import { EASE, MaskHeadline, Meta, Reveal, SectionMark, StatusPill } from './primitives'
import { Folder } from './sketches'

export function EvidenceBag() {
  const [active, setActive] = useState(0)
  // `active` is only ever assigned from an index into RECORD_DOCS.
  const doc = RECORD_DOCS[active]!

  return (
    <section id="evidence" className="relative py-24 md:py-36">
      <div className="mx-auto max-w-[1440px] px-5 md:px-10">
        <div className="grid gap-8 md:grid-cols-12">
          <div className="md:col-span-6">
            <SectionMark index="02" label="The evidence bag" meta="Archive" />
            <MaskHeadline
              className="mt-5 text-[2.6rem] uppercase sm:text-6xl lg:text-7xl"
              lines={['Every page', <span key="i" className="italic normal-case text-oxblood">accounted for.</span>]}
            />
          </div>
          <Reveal className="md:col-span-5 md:col-start-8 md:self-end">
            <p className="leading-relaxed text-ink-soft text-pretty">
              Each incoming record keeps its source, page and version. Newer reports supersede older ones without
              erasing them, and disagreements between documents surface as conflicts — not silent overwrites.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {(['VERIFIED', 'PENDING', 'CONFLICT', 'SUPERSEDED'] as const).map((s) => (
                <StatusPill key={s} status={s} />
              ))}
            </div>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="relative border border-ink/80 bg-bone p-4 pt-10 md:p-8 md:pt-12">
              <Folder className="absolute right-4 top-3 w-8 text-ink/40" />
              <div className="absolute left-4 top-3 flex gap-4 md:left-8">
                <Meta>Record bag · MRN ••••4127</Meta>
                <Meta className="hidden sm:inline">{RECORD_DOCS.length} items</Meta>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4" role="listbox" aria-label="Documents in record bag">
                {RECORD_DOCS.map((d, i) => {
                  const selected = i === active
                  return (
                    <li key={d.id + d.version} role="option" aria-selected={selected}>
                      <motion.button
                        type="button"
                        data-cursor="open"
                        onClick={() => setActive(i)}
                        className={cn(
                          'relative block aspect-[3/4] w-full text-left text-[7px] outline-none focus-visible:ring-2 focus-visible:ring-teal sm:text-[8px] md:text-[9px]',
                          d.status === 'SUPERSEDED' && 'opacity-70',
                        )}
                        animate={{ y: selected ? -10 : 0, rotate: selected ? 0 : (i % 2 ? 1.2 : -1.2) }}
                        whileHover={{ y: selected ? -10 : -5 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                      >
                        <DocThumb kind={d.kind} id={d.id} version={d.version} />
                        <span
                          className={cn(
                            'absolute inset-0 border-2 transition-colors',
                            selected ? STATUS_STYLES[d.status].border : 'border-transparent',
                          )}
                          aria-hidden
                        />
                        <span
                          className={cn('absolute -top-1 right-2 size-2 rounded-full', STATUS_STYLES[d.status].dot)}
                          aria-hidden
                        />
                        <span className="sr-only">
                          {d.title}, {d.status}
                        </span>
                      </motion.button>
                    </li>
                  )
                })}
                <li className="flex aspect-[3/4] flex-col items-center justify-center gap-2 border border-dashed border-ink/30 text-center">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Follow-up plan</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">Not received</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="lg:col-span-5" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.article
                key={doc.id + doc.version}
                initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }}
                animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
                className="flex h-full flex-col border-t-2 border-ink pt-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Meta>{KIND_LABEL[doc.kind]}</Meta>
                    <h3 className="mt-2 font-serif text-4xl leading-none md:text-5xl">{doc.title}</h3>
                  </div>
                  <motion.span
                    initial={{ scale: 1.8, rotate: -20, opacity: 0 }}
                    animate={{ scale: 1, rotate: -8, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.25 }}
                    className={cn(
                      'shrink-0 border-2 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]',
                      STATUS_STYLES[doc.status].text,
                      STATUS_STYLES[doc.status].border,
                    )}
                  >
                    {doc.status === 'VERIFIED' ? 'Source verified' : doc.status}
                  </motion.span>
                </div>
                <dl className="mt-8 grid grid-cols-2 border-t border-ink/15">
                  {[
                    ['Source', doc.id],
                    ['Origin', doc.source],
                    ['Page', doc.page],
                    ['Version', doc.version],
                    ['Received', doc.received],
                    ['Status', doc.status],
                  ].map(([k, v]) => (
                    <div key={k} className="border-b border-ink/15 py-3 pr-3 odd:border-r odd:pr-4 even:pl-4">
                      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">{k}</dt>
                      <dd className="mt-1 font-mono text-sm">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-6 font-serif text-xl italic leading-snug text-ink-soft">{doc.note}</p>
              </motion.article>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
