import type { OcrPort } from '@oncobrief/ports';
import { FixtureOcrAdapter } from './fixture-ocr';
import { LocalMultimodalOcrAdapter } from './local-multimodal-ocr';
import {
  SarvamVisionOcrAdapter,
  type SarvamVisionConfig,
} from './sarvam-vision-ocr';
import { TextractOcrAdapter, type TextractConfig } from './textract-ocr';

export interface OcrRoutingConfig {
  driver: 'auto' | 'sarvam' | 'textract' | 'local-pdf' | 'fixture';
  sarvam?: SarvamVisionConfig;
  textract?: TextractConfig;
}
export function createOcrAdapter(config: OcrRoutingConfig): OcrPort {
  if (
    config.driver === 'sarvam' ||
    (config.driver === 'auto' && config.sarvam?.apiKey)
  ) {
    if (!config.sarvam?.apiKey) throw new Error('ocr_missing_sarvam_api_key');
    return new SarvamVisionOcrAdapter(config.sarvam);
  }
  if (
    config.driver === 'textract' ||
    (config.driver === 'auto' &&
      config.textract?.credentials.accessKeyId &&
      config.textract.credentials.secretAccessKey)
  ) {
    if (
      !config.textract?.credentials.accessKeyId ||
      !config.textract.credentials.secretAccessKey
    )
      throw new Error('ocr_missing_textract_configuration');
    return new TextractOcrAdapter(config.textract);
  }
  if (config.driver === 'fixture') return new FixtureOcrAdapter();
  if (config.driver !== 'auto' && config.driver !== 'local-pdf')
    throw new Error('ocr_unknown_driver');
  return new LocalMultimodalOcrAdapter();
}
