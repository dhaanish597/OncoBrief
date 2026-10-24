/**
 * Deterministic derived clinical metrics.
 *
 * Implements standard, peer-reviewed physiological calculation methods
 * (DuBois & DuBois BSA, Mosteller BSA, Quetelet BMI).
 *
 * Safety & Non-Clinical Boundary:
 * Every calculation is strictly mathematical and labeled as derived.
 * The system never infers or fabricates missing height or weight inputs.
 * Calculation inputs, their collection/observation dates, and the formula used
 * are explicitly preserved for clinical audit.
 */

export interface MeasurementInput {
  value: number;
  unit: string;
  observedOn: string | null;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  sourcePageNumber?: number | null;
  state?: string;
}

export interface DerivedCalculationResult {
  derived: true;
  formula: string;
  methodName: string;
  value: number;
  formattedValue: string;
  unit: string;
  inputs: {
    height?: MeasurementInput;
    weight?: MeasurementInput;
  };
  inputDates: {
    heightDate: string | null;
    weightDate: string | null;
  };
  notes: string[];
}

export interface DerivedCalculationUnavailable {
  derived: false;
  reason: 'missing_height' | 'missing_weight' | 'missing_both' | 'invalid_values';
  message: string;
}

export type DerivedMetricResult = DerivedCalculationResult | DerivedCalculationUnavailable;

/**
 * Calculate Body Mass Index (BMI).
 * Formula: Weight (kg) / [Height (m)]^2 = Weight (kg) / [Height (cm) / 100]^2
 */
export function calculateBMI(
  heightInput?: MeasurementInput | null,
  weightInput?: MeasurementInput | null,
): DerivedMetricResult {
  if (!heightInput && !weightInput) {
    return {
      derived: false,
      reason: 'missing_both',
      message: 'Both height and weight measurements are required to calculate derived BMI.',
    };
  }
  if (!heightInput) {
    return {
      derived: false,
      reason: 'missing_height',
      message: 'Height measurement is missing; BMI cannot be derived.',
    };
  }
  if (!weightInput) {
    return {
      derived: false,
      reason: 'missing_weight',
      message: 'Weight measurement is missing; BMI cannot be derived.',
    };
  }

  const heightCm = normalizeHeightToCm(heightInput.value, heightInput.unit);
  const weightKg = normalizeWeightToKg(weightInput.value, weightInput.unit);

  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg) || heightCm <= 0 || weightKg <= 0 || heightCm > 300 || weightKg > 500) {
    return {
      derived: false,
      reason: 'invalid_values',
      message: 'Documented height or weight values are out of physiological bounds.',
    };
  }

  const heightM = heightCm / 100;
  const rawBMI = weightKg / (heightM * heightM);
  const roundedBMI = Math.round(rawBMI * 10) / 10;

  const notes: string[] = [];
  if (heightInput.observedOn && weightInput.observedOn && heightInput.observedOn !== weightInput.observedOn) {
    notes.push(
      `Calculated from asynchronous observations: height recorded on ${heightInput.observedOn}, weight on ${weightInput.observedOn}.`,
    );
  }

  return {
    derived: true,
    formula: 'weight (kg) / [height (m)]²',
    methodName: 'Quetelet Metric BMI',
    value: roundedBMI,
    formattedValue: `${roundedBMI.toFixed(1)} kg/m²`,
    unit: 'kg/m²',
    inputs: {
      height: { ...heightInput, value: heightCm, unit: 'cm' },
      weight: { ...weightInput, value: weightKg, unit: 'kg' },
    },
    inputDates: {
      heightDate: heightInput.observedOn,
      weightDate: weightInput.observedOn,
    },
    notes,
  };
}

/**
 * Calculate Body Surface Area (BSA) using the DuBois & DuBois formula:
 * BSA (m²) = 0.007184 × Weight (kg)^0.425 × Height (cm)^0.725
 */
export function calculateBSADuBois(
  heightInput?: MeasurementInput | null,
  weightInput?: MeasurementInput | null,
): DerivedMetricResult {
  if (!heightInput && !weightInput) {
    return {
      derived: false,
      reason: 'missing_both',
      message: 'Both height and weight measurements are required to calculate derived BSA.',
    };
  }
  if (!heightInput) {
    return {
      derived: false,
      reason: 'missing_height',
      message: 'Height measurement is missing; BSA cannot be derived.',
    };
  }
  if (!weightInput) {
    return {
      derived: false,
      reason: 'missing_weight',
      message: 'Weight measurement is missing; BSA cannot be derived.',
    };
  }

  const heightCm = normalizeHeightToCm(heightInput.value, heightInput.unit);
  const weightKg = normalizeWeightToKg(weightInput.value, weightInput.unit);

  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg) || heightCm <= 0 || weightKg <= 0 || heightCm > 300 || weightKg > 500) {
    return {
      derived: false,
      reason: 'invalid_values',
      message: 'Documented height or weight values are out of physiological bounds.',
    };
  }

  const rawBSA = 0.007184 * Math.pow(weightKg, 0.425) * Math.pow(heightCm, 0.725);
  const roundedBSA = Math.round(rawBSA * 100) / 100;

  const notes: string[] = [];
  if (heightInput.observedOn && weightInput.observedOn && heightInput.observedOn !== weightInput.observedOn) {
    notes.push(
      `Calculated from asynchronous observations: height recorded on ${heightInput.observedOn}, weight on ${weightInput.observedOn}.`,
    );
  }

  return {
    derived: true,
    formula: '0.007184 × weight (kg)^0.425 × height (cm)^0.725',
    methodName: 'DuBois & DuBois (1916)',
    value: roundedBSA,
    formattedValue: `${roundedBSA.toFixed(2)} m²`,
    unit: 'm²',
    inputs: {
      height: { ...heightInput, value: heightCm, unit: 'cm' },
      weight: { ...weightInput, value: weightKg, unit: 'kg' },
    },
    inputDates: {
      heightDate: heightInput.observedOn,
      weightDate: weightInput.observedOn,
    },
    notes,
  };
}

/**
 * Calculate Body Surface Area (BSA) using the Mosteller formula:
 * BSA (m²) = sqrt([Height (cm) × Weight (kg)] / 3600)
 */
export function calculateBSAMosteller(
  heightInput?: MeasurementInput | null,
  weightInput?: MeasurementInput | null,
): DerivedMetricResult {
  if (!heightInput || !weightInput) {
    return calculateBSADuBois(heightInput, weightInput);
  }

  const heightCm = normalizeHeightToCm(heightInput.value, heightInput.unit);
  const weightKg = normalizeWeightToKg(weightInput.value, weightInput.unit);

  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg) || heightCm <= 0 || weightKg <= 0 || heightCm > 300 || weightKg > 500) {
    return {
      derived: false,
      reason: 'invalid_values',
      message: 'Documented height or weight values are out of physiological bounds.',
    };
  }

  const rawBSA = Math.sqrt((heightCm * weightKg) / 3600);
  const roundedBSA = Math.round(rawBSA * 100) / 100;

  return {
    derived: true,
    formula: '√([height (cm) × weight (kg)] / 3600)',
    methodName: 'Mosteller (1987)',
    value: roundedBSA,
    formattedValue: `${roundedBSA.toFixed(2)} m²`,
    unit: 'm²',
    inputs: {
      height: { ...heightInput, value: heightCm, unit: 'cm' },
      weight: { ...weightInput, value: weightKg, unit: 'kg' },
    },
    inputDates: {
      heightDate: heightInput.observedOn,
      weightDate: weightInput.observedOn,
    },
    notes: [],
  };
}

function normalizeHeightToCm(val: number, unit: string): number {
  const u = unit.trim().toLowerCase();
  if (u === 'm' || u === 'meter' || u === 'meters') return val * 100;
  if (u === 'in' || u === 'inch' || u === 'inches') return val * 2.54;
  if (u === 'ft' || u === 'feet') return val * 30.48;
  return ['cm', 'centimeter', 'centimeters'].includes(u) ? val : NaN;
}

function normalizeWeightToKg(val: number, unit: string): number {
  const u = unit.trim().toLowerCase();
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return val * 0.45359237;
  if (u === 'g' || u === 'grams') return val / 1000;
  return ['kg', 'kilogram', 'kilograms'].includes(u) ? val : NaN;
}
