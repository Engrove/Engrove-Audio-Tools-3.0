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

S30B adds:

- `data/loadTestRecords.ts` and `/data/audio/v3/runtime/test-records.json`
  with five reference records (Hi-Fi News HFN-001, JVC TRS-1007,
  CBS STR-100, Clearaudio CA-TRS-1007 and the Ortofon Test Record).
  Each band carries a closed-vocabulary `purpose`, `type` and
  `channel`. The validator enforces the vocabulary and the manifest
  carries the dataset's SHA-256.
- `engine/iriaaFilter.ts` — pure-function RIAA playback de-emphasis.
  Exports the canonical 3-time-constant analog reference
  (`computeRiaaMagnitudeDb`), bilinear-transformed IIR coefficients
  (`computeIriaaIirCoefficients`), the closed-form discrete magnitude
  (`computeIriaaDiscreteMagnitudeDb`) and a Float64 time-domain runner
  (`applyIirFilter`) so the same code is exercised by the Node CI gate
  `tools/check-measurement-lab.mjs`.
- `dsp/iriaaNode.ts` — browser glue that turns the pure coefficients
  into a live `IIRFilterNode`.
- A **Software iRIAA** toggle in the source panel. When enabled the
  capture stream (or the self-test sine) is routed through the iRIAA
  filter before the level meter. The toggle is disabled while capture
  is live; the user must Disconnect before changing the signal path.

Out of scope here — speed, wow & flutter, channel balance, crosstalk,
frequency response, THD and resonance peak measurements all arrive in
S30C onwards, sharing this same capture pipeline. See
`docs/release/S30_MEASUREMENT_LAB_PLAN.md` for the full plan.

The level-metric helpers in `shared/audio-io/levelMetrics.ts` are pure
functions and are testable without a browser; later slices will gate
DSP correctness against synthesised reference signals in CI.
