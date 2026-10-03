import { cn } from '@/lib/landing/cn'
import { KIND_LABEL, type DocKind } from '@/lib/landing/data'
import { CTRing, Cells } from './sketches'

function Lines({ n, widths }: { n: number; widths?: number[] }) {
  return (
    <div className="flex flex-col gap-[0.35em]">
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className="block h-[0.22em] min-h-[2px] bg-ink/15"
          style={{ width: `${widths?.[i % widths.length] ?? 100}%` }}
        />
      ))}
    </div>
  )
}

function Motif({ kind }: { kind: DocKind }) {
  switch (kind) {
    case 'pathology':
      return (
        <div className="flex items-center gap-[0.6em]">
          <Cells className="aspect-square w-[42%] text-oxblood/80" />
          <div className="flex-1">
            <Lines n={4} widths={[100, 80, 92, 60]} />
          </div>
        </div>
      )
    case 'imaging':
      return (
        <div className="flex items-center gap-[0.6em]">
          <div className="aspect-square w-[46%] bg-ink p-[4%] text-ivory/80">
            <CTRing className="size-full" />
          </div>
          <div className="flex-1">
            <Lines n={4} widths={[90, 100, 70, 85]} />
          </div>
        </div>
      )
    case 'handwritten':
      return (
        <svg viewBox="0 0 100 46" className="w-full text-ink/55" fill="none" stroke="currentColor" strokeWidth={1}>
          <path d="M2 8c6-4 10 4 16 0s8-5 14 0 10 3 16-1 9 2 14 0 8-3 12 1" />
          <path d="M2 20c5-3 9 3 14 0s10-4 16 0 8 3 14-1 12 2 16 0" />
          <path d="M2 32c7-3 9 3 15 0s9-4 13 0 9 1 14-2" />
          <path d="M60 30l8 8M68 30l-8 8" stroke="var(--color-oxblood)" />
          <path d="M2 42c6-2 12 2 18 0" />
        </svg>
      )
    case 'chemo':
      return (
        <div className="grid grid-cols-4 gap-px bg-ink/15 p-px">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className={cn('h-[0.9em] bg-[#faf6ee]', i === 6 && 'bg-teal/30')} />
          ))}
        </div>
      )
    case 'referral':
      return (
        <div className="flex flex-col gap-[0.6em]">
          <Lines n={2} widths={[40, 30]} />
          <Lines n={4} widths={[100, 96, 88, 50]} />
        </div>
      )
    case 'discharge':
      return (
        <div className="flex flex-col gap-[0.5em]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-[0.4em]">
              <span className="size-[0.45em] min-h-1 min-w-1 border border-ink/40" />
              <span className="block h-[0.22em] min-h-[2px] flex-1 bg-ink/15" style={{ width: `${70 + i * 7}%` }} />
            </div>
          ))}
        </div>
      )
  }
}

export function DocThumb({
  kind,
  id,
  version,
  className,
}: {
  kind: DocKind
  id: string
  version?: string
  className?: string
}) {
  return (
    <div className={cn('paper flex size-full flex-col gap-[0.7em] overflow-hidden p-[0.9em] text-ink', className)}>
      <div className="flex items-center justify-between font-mono text-[0.62em] uppercase tracking-[0.12em] text-ink-soft">
        <span>{id}</span>
        {version ? <span>{version}</span> : null}
      </div>
      <div className="font-serif text-[1.15em] leading-none">{KIND_LABEL[kind]}</div>
      <span className="h-px w-full bg-ink/20" />
      <Motif kind={kind} />
      <div className="mt-auto">
        <Lines n={2} widths={[100, 64]} />
      </div>
    </div>
  )
}
