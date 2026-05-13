# Measurement Lab

S30A foundation slice. Captures audio from the user's ADC under strict
constraints (echo cancellation, noise suppression and automatic gain
control all forced off) so a measurement pipeline can run on top of it
in later slices.

What ships in S30A:

- `/measurement-lab` route with the shared workbench frame.
- Audio source mode toggle — Live capture or Self-test.
- Audio input device picker with localStorage persistence.
- Strict-constraints `getUserMedia` wrapper.
- `MeasurementAudioContext` wrapper that records the requested sample
  rate and exposes the actual rate honestly.
- Sample-rate honesty report classifying any browser/OS resampling as
  match, minor or major and surfacing it in the UI.
- Live peak and RMS metering per channel via `AnalyserNode` with a
  decaying peak-hold indicator.
- Self-test mode that injects a deterministic 1 kHz sine through a
  silent sink so the meter can be verified without a real test record.

Out of scope here — speed, wow & flutter, channel balance, crosstalk,
frequency response, THD and resonance peak measurements all arrive in
S30C onwards, sharing this same capture pipeline. iRIAA filtering and
the test-record dataset land in S30B.

The level-metric helpers in `shared/audio-io/levelMetrics.ts` are pure
functions and are testable without a browser; later slices will gate
DSP correctness against synthesised reference signals in CI.
