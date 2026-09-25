import { env } from './env';
import {
  FixtureOcrAdapter,
  LocalFsStorageAdapter,
  RuleBasedExtractor,
  S3StorageAdapter,
  SimulatedDeliveryAdapter,
  SystemClock,
} from '@oncobrief/adapters';
import type {
  ClockPort,
  DeliveryPort,
  ExtractionPort,
  OcrPort,
  PresignPutPort,
  StoragePort,
} from '@oncobrief/ports';

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
      const s3 = env.s3;
      storage = new S3StorageAdapter({
        bucket: s3.bucket,
        region: s3.region,
        credentials: {
          accessKeyId: s3.accessKeyId,
          secretAccessKey: s3.secretAccessKey,
          ...(s3.sessionToken ? { sessionToken: s3.sessionToken } : {}),
        },
        ...(s3.endpoint ? { endpoint: s3.endpoint } : {}),
        forcePathStyle: s3.forcePathStyle,
      });
    } else {
      storage = new LocalFsStorageAdapter(env.storageFsRoot, env.sessionSecret);
    }
  }
  return storage;
}

/**
 * The direct-to-bucket upload capability. Only the S3 adapter provides it; the
 * filesystem adapter does not, so `POST .../documents/upload-url` returns a
 * clear configuration error locally rather than pretending to presign.
 */
export function getPresignPut(): PresignPutPort | null {
  const s = getStorage();
  return 'presignPut' in s && typeof (s as PresignPutPort).presignPut === 'function'
    ? (s as PresignPutPort)
    : null;
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
