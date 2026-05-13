export type VtaSraInput = {
  effectiveLengthMm: number;
  referenceSraDeg: number;
  pillarDeltaMm: number;
  matDeltaMm: number;
};

export type VtaSraResult = {
  verticalDeltaMm: number;
  ratio: number;
  sraDeltaDeg: number;
  sraActualDeg: number;
};

export type InverseVtaSraInput = {
  effectiveLengthMm: number;
  targetSraDeltaDeg: number;
};

const ratioClamp = 0.99;

function assertFinitePositive(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${fieldName} must be greater than zero.`);
  }
}

function assertFinite(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${fieldName} must be a finite number.`);
  }
}

export function computeVtaSra(input: VtaSraInput): VtaSraResult {
  assertFinitePositive(input.effectiveLengthMm, 'effectiveLengthMm');
  assertFinite(input.referenceSraDeg, 'referenceSraDeg');
  assertFinite(input.pillarDeltaMm, 'pillarDeltaMm');
  assertFinite(input.matDeltaMm, 'matDeltaMm');

  const verticalDeltaMm = input.pillarDeltaMm - input.matDeltaMm;
  const rawRatio = verticalDeltaMm / input.effectiveLengthMm;
  const ratio = Math.max(-ratioClamp, Math.min(ratioClamp, rawRatio));
  const sraDeltaDeg = (Math.asin(ratio) * 180) / Math.PI;
  const sraActualDeg = input.referenceSraDeg + sraDeltaDeg;

  return { verticalDeltaMm, ratio, sraDeltaDeg, sraActualDeg };
}

export function computeInverseVtaSra(input: InverseVtaSraInput): number {
  assertFinitePositive(input.effectiveLengthMm, 'effectiveLengthMm');
  assertFinite(input.targetSraDeltaDeg, 'targetSraDeltaDeg');

  const targetRad = (input.targetSraDeltaDeg * Math.PI) / 180;
  return input.effectiveLengthMm * Math.sin(targetRad);
}
