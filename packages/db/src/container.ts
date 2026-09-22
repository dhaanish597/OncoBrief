import { env } from './env.js';
import {
  FixtureOcrAdapter,
  LocalFsStorageAdapter,
  RuleBasedExtractor,
  SimulatedDeliveryAdapter,
  SystemClock,
} from '@oncobrief/adapters';
import type { ClockPort, DeliveryPort, ExtractionPort, OcrPort, StoragePort } from '@oncobrief/ports';

/**
 * Port wiring. Adapters are selected from the environment; the rest of the
 * application depends only on the interface (architecture §2.3).
 */

let storage: StoragePort | null = null;
let ocr: OcrPort | null = null;
let extractor: ExtractionPort | null = null;
let delivery: DeliveryPort | null = null;

export function getStorage(): StoragePort {
  if (!storage) {
    if (env.storageDriver === 's3') {
      throw new Error(
        'storage_driver_s3_not_wired: set STORAGE_DRIVER=fs or implement S3StorageAdapter (ADR 0007, 0013)',
      );
    }
    storage = new LocalFsStorageAdapter(env.storageFsRoot, env.sessionSecret);
  }
  return storage;
}

export function getOcr(): OcrPort {
  if (!ocr) ocr = new FixtureOcrAdapter();
  return ocr;
}

export function getExtractor(): ExtractionPort {
  if (!extractor) extractor = new RuleBasedExtractor();
  return extractor;
}

export function getDelivery(): DeliveryPort {
  if (!delivery) delivery = new SimulatedDeliveryAdapter();
  return delivery;
}

export function getClock(): ClockPort {
  return new SystemClock();
}

/** Test seam: inject fakes without touching module state. */
export function setPorts(p: {
  storage?: StoragePort | null;
  ocr?: OcrPort | null;
  extractor?: ExtractionPort | null;
  delivery?: DeliveryPort | null;
}): void {
  if (p.storage !== undefined) storage = p.storage;
  if (p.ocr !== undefined) ocr = p.ocr;
  if (p.extractor !== undefined) extractor = p.extractor;
  if (p.delivery !== undefined) delivery = p.delivery;
}
