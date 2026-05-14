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

S30C adds:

- `engine/speedFlutter.ts` — pure Speed & W&F engine. Exports
  `demodulateInstantaneousFrequency` (upward zero-crossing detection
  with linear interpolation), `computeSpeedFlutterMetrics` and the
  convenience wrapper `analyseSpeedFlutter`. IEC flutter-weighting is
  a first-order approximation (HP 0.5 Hz + LP 200 Hz bilinear);
  the dominant flutter band (1–10 Hz) is covered accurately.
- `dsp/speedFlutterNode.ts` — `createSpeedFlutterCapture` wraps a
  `ScriptProcessorNode` to collect contiguous audio over a fixed
  duration without an AudioWorklet build step (worklet migration is
  deferred). Progress and done callbacks drive the UI.
- **Speed & W&F panel** in the source workbench (panel 03). When a
  source is live the user picks 3150 Hz or 3000 Hz as the reference
  frequency and starts a 30-second capture. Results show speed
  deviation (%), unweighted W&F (AES6) and IEC-weighted W&F with a
  five-tier classification.
- `check-measurement-lab.mjs` extended with three S30C assertions:
  0.2 % FM signal → 0.20 ± 0.01 % unweighted W&F; FM speed deviation
  ≈ 0 %; pure tone noise floor < 0.01 %.

S30D adds:

- `engine/crosstalk.ts` — pure channel-balance & crosstalk engine.
  Exports `computeRms`, `analyseChannelCapture` (per-channel RMS plus
  on-to-off-channel ratio in dB) and `summariseChannelBalance` (R vs L
  balance dB plus bidirectional crosstalk).
- `dsp/stereoCaptureNode.ts` — `createStereoChannelCapture` collects
  10 seconds of stereo audio via `ScriptProcessorNode(buf, 2, 2)`,
  preserving L and R as separate Float32Arrays.
- **Channel balance & crosstalk panel** (panel 04) — two-step wizard:
  cue the L-channel reference band, capture 10 s, then cue the
  R-channel band, capture 10 s. Step 1 result is shown before step 2.
  After both steps the panel reports L/R RMS in dBFS, channel balance
  (R − L in dB) and both directions of crosstalk.
- `check-measurement-lab.mjs` extended with three S30D assertions:
  L → R crosstalk = -40 dB ± 0.3 dB; matched balance = 0 dB ± 0.05 dB;
  mismatched balance (R at -6 dB) = -6.02 dB ± 0.05 dB.

Out of scope here — frequency response, THD and resonance peak
measurements arrive in S30E onwards, sharing this same capture
pipeline. See `docs/release/S30_MEASUREMENT_LAB_PLAN.md` for the full
plan.

The level-metric helpers in `shared/audio-io/levelMetrics.ts` are pure
functions and are testable without a browser; later slices will gate
DSP correctness against synthesised reference signals in CI.
