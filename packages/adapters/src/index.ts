import type { ClockPort } from '@oncobrief/ports';

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}

/** Fixed clock for deterministic tests and byte-identical seeds. */
export class FixedClock implements ClockPort {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export * from './local-fs-storage.js';
export * from './fixture-ocr.js';
export * from './rule-based-extractor.js';
export * from './simulated-delivery.js';
