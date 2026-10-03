import type { SVGProps } from 'react'

type SketchProps = SVGProps<SVGSVGElement> & { title?: string }

function Base({ children, title, viewBox = '0 0 120 120', ...props }: SketchProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function Stethoscope(props: SketchProps) {
  return (
    <Base {...props}>
      <path d="M30 14v26c0 16 10 26 22 26s22-10 22-26V14" />
      <path d="M26 14h8M70 14h8" />
      <path d="M52 66v14c0 14 10 24 24 24s20-10 20-22V64" />
      <circle cx="96" cy="56" r="9" />
      <circle cx="96" cy="56" r="4" strokeDasharray="1.5 2" />
      <path d="M38 24c2 8 2 14 0 20M66 24c-2 8-2 14 0 20" strokeOpacity={0.35} />
    </Base>
  )
}

export function Microscope(props: SketchProps) {
  return (
    <Base {...props}>
      <path d="M50 18l14-6 18 40-14 6z" />
      <path d="M58 22l-8 3M74 58l-6 18" />
      <circle cx="66" cy="80" r="4" />
      <path d="M40 84h40M86 50c12 10 14 30 2 44" />
      <path d="M28 104h70M40 104v-6h46v6" />
      <path d="M46 16l6-2" strokeOpacity={0.4} />
    </Base>
  )
}

export function MedicalFile(props: SketchProps) {
  return (
    <Base {...props}>
      <path d="M26 20h46l22 22v58H26z" />
      <path d="M72 20v22h22" />
      <path d="M38 56h44M38 66h44M38 76h30M38 86h38" strokeOpacity={0.55} />
      <path d="M40 34h8M44 30v8" />
    </Base>
  )
}

export function Clipboard(props: SketchProps) {
  return (
    <Base {...props}>
      <rect x="28" y="20" width="64" height="86" rx="3" />
      <path d="M46 20v-6h28v6M46 20h28v8H46z" />
      <path d="M38 46l4 4 8-8M56 46h26M38 64l4 4 8-8M56 64h26" />
      <path d="M40 82h10M56 82h26" strokeDasharray="2 3" />
    </Base>
  )
}

export function PathologySlide(props: SketchProps) {
  return (
    <Base {...props}>
      <rect x="10" y="44" width="100" height="32" rx="2" />
      <rect x="14" y="48" width="20" height="24" strokeOpacity={0.5} />
      <circle cx="70" cy="60" r="11" />
      <circle cx="66" cy="57" r="2.4" />
      <circle cx="74" cy="62" r="1.8" />
      <circle cx="69" cy="65" r="1.4" />
      <path d="M17 54h14M17 59h10" strokeOpacity={0.5} />
    </Base>
  )
}

export function CTRing(props: SketchProps) {
  return (
    <Base {...props}>
      <circle cx="60" cy="60" r="46" />
      <circle cx="60" cy="60" r="34" strokeDasharray="2 3" />
      <ellipse cx="60" cy="62" rx="20" ry="16" />
      <ellipse cx="51" cy="62" rx="6" ry="9" strokeOpacity={0.6} />
      <ellipse cx="69" cy="62" rx="6" ry="9" strokeOpacity={0.6} />
      <path d="M60 14v6M60 100v6M14 60h6M100 60h6" />
    </Base>
  )
}

export function Scanner(props: SketchProps) {
  return (
    <Base {...props}>
      <path d="M14 70l14-26h64l14 26z" />
      <path d="M14 70v14h92V70" />
      <path d="M30 56h60" stroke="var(--color-teal)" strokeWidth={1.6} />
      <path d="M36 44l6-24h36l6 24" strokeOpacity={0.5} />
      <circle cx="94" cy="77" r="2" />
    </Base>
  )
}

export function Pen(props: SketchProps) {
  return (
    <Base {...props}>
      <path d="M24 96l8-22 52-52 14 14-52 52z" />
      <path d="M32 74l14 14M78 28l14 14" />
      <path d="M24 96l6-2" />
    </Base>
  )
}

export function CalendarSketch(props: SketchProps) {
  return (
    <Base {...props}>
      <rect x="20" y="28" width="80" height="72" rx="2" />
      <path d="M20 46h80M40 20v14M80 20v14" />
      <path d="M34 60h6M52 60h6M70 60h6M34 76h6M52 76h6M70 76h6M34 90h6" strokeOpacity={0.5} />
      <circle cx="73" cy="77" r="7" stroke="var(--color-oxblood)" />
    </Base>
  )
}

export function Folder(props: SketchProps) {
  return (
    <Base {...props}>
      <path d="M14 34h32l8 8h52v56H14z" />
      <path d="M14 50h92" strokeOpacity={0.5} />
      <path d="M22 26h28M22 26v8" strokeOpacity={0.4} />
    </Base>
  )
}

export function Asclepius(props: SketchProps) {
  return (
    <Base {...props}>
      <path d="M60 10v100" />
      <path d="M60 22c14 0 14 14 0 14s-14 14 0 14 14 14 0 14-14 14 0 14 10 10 0 14" />
      <circle cx="66" cy="20" r="2" />
    </Base>
  )
}

export function Cells(props: SketchProps) {
  return (
    <Base {...props}>
      <circle cx="60" cy="60" r="50" strokeOpacity={0.5} />
      <circle cx="40" cy="44" r="10" />
      <circle cx="41" cy="45" r="3" />
      <circle cx="74" cy="40" r="8" />
      <circle cx="73" cy="41" r="2.4" />
      <circle cx="56" cy="74" r="12" />
      <circle cx="58" cy="72" r="3.4" />
      <circle cx="84" cy="72" r="7" />
      <circle cx="30" cy="74" r="6" strokeOpacity={0.6} />
    </Base>
  )
}
