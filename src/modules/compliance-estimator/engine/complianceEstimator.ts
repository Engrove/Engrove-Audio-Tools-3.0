export type ComplianceSourceType = 'dynamic-10hz' | 'dynamic-100hz' | 'static';
export type GeneratorType = 'mm-mi' | 'mc-low-output' | 'mc-high-output' | 'unknown-custom';
export type ComplianceProvenance = 'direct' | 'converted' | 'estimated' | 'custom';

export type ComplianceEstimatorInput = {
  complianceValue: number;
  sourceType: ComplianceSourceType;
  generatorType: GeneratorType;
  customMultiplier?: number;
};

export type ComplianceEstimatorResult = {
  estimatedCompliance10Hz: number;
  multiplier: number;
  provenance: ComplianceProvenance;
  confidence: 'high' | 'medium' | 'wide';
  title: string;
  note: string;
};

const generatorMultipliers: Record<Exclude<GeneratorType, 'unknown-custom'>, number> = {
  'mm-mi': 1.5,
  'mc-low-output': 2,
  'mc-high-output': 1.7,
};

export function generatorTypeLabel(generatorType: GeneratorType): string {
  switch (generatorType) {
    case 'mm-mi':
      return 'MM / MI';
    case 'mc-low-output':
      return 'MC low output';
    case 'mc-high-output':
      return 'MC high output';
    case 'unknown-custom':
      return 'Unknown / custom';
  }
}

export function sourceTypeLabel(sourceType: ComplianceSourceType): string {
  switch (sourceType) {
    case 'dynamic-10hz':
      return 'Dynamic compliance @ 10 Hz';
    case 'dynamic-100hz':
      return 'Dynamic compliance @ 100 Hz';
    case 'static':
      return 'Static compliance';
  }
}

function assertPositiveFinite(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }
}

export function estimateCompliance(input: ComplianceEstimatorInput): ComplianceEstimatorResult {
  assertPositiveFinite(input.complianceValue, 'Compliance');

  if (input.sourceType === 'dynamic-10hz') {
    return {
      estimatedCompliance10Hz: input.complianceValue,
      multiplier: 1,
      provenance: 'direct',
      confidence: 'high',
      title: 'Direct 10 Hz value',
      note: 'The published value is already dynamic compliance at 10 Hz; no conversion multiplier was applied.',
    };
  }

  if (input.sourceType === 'static') {
    return {
      estimatedCompliance10Hz: input.complianceValue * 0.5,
      multiplier: 0.5,
      provenance: 'estimated',
      confidence: 'wide',
      title: 'Static-to-dynamic estimate',
      note: 'Static compliance is approximated as a dynamic 10 Hz estimate using ×0.5. Treat this as a broad screening value.',
    };
  }

  if (input.generatorType === 'unknown-custom') {
    const customMultiplier = input.customMultiplier;
    assertPositiveFinite(customMultiplier ?? Number.NaN, 'Custom multiplier');
    const multiplier = customMultiplier as number;

    return {
      estimatedCompliance10Hz: input.complianceValue * multiplier,
      multiplier,
      provenance: 'custom',
      confidence: 'wide',
      title: 'Custom 100 Hz conversion',
      note: 'The 100 Hz value was converted with a user-supplied multiplier. Confidence depends on the cartridge generator family and manufacturer method.',
    };
  }

  const multiplier = generatorMultipliers[input.generatorType];

  return {
    estimatedCompliance10Hz: input.complianceValue * multiplier,
    multiplier,
    provenance: 'converted',
    confidence: 'medium',
    title: `${generatorTypeLabel(input.generatorType)} 100 Hz conversion`,
    note: 'The 100 Hz dynamic value was converted to a 10 Hz estimate with the reference multiplier for this generator family.',
  };
}
