/*
 * Sample-rate honesty report. Compares what was asked for against what
 * the browser and OS audio stack actually granted, so the user sees the
 * truth and not the assumption.
 *
 * Browsers and operating systems often resample silently:
 *   - macOS may pin AudioContext to the device's preferred rate
 *   - Safari frequently lands on 48000 Hz even if 96000 was requested
 *   - Windows WDM-KS bypasses the OS mixer; WASAPI shared mode does not
 *   - Linux PipeWire / PulseAudio resamples by default
 *
 * The "delta" classification lets the UI surface the issue without
 * either lying about precision or blocking the user from continuing.
 */

export type SampleRateMatchClassification = 'match' | 'minor' | 'major';

export type SampleRateHonestyReport = {
  readonly requestedHz: number;
  readonly contextActualHz: number;
  readonly trackReportedHz: number | undefined;
  readonly absoluteDeltaHz: number;
  readonly relativeDeltaPpm: number;
  readonly classification: SampleRateMatchClassification;
  readonly summary: string;
};

function classifyDelta(absoluteDeltaHz: number, requestedHz: number): SampleRateMatchClassification {
  if (requestedHz <= 0) return 'major';
  const ppm = (absoluteDeltaHz / requestedHz) * 1_000_000;
  if (ppm < 100) return 'match';
  if (ppm < 5_000) return 'minor';
  return 'major';
}

function formatRate(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return 'unknown';
  if (hz >= 1000) return `${(hz / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })} kHz`;
  return `${hz.toLocaleString('en-US', { maximumFractionDigits: 0 })} Hz`;
}

export function describeSampleRateHonesty(input: {
  readonly requestedHz: number;
  readonly contextActualHz: number;
  readonly trackReportedHz?: number;
}): SampleRateHonestyReport {
  const requestedHz = input.requestedHz;
  const contextActualHz = input.contextActualHz;
  const trackReportedHz = input.trackReportedHz;
  const absoluteDeltaHz = Math.abs(contextActualHz - requestedHz);
  const relativeDeltaPpm = requestedHz > 0
    ? (absoluteDeltaHz / requestedHz) * 1_000_000
    : 0;
  const classification = classifyDelta(absoluteDeltaHz, requestedHz);

  const trackTail = typeof trackReportedHz === 'number' && Number.isFinite(trackReportedHz)
    ? ` Track reports ${formatRate(trackReportedHz)}.`
    : '';

  let summary: string;
  if (classification === 'match') {
    summary = `Audio context running at ${formatRate(contextActualHz)} as requested.${trackTail}`;
  } else if (classification === 'minor') {
    summary = `Audio context resampled to ${formatRate(contextActualHz)} (requested ${formatRate(requestedHz)}). Acceptable for level metering; flag this when running precision measurements.${trackTail}`;
  } else {
    summary = `Audio context delivered ${formatRate(contextActualHz)} but the lab requested ${formatRate(requestedHz)}. Measurements that depend on absolute sample rate (speed, wow & flutter) will be inaccurate until the device or OS settings are adjusted.${trackTail}`;
  }

  return {
    requestedHz,
    contextActualHz,
    trackReportedHz,
    absoluteDeltaHz,
    relativeDeltaPpm,
    classification,
    summary,
  };
}
