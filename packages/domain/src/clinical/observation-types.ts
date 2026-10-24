/**
 * Universal observation types and canonical analyte catalog.
 *
 * Provides deterministic mapping from variable source-documented test names
 * (e.g. "Haemoglobin", "Hb", "Hemoglobin", "HGB") to canonical observation
 * groups, while preserving verbatim names, units, flags, and source reference ranges.
 */

export interface SourceReferenceRange {
  low?: number;
  high?: number;
  text: string;
}

export type ObservationSourceFlag = 'H' | 'L' | 'NORMAL' | 'CRITICAL';

export interface StructuredObservation {
  id: string;
  patientId: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  observedOn: string | null;
  documentDate: string | null;
  canonicalKey: string;
  canonicalLabel: string;
  category: ObservationCategory;
  asWrittenName: string;
  verbatimQuote: string;
  valueText: string;
  numericValue?: number;
  unitText?: string;
  referenceRange?: SourceReferenceRange;
  flag?: ObservationSourceFlag;
  state: 'extracted' | 'verified' | 'conflicting' | 'corrected' | 'rejected' | 'superseded';
  confidenceBand?: string;
  extractorName?: string;
  reviewerName?: string | null;
  reviewedAt?: string | null;
}

export type ObservationCategory =
  | 'hematology'
  | 'biochemistry'
  | 'tumor_marker'
  | 'vital_baseline'
  | 'pathology_biomarker'
  | 'molecular'
  | 'treatment_response'
  | 'other';

export interface AnalyteDefinition {
  key: string;
  label: string;
  category: ObservationCategory;
  isNumeric: boolean;
  defaultUnit?: string;
  aliases: string[];
}

export const ANALYTE_CATALOG: readonly AnalyteDefinition[] = [
  // ─── Haematology & CBC ───────────────────────────────────────────────────
  {
    key: 'haemoglobin',
    label: 'Haemoglobin',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: 'g/dL',
    aliases: ['haemoglobin', 'hemoglobin', 'hb', 'hgb', 'blood hb'],
  },
  {
    key: 'rbc',
    label: 'RBC Count',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: 'million/uL',
    aliases: ['rbc', 'red blood cells', 'red blood cell count', 'erythrocyte count'],
  },
  {
    key: 'wbc',
    label: 'Total Leucocyte Count (WBC)',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '/uL',
    aliases: ['total leucocyte count', 'total leukocyte count', 'tlc', 'wbc', 'white blood cells', 'leucocyte count', 'leukocyte count', 'white blood cell count'],
  },
  {
    key: 'platelets',
    label: 'Platelet Count',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '/uL',
    aliases: ['platelet count', 'platelets', 'plt', 'total platelet count'],
  },
  {
    key: 'anc',
    label: 'Absolute Neutrophil Count (ANC)',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '/uL',
    aliases: ['absolute neutrophil count', 'anc', 'neutrophils absolute'],
  },
  {
    key: 'abs_lymphocytes',
    label: 'Absolute Lymphocyte Count',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '/uL',
    aliases: ['absolute lymphocyte count', 'alc', 'lymphocytes absolute'],
  },
  {
    key: 'hematocrit',
    label: 'Haematocrit (HCT/PCV)',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '%',
    aliases: ['haematocrit', 'hematocrit', 'hct', 'pcv', 'packed cell volume'],
  },
  {
    key: 'mcv',
    label: 'Mean Corpuscular Volume (MCV)',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: 'fL',
    aliases: ['mcv', 'mean corpuscular volume', 'mean cell volume'],
  },
  {
    key: 'mch',
    label: 'Mean Corpuscular Haemoglobin (MCH)',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: 'pg',
    aliases: ['mch', 'mean corpuscular haemoglobin', 'mean cell haemoglobin', 'mean corpuscular hemoglobin'],
  },
  {
    key: 'mchc',
    label: 'MCHC',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: 'g/dL',
    aliases: ['mchc', 'mean corpuscular haemoglobin concentration', 'mean cell haemoglobin concentration'],
  },
  {
    key: 'rdw',
    label: 'RDW',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '%',
    aliases: ['rdw', 'red cell distribution width'],
  },
  {
    key: 'reticulocytes',
    label: 'Reticulocyte Count',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '%',
    aliases: ['reticulocytes', 'reticulocyte count', 'retic'],
  },
  {
    key: 'neutrophils_pct',
    label: 'Neutrophils %',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '%',
    aliases: ['neutrophils', 'neutrophils %', 'neutrophils percentage', 'polymorphs', 'polys %'],
  },
  {
    key: 'lymphocytes_pct',
    label: 'Lymphocytes %',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '%',
    aliases: ['lymphocytes', 'lymphocytes %', 'lymphocytes percentage'],
  },
  {
    key: 'monocytes_pct',
    label: 'Monocytes %',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '%',
    aliases: ['monocytes', 'monocytes %', 'monocytes percentage'],
  },
  {
    key: 'eosinophils_pct',
    label: 'Eosinophils %',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '%',
    aliases: ['eosinophils', 'eosinophils %', 'eosinophils percentage'],
  },
  {
    key: 'basophils_pct',
    label: 'Basophils %',
    category: 'hematology',
    isNumeric: true,
    defaultUnit: '%',
    aliases: ['basophils', 'basophils %', 'basophils percentage'],
  },

  // ─── Biochemistry & Organ Function ───────────────────────────────────────
  {
    key: 'creatinine',
    label: 'Serum Creatinine',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/dL',
    aliases: ['creatinine', 'serum creatinine', 's. creatinine', 'creat', 'sr creatinine'],
  },
  {
    key: 'egfr',
    label: 'eGFR',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mL/min/1.73m²',
    aliases: ['egfr', 'estimated gfr', 'glomerular filtration rate', 'gfr estimated'],
  },
  {
    key: 'bilirubin_total',
    label: 'Total Bilirubin',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/dL',
    aliases: ['total bilirubin', 'bilirubin total', 's. bilirubin total', 't. bilirubin', 'sr bilirubin total'],
  },
  {
    key: 'bilirubin_direct',
    label: 'Direct Bilirubin',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/dL',
    aliases: ['direct bilirubin', 'bilirubin direct', 'conjugated bilirubin'],
  },
  {
    key: 'ldh',
    label: 'Lactate Dehydrogenase (LDH)',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'U/L',
    aliases: ['ldh', 'lactate dehydrogenase', 'serum ldh', 's. ldh'],
  },
  {
    key: 'alt',
    label: 'Alanine Transaminase (ALT/SGPT)',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'U/L',
    aliases: ['alt', 'sgpt', 'alanine aminotransferase', 'alanine transaminase'],
  },
  {
    key: 'ast',
    label: 'Aspartate Transaminase (AST/SGOT)',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'U/L',
    aliases: ['ast', 'sgot', 'aspartate aminotransferase', 'aspartate transaminase'],
  },
  {
    key: 'alp',
    label: 'Alkaline Phosphatase (ALP)',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'U/L',
    aliases: ['alp', 'alkaline phosphatase', 'alk phos'],
  },
  {
    key: 'ggt',
    label: 'Gamma-GT (GGT)',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'U/L',
    aliases: ['ggt', 'gamma-gt', 'gamma gt', 'gamma glutamyl transferase', 'gamma-glutamyl transpeptidase'],
  },
  {
    key: 'urea',
    label: 'Blood Urea',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/dL',
    aliases: ['blood urea', 'urea', 'bun', 'blood urea nitrogen'],
  },
  {
    key: 'uric_acid',
    label: 'Uric Acid',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/dL',
    aliases: ['uric acid', 's. uric acid', 'serum uric acid'],
  },
  {
    key: 'albumin',
    label: 'Serum Albumin',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'g/dL',
    aliases: ['albumin', 'serum albumin', 's. albumin'],
  },
  {
    key: 'total_protein',
    label: 'Total Protein',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'g/dL',
    aliases: ['total protein', 'serum total protein'],
  },
  {
    key: 'electrolytes_sodium',
    label: 'Serum Sodium',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mmol/L',
    aliases: ['sodium', 'serum sodium', 'na+'],
  },
  {
    key: 'electrolytes_potassium',
    label: 'Serum Potassium',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mmol/L',
    aliases: ['potassium', 'serum potassium', 'k+'],
  },
  {
    key: 'calcium',
    label: 'Serum Calcium',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/dL',
    aliases: ['calcium', 'serum calcium', 's. calcium'],
  },
  {
    key: 'magnesium',
    label: 'Serum Magnesium',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/dL',
    aliases: ['magnesium', 'serum magnesium', 's. magnesium'],
  },
  {
    key: 'phosphate',
    label: 'Serum Phosphate',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/dL',
    aliases: ['phosphate', 'serum phosphate', 'phosphorus', 'inorganic phosphate'],
  },
  {
    key: 'glucose',
    label: 'Blood Glucose',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/dL',
    aliases: ['glucose', 'blood glucose', 'blood sugar', 'rbs', 'fbs', 'random blood sugar', 'fasting blood sugar'],
  },

  // ─── Coagulation, Inflammation & Other Lab Values ─────────────────────────
  {
    key: 'pt_inr',
    label: 'PT / INR',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'INR',
    aliases: ['pt', 'inr', 'pt/inr', 'prothrombin time', 'international normalised ratio'],
  },
  {
    key: 'aptt',
    label: 'aPTT',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'sec',
    aliases: ['aptt', 'aptt', 'activated partial thromboplastin time', 'ptt'],
  },
  {
    key: 'fibrinogen',
    label: 'Fibrinogen',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/dL',
    aliases: ['fibrinogen', 'serum fibrinogen'],
  },
  {
    key: 'd_dimer',
    label: 'D-Dimer',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'µg/mL',
    aliases: ['d-dimer', 'd dimer', 'ddimer'],
  },
  {
    key: 'crp',
    label: 'C-Reactive Protein (CRP)',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mg/L',
    aliases: ['crp', 'c-reactive protein', 'c reactive protein'],
  },
  {
    key: 'esr',
    label: 'ESR',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mm/hr',
    aliases: ['esr', 'erythrocyte sedimentation rate'],
  },
  {
    key: 'ferritin',
    label: 'Serum Ferritin',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'ng/mL',
    aliases: ['ferritin', 'serum ferritin', 's. ferritin'],
  },
  {
    key: 'lactate',
    label: 'Serum Lactate',
    category: 'biochemistry',
    isNumeric: true,
    defaultUnit: 'mmol/L',
    aliases: ['lactate', 'serum lactate', 'blood lactate'],
  },

  // ─── Tumour Markers & Quantitative Biomarkers ──────────────────────────────
  {
    key: 'ca_15_3',
    label: 'CA 15-3',
    category: 'tumor_marker',
    isNumeric: true,
    defaultUnit: 'U/mL',
    aliases: ['ca 15-3', 'ca 15.3', 'ca15-3', 'ca15.3', 'cancer antigen 15-3'],
  },
  {
    key: 'cea',
    label: 'Carcinoembryonic Antigen (CEA)',
    category: 'tumor_marker',
    isNumeric: true,
    defaultUnit: 'ng/mL',
    aliases: ['cea', 'carcinoembryonic antigen'],
  },
  {
    key: 'ca_125',
    label: 'CA-125',
    category: 'tumor_marker',
    isNumeric: true,
    defaultUnit: 'U/mL',
    aliases: ['ca-125', 'ca 125', 'ca125', 'cancer antigen 125'],
  },
  {
    key: 'ca_19_9',
    label: 'CA 19-9',
    category: 'tumor_marker',
    isNumeric: true,
    defaultUnit: 'U/mL',
    aliases: ['ca 19-9', 'ca 19.9', 'ca19-9', 'ca19.9', 'cancer antigen 19-9'],
  },
  {
    key: 'afp',
    label: 'Alpha-Fetoprotein (AFP)',
    category: 'tumor_marker',
    isNumeric: true,
    defaultUnit: 'ng/mL',
    aliases: ['afp', 'alpha-fetoprotein', 'alpha fetoprotein'],
  },
  {
    key: 'beta_hcg',
    label: 'Beta-hCG',
    category: 'tumor_marker',
    isNumeric: true,
    defaultUnit: 'mIU/mL',
    aliases: ['beta-hcg', 'beta hcg', 'b-hcg', 'human chorionic gonadotropin'],
  },
  {
    key: 'psa',
    label: 'PSA (Prostate-Specific Antigen)',
    category: 'tumor_marker',
    isNumeric: true,
    defaultUnit: 'ng/mL',
    aliases: ['psa', 'prostate specific antigen', 'prostate-specific antigen'],
  },
  {
    key: 'thyroglobulin',
    label: 'Thyroglobulin',
    category: 'tumor_marker',
    isNumeric: true,
    defaultUnit: 'ng/mL',
    aliases: ['thyroglobulin', 'tg'],
  },
  {
    key: 'beta2_microglobulin',
    label: 'Beta-2 Microglobulin',
    category: 'tumor_marker',
    isNumeric: true,
    defaultUnit: 'mg/L',
    aliases: ['beta-2 microglobulin', 'b2m', 'beta2 microglobulin', 'b2 microglobulin'],
  },
  {
    key: 'nse',
    label: 'Neuron-Specific Enolase (NSE)',
    category: 'tumor_marker',
    isNumeric: true,
    defaultUnit: 'ng/mL',
    aliases: ['nse', 'neuron-specific enolase', 'neuron specific enolase'],
  },

  // ─── Vital Signs & Patient Baseline ───────────────────────────────────────
  {
    key: 'height',
    label: 'Height',
    category: 'vital_baseline',
    isNumeric: true,
    defaultUnit: 'cm',
    aliases: ['height', 'ht', 'stature', 'patient height'],
  },
  {
    key: 'weight',
    label: 'Weight',
    category: 'vital_baseline',
    isNumeric: true,
    defaultUnit: 'kg',
    aliases: ['weight', 'wt', 'body weight', 'patient weight'],
  },
  {
    key: 'blood_group',
    label: 'Blood Group and Rh',
    category: 'vital_baseline',
    isNumeric: false,
    aliases: ['blood group', 'blood group and rh', 'blood type', 'abo group', 'abo & rh'],
  },
  {
    key: 'allergies',
    label: 'Documented Allergies',
    category: 'vital_baseline',
    isNumeric: false,
    aliases: ['allergies', 'allergy', 'drug allergies', 'documented allergies', 'nkda'],
  },
  {
    key: 'ecog',
    label: 'ECOG Performance Status',
    category: 'vital_baseline',
    isNumeric: false,
    aliases: ['ecog', 'ecog ps', 'ecog performance status', 'performance status'],
  },
  {
    key: 'comorbidities',
    label: 'Relevant Comorbidities',
    category: 'vital_baseline',
    isNumeric: false,
    aliases: ['comorbidities', 'comorbidity', 'past medical history', 'co-morbidities'],
  },

  // ─── Pathology / Histology / IHC Biomarkers ───────────────────────────────
  {
    key: 'er',
    label: 'Estrogen Receptor (ER)',
    category: 'pathology_biomarker',
    isNumeric: false,
    aliases: ['er', 'estrogen receptor', 'er status', 'er allred'],
  },
  {
    key: 'pr',
    label: 'Progesterone Receptor (PR)',
    category: 'pathology_biomarker',
    isNumeric: false,
    aliases: ['pr', 'progesterone receptor', 'pr status'],
  },
  {
    key: 'her2',
    label: 'HER2 / neu Receptor',
    category: 'pathology_biomarker',
    isNumeric: false,
    aliases: ['her2', 'her2/neu', 'her-2', 'her2 status', 'erbb2'],
  },
  {
    key: 'ki_67',
    label: 'Ki-67 Proliferation Index',
    category: 'pathology_biomarker',
    isNumeric: true,
    defaultUnit: '%',
    aliases: ['ki-67', 'ki67', 'ki 67', 'mib-1', 'proliferation index'],
  },
  {
    key: 'pd_l1',
    label: 'PD-L1 Expression',
    category: 'pathology_biomarker',
    isNumeric: false,
    aliases: ['pd-l1', 'pd l1', 'pdl1', 'programmed death ligand 1'],
  },
  {
    key: 'histology_type',
    label: 'Histological Type',
    category: 'pathology_biomarker',
    isNumeric: false,
    aliases: ['histological type', 'histology', 'morphology', 'histopathology type'],
  },
  {
    key: 'tumour_grade',
    label: 'Tumour Grade',
    category: 'pathology_biomarker',
    isNumeric: false,
    aliases: ['grade', 'tumour grade', 'tumor grade', 'nottingham grade', 'who grade'],
  },

  // ─── Molecular / Genomic Findings ─────────────────────────────────────────
  {
    key: 'egfr_mutation',
    label: 'EGFR Mutation Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['egfr', 'egfr mutation', 'egfr status', 'epidermal growth factor receptor'],
  },
  {
    key: 'alk_fusion',
    label: 'ALK Fusion Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['alk', 'alk fusion', 'alk rearrangement', 'alk status'],
  },
  {
    key: 'ros1_fusion',
    label: 'ROS1 Fusion Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['ros1', 'ros1 fusion', 'ros1 rearrangement'],
  },
  {
    key: 'braf_mutation',
    label: 'BRAF Mutation Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['braf', 'braf mutation', 'braf v600e'],
  },
  {
    key: 'kras_mutation',
    label: 'KRAS Mutation Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['kras', 'kras mutation', 'k-ras'],
  },
  {
    key: 'nras_mutation',
    label: 'NRAS Mutation Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['nras', 'nras mutation', 'n-ras'],
  },
  {
    key: 'brca1',
    label: 'BRCA1 Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['brca1', 'brca 1', 'brca1 mutation'],
  },
  {
    key: 'brca2',
    label: 'BRCA2 Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['brca2', 'brca 2', 'brca2 mutation'],
  },
  {
    key: 'pik3ca_mutation',
    label: 'PIK3CA Mutation Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['pik3ca', 'pik3ca mutation', 'pi3k'],
  },
  {
    key: 'ntrk_fusion',
    label: 'NTRK Fusion Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['ntrk', 'ntrk fusion', 'ntrk1', 'ntrk2', 'ntrk3'],
  },
  {
    key: 'ret_fusion',
    label: 'RET Fusion / Mutation',
    category: 'molecular',
    isNumeric: false,
    aliases: ['ret', 'ret fusion', 'ret mutation', 'ret rearrangement'],
  },
  {
    key: 'met_alteration',
    label: 'MET Alteration',
    category: 'molecular',
    isNumeric: false,
    aliases: ['met', 'met amplification', 'met exon 14', 'met mutation'],
  },
  {
    key: 'msi_status',
    label: 'MSI Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['msi', 'microsatellite instability', 'msi-h', 'msi-l', 'mss', 'msi status'],
  },
  {
    key: 'mmr_status',
    label: 'MMR Status',
    category: 'molecular',
    isNumeric: false,
    aliases: ['mmr', 'mismatch repair', 'mmr status', 'dmmr', 'pmmr'],
  },
  {
    key: 'tmb',
    label: 'Tumour Mutational Burden (TMB)',
    category: 'molecular',
    isNumeric: true,
    defaultUnit: 'mut/Mb',
    aliases: ['tmb', 'tumour mutational burden', 'tumor mutational burden'],
  },

  // ─── Treatment Response & Disease Assessments ──────────────────────────────
  {
    key: 'treatment_response',
    label: 'Treatment Response Assessment',
    category: 'treatment_response',
    isNumeric: false,
    aliases: ['response', 'treatment response', 'recist response', 'cr', 'pr response', 'sd', 'pd', 'complete response', 'partial response', 'stable disease', 'progressive disease'],
  },
  {
    key: 'ecog_status',
    label: 'ECOG Performance Status (Serial)',
    category: 'treatment_response',
    isNumeric: false,
    aliases: ['ecog assessment', 'performance status assessment', 'ps assessment'],
  },
  {
    key: 'tumour_dimension',
    label: 'Tumour Dimension / RECIST Measurement',
    category: 'treatment_response',
    isNumeric: true,
    defaultUnit: 'mm',
    aliases: ['tumour size', 'tumor size', 'lesion size', 'target lesion', 'recist measurement', 'tumour dimension', 'tumor dimension', 'sum of diameters'],
  },
  {
    key: 'toxicity_grade',
    label: 'Toxicity Grade (CTCAE)',
    category: 'treatment_response',
    isNumeric: false,
    aliases: ['toxicity', 'ctcae', 'grade toxicity', 'adverse event grade', 'toxicity grade'],
  },
] as const;

/**
 * Map an as-written observation name to its canonical analyte definition.
 * If not recognized, generates a clean title-cased key under category 'other'.
 */
export function canonicalizeAnalyte(name: string): {
  key: string;
  label: string;
  category: ObservationCategory;
  isNumeric: boolean;
} {
  const norm = name.trim().toLowerCase().replace(/[-_./:]+/g, ' ').replace(/\s+/g, ' ');

  for (const def of ANALYTE_CATALOG) {
    for (const alias of def.aliases) {
      const aliasNorm = alias.toLowerCase().replace(/[-_./:]+/g, ' ').replace(/\s+/g, ' ');
      if (norm === aliasNorm || norm.startsWith(`${aliasNorm} `) || norm.endsWith(` ${aliasNorm}`)) {
        return {
          key: def.key,
          label: def.label,
          category: def.category,
          isNumeric: def.isNumeric,
        };
      }
    }
  }

  // Fallback slug for arbitrary tests (e.g. specialized assays)
  const slug = norm.replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '_');
  const label = name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return {
    key: slug || 'unnamed_test',
    label: label || 'Unnamed Observation',
    category: 'other',
    isNumeric: true, // will be verified against actual value during parsing
  };
}

/**
 * Check if two measurement units are compatible for direct chart plotting.
 * Different or incompatible units (e.g. g/dL vs mmol/L, or % vs cells) are flagged.
 */
export function areUnitsComparable(unitA?: string | null, unitB?: string | null): boolean {
  if (!unitA && !unitB) return true;
  if (!unitA || !unitB) return false;
  const a = unitA.trim().toLowerCase().replace(/\s+/g, '');
  const b = unitB.trim().toLowerCase().replace(/\s+/g, '');
  if (a === b) return true;

  // Synonymous units
  const equivalents: [string, string][] = [
    ['/ul', 'cells/mcl'],
    ['/ul', 'cells/cu.mm'],
    ['/ul', '/mcl'],
    ['cells/mcl', 'cells/cu.mm'],
    ['g/dl', 'gm/dl'],
    ['mg/dl', 'mg%'],
    ['u/l', 'iu/l'],
  ];

  for (const [x, y] of equivalents) {
    if ((a === x && b === y) || (a === y && b === x)) return true;
  }

  return false;
}

/**
 * Parse reference range text into low and high numeric boundaries if available.
 * Handles patterns such as:
 *   "12.0 - 15.0"
 *   "Ref: 12.0 - 15.0 g/dL"
 *   "< 30"
 *   "> 10"
 *   "4,000 - 11,000"
 */
export function parseReferenceRange(text?: string | null): SourceReferenceRange | undefined {
  if (!text || text.trim().length === 0) return undefined;
  const clean = text.trim();

  // Pattern: "12.0 - 15.0" or "4,000 - 11,000"
  const rangeMatch = /(?:ref(?:erence)?(?:\s+range)?[:\s]*)?([<>]?\s*[\d,]+(?:\.\d+)?)\s*(?:-|to)\s*([\d,]+(?:\.\d+)?)/i.exec(
    clean,
  );
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]!.replace(/,/g, ''));
    const high = parseFloat(rangeMatch[2]!.replace(/,/g, ''));
    return {
      low: Number.isFinite(low) ? low : undefined,
      high: Number.isFinite(high) ? high : undefined,
      text: clean,
    };
  }

  // Pattern: "< 30" or "< 5.0"
  const upperLimit = /(?:ref[:\s]*)?<\s*([\d,]+(?:\.\d+)?)/i.exec(clean);
  if (upperLimit) {
    const high = parseFloat(upperLimit[1]!.replace(/,/g, ''));
    return {
      high: Number.isFinite(high) ? high : undefined,
      text: clean,
    };
  }

  // Pattern: "> 10"
  const lowerLimit = /(?:ref[:\s]*)?>\s*([\d,]+(?:\.\d+)?)/i.exec(clean);
  if (lowerLimit) {
    const low = parseFloat(lowerLimit[1]!.replace(/,/g, ''));
    return {
      low: Number.isFinite(low) ? low : undefined,
      text: clean,
    };
  }

  return { text: clean };
}

/**
 * Parse source-reported abnormality flag.
 * Accepts: H, HIGH, L, LOW, CRITICAL, NORMAL, *, ABNORMAL
 */
export function parseSourceFlag(token?: string | null): ObservationSourceFlag | undefined {
  if (!token) return undefined;
  const t = token.trim().toUpperCase().replace(/[[\](),*]/g, '');
  if (t === 'H' || t === 'HIGH' || t === 'HH') return 'H';
  if (t === 'L' || t === 'LOW' || t === 'LL') return 'L';
  if (t === 'CRITICAL' || t === 'PANIC' || t === 'ALERT') return 'CRITICAL';
  if (t === 'NORMAL' || t === 'N' || t === 'WNL') return 'NORMAL';
  return undefined;
}
