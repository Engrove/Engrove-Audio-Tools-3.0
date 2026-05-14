/*
 * Browser-side capture node for Speed & W&F measurement.
 *
 * Uses ScriptProcessorNode — deprecated in favour of AudioWorklet but
 * universally supported and the only way to capture contiguous samples
 * without a separate build step. Migration to AudioWorklet is deferred
 * until the Vite worklet pipeline is established in a later slice.
 *
 * Connects to the caller-supplied source node and accumulates a fixed
 * duration of single-channel audio into a pre-allocated Float32Array,
 * then calls onDone with the computed SpeedFlutterResult. Call stop()
 * at any time to abort the capture and receive a partial result.
 */

import { analyseSpeedFlutter, type SpeedFlutterResult } from '../engine/speedFlutter';

export type { SpeedFlutterResult };

export type SpeedFlutterCapture = {
  readonly stop: () => SpeedFlutterResult;
};

export function createSpeedFlutterCapture(
  context: AudioContext,
  source: AudioNode,
  referenceHz: number,
  durationSeconds: number,
  callbacks?: {
    readonly onProgress?: (elapsedSeconds: number) => void;
    readonly onDone?: (result: SpeedFlutterResult) => void;
  },
): SpeedFlutterCapture {
  const bufferSize = 4096;
  const totalSamples = Math.ceil(durationSeconds * context.sampleRate);
  const collected = new Float32Array(totalSamples);
  let writtenSamples = 0;
  let done = false;

  // eslint-disable-next-line deprecation/deprecation
  const processor = context.createScriptProcessor(bufferSize, 1, 1);
  const silentSink = context.createGain();
  silentSink.gain.value = 0;
  silentSink.connect(context.destination);

  function teardown(): void {
    try { processor.disconnect(); } catch { /* already gone */ }
    try { silentSink.disconnect(); } catch { /* already gone */ }
  }

  function buildResult(): SpeedFlutterResult {
    const slice = writtenSamples > 0
      ? collected.subarray(0, writtenSamples)
      : new Float32Array(0);
    return analyseSpeedFlutter(slice, context.sampleRate, referenceHz);
  }

  processor.onaudioprocess = (event) => {
    if (done) return;
    const input = event.inputBuffer.getChannelData(0);
    const remaining = totalSamples - writtenSamples;
    const toWrite = Math.min(input.length, remaining);
    collected.set(input.subarray(0, toWrite), writtenSamples);
    writtenSamples += toWrite;
    callbacks?.onProgress?.(writtenSamples / context.sampleRate);
    if (writtenSamples >= totalSamples) {
      done = true;
      teardown();
      callbacks?.onDone?.(buildResult());
    }
  };

  source.connect(processor);
  processor.connect(silentSink);

  return {
    stop(): SpeedFlutterResult {
      if (!done) {
        done = true;
        teardown();
      }
      return buildResult();
    },
  };
}
