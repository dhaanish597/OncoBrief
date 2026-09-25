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

export * from './local-fs-storage';
export * from './fixture-ocr';
export * from './rule-based-extractor';
export * from './simulated-delivery';
export * from './nvidia-llm';
export * from './sarvam-voice';
export * from './aws-sigv4';
export * from './s3-storage';
export * from './sqs-queue';
export * from './textract-ocr';
export * from './bedrock-llm';
export * from './llm-extractor';
export * from './secrets-manager';
