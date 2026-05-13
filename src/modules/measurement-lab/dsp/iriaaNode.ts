/*
 * Browser-side glue that turns the pure iRIAA coefficients into a live
 * AudioNode. Kept separate from the engine module so the CI gate does
 * not need to import any Web Audio API types.
 */

import { computeIriaaIirCoefficients, type RiaaCoefficients } from '../engine/iriaaFilter';

export type IriaaFilterNode = {
  readonly node: AudioNode;
  readonly coefficients: RiaaCoefficients;
};

export function createIriaaFilterNode(context: AudioContext): IriaaFilterNode {
  const coefficients = computeIriaaIirCoefficients(context.sampleRate);
  const node = context.createIIRFilter(
    [...coefficients.feedforward],
    [...coefficients.feedback],
  );
  return { node, coefficients };
}
