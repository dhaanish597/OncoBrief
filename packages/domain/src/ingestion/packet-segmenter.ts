export interface OcrPageInput {
  documentId?: string;
  pageNumber: number;
  plainText?: string;
  fixture?: { plainText: string; spans?: unknown[] };
  spans?: readonly { text: string }[];
}

export type SubDocumentCategory =
  | 'Pathology'
  | 'Laboratory'
  | 'Imaging'
  | 'Discharge Summary'
  | 'OPD Consultation'
  | 'Prescription'
  | 'Invoice'
  | 'Other';

export interface PacketSubDocument {
  index: number;
  startPage: number;
  endPage: number;
  category: SubDocumentCategory;
  statedDate: string | null;
  statedFacility: string | null;
  confidence: number;
}

const CATEGORY_PATTERNS: Array<{ category: SubDocumentCategory; pattern: RegExp; confidence: number }> = [
  { category: 'Pathology', pattern: /\b(HISTOPATHOLOGY|BIOPSY|CYTOPATHOLOGY|SURGICAL PATHOLOGY|IMMUNOHISTOCHEMISTRY|IHC REPORT)\b/i, confidence: 0.95 },
  { category: 'Laboratory', pattern: /\b(LABORATORY REPORT|COMPLETE BLOOD COUNT|BIOCHEMISTRY|HEMOGRAM|CBC REPORT|BLOOD REPORT|LIPID PROFILE|LIVER FUNCTION TEST|LFT|KFT)\b/i, confidence: 0.95 },
  { category: 'Imaging', pattern: /\b(PET-CT|MRI|CT SCAN|ULTRASOUND|X-RAY|RADIOLOGY REPORT|IMAGING REPORT|WHOLE BODY SCAN)\b/i, confidence: 0.95 },
  { category: 'Discharge Summary', pattern: /\b(DISCHARGE SUMMARY|DISCHARGE CERTIFICATE|INPATIENT SUMMARY|DISCHARGE NOTE)\b/i, confidence: 0.95 },
  { category: 'OPD Consultation', pattern: /\b(OPD CONSULTATION|OUTPATIENT RECORD|CLINICAL VISIT NOTE|CONSULTATION NOTE|ONCOLOGY OPD)\b/i, confidence: 0.92 },
  { category: 'Prescription', pattern: /\b(PRESCRIPTION|RX|MEDICATION ORDER|PHARMACY ORDER)\b/i, confidence: 0.9 },
  { category: 'Invoice', pattern: /\b(INVOICE|TAX INVOICE|BILLING SUMMARY|PATIENT BILL|PAYMENT RECEIPT)\b/i, confidence: 0.9 },
];

function extractDate(text: string): string | null {
  // ISO: 2026-05-14
  const isoMatch = text.match(/\b(20\d\d-[01]\d-[0-3]\d)\b/);
  if (isoMatch?.[1]) return isoMatch[1];

  // DD/MM/YYYY or DD-MM-YYYY
  const numMatch = text.match(/\b([0-3]?\d)[/-]([01]?\d)[/-](20\d\d)\b/);
  if (numMatch?.[1] && numMatch[2] && numMatch[3]) {
    const day = numMatch[1].padStart(2, '0');
    const month = numMatch[2].padStart(2, '0');
    const year = numMatch[3];
    return `${year}-${month}-${day}`;
  }

  // DD Month YYYY: 14 May 2026, 14-May-2026, 14 Mar 2026
  const monthNames: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };
  const namedMatch = text.match(/\b([0-3]?\d)[-\s]+([A-Za-z]{3,9})[-\s]+(20\d\d)\b/);
  if (namedMatch?.[1] && namedMatch[2] && namedMatch[3]) {
    const mStr = namedMatch[2].toLowerCase();
    const mNum = monthNames[mStr];
    if (mNum) {
      const day = namedMatch[1].padStart(2, '0');
      const year = namedMatch[3];
      return `${year}-${mNum}-${day}`;
    }
  }

  return null;
}

function extractFacility(text: string): string | null {
  const facilityMatch = text.match(
    /(?:Issued by|Hospital|Centre|Center|Institute|Laboratory|Lab)[:\s]*([A-Za-z0-9&., -]{4,40}(?:Hospital|Centre|Center|Institute|Lab|Laboratory|Cancer Centre))/i,
  );
  if (facilityMatch?.[1]) {
    return facilityMatch[1].trim();
  }

  const knownProviders = [
    'Tata Memorial Hospital',
    'Apollo Cancer Centre',
    'Apollo Hospitals',
    'AIIMS Delhi',
    'AIIMS',
    'Max Super Speciality Hospital',
    'Fortis Healthcare',
    'Kidwai Memorial Institute of Oncology',
    'Regional Cancer Centre',
  ];
  for (const prov of knownProviders) {
    if (text.toLowerCase().includes(prov.toLowerCase())) {
      return prov;
    }
  }

  return null;
}

function detectPageCategory(text: string): { category: SubDocumentCategory; confidence: number } | null {
  for (const entry of CATEGORY_PATTERNS) {
    if (entry.pattern.test(text)) {
      return { category: entry.category, confidence: entry.confidence };
    }
  }
  return null;
}

function hasPageReset(text: string): boolean {
  return /\b(Page\s+1\s+of\s+\d+|Page\s+1\s*\/\s*\d+|Page:\s*1\b)\b/i.test(text);
}

/**
 * Automatically segments multi-report outside PDFs into virtual sub-documents,
 * identifies canonical report categories, and extracts stated report dates and facilities.
 * (Damani et al., 2026)
 */
export function segmentDocumentPacket(pages: readonly OcrPageInput[]): readonly PacketSubDocument[] {
  if (pages.length === 0) return [];

  interface PageData {
    pageNumber: number;
    text: string;
    detectedCategory: SubDocumentCategory | null;
    confidence: number;
    statedDate: string | null;
    statedFacility: string | null;
    isPageReset: boolean;
  }

  const parsedPages: PageData[] = pages.map((page) => {
    const text =
      page.plainText ??
      page.fixture?.plainText ??
      page.spans?.map((s) => s.text).join('\n') ??
      '';
    const cat = detectPageCategory(text);
    return {
      pageNumber: page.pageNumber,
      text,
      detectedCategory: cat?.category ?? null,
      confidence: cat?.confidence ?? 0.8,
      statedDate: extractDate(text),
      statedFacility: extractFacility(text),
      isPageReset: hasPageReset(text),
    };
  });

  const subDocs: PacketSubDocument[] = [];
  let currentSubDoc: {
    startPage: number;
    endPage: number;
    category: SubDocumentCategory;
    statedDate: string | null;
    statedFacility: string | null;
    confidence: number;
  } | null = null;

  for (let i = 0; i < parsedPages.length; i++) {
    const p = parsedPages[i]!;
    const isFirstPage = i === 0;

    const startsNewReport =
      isFirstPage ||
      p.isPageReset ||
      (p.detectedCategory !== null &&
        currentSubDoc !== null &&
        p.detectedCategory !== currentSubDoc.category);

    if (startsNewReport) {
      if (currentSubDoc) {
        subDocs.push({
          index: subDocs.length,
          startPage: currentSubDoc.startPage,
          endPage: currentSubDoc.endPage,
          category: currentSubDoc.category,
          statedDate: currentSubDoc.statedDate,
          statedFacility: currentSubDoc.statedFacility,
          confidence: currentSubDoc.confidence,
        });
      }

      currentSubDoc = {
        startPage: p.pageNumber,
        endPage: p.pageNumber,
        category: p.detectedCategory ?? 'Other',
        statedDate: p.statedDate,
        statedFacility: p.statedFacility,
        confidence: p.confidence,
      };
    } else if (currentSubDoc) {
      currentSubDoc.endPage = p.pageNumber;
      if (!currentSubDoc.statedDate && p.statedDate) {
        currentSubDoc.statedDate = p.statedDate;
      }
      if (!currentSubDoc.statedFacility && p.statedFacility) {
        currentSubDoc.statedFacility = p.statedFacility;
      }
      if (currentSubDoc.category === 'Other' && p.detectedCategory) {
        currentSubDoc.category = p.detectedCategory;
        currentSubDoc.confidence = p.confidence;
      }
    }
  }

  if (currentSubDoc) {
    subDocs.push({
      index: subDocs.length,
      startPage: currentSubDoc.startPage,
      endPage: currentSubDoc.endPage,
      category: currentSubDoc.category,
      statedDate: currentSubDoc.statedDate,
      statedFacility: currentSubDoc.statedFacility,
      confidence: currentSubDoc.confidence,
    });
  }

  return subDocs;
}
