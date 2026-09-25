import { isFactType, type FactType, type FactValue } from '@oncobrief/domain';
import type { CandidateDraft, ExtractionInput, ExtractionPort, LLMProvider } from '@oncobrief/ports';

/**
 * Adapts an `LLMProvider` to the existing `ExtractionPort`, so the AWS/Bedrock
 * extraction path feeds the **same** deterministic promoter as the rule-based
 * extractor. The provider proposes; the promoter validates spans and writes the
 * ledger. See ADR 0015 and architecture §16.3, §17.
 */
export class LlmExtractionAdapter implements ExtractionPort {
  readonly name: string;
  readonly version: string;

  constructor(private readonly provider: LLMProvider) {
    this.name = provider.name;
    this.version = provider.model;
  }

  async extract(input: ExtractionInput): Promise<CandidateDraft[]> {
    const response = await this.provider.extract_document({
      documentId: input.documentId,
      patientId: input.patientId,
      documentType: input.documentType,
      documentDate: input.documentDate,
      issuingFacility: input.issuingFacility,
      pageText: input.pageText,
      spans: input.spans,
      correlationId: input.correlationId ?? '',
    });

    const candidates: CandidateDraft[] = [];
    for (const fact of response.facts) {
      if (!isFactType(fact.factType)) continue;
      candidates.push({
        factType: fact.factType as FactType,
        value: fact.value as FactValue,
        verbatimQuote: fact.verbatimQuote,
        spanIds: fact.spanIds,
        confidenceRaw: fact.confidence,
        extractorName: this.provider.name,
        extractorVersion: response.model,
        observedOn: fact.date ?? null,
      });
    }
    return candidates;
  }
}
