import { test } from 'node:test';
import assert from 'node:assert/strict';
import { theme as c } from '../src/theme';
import {
  calculateContrastRatio,
  buildHistoryChartAccessibilityLabel,
  buildRecordsChartAccessibilityLabel,
  buildReadinessChartAccessibilityLabel
} from '../src/accessibility';

test('theme color tokens satisfy WCAG 2.2 AA text contrast >= 4.5:1 (BUG-MOB-12 / REQ-MOB-038)', () => {
  // c.teal on c.sage badge/panel
  const tealOnSage = calculateContrastRatio(c.teal, c.sage);
  assert.ok(
    tealOnSage >= 4.5,
    `Contrast ratio for c.teal (${c.teal}) on c.sage (${c.sage}) is ${tealOnSage.toFixed(2)} (< 4.5 required for WCAG 2.2 AA)`
  );

  // c.ink on c.paper
  const inkOnPaper = calculateContrastRatio(c.ink, c.paper);
  assert.ok(inkOnPaper >= 4.5, `c.ink on c.paper ratio ${inkOnPaper.toFixed(2)} must be >= 4.5`);

  // c.muted on c.paper
  const mutedOnPaper = calculateContrastRatio(c.muted, c.paper);
  assert.ok(mutedOnPaper >= 4.5, `c.muted (${c.muted}) on c.paper (${c.paper}) ratio ${mutedOnPaper.toFixed(2)} must be >= 4.5`);
});

test('theme border token c.line satisfies WCAG 2.2 non-text contrast >= 3.0:1 against white (BUG-MOB-12 / REQ-MOB-038)', () => {
  const lineOnPaper = calculateContrastRatio(c.line, c.paper);
  assert.ok(
    lineOnPaper >= 3.0,
    `Contrast ratio for c.line (${c.line}) on c.paper (${c.paper}) is ${lineOnPaper.toFixed(2)} (< 3.0 required for UI borders)`
  );
});

test('chart accessibility label builders produce factual, non-empty, non-diagnostic descriptions (BUG-MOB-12 / REQ-MOB-039)', () => {
  // HistoryChart label
  const samplePoints = [
    { id: 'p1', date: '2026-10-14', value: 12.1 },
    { id: 'p2', date: '2026-10-24', value: 12.4 }
  ];
  const historyLabel = buildHistoryChartAccessibilityLabel(samplePoints, 'g/dL');
  assert.ok(historyLabel.length > 0, 'History chart accessibility label must not be empty');
  assert.ok(historyLabel.includes('12.1') && historyLabel.includes('12.4'), 'Must mention values');
  assert.ok(historyLabel.includes('g/dL'), 'Must mention unit');

  // Tamil localization of history label
  const historyLabelTa = buildHistoryChartAccessibilityLabel(samplePoints, 'g/dL', 'ta');
  assert.ok(/[\u0B80-\u0BFF]/.test(historyLabelTa), 'Tamil history label must contain Tamil characters');

  // RecordsChart label
  const recordsLabel = buildRecordsChartAccessibilityLabel([
    { category: 'laboratory', count: 2 },
    { category: 'pathology', count: 1 }
  ]);
  assert.ok(recordsLabel.length > 0, 'Records chart accessibility label must not be empty');
  assert.ok(recordsLabel.includes('laboratory') || recordsLabel.includes('2'), 'Must cite category or count');

  // ReadinessChart label
  const readinessLabel = buildReadinessChartAccessibilityLabel(3, 4);
  assert.ok(readinessLabel.includes('3 of 4') || readinessLabel.includes('3/4'), 'Must describe completion proportion');
});
