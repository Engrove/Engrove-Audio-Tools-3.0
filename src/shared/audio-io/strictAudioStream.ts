/*
 * Strict-constraints audio capture wrapper. The browser defaults for
 * getUserMedia are tuned for voice calls (echo cancellation, noise
 * suppression, automatic gain control). Those defaults are fatal for
 * measurement: they apply non-deterministic dynamic processing that
 * destroys the linearity of test tones and frequency sweeps. This
 * module forces them off and asks for a measurement-grade sample rate
 * and channel layout.
 */

export type StrictAudioStreamOptions = {
  readonly deviceId?: string;
  readonly requestedSampleRate: number;
  readonly requestedChannelCount: number;
};

export type StrictAudioStream = {
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  readonly trackSettings: MediaTrackSettings;
  readonly requestedSampleRate: number;
  readonly requestedChannelCount: number;
};

export class AudioStreamUnavailableError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AudioStreamUnavailableError';
    this.cause = cause;
  }
}

function hasMediaDevices(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices === 'object'
    && navigator.mediaDevices !== null
    && typeof navigator.mediaDevices.getUserMedia === 'function';
}

function describeGetUserMediaError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Microphone permission was denied by the browser. Reload and grant access to enable audio capture.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No audio input device is available on this system.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'The selected audio input could not be opened. Another application may be using it.';
    }
    if (name === 'OverconstrainedError') {
      return 'The selected device does not support the requested sample rate or channel count.';
    }
    if (name === 'AbortError') {
      return 'Audio capture was aborted before the stream could start.';
    }
  }
  if (error instanceof Error && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }
  return 'Audio capture failed for an unknown reason.';
}

export async function requestStrictAudioStream(
  options: StrictAudioStreamOptions,
): Promise<StrictAudioStream> {
  if (!hasMediaDevices()) {
    throw new AudioStreamUnavailableError(
      'This browser does not expose navigator.mediaDevices.getUserMedia. Use a recent Chrome, Firefox or Safari build.',
    );
  }

  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      sampleRate: { ideal: options.requestedSampleRate },
      channelCount: { ideal: options.requestedChannelCount },
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: false },
    },
    video: false,
  };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    throw new AudioStreamUnavailableError(describeGetUserMediaError(error), error);
  }

  const tracks = stream.getAudioTracks();
  const track = tracks[0];
  if (!track) {
    stream.getTracks().forEach((existing) => existing.stop());
    throw new AudioStreamUnavailableError(
      'The granted MediaStream contains no audio tracks. The selected device may be muted or disabled at the OS level.',
    );
  }

  return {
    stream,
    track,
    trackSettings: track.getSettings(),
    requestedSampleRate: options.requestedSampleRate,
    requestedChannelCount: options.requestedChannelCount,
  };
}

export function releaseStrictAudioStream(stream: StrictAudioStream | null): void {
  if (!stream) return;
  for (const track of stream.stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* track may already be stopped; releasing is best-effort. */
    }
  }
}
