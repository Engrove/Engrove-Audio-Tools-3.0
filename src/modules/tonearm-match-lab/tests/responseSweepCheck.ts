import {
  calculateResponseSweep,
} from '../engine/responseSweep.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertApprox(
  actual: number,
  expected: number,
  tolerance: number,
  message: string,
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

const input = {
  tonearmEffectiveMassG: 35,
  cartridgeMassG: 0,
  fastenerMassG: 0,
  trackingForceG: 0,
  compliance10HzCu: 15,
};

const sweep = calculateResponseSweep({
  ...input,
  qFactor: 3.33,
  stylusAmplitudeMm: 0.1,
  points: 240,
});

assert(sweep.model === 'absolute_base_excited_response', 'model name');
assertApprox(sweep.naturalFrequencyHz, 6.95, 0.03, 'natural frequency');
assert(sweep.points.length === 240, 'sweep point count');
assert(sweep.maxDisplacement.displacementMm > 0.1, 'resonance should create displacement overshoot');
assert(sweep.maxAcceleration.accelerationG > 0, 'acceleration must be positive');

const finalPoint = sweep.points[sweep.points.length - 1];

assert(
  finalPoint.transmissibility > 0,
  'high-frequency transmissibility must remain positive',
);

assert(
  Number.isFinite(finalPoint.accelerationG),
  'high-frequency acceleration must remain finite',
);

console.info('PASS tonearm response sweep checks');
