export type AlignmentStandard = 'IEC' | 'DIN';
export type AlignmentMethod = 'Baerwald' | 'LofgrenA' | 'LofgrenB' | 'Stevenson';

export type NullPointPair = {
  n1Mm: number;
  n2Mm: number;
  source: string;
};

export type StandardRadii = {
  innerMm: number;
  outerMm: number;
};

export type ReferenceGeometry = {
  pivotToSpindleMm: number;
  effectiveLengthMm: number;
  overhangMm: number;
  offsetAngleDeg: number;
  innerNullMm: number;
  outerNullMm: number;
};

export type SimulatedGeometry =
  | {
      valid: true;
      pivotToSpindleMm: number;
      effectiveLengthMm: number;
      overhangMm: number;
      offsetAngleDeg: number;
      innerNullMm: number;
      outerNullMm: number;
    }
  | {
      valid: false;
      pivotToSpindleMm: number;
      effectiveLengthMm: number;
      overhangMm: number;
      offsetAngleDeg: number;
      reason: 'discriminant-negative' | 'non-positive-null' | 'invalid-input';
    };

export function computeReferenceGeometry(
  pivotToSpindleMm: number,
  nullPoints: NullPointPair,
): ReferenceGeometry {
  if (!Number.isFinite(pivotToSpindleMm) || pivotToSpindleMm <= 0) {
    throw new RangeError('pivotToSpindleMm must be greater than zero.');
  }

  const p = pivotToSpindleMm;
  const n1 = nullPoints.n1Mm;
  const n2 = nullPoints.n2Mm;
  const effectiveLengthMm = Math.sqrt(p * p + n1 * n2);
  const overhangMm = effectiveLengthMm - p;
  const offsetAngleDeg = (Math.asin((n1 + n2) / (2 * effectiveLengthMm)) * 180) / Math.PI;

  return {
    pivotToSpindleMm: p,
    effectiveLengthMm,
    overhangMm,
    offsetAngleDeg,
    innerNullMm: n1,
    outerNullMm: n2,
  };
}

export function computeSimulatedGeometry(
  simulatedPivotMm: number,
  simulatedOverhangMm: number,
  simulatedOffsetAngleDeg: number,
): SimulatedGeometry {
  const p = simulatedPivotMm;
  const oh = simulatedOverhangMm;
  const oa = simulatedOffsetAngleDeg;
  const l = p + oh;

  if (
    !Number.isFinite(p) ||
    !Number.isFinite(oh) ||
    !Number.isFinite(oa) ||
    p <= 0 ||
    l <= 0
  ) {
    return {
      valid: false,
      pivotToSpindleMm: p,
      effectiveLengthMm: l,
      overhangMm: oh,
      offsetAngleDeg: oa,
      reason: 'invalid-input',
    };
  }

  const oaRad = (oa * Math.PI) / 180;
  const t1 = l * Math.sin(oaRad);
  const t2 = l * l - p * p;
  const discriminant = t1 * t1 - t2;

  if (discriminant < 0) {
    return {
      valid: false,
      pivotToSpindleMm: p,
      effectiveLengthMm: l,
      overhangMm: oh,
      offsetAngleDeg: oa,
      reason: 'discriminant-negative',
    };
  }

  const root = Math.sqrt(discriminant);
  const n1 = t1 - root;
  const n2 = t1 + root;

  if (n1 <= 0 || n2 <= 0) {
    return {
      valid: false,
      pivotToSpindleMm: p,
      effectiveLengthMm: l,
      overhangMm: oh,
      offsetAngleDeg: oa,
      reason: 'non-positive-null',
    };
  }

  return {
    valid: true,
    pivotToSpindleMm: p,
    effectiveLengthMm: l,
    overhangMm: oh,
    offsetAngleDeg: oa,
    innerNullMm: n1,
    outerNullMm: n2,
  };
}

export type CurvePoint = {
  radiusMm: number;
  trackingErrorDeg: number;
  estimatedWtdPct: number;
};

const wtdConstantKappa = 38;

export function computeTrackingErrorCurve(
  pivotToSpindleMm: number,
  effectiveLengthMm: number,
  offsetAngleDeg: number,
  startRadiusMm = 50,
  endRadiusMm = 150,
  stepMm = 0.5,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  if (
    !Number.isFinite(pivotToSpindleMm) ||
    !Number.isFinite(effectiveLengthMm) ||
    !Number.isFinite(offsetAngleDeg) ||
    pivotToSpindleMm <= 0 ||
    effectiveLengthMm <= 0
  ) {
    return points;
  }

  for (let r = startRadiusMm; r <= endRadiusMm + stepMm / 2; r += stepMm) {
    const cosArg =
      (effectiveLengthMm * effectiveLengthMm + r * r - pivotToSpindleMm * pivotToSpindleMm) /
      (2 * effectiveLengthMm * r);
    const clamped = Math.max(-1, Math.min(1, cosArg));
    const trackingErrorDeg = (Math.asin(clamped) * 180) / Math.PI - offsetAngleDeg;
    const estimatedWtdPct = (Math.abs(trackingErrorDeg) * 100) / (r * wtdConstantKappa);
    points.push({ radiusMm: r, trackingErrorDeg, estimatedWtdPct });
  }
  return points;
}

export type GeometrySample = {
  radiusMm: number;
  trackingErrorDeg: number;
  absTrackingErrorDeg: number;
};

export function sampleTrackingGeometry(args: {
  pivotToSpindleMm: number;
  effectiveLengthMm: number;
  offsetAngleDeg: number;
  innerGrooveMm: number;
  outerGrooveMm: number;
  sampleCount?: number;
}): GeometrySample[] {
  const { pivotToSpindleMm, effectiveLengthMm, offsetAngleDeg, innerGrooveMm, outerGrooveMm } = args;
  const count = args.sampleCount ?? 200;
  if (
    !Number.isFinite(pivotToSpindleMm) ||
    !Number.isFinite(effectiveLengthMm) ||
    !Number.isFinite(offsetAngleDeg) ||
    pivotToSpindleMm <= 0 ||
    effectiveLengthMm <= 0 ||
    innerGrooveMm >= outerGrooveMm
  ) {
    return [];
  }
  const step = (outerGrooveMm - innerGrooveMm) / Math.max(1, count - 1);
  const samples: GeometrySample[] = [];
  for (let i = 0; i < count; i++) {
    const r = innerGrooveMm + i * step;
    const cosArg =
      (effectiveLengthMm * effectiveLengthMm + r * r - pivotToSpindleMm * pivotToSpindleMm) /
      (2 * effectiveLengthMm * r);
    const clamped = Math.max(-1, Math.min(1, cosArg));
    const trackingErrorDeg = (Math.asin(clamped) * 180) / Math.PI - offsetAngleDeg;
    samples.push({ radiusMm: r, trackingErrorDeg, absTrackingErrorDeg: Math.abs(trackingErrorDeg) });
  }
  return samples;
}

export function findNullPoints(samples: GeometrySample[]): number[] {
  const nulls: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (prev.trackingErrorDeg * curr.trackingErrorDeg < 0) {
      const t = Math.abs(prev.trackingErrorDeg) / (Math.abs(prev.trackingErrorDeg) + Math.abs(curr.trackingErrorDeg));
      nulls.push(prev.radiusMm + t * (curr.radiusMm - prev.radiusMm));
    } else if (curr.trackingErrorDeg === 0) {
      nulls.push(curr.radiusMm);
    }
  }
  return nulls;
}

export function calcRmsTrackingError(samples: GeometrySample[]): number {
  if (samples.length === 0) return 0;
  const sumSq = samples.reduce((acc, s) => acc + s.trackingErrorDeg * s.trackingErrorDeg, 0);
  return Math.sqrt(sumSq / samples.length);
}

export function calcMaxTrackingError(samples: GeometrySample[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((acc, s) => Math.max(acc, s.absTrackingErrorDeg), 0);
}

export function calcGrooveVelocityMmPerSec(radiusMm: number, rpm = 33.333): number {
  return 2 * Math.PI * radiusMm * rpm / 60;
}

export function methodLabel(method: AlignmentMethod): string {
  switch (method) {
    case 'Baerwald':
      return 'Baerwald';
    case 'LofgrenA':
      return 'Loefgren A';
    case 'LofgrenB':
      return 'Loefgren B';
    case 'Stevenson':
      return 'Stevenson';
  }
}

export function standardLabel(standard: AlignmentStandard): string {
  return standard;
}
