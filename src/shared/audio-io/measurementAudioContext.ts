/*
 * Thin wrapper around AudioContext for the Measurement Lab. The context
 * is created lazily on the first user gesture (browser autoplay policy)
 * and disposed when the lab is reset. The requested sample rate is
 * recorded alongside the actual rate so the UI can surface the
 * difference. Browsers may silently resample to the device's preferred
 * rate; "honesty" here means reporting what was actually granted, not
 * what was asked for.
 */

export type MeasurementAudioContextOptions = {
  readonly requestedSampleRate: number;
};

export type MeasurementAudioContextState = 'idle' | 'live' | 'suspended' | 'closed';

export type MeasurementAudioContextHandle = {
  readonly context: AudioContext;
  readonly requestedSampleRate: number;
};

function selectAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  type WindowWithLegacyAudio = typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const w = window as WindowWithLegacyAudio;
  if (typeof w.AudioContext === 'function') return w.AudioContext;
  if (typeof w.webkitAudioContext === 'function') return w.webkitAudioContext;
  return null;
}

export class MeasurementAudioContextUnavailableError extends Error {
  constructor() {
    super('Web Audio API is not available in this browser.');
    this.name = 'MeasurementAudioContextUnavailableError';
  }
}

export function createMeasurementAudioContext(
  options: MeasurementAudioContextOptions,
): MeasurementAudioContextHandle {
  const ctor = selectAudioContextConstructor();
  if (!ctor) {
    throw new MeasurementAudioContextUnavailableError();
  }
  const context = new ctor({
    sampleRate: options.requestedSampleRate,
    latencyHint: 'playback',
  });
  return {
    context,
    requestedSampleRate: options.requestedSampleRate,
  };
}

export async function disposeMeasurementAudioContext(
  handle: MeasurementAudioContextHandle | null,
): Promise<void> {
  if (!handle) return;
  if (handle.context.state === 'closed') return;
  try {
    await handle.context.close();
  } catch {
    /* context may have been closed elsewhere; closing is best-effort. */
  }
}
