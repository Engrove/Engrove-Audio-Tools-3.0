/*
 * Browser-side stereo capture node for the Channel balance &
 * crosstalk wizard.
 *
 * Like the single-channel speed/W&F capture node, this uses
 * ScriptProcessorNode for contiguous sample access without an
 * AudioWorklet build step. A 2-channel input lets the engine compute
 * crosstalk between L and R from a single capture.
 */

import {
  analyseChannelCapture,
  type ChannelCaptureMetrics,
  type CrosstalkChannel,
} from '../engine/crosstalk';

export type { ChannelCaptureMetrics };

export type StereoCapture = {
  readonly stop: () => ChannelCaptureMetrics | null;
};

export function createStereoChannelCapture(
  context: AudioContext,
  source: AudioNode,
  onChannel: CrosstalkChannel,
  durationSeconds: number,
  callbacks?: {
    readonly onProgress?: (elapsedSeconds: number) => void;
    readonly onDone?: (result: ChannelCaptureMetrics) => void;
  },
): StereoCapture {
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

  function buildResult(): ChannelCaptureMetrics | null {
    if (written === 0) return null;
    return analyseChannelCapture(
      left.subarray(0, written),
      right.subarray(0, written),
      onChannel,
      context.sampleRate,
      0.5,
    );
  }

  processor.onaudioprocess = (event) => {
    if (done) return;
    const inputBuffer = event.inputBuffer;
    const inL = inputBuffer.getChannelData(0);
    const inR = inputBuffer.numberOfChannels > 1
      ? inputBuffer.getChannelData(1)
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
    stop(): ChannelCaptureMetrics | null {
      if (!done) {
        done = true;
        teardown();
      }
      return buildResult();
    },
  };
}
