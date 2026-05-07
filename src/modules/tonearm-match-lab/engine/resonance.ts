import type { CartridgeRecord, TonearmRecord } from '../../../shared/audio-domain';

export type ResonanceInput = {
  tonearmEffectiveMassG: number;
  cartridgeMassG: number;
  fastenerMassG: number;
  trackingForceG: number;
  compliance10HzCu: number;
};

export type ResonanceResult = {
  totalMovingMassG: number;
  resonanceHz: number;
};

export type QuickMatchTonearmFields = Pick<TonearmRecord, 'effective_mass_g'>;
export type QuickMatchCartridgeFields = Pick<
  CartridgeRecord,
  'mass_g' | 'tracking_force_g' | 'compliance'
>;

const resonanceConstant = 159;

function assertFiniteNumber(value: number, fieldName: keyof ResonanceInput): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${fieldName} must be a finite number.`);
  }
}

function assertNonNegative(value: number, fieldName: keyof ResonanceInput): void {
  assertFiniteNumber(value, fieldName);

  if (value < 0) {
    throw new RangeError(`${fieldName} must not be negative.`);
  }
}

function assertPositive(value: number, fieldName: keyof ResonanceInput): void {
  assertFiniteNumber(value, fieldName);

  if (value <= 0) {
    throw new RangeError(`${fieldName} must be greater than zero.`);
  }
}

export function validateResonanceInput(input: ResonanceInput): void {
  assertNonNegative(input.tonearmEffectiveMassG, 'tonearmEffectiveMassG');
  assertNonNegative(input.cartridgeMassG, 'cartridgeMassG');
  assertNonNegative(input.fastenerMassG, 'fastenerMassG');
  assertNonNegative(input.trackingForceG, 'trackingForceG');
  assertPositive(input.compliance10HzCu, 'compliance10HzCu');
}

export function calculateTotalMovingMass(input: ResonanceInput): number {
  validateResonanceInput(input);

  const totalMovingMassG =
    input.tonearmEffectiveMassG +
    input.cartridgeMassG +
    input.fastenerMassG +
    input.trackingForceG;

  if (totalMovingMassG <= 0) {
    throw new RangeError('totalMovingMassG must be greater than zero.');
  }

  return totalMovingMassG;
}

export function calculateResonanceHz(input: ResonanceInput): number {
  const totalMovingMassG = calculateTotalMovingMass(input);

  /*
   * Standard simplified tonearm/cartridge resonance model:
   * resonanceHz = 159 / sqrt(total moving mass in grams * compliance at 10 Hz in cu).
   */
  return resonanceConstant / Math.sqrt(totalMovingMassG * input.compliance10HzCu);
}

export function calculateResonanceResult(input: ResonanceInput): ResonanceResult {
  const totalMovingMassG = calculateTotalMovingMass(input);

  return {
    totalMovingMassG,
    resonanceHz: resonanceConstant / Math.sqrt(totalMovingMassG * input.compliance10HzCu),
  };
}
