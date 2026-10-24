'use client';

interface SparklinePoint {
  value: number;
  date?: string | null;
}

export function Sparkline({
  points,
  width = 60,
  height = 20,
  strokeColor = 'var(--color-accent)',
  className = '',
}: {
  points: SparklinePoint[] | number[];
  width?: number;
  height?: number;
  strokeColor?: string;
  className?: string;
}) {
  const normalized: number[] = points.map((p) => (typeof p === 'number' ? p : p.value));

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length === 1) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={`inline-block shrink-0 ${className}`}
        aria-hidden="true"
      >
        <circle cx={width / 2} cy={height / 2} r="3" fill={strokeColor} />
      </svg>
    );
  }

  const min = Math.min(...normalized);
  const max = Math.max(...normalized);
  const range = max - min || 1;
  const padding = 3;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const coords = normalized.map((val, idx) => {
    const x = padding + (idx / (normalized.length - 1)) * plotWidth;
    const y = padding + (1 - (val - min) / range) * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastCoord = coords[coords.length - 1]!.split(',');
  const lastX = parseFloat(lastCoord[0]!);
  const lastY = parseFloat(lastCoord[1]!);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`inline-block shrink-0 overflow-visible ${className}`}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(' ')}
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={strokeColor} />
    </svg>
  );
}
