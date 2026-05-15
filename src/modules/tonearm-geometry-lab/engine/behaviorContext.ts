export type TruthStatus =
  | 'FORMULA'
  | 'MODEL'
  | 'MEASURED'
  | 'CALIBRATED'
  | 'VERIFIED'
  | 'BLOCKED';

export type StylusProfile =
  | 'unknown'
  | 'conical'
  | 'elliptical'
  | 'line-contact'
  | 'microline';

export type WarpSeverity = 'low' | 'medium' | 'high';

export type BehaviorContextInput = {
  pivotToSpindleMm: number;
  effectiveLengthMm: number;
  overhangMm: number;
  offsetAngleDeg: number;
  innerGrooveMm: number;
  outerGrooveMm: number;
  eccentricityMm: number;
  warpSeverity: WarpSeverity;
  stylusProfile: StylusProfile;
  angularErrorThresholdDeg: number;
  rpm: number;
};

export type BehaviorSample = {
  radiusMm: number;
  angularErrorDeg: number;
  angularThresholdPenalty: number;
  velocityPenalty: number;
  offsetBurden: number;
  eccentricityPenalty: number;
  warpFactor: number;
  stylusFactor: number;
  scrubProxy: number;
  totalBehaviorRisk: number;
};

export type BehaviorWeights = {
  scrub: number;
  velocity: number;
  angular: number;
  eccentricityWarp: number;
};

const defaultBehaviorWeights: BehaviorWeights = {
  scrub: 0.35,
  velocity: 0.25,
  angular: 0.25,
  eccentricityWarp: 0.15,
};

const stylusFactorMap: Record<StylusProfile, number> = {
  unknown: 1.10,
  conical: 1.15,
  elliptical: 1.05,
  'line-contact': 0.95,
  microline: 0.90,
};

const warpFactorMap: Record<WarpSeverity, number> = {
  low: 0.95,
  medium: 1.10,
  high: 1.35,
};

export function calcOffsetBurden(offsetAngleDeg: number): number {
  return Math.abs(offsetAngleDeg) / 25;
}

export function calcVelocityPenalty(radiusMm: number, outerGrooveMm: number): number {
  return outerGrooveMm / radiusMm;
}

export function calcAngularThresholdPenalty(
  absErrorDeg: number,
  thresholdDeg = 1.5,
  scaleDeg = 5,
): number {
  return Math.max(0, absErrorDeg - thresholdDeg) / scaleDeg;
}

export function calcEccentricityPenalty(
  eccentricityMm: number,
  radiusMm: number,
  scale = 100,
): number {
  return (eccentricityMm / radiusMm) * scale;
}

export function calcWarpFactor(warpSeverity: WarpSeverity): number {
  return warpFactorMap[warpSeverity];
}

export function calcStylusFactor(stylusProfile: StylusProfile): number {
  return stylusFactorMap[stylusProfile];
}

export function calcScrubProxy(args: {
  offsetBurden: number;
  velocityPenalty: number;
  eccentricityPenalty: number;
  warpFactor: number;
  stylusFactor: number;
}): number {
  return (
    args.offsetBurden *
    args.velocityPenalty *
    (1 + args.eccentricityPenalty) *
    args.warpFactor *
    args.stylusFactor
  );
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function normalizeSoft(x: number, reference: number): number {
  return clamp01(x / reference);
}

export function calcTotalBehaviorRisk(args: {
  scrubProxy: number;
  velocityPenalty: number;
  angularThresholdPenalty: number;
  eccentricityPenalty: number;
  warpFactor: number;
  weights?: BehaviorWeights;
}): number {
  const w = args.weights ?? defaultBehaviorWeights;
  const scrub = normalizeSoft(args.scrubProxy, 2.5);
  const velocity = normalizeSoft(args.velocityPenalty - 1, 1.5);
  const angular = normalizeSoft(args.angularThresholdPenalty, 1.0);
  const eccWarp = normalizeSoft(args.eccentricityPenalty * args.warpFactor, 1.0);
  return clamp01(
    w.scrub * scrub +
    w.velocity * velocity +
    w.angular * angular +
    w.eccentricityWarp * eccWarp,
  );
}

function calcTrackingErrorDeg(
  pivotToSpindleMm: number,
  effectiveLengthMm: number,
  offsetAngleDeg: number,
  radiusMm: number,
): number {
  const cosArg =
    (effectiveLengthMm * effectiveLengthMm + radiusMm * radiusMm - pivotToSpindleMm * pivotToSpindleMm) /
    (2 * effectiveLengthMm * radiusMm);
  const clamped = Math.max(-1, Math.min(1, cosArg));
  return (Math.asin(clamped) * 180) / Math.PI - offsetAngleDeg;
}

export function sampleBehaviorContext(input: BehaviorContextInput): BehaviorSample[] {
  const {
    pivotToSpindleMm,
    effectiveLengthMm,
    overhangMm: _overhangMm,
    offsetAngleDeg,
    innerGrooveMm,
    outerGrooveMm,
    eccentricityMm,
    warpSeverity,
    stylusProfile,
    angularErrorThresholdDeg,
  } = input;

  const samples: BehaviorSample[] = [];
  const stepMm = 0.5;
  const warpFactor = calcWarpFactor(warpSeverity);
  const stylusFactor = calcStylusFactor(stylusProfile);
  const offsetBurden = calcOffsetBurden(offsetAngleDeg);

  for (let r = outerGrooveMm; r >= innerGrooveMm - stepMm / 2; r -= stepMm) {
    const radiusMm = Math.max(innerGrooveMm, Math.min(outerGrooveMm, r));
    const angularErrorDeg = calcTrackingErrorDeg(pivotToSpindleMm, effectiveLengthMm, offsetAngleDeg, radiusMm);
    const absError = Math.abs(angularErrorDeg);
    const angularThresholdPenalty = calcAngularThresholdPenalty(absError, angularErrorThresholdDeg);
    const velocityPenalty = calcVelocityPenalty(radiusMm, outerGrooveMm);
    const eccentricityPenalty = calcEccentricityPenalty(eccentricityMm, radiusMm);
    const scrubProxy = calcScrubProxy({
      offsetBurden,
      velocityPenalty,
      eccentricityPenalty,
      warpFactor,
      stylusFactor,
    });
    const totalBehaviorRisk = calcTotalBehaviorRisk({
      scrubProxy,
      velocityPenalty,
      angularThresholdPenalty,
      eccentricityPenalty,
      warpFactor,
    });
    samples.push({
      radiusMm,
      angularErrorDeg,
      angularThresholdPenalty,
      velocityPenalty,
      offsetBurden,
      eccentricityPenalty,
      warpFactor,
      stylusFactor,
      scrubProxy,
      totalBehaviorRisk,
    });
  }

  return samples;
}
