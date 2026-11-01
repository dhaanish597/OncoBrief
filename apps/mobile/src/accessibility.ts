export function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16);
    const g = parseInt(clean[1]! + clean[1]!, 16);
    const b = parseInt(clean[2]! + clean[2]!, 16);
    return [r, g, b];
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!;
}

export function calculateContrastRatio(fgHex: string, bgHex: string): number {
  const [r1, g1, b1] = parseHexColor(fgHex);
  const [r2, g2, b2] = parseHexColor(bgHex);
  const l1 = relativeLuminance(r1, g1, b1);
  const l2 = relativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ChartPoint {
  id: string;
  date: string;
  value: number;
  displayDate?: string;
}

export function buildHistoryChartAccessibilityLabel(points: ChartPoint[], unit: string, locale: 'en' | 'ta' = 'en'): string {
  if (!points.length) {
    return locale === 'ta' ? 'விவரங்கள் இல்லை' : 'No recorded observations';
  }
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const count = sorted.length;
  const valuesStr = sorted.map(p => `${p.date}: ${p.value} ${unit}`).join(', ');

  if (locale === 'ta') {
    return `காலவரிசை வரைபடம்: ${count} பதிவுகள். ${valuesStr}`;
  }
  return `Timeline chart: ${count} recorded observation${count === 1 ? '' : 's'}. ${valuesStr}`;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export function buildRecordsChartAccessibilityLabel(categories: CategoryCount[], locale: 'en' | 'ta' = 'en'): string {
  const total = categories.reduce((sum, c) => sum + c.count, 0);
  const breakdown = categories.map(c => `${c.category}: ${c.count}`).join(', ');

  if (locale === 'ta') {
    return `ஆவணங்கள் வரைபடம்: மொத்தம் ${total} ஆவணங்கள். ${breakdown}`;
  }
  return `Document vault breakdown: ${total} total documents. ${breakdown}`;
}

export function buildReadinessChartAccessibilityLabel(done: number, total: number, locale: 'en' | 'ta' = 'en'): string {
  const pct = total ? Math.round((done / total) * 100) : 0;
  if (locale === 'ta') {
    return `தயாரிப்பு முன்னேற்றம்: ${total} இல் ${done} முடிந்தது (${pct}%)`;
  }
  return `Consultation readiness: ${done} of ${total} tasks complete (${pct}%)`;
}
