import {
  sampleTrackingGeometry,
  findNullPoints,
  calcRmsTrackingError,
  calcMaxTrackingError,
  calcGrooveVelocityMmPerSec,
} from '../engine/geometry.js';

function assert(label: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`  PASS ${label}`);
}

function assertFinite(label: string, value: number): void {
  assert(label, Number.isFinite(value));
}

console.log('geometry acceptance gates');

const baseArgs = {
  pivotToSpindleMm: 222,
  effectiveLengthMm: 239.3,
  offsetAngleDeg: 22.99,
  innerGrooveMm: 60.325,
  outerGrooveMm: 146.05,
};

const samplesPositive = sampleTrackingGeometry(baseArgs);
assert('positive overhang samples are non-empty', samplesPositive.length > 0);
assert(
  'positive overhang samples have finite tracking error',
  samplesPositive.every((s) => Number.isFinite(s.trackingErrorDeg)),
);

const samplesZero = sampleTrackingGeometry({ ...baseArgs, effectiveLengthMm: 222, offsetAngleDeg: 0 });
assert('zero overhang (L=P) samples are non-empty', samplesZero.length > 0);
assert(
  'zero overhang samples have finite tracking error',
  samplesZero.every((s) => Number.isFinite(s.trackingErrorDeg)),
);

const samplesNeg = sampleTrackingGeometry({ ...baseArgs, effectiveLengthMm: 212, offsetAngleDeg: 0 });
assert('underhung (L<P) samples are non-empty', samplesNeg.length > 0);
assert(
  'underhung samples have finite tracking error',
  samplesNeg.every((s) => Number.isFinite(s.trackingErrorDeg)),
);

const samplesZeroOffset = sampleTrackingGeometry({ ...baseArgs, offsetAngleDeg: 0 });
assert('zero offset angle does not crash', samplesZeroOffset.length > 0);

const nullsZeroOffset = findNullPoints(samplesZero);
assert('null detection returns empty or small array when no clear crossing in zero-offset zero-overhang', nullsZeroOffset.length <= 1);

const nullsBaerwald = findNullPoints(samplesPositive);
assert('null detection returns radii values when sign crossings exist', nullsBaerwald.length > 0);
nullsBaerwald.forEach((r) => assertFinite(`null point radius is finite: ${r.toFixed(1)}`, r));

const rms = calcRmsTrackingError(samplesPositive);
assertFinite('rms tracking error is finite', rms);

const maxErr = calcMaxTrackingError(samplesPositive);
assertFinite('max tracking error is finite', maxErr);

const vel = calcGrooveVelocityMmPerSec(60.325);
assertFinite('groove velocity at inner groove is finite', vel);
assert('groove velocity at inner groove is positive', vel > 0);

const velOuter = calcGrooveVelocityMmPerSec(146.05);
assert('groove velocity at outer > inner', velOuter > vel);

console.log('geometry: all gates passed');
