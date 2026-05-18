/*
 * Browser-side stereo capture node for Noise Floor / Rig Baseline measurement.
 *
 * Uses ScriptProcessorNode — same pattern as stereoCaptureNode.ts.
 * Captures both channels for the given duration, then calls analyzeNoiseFloor
 * with the accumulated samples.
 */

import { analyzeNoiseFloor, type NoiseFloorResult } from '../engine/noiseFloor';

export type { NoiseFloorResult };

export type NoiseFloorCapture = {
  readonly stop: () => NoiseFloorResult | null;
};

export function createNoiseFloorCapture(
  context: AudioContext,
  source: AudioNode,
  durationSeconds: number,
  callbacks?: {
    readonly onProgress?: (elapsedSeconds: number) => void;
    readonly onDone?: (result: NoiseFloorResult) => void;
  },
): NoiseFloorCapture {
  const bufferSize = 4096;
  const totalSamples = Math.ceil(durationSeconds * context.sampleRate);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  let written = 0;
  let done = false;

  // eslint-disable-next-line deprecation/deprecation
  const processor = context.createScriptProcessor(bufferSize, 2, 2);
  const silentSink = context.createGain();
  silentSink.gain.value = 0;
  silentSink.connect(context.destination);

  function teardown(): void {
    try { processor.disconnect(); } catch { /* gone */ }
    try { silentSink.disconnect(); } catch { /* gone */ }
  }

  function buildResult(): NoiseFloorResult | null {
    if (written === 0) return null;
    return analyzeNoiseFloor(
      left.subarray(0, written),
      right.subarray(0, written),
    );
  }

  processor.onaudioprocess = (event) => {
    if (done) return;
    const inL = event.inputBuffer.getChannelData(0);
    const inR = event.inputBuffer.numberOfChannels > 1
      ? event.inputBuffer.getChannelData(1)
      : inL;
    const remaining = totalSamples - written;
    const toWrite = Math.min(inL.length, remaining);
    left.set(inL.subarray(0, toWrite), written);
    right.set(inR.subarray(0, toWrite), written);
    written += toWrite;
    callbacks?.onProgress?.(written / context.sampleRate);
    if (written >= totalSamples) {
      done = true;
      teardown();
      const result = buildResult();
      if (result) callbacks?.onDone?.(result);
    }
  };

  source.connect(processor);
  processor.connect(silentSink);

  return {
    stop(): NoiseFloorResult | null {
      if (!done) {
        done = true;
        teardown();
      }
      return buildResult();
    },
  };
}
