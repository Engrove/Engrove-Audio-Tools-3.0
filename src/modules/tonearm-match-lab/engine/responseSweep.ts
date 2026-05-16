import {
  calculateTotalMovingMass,
  type ResonanceInput,
} from './resonance.js';

export type ResponseModel = 'absolute_base_excited_response';

export type ResponseSweepInput = ResonanceInput & {
  qFactor?: number;
  stylusAmplitudeMm?: number;
  fMinHz?: number;
  fMaxHz?: number;
  points?: number;
  accelerationLimitG?: number;
};

export type ResponseSweepPoint = {
  frequencyHz: number;
  beta: number;
  transmissibility: number;
  displacementMm: number;
  displacementOvershootRatio: number;
  accelerationG: number;
  accelerationSafe: boolean;
};

export type ResponseSweepResult = {
  model: ResponseModel;
  totalMovingMassG: number;
  naturalFrequencyHz: number;
  qFactor: number;
  stylusAmplitudeMm: number;
  accelerationLimitG: number;
  maxDisplacement: ResponseSweepPoint;
  maxAcceleration: ResponseSweepPoint;
  points: ResponseSweepPoint[];
};

export type ResponseSweepAssessment = {
  accelerationSafe: boolean;
  peakAccelerationG: number;
  peakAccelerationFrequencyHz: number;
  peakDisplacementMm: number;
  peakDisplacementFrequencyHz: number;
};

const gravityMmPerS2 = 9806.65;
const defaultAccelerationLimitG = 0.05;
const naturalFrequencyConstant = 1000 / (2 * Math.PI);

function assertPositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero.`);
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function maxBy<T>(items: readonly T[], selector: (item: T) => number): T {
  if (items.length === 0) {
    throw new RangeError('Cannot find maximum of an empty array.');
  }

  return items.reduce((best, item) =>
    selector(item) > selector(best) ? item : best,
  );
}

function absoluteBaseExcitedTransmissibility(beta: number, qFactor: number): number {
  const dampingTerm = beta / qFactor;

  return Math.sqrt(1 + dampingTerm ** 2) / Math.sqrt(
    (1 - beta ** 2) ** 2 + dampingTerm ** 2,
  );
}

export function calculateResponseSweep(input: ResponseSweepInput): ResponseSweepResult {
  const totalMovingMassG = calculateTotalMovingMass(input);

  const qFactor = input.qFactor ?? 3.33;
  const stylusAmplitudeMm = input.stylusAmplitudeMm ?? 0.1;
  const fMinHz = input.fMinHz ?? 0.016;
  const fMaxHz = input.fMaxHz ?? 31.5;
  const points = input.points ?? 240;
  const accelerationLimitG = input.accelerationLimitG ?? defaultAccelerationLimitG;

  assertPositiveNumber(qFactor, 'qFactor');
  assertPositiveNumber(stylusAmplitudeMm, 'stylusAmplitudeMm');
  assertPositiveNumber(fMinHz, 'fMinHz');
  assertPositiveNumber(fMaxHz, 'fMaxHz');
  assertPositiveNumber(accelerationLimitG, 'accelerationLimitG');

  if (fMaxHz <= fMinHz) {
    throw new RangeError('fMaxHz must be greater than fMinHz.');
  }

  if (!Number.isInteger(points) || points < 2) {
    throw new RangeError('points must be an integer greater than one.');
  }

  const naturalFrequencyHz =
    naturalFrequencyConstant / Math.sqrt(totalMovingMassG * input.compliance10HzCu);

  const sweepPoints: ResponseSweepPoint[] = [];

  for (let index = 0; index < points; index += 1) {
    const frequencyHz = fMinHz + (index * (fMaxHz - fMinHz)) / (points - 1);
    const beta = frequencyHz / naturalFrequencyHz;
    const transmissibility = absoluteBaseExcitedTransmissibility(beta, qFactor);
    const displacementMm = stylusAmplitudeMm * transmissibility;
    const omega = 2 * Math.PI * frequencyHz;
    const accelerationG = (omega ** 2 * displacementMm) / gravityMmPerS2;

    sweepPoints.push({
      frequencyHz: round(frequencyHz, 4),
      beta: round(beta, 5),
      transmissibility: round(transmissibility, 6),
      displacementMm: round(displacementMm, 6),
      displacementOvershootRatio: round(displacementMm / stylusAmplitudeMm, 6),
      accelerationG: round(accelerationG, 6),
      accelerationSafe: accelerationG <= accelerationLimitG,
    });
  }

  return {
    model: 'absolute_base_excited_response',
    totalMovingMassG: round(totalMovingMassG, 4),
    naturalFrequencyHz: round(naturalFrequencyHz, 4),
    qFactor: round(qFactor, 4),
    stylusAmplitudeMm: round(stylusAmplitudeMm, 4),
    accelerationLimitG,
    maxDisplacement: maxBy(sweepPoints, (point) => point.displacementMm),
    maxAcceleration: maxBy(sweepPoints, (point) => point.accelerationG),
    points: sweepPoints,
  };
}
