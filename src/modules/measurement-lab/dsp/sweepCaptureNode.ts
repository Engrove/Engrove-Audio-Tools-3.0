/*
 * Browser-side mono capture node for frequency-response measurement.
 *
 * Collects a fixed-duration mono capture via ScriptProcessorNode (same
 * pattern as speedFlutterNode.ts) then hands the raw samples back to the
 * caller.  The caller is responsible for passing the samples to the pure
 * computeFrequencyResponse engine.
 */

export type SweepCapture = {
  readonly stop: () => Float32Array | null;
};

export function createSweepCapture(
  context: AudioContext,
  source: AudioNode,
  durationSeconds: number,
  callbacks?: {
    readonly onProgress?: (elapsedSeconds: number) => void;
    readonly onDone?: (samples: Float32Array) => void;
  },
): SweepCapture {
  const bufferSize = 4096;
  const totalSamples = Math.ceil(durationSeconds * context.sampleRate);
  const captured = new Float32Array(totalSamples);
  let written = 0;
  let done = false;

  // eslint-disable-next-line deprecation/deprecation
  const processor = context.createScriptProcessor(bufferSize, 1, 1);
  const silentSink = context.createGain();
  silentSink.gain.value = 0;
  silentSink.connect(context.destination);

  function teardown(): void {
    try { processor.disconnect(); } catch { /* gone */ }
    try { silentSink.disconnect(); } catch { /* gone */ }
  }

  processor.onaudioprocess = (event) => {
    if (done) return;
    const inBuf = event.inputBuffer.getChannelData(0);
    const remaining = totalSamples - written;
    const toWrite = Math.min(inBuf.length, remaining);
    captured.set(inBuf.subarray(0, toWrite), written);
    written += toWrite;
    callbacks?.onProgress?.(written / context.sampleRate);
    if (written >= totalSamples) {
      done = true;
      teardown();
      callbacks?.onDone?.(captured.slice(0, written));
    }
  };

  source.connect(processor);
  processor.connect(silentSink);

  return {
    stop(): Float32Array | null {
      if (!done) {
        done = true;
        teardown();
      }
      return written > 0 ? captured.slice(0, written) : null;
    },
  };
}
