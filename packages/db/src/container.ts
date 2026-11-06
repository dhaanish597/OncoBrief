import { env } from './env';
import {
  BedrockLlmProvider,
  createOcrAdapter,
  createEcsCredentialsProvider,
  HttpAbdmGatewayAdapter,
  LlmExtractionAdapter,
  LocalFsStorageAdapter,
  RuleBasedExtractor,
  S3StorageAdapter,
  SimulatedAbdmGatewayAdapter,
  SimulatedDeliveryAdapter,
  SystemClock,
  WebhookDeliveryAdapter,
} from '@oncobrief/adapters';
import type {
  AbdmGatewayPort,
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
let abdmGateway: AbdmGatewayPort | null = null;

export function getStorage(): StoragePort {
  if (!storage) {
    if (env.storageDriver === 's3') {
      const s3 = env.s3;
      storage = new S3StorageAdapter({
        ...(process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ? {
          credentialProvider: createEcsCredentialsProvider(process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI),
        } : {}),
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
  // A presigned upload must not be offered without an asynchronous ingestion owner.
  if (process.env.DOCUMENT_INGESTION_MODE === 'sync') return null;
  const s = getStorage();
  return 'presignPut' in s && typeof (s as PresignPutPort).presignPut === 'function'
    ? (s as PresignPutPort)
    : null;
}

export function getOcr(): OcrPort {
  if (!ocr) {
    // Object-storage credentials (e.g. MinIO) do not configure an OCR service.
    const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];
    ocr = createOcrAdapter({
      driver: env.ocrDriver,
      sarvam: { apiKey: env.sarvamApiKey, language: process.env['OCR_LANGUAGE'] ?? 'en-IN' },
      ...(accessKeyId && secretAccessKey ? { textract: {
        region: process.env['AWS_REGION'] ?? 'ap-south-1',
        credentials: { accessKeyId, secretAccessKey, sessionToken: process.env['AWS_SESSION_TOKEN'] },
        ...(process.env['AWS_ENDPOINT_URL'] ? { endpoint: process.env['AWS_ENDPOINT_URL'] } : {}),
      }} : {}),
    });
  }
  return ocr;
}

/**
 * Dynamic Extractor Router with Resilient Fallback (`TASK-005`).
 * When `EXTRACTOR_DRIVER=bedrock` (or `auto` with AWS Bedrock credentials + model ID),
 * wraps `LlmExtractionAdapter(BedrockLlmProvider)` with an automatic fallback to
 * `RuleBasedExtractor` so transient cloud failures never drop candidate extraction.
 */
export function getExtractor(): ExtractionPort {
  if (!extractor) {
    const driver = env.extractorDriver;
    const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];
    const bedrockModelId = process.env['BEDROCK_MODEL_ID'];
    const ruleFallback = new RuleBasedExtractor();

    if (
      (driver === 'bedrock' || (driver === 'auto' && bedrockModelId && accessKeyId && secretAccessKey)) &&
      bedrockModelId &&
      accessKeyId &&
      secretAccessKey
    ) {
      const bedrockProvider = new BedrockLlmProvider({
        region: process.env['AWS_REGION'] ?? 'ap-south-1',
        modelId: bedrockModelId,
        credentials: {
          accessKeyId,
          secretAccessKey,
          ...(process.env['AWS_SESSION_TOKEN'] ? { sessionToken: process.env['AWS_SESSION_TOKEN'] } : {}),
        },
        ...(process.env['AWS_ENDPOINT_URL'] ? { endpoint: process.env['AWS_ENDPOINT_URL'] } : {}),
      });
      const llmExtractor = new LlmExtractionAdapter(bedrockProvider);
      extractor = {
        name: llmExtractor.name,
        version: llmExtractor.version,
        async extract(input) {
          try {
            const llmCandidates = await llmExtractor.extract(input);
            if (llmCandidates.length > 0) return llmCandidates;
          } catch {
            // Fall through to deterministic rule-based extractor on cloud error
          }
          return ruleFallback.extract(input);
        },
      };
    } else {
      extractor = ruleFallback;
    }
  }
  return extractor;
}

export function getDelivery(): DeliveryPort {
  if (!delivery) {
    const driver = (process.env['DELIVERY_DRIVER'] ?? 'auto').toLowerCase();
    const hasLiveDeliveryConfig = Boolean(
      process.env['DELIVERY_WEBHOOK_URL']?.trim() ||
        (process.env['TWILIO_ACCOUNT_SID']?.trim() &&
          process.env['TWILIO_AUTH_TOKEN']?.trim() &&
          process.env['TWILIO_FROM_NUMBER']?.trim()),
    );
    if (
      driver === 'webhook' ||
      driver === 'twilio' ||
      (driver === 'auto' && hasLiveDeliveryConfig)
    ) {
      delivery = new WebhookDeliveryAdapter({
        channel: process.env['DELIVERY_CHANNEL'] === 'whatsapp' ? 'whatsapp' : 'sms',
      });
    } else {
      delivery = new SimulatedDeliveryAdapter();
    }
  }
  return delivery;
}

export function getClock(): ClockPort {
  return new SystemClock();
}

export function getAbdmGateway(): AbdmGatewayPort {
  if (!abdmGateway) {
    if (env.abdm.driver === 'sandbox') {
      abdmGateway = new HttpAbdmGatewayAdapter({
        baseUrl: env.abdm.baseUrl,
        sessionUrl: env.abdm.sessionUrl,
        cmId: env.abdm.cmId,
        clientId: env.abdm.clientId,
        clientSecret: env.abdm.clientSecret,
        hipId: env.abdm.hipId,
        hiuId: env.abdm.hiuId,
      });
    } else {
      // Next compiles actions and routes separately; share the bounded loopback queue.
      const runtime = globalThis as typeof globalThis & { oncobriefSimulation?: SimulatedAbdmGatewayAdapter };
      abdmGateway = runtime.oncobriefSimulation ??= new SimulatedAbdmGatewayAdapter({
        callbackBaseUrl: env.abdm.callbackBaseUrl,
        hipId: env.abdm.hipId,
        hiuId: env.abdm.hiuId,
        dispatchDirectHttp: true,
      });
    }
  }
  return abdmGateway;
}

/** Test seam: inject fakes without touching module state. */
export function setPorts(p: {
  storage?: StoragePort | null;
  ocr?: OcrPort | null;
  extractor?: ExtractionPort | null;
  delivery?: DeliveryPort | null;
  abdmGateway?: AbdmGatewayPort | null;
}): void {
  if (p.storage !== undefined) storage = p.storage;
  if (p.ocr !== undefined) ocr = p.ocr;
  if (p.extractor !== undefined) extractor = p.extractor;
  if (p.delivery !== undefined) delivery = p.delivery;
  if (p.abdmGateway !== undefined) abdmGateway = p.abdmGateway;
}

/** Complete local loopback delivery only after the initiating transaction commits. */
export async function flushAbdmSimulation(requestId: string): Promise<void> {
  const gateway = getAbdmGateway();
  if (gateway.driver === 'simulated') await (gateway as SimulatedAbdmGatewayAdapter).flushCallbacks(requestId);
}
