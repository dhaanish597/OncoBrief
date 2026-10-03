'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/landing/cn'
import { EASE, MaskHeadline, Meta, SectionMark } from './primitives'
import { Clipboard, MedicalFile, Stethoscope } from './sketches'

const LANES = [
  {
    key: 'clinician',
    role: 'Clinician',
    title: 'Clinician brief',
    Icon: Stethoscope,
    lede: 'A one-page, source-linked summary of what the record says — and what it doesn’t.',
    items: [
      ['Evidence ledger', '6 facts · 4 verified'],
      ['Conflicts', '1 · study date'],
      ['Open questions', 'Referral reason'],
      ['Sources', 'Every line linked'],
    ],
    tone: 'bg-ivory text-ink',
  },
  {
    key: 'nurse',
    role: 'Nurse / coordinator',
    title: 'Coordination desk',
    Icon: Clipboard,
    lede: 'Missing documents, owned tasks and intake status, so nothing waits for the consult room.',
    items: [
      ['Tasks', '2 open · 2 owned'],
      ['Requested', 'Follow-up plan'],
      ['Low-confidence OCR', '1 page to read'],
      ['Intake', 'Packet 80% evidenced'],
    ],
    tone: 'bg-bone text-ink',
  },
  {
    key: 'patient',
    role: 'Patient',
    title: 'Patient journey',
    Icon: MedicalFile,
    lede: 'A plain-language view of what has been received and what’s next — reviewed by staff before release.',
    items: [
      ['Received', '5 of 6 documents'],
      ['Next step', 'Specialist consultation'],
      ['Bring along', 'Current medication list'],
      ['Status', 'Staff-reviewed'],
    ],
    tone: 'bg-oxblood text-ivory',
  },
] as const

export function Surfaces() {
  const [active, setActive] = useState(0)

  return (
    <section id="surfaces" className="relative py-24 md:py-36">
      <div className="mx-auto max-w-[1440px] px-5 md:px-10">
        <SectionMark index="06" label="Three surfaces" meta="One record" />
        <MaskHeadline
          className="mt-5 max-w-5xl text-[2.6rem] uppercase sm:text-6xl lg:text-7xl xl:text-8xl"
          lines={['One record.', <span key="b" className="italic normal-case text-oxblood">Three ways in.</span>]}
        />

        <div className="mt-14 flex flex-col gap-3 lg:h-[560px] lg:flex-row">
          {LANES.map((l, i) => {
            const on = active === i
            const light = l.key === 'patient'
            return (
              <motion.article
                key={l.key}
                data-cursor="enter"
                tabIndex={0}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                className={cn(
                  'relative flex min-h-[420px] flex-col overflow-hidden p-6 outline-none focus-visible:ring-2 focus-visible:ring-teal md:p-8 lg:min-h-0',
                  l.tone,
                  !light && 'border border-ink/15',
                )}
                animate={{ flexGrow: on ? 2.4 : 1 }}
                style={{ flexBasis: 0 }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                <div className="flex items-start justify-between">
                  <Meta className={light ? 'text-ivory/70' : undefined}>
                    {String(i + 1).padStart(2, '0')} / {l.role}
                  </Meta>
                  <l.Icon className={cn('w-14', light ? 'text-ivory/70' : 'text-ink/50')} />
                </div>
                <h3 className="mt-auto font-serif text-4xl leading-none md:text-5xl">{l.title}</h3>
                <p className={cn('mt-3 max-w-sm text-pretty', light ? 'text-ivory/80' : 'text-ink-soft')}>{l.lede}</p>
                <motion.dl
                  className="mt-6 grid grid-cols-2 gap-px overflow-hidden"
                  initial={false}
                  animate={{ opacity: on ? 1 : 0.5, height: 'auto' }}
                >
                  {l.items.map(([k, v], j) => (
                    <motion.div
                      key={k}
                      className={cn('py-3 pr-3', light ? 'border-t border-ivory/25' : 'border-t border-ink/15')}
                      initial={false}
                      animate={{ y: on ? 0 : 4, opacity: on ? 1 : 0.7 }}
                      transition={{ delay: on ? j * 0.05 : 0 }}
                    >
                      <dt className={cn('font-mono text-[10px] uppercase tracking-[0.14em]', light ? 'text-ivory/60' : 'text-ink-soft')}>
                        {k}
                      </dt>
                      <dd className="mt-1 text-sm">{v}</dd>
                    </motion.div>
                  ))}
                </motion.dl>
              </motion.article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
