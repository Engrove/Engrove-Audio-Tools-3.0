import {
  calcOffsetBurden,
  calcVelocityPenalty,
  calcAngularThresholdPenalty,
  calcEccentricityPenalty,
  calcWarpFactor,
  calcStylusFactor,
  calcScrubProxy,
  calcTotalBehaviorRisk,
  sampleBehaviorContext,
  type BehaviorContextInput,
} from '../engine/behaviorContext.js';

function assert(label: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`  PASS ${label}`);
}

console.log('behaviorContext acceptance gates');

assert('offset angle 0 gives offsetBurden 0', calcOffsetBurden(0) === 0);
assert(
  'high offset angle gives higher offsetBurden than low offset',
  calcOffsetBurden(20) > calcOffsetBurden(5),
);

const innerMm = 60.325;
const outerMm = 146.05;

const velInner = calcVelocityPenalty(innerMm, outerMm);
const velOuter = calcVelocityPenalty(outerMm, outerMm);
assert('velocityPenalty at inner > at outer', velInner > velOuter);
assert('velocityPenalty increases toward inner grooves', velInner > 1);
assert('velocityPenalty is 1.0 at outer groove', velOuter === 1);

const eccInner = calcEccentricityPenalty(0.25, innerMm);
const eccOuter = calcEccentricityPenalty(0.25, outerMm);
assert('eccentricityPenalty increases toward inner grooves', eccInner > eccOuter);

assert('angularThresholdPenalty is 0 below threshold', calcAngularThresholdPenalty(1.0) === 0);
assert('angularThresholdPenalty is 0 at threshold', calcAngularThresholdPenalty(1.5) === 0);
assert('angularThresholdPenalty increases above threshold', calcAngularThresholdPenalty(2.5) > 0);
assert(
  'angularThresholdPenalty(3) > angularThresholdPenalty(2)',
  calcAngularThresholdPenalty(3) > calcAngularThresholdPenalty(2),
);

assert(
  'warpFactor low < medium < high',
  calcWarpFactor('low') < calcWarpFactor('medium') && calcWarpFactor('medium') < calcWarpFactor('high'),
);

assert(
  'stylusFactor microline < line-contact < elliptical < conical',
  calcStylusFactor('microline') < calcStylusFactor('line-contact') &&
  calcStylusFactor('line-contact') < calcStylusFactor('elliptical') &&
  calcStylusFactor('elliptical') < calcStylusFactor('conical'),
);

const scrub = calcScrubProxy({
  offsetBurden: 0.8,
  velocityPenalty: 2.0,
  eccentricityPenalty: 0.4,
  warpFactor: 1.1,
  stylusFactor: 1.05,
});
assert('scrubProxy is finite and positive', Number.isFinite(scrub) && scrub > 0);

const risk = calcTotalBehaviorRisk({
  scrubProxy: scrub,
  velocityPenalty: 2.0,
  angularThresholdPenalty: 0.2,
  eccentricityPenalty: 0.4,
  warpFactor: 1.1,
});
assert('totalBehaviorRisk is clamped 0–1', risk >= 0 && risk <= 1);

const riskZero = calcTotalBehaviorRisk({
  scrubProxy: 0,
  velocityPenalty: 1,
  angularThresholdPenalty: 0,
  eccentricityPenalty: 0,
  warpFactor: 0.95,
});
assert('totalBehaviorRisk is >= 0 for all-zero inputs', riskZero >= 0);

const baseInput: BehaviorContextInput = {
  pivotToSpindleMm: 222,
  effectiveLengthMm: 239.3,
  overhangMm: 17.3,
  offsetAngleDeg: 22.99,
  innerGrooveMm: innerMm,
  outerGrooveMm: outerMm,
  eccentricityMm: 0.25,
  warpSeverity: 'medium',
  stylusProfile: 'elliptical',
  angularErrorThresholdDeg: 1.5,
  rpm: 33.333,
};

const samples = sampleBehaviorContext(baseInput);
assert('samples are non-empty', samples.length > 0);
assert('all samples have finite totalBehaviorRisk', samples.every((s) => Number.isFinite(s.totalBehaviorRisk)));
assert('all samples clamped 0–1', samples.every((s) => s.totalBehaviorRisk >= 0 && s.totalBehaviorRisk <= 1));
assert('all behavior outputs carry MODEL-compatible data', samples.every((s) => Number.isFinite(s.scrubProxy)));

const underhungInput: BehaviorContextInput = {
  ...baseInput,
  pivotToSpindleMm: 222,
  effectiveLengthMm: 212,
  overhangMm: -10,
  offsetAngleDeg: 0,
};
const underhungSamples = sampleBehaviorContext(underhungInput);
assert('underhung scenario samples are non-empty', underhungSamples.length > 0);
const underhungOffset = underhungSamples[0]?.offsetBurden ?? -1;
assert('underhung straight arm has zero offsetBurden', underhungOffset === 0);
const underhungAngular = underhungSamples[underhungSamples.length - 1]?.angularThresholdPenalty ?? -1;
assert('underhung scenario can show angular penalty (>= 0)', underhungAngular >= 0);

console.log('behaviorContext: all gates passed');
