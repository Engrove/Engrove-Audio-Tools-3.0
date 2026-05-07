import { diagnoseResonance } from '../engine/diagnosis.js';
import {
  calculateResonanceHz,
  calculateTotalMovingMass,
  type ResonanceInput,
} from '../engine/resonance.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} ± ${tolerance}, got ${actual}`,
  );
}

function assertThrows(run: () => unknown, message: string): void {
  try {
    run();
  } catch {
    return;
  }

  throw new Error(message);
}

const defaultInput: ResonanceInput = {
  tonearmEffectiveMassG: 12,
  cartridgeMassG: 6.5,
  fastenerMassG: 1,
  trackingForceG: 1.8,
  compliance10HzCu: 18,
};

const totalMass = calculateTotalMovingMass(defaultInput);
const defaultHz = calculateResonanceHz(defaultInput);
const defaultDiagnosis = diagnoseResonance(defaultHz);

assertApprox(totalMass, 21.3, 0.001, 'default total moving mass');
assertApprox(defaultHz, 8.1, 0.05, 'default resonance follows the specified simplified formula');
assert(defaultDiagnosis.code === 'good', 'default diagnosis should be good');

const lowHz = calculateResonanceHz({
  tonearmEffectiveMassG: 25,
  cartridgeMassG: 10,
  fastenerMassG: 1,
  trackingForceG: 2,
  compliance10HzCu: 30,
});

assert(diagnoseResonance(lowHz).code === 'poor_low', 'low resonance case should diagnose poor_low');

const highHz = calculateResonanceHz({
  tonearmEffectiveMassG: 6,
  cartridgeMassG: 4,
  fastenerMassG: 1,
  trackingForceG: 1.5,
  compliance10HzCu: 8,
});

assert(diagnoseResonance(highHz).code === 'poor_high', 'high resonance case should diagnose poor_high');

assertThrows(
  () =>
    calculateResonanceHz({
      ...defaultInput,
      compliance10HzCu: 0,
    }),
  'zero compliance should be rejected',
);

assertThrows(
  () =>
    calculateResonanceHz({
      ...defaultInput,
      tonearmEffectiveMassG: -1,
    }),
  'negative values should be rejected',
);

assertThrows(
  () =>
    calculateResonanceHz({
      ...defaultInput,
      cartridgeMassG: Number.NaN,
    }),
  'NaN should be rejected',
);

console.info('PASS tonearm match lab resonance engine checks');
