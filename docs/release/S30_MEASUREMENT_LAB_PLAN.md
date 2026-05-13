# S30 Measurement Lab — continuity dossier

This document is the single hand-off artefact a new session needs to
pick up the Measurement Lab work without reading every prior commit. It
covers what has shipped, what is in flight, the development plan for
the remaining slices and the engineering rules the slices must follow.

Status as of this writing: branch
`claude/implement-tonearm-vta-labs-W5uif`, HEAD targets the S30B
commit. S30A and S30B are merged into the branch; S30C and onwards are
not started.

---

## 1. Where we are

### 1.1 Branch state

- Branch: `claude/implement-tonearm-vta-labs-W5uif`
- Latest meaningful commits (most recent last):
  - `62ef355` — S30A audio-input foundation
  - (this slice) — S30B test-record dataset + iRIAA filter
- All existing gates pass: `tsc --noEmit`, `check:sanitation`,
  `check:tokens-layout` (still 9 pre-existing shared-CSS items, no new
  drift), `validate:data` 0/0, `check:measurement-lab`, `vite build`
  emits no `.map` files, all six routes return 200 on the dev server.

### 1.2 Routes shipped

| Route | Tool | Status |
|---|---|---|
| `/` | Home (tool index) | shipped |
| `/tonearm-calculator` | Tonearm Match Lab | shipped |
| `/compliance` | Compliance Estimator | shipped |
| `/geometry-lab` | Tonearm Geometry Lab | shipped |
| `/vta-sra-lab` | VTA & SRA Lab | shipped |
| `/measurement-lab` | Measurement Lab | S30A + S30B foundation, no real measurements yet |

### 1.3 What S30A shipped (audio-input foundation)

- `src/shared/audio-io/`
  - `levelMetrics.ts` — pure peak / RMS / dBFS helpers + decaying peak
    hold; testable in Node, no DOM dependency
  - `strictAudioStream.ts` — `getUserMedia` wrapper that forces
    echoCancellation, noiseSuppression and autoGainControl off and
    asks for 96 kHz / 2 channels
  - `audioInputDeviceList.ts` — `enumerateDevices` wrapper that
    degrades gracefully when labels are empty (pre-permission)
  - `measurementAudioContext.ts` — AudioContext factory recording
    requested vs. actual sample rate
  - `sampleRateHonesty.ts` — match / minor / major classifier with
    English-only summary sentence
- `/measurement-lab` route under `src/modules/measurement-lab/`:
  - Source mode toggle (Live capture vs. Self-test)
  - Device picker with `localStorage` persistence; `devicechange`
    listener refreshes list on USB hot-plug
  - Sample-rate honesty surfaced as coloured badge + English summary
  - Live per-channel peak + RMS metering at 60 Hz via `AnalyserNode`
    and `requestAnimationFrame`
  - Decaying peak-hold marker at 12 dB/s
  - Self-test injects a deterministic 1 kHz sine through a silent
    sink so the meter is verifiable without an ADC

### 1.4 What S30B adds

- `public/data/audio/v3/runtime/test-records.json` — 5 records, 30
  bands total (HFN-001, JVC TRS-1007, CBS STR-100, Clearaudio
  CA-TRS-1007, Ortofon Test Record). Each band carries an `index`,
  `label`, `type`, `channel`, `purpose`, `duration_seconds`,
  optional `frequency_hz` / `from_hz` / `to_hz`, and a `notes` field.
- Manifest entry with size and SHA-256.
- `tools/validate-audio-data.mjs` extended with:
  - `publicTestRecords` / `publicFetchPaths.testRecords`
  - `validateTestRecords()` that enforces closed vocabulary for
    `type`, `channel` and `purpose`; kebab-case ids; non-empty
    manufacturer / title / source; positive durations and frequencies
- `src/modules/measurement-lab/data/loadTestRecords.ts` — typed
  loader following the `loadNullPoints` pattern; caches the promise.
- `src/modules/measurement-lab/engine/iriaaFilter.ts`:
  - `riaaTimeConstantsSeconds` = `{ t1: 3180e-6, t2: 318e-6, t3: 75e-6 }`
    (canonical 3-time-constant RIAA, no Neumann)
  - `computeRiaaMagnitudeDb(freqHz)` — exact analog reference,
    normalised to 0 dB at 1 kHz; pure function
  - `computeIriaaIirCoefficients(sampleRateHz)` — bilinear-transformed
    IIRFilterNode coefficients, normalised so the digital filter is
    unity-gain at 1 kHz; pure function
  - `computeIriaaDiscreteMagnitudeDb(coefficients, freq, sampleRate)`
    — closed-form magnitude of the digital filter
  - `applyIirFilter(coefficients, input)` — sample-by-sample IIR
    runner over Float64; pure function used by the Node gate
- `src/modules/measurement-lab/dsp/iriaaNode.ts` — `createIriaaFilterNode(context)`
  that turns the pure coefficients into an `IIRFilterNode`. Browser
  glue only; the engine module is import-free.
- `tools/check-measurement-lab.mjs` — Node-only CI gate that compiles
  the engine into a temp tree and asserts:
  1. The analog reference table at 20, 50, 100, 1 k, 5 k, 10 k, 20 kHz
     matches the canonical playback RIAA to ≤ 0.05 dB.
  2. The discrete-time z-transform of the shipped coefficients lies
     within a frequency-dependent envelope of the analog reference
     (0.05 dB ≤ 1 kHz, 0.15 dB ≤ 5 kHz, 0.5 dB ≤ 10 kHz, 1.6 dB at
     20 kHz). The envelope is the bilinear-warp budget — documented
     in code with the reason.
  3. The time-domain `applyIirFilter` agrees with the closed-form
     discrete magnitude within 0.1 dB (catches indexing / accumulator
     errors).
- Source-panel toggle wired: Bypass / Apply iRIAA. When Apply is
  selected and capture is connected, the iRIAA IIRFilterNode is
  spliced between source and analyser; toggling is disabled while
  capture is live (force the user to Disconnect before changing the
  signal path).
- `package.json` `check:sanitation` now includes `check:measurement-lab`.

---

## 2. Engineering rules to carry into every S30 slice

These are not optional. They are how the project keeps small and
honest. Audit reports through S29 enforce them.

### 2.1 Strict capture constraints
`getUserMedia` MUST set `echoCancellation: false`, `noiseSuppression:
false`, `autoGainControl: false`. The audio voice-call defaults are
fatal to measurement. All new capture paths go through
`requestStrictAudioStream` in `src/shared/audio-io/`.

### 2.2 Sample-rate honesty
Every measurement that depends on absolute sample rate (speed, W&F,
inter-tone timing) MUST surface the `describeSampleRateHonesty`
classification to the user. Never silently report a precision that the
audio context cannot honour.

### 2.3 Closed vocabularies
`purpose` ∈ `speed | freq_response | crosstalk | thd | imd | resonance | tracking_ability`.
`channel` ∈ `mono | L | R | both | out_of_phase`.
`type` ∈ `sine | sweep | dual_tone | silence | noise | pulse`.
Add to `validate-audio-data.mjs` if a new value is genuinely needed;
do not extend silently.

### 2.4 Pure engines, browser glue separately
Every measurement engine lives in `src/modules/measurement-lab/engine/*.ts`
as pure functions over Float32 / Float64 arrays. The DSP node wrapper
lives in `dsp/*.ts`. The engine MUST be importable by
`tools/check-measurement-lab.mjs` in a temp `tsc` tree without any
DOM types.

### 2.5 Acceptance gates per measurement
Every measurement slice ships with a synthesised reference signal +
expected output + tolerance in `check-measurement-lab.mjs`. CI rejects
the slice if the gate is not present.

### 2.6 CSP-friendly
- No inline `<script>` (Cloudflare beacon already in `index.html`, no
  inline IIFE).
- No `wasm-unsafe-eval`. If Wasm is ever introduced, use
  `WebAssembly.instantiateStreaming(fetch(...))`.
- No `title=` on owned controls; no native HTML form validation
  bubbles; no `<form>` wrappers (avoids locale-specific tooltips).
- No `onclick=`; all events through centralised listeners on
  `data-mlab-*` attributes.

### 2.7 Render safety
All user-supplied text rendered into HTML goes through
`renderText` / `escapeHtml` / `escapeAttribute` from
`src/shared/ui/renderSafe.ts`. Test in `check-render-safe.mjs`.

### 2.8 English-only owned UI
Owned tooltips, aria-labels, status copy and notes must be English.
Proper nouns ("Löfgren") are allowed. Dataset notes flow through
`renderText` only when explicitly labelled as dataset-provided.

### 2.9 Audio graph hygiene
- Stop all `MediaStreamTrack`s on disconnect (browsers leak permission
  indicators otherwise).
- Disconnect every `AudioNode` in `teardownAudio()`.
- Close `AudioContext` on disconnect via
  `disposeMeasurementAudioContext`.
- Cancel `requestAnimationFrame` loops.
- Toggling the signal graph (e.g. iRIAA) MUST happen while the
  context is idle. Force user to Disconnect first if needed.

### 2.10 Bilinear honesty
iRIAA and any future IIR uses bilinear transform with an honest
frequency-dependent tolerance band in CI. Do not pretend a 2nd-order
biquad is bit-exact across 20 Hz – 20 kHz at 96 kHz; the warp is
real and documented.

---

## 3. Development plan for S30C – S30I

Each slice is a separate commit / push. Gates must be green between
slices. Audio-graph changes happen only while the context is idle.

### S30C — Speed and Wow & Flutter (primary value module)

**User story.** User cues a 3150 Hz or 3000 Hz speed-reference band
on their test record, hits Capture, and after 30 seconds reads off
absolute platter speed deviation (%) and AES6 unweighted / IEC weighted
W&F. The chart shows the demodulated speed signal over time so cyclic
disturbances are visible.

**Engine.** `src/modules/measurement-lab/engine/speedFlutter.ts`
- Hilbert transform or zero-crossing demodulation of the reference
  tone to recover instantaneous frequency `f_inst(t)`
- Speed deviation = mean((f_inst - f_ref) / f_ref) × 100 %
- AES6 unweighted W&F = sqrt(2) × RMS of (f_inst - mean) / f_ref over
  the analysis window
- IEC weighted W&F applies the IEC 386 weighting curve to f_inst
  before RMS
- Returns `{ speedDeviationPercent, unweightedWfPercent,
  weightedWfPercent, demodulatedSeries }`

**Worklet.** `src/modules/measurement-lab/worklets/speedFlutter.worklet.ts`
- AudioWorkletProcessor that buffers samples, computes blocks of
  demodulated values via the engine, posts metric snapshots to main
  thread

**UI.** New panel:
- Band picker (from selected test record's `purpose: 'speed'` bands)
- "Start measurement" button (records for 30 s)
- Live chart of `f_inst(t)`, settling animation
- Result block with three numbers + classification ("Ideal", "Good",
  "Acceptable", "Marginal", "Poor")

**Gate.** Feed a synthesised 3150 Hz + 0.2 % sinusoidal FM at 3 Hz to
the engine. Expect `unweightedWfPercent = 0.20 ± 0.01`. Plus a clean
3150 Hz test (no FM) → `unweightedWfPercent < 0.01`.

**Risk to flag.** OS resampling around the speed band frequency adds
artefacts; the sample-rate honesty card already surfaces this.

### S30D — Channel balance and crosstalk

**User story.** User plays the L-channel-only band then the
R-channel-only band. Tool reports per-channel RMS, L/R balance dB and
crosstalk floor.

**Engine.** `src/modules/measurement-lab/engine/crosstalk.ts`
- Per-channel RMS over a settling-trimmed window
- Crosstalk in dB = 20 × log10(off-channel RMS / on-channel RMS)
- Closed-form output `{ leftRms, rightRms, balanceDb, crosstalkDb }`

**UI.** Two-step wizard: (1) play L band, capture for 10 s,
(2) play R band, capture for 10 s. Display per-band readout +
combined balance / crosstalk numbers.

**Gate.** Synthesise 1 kHz tone on L at 0 dBFS, R at −40 dB, run the
engine. Expect crosstalk ≈ −40 dB ± 0.3 dB.

### S30E — Frequency response sweep

**User story.** User cues a 20–20k logarithmic sweep band; tool plots
magnitude vs. frequency, normalised to 0 dB at 1 kHz. iRIAA toggle
governs whether the captured signal is de-emphasised before FFT.

**Engine.** `src/modules/measurement-lab/engine/freqResponse.ts`
- Windowed FFT (Hann), at least 8192 bins
- Map FFT bins to log-frequency centres
- Normalise to 1 kHz bin
- Output `{ frequencies, magnitudesDb }`

**Worklet.** Buffers samples until the sweep window is full, then
posts a single FFT result to main thread.

**UI.** Magnitude chart with ±0.5 dB target band; toggle to overlay
RIAA reference curve when iRIAA is bypassed (so the user sees the
recording shape vs. the playback shape).

**Gate.** Synthesise flat-spectrum sweep through `applyIirFilter`
with iRIAA coefficients → expect output magnitude to match
`computeRiaaMagnitudeDb` within the bilinear-envelope tolerance from
S30B's CI gate.

### S30F — THD and IMD

**User story.** Cue 1 kHz tone, read THD %. Cue dual-tone 60 Hz +
4 kHz, read IMD %.

**Engine.** `src/modules/measurement-lab/engine/thd.ts`
- FFT, isolate fundamental
- Sum 2nd–10th harmonic bins (interpolate to handle non-integer bin
  centres)
- THD % = sqrt(sum_h amplitude_h²) / amplitude_fund × 100
- For IMD: SMPTE method, sum (f2 ± n·f1) sidebands

**Gate.** Synthesise 1 kHz + 1 % 2nd-harmonic distortion → expect
THD = 1.00 ± 0.05 %. Synthesise SMPTE IMD test signal → expect known
IMD value.

### S30G — Low-frequency resonance peak

**User story.** Cue low-frequency sweep band; tool sweeps 5–20 Hz
input and finds the frequency at which the captured signal's envelope
amplitude is largest. Reports F0 and an estimated Q (3-dB bandwidth).

**Engine.** `src/modules/measurement-lab/engine/resonance.ts`
- Envelope detection via Hilbert or low-pass-of-absolute-value
- Peak-find on the envelope vs. instantaneous sweep frequency
- Q estimate = F0 / (f_high_3dB − f_low_3dB)
- Output `{ peakFrequencyHz, peakAmplitudeLinear, qEstimate }`

**Cross-tool link.** Show "Predicted F0 from Match Lab" next to
measured F0 if the user has already selected a cartridge + tonearm.

### S30H — Provenance and JSON export polish

**Schema.** `engrove-toolbox.session/v1`, `tool: "measurement-lab"`:

```
{
  "schema": "engrove-toolbox.session/v1",
  "tool": "measurement-lab",
  "timestamp": "...",
  "dataset_version": "1.0.0",
  "capture": {
    "device_label_hash": "...",
    "requested_sample_rate_hz": 96000,
    "actual_sample_rate_hz": 48000,
    "honesty_classification": "minor",
    "iriaa_applied": false,
    "source_mode": "live" | "self-test"
  },
  "selection": {
    "cartridge": { "id": "...", "display_name": "..." } | null,
    "tonearm": { "id": "...", "display_name": "..." } | null,
    "test_record": { "id": "...", "band": "A1" } | null
  },
  "measurements": {
    "speed": { ... },
    "wow_flutter": { ... },
    "channel_balance": { ... },
    "crosstalk": { ... },
    "frequency_response": { ... },
    "thd": { ... },
    "imd": { ... },
    "resonance": { ... }
  }
}
```

No raw audio is ever exported by default. A separate opt-in feature
could allow exporting a waveform but is out of scope for v3.0.

### S30I — Cross-tool integration (v3.1 candidate)

- Send measured F0 → Match Lab as "Measured resonance"
- Send measured response null-radii → Geometry Lab
- Opt-in aggregate upload of measurement summary (numbers only, no
  audio) to a future PCML-style endpoint

This slice depends on shared cross-tool state which the workbench
does not have today; it is intentionally listed last.

---

## 4. Feature description (what Measurement Lab is, end to end)

Read this section first if you have never seen the tool.

### 4.1 Mission

A free, dataset-backed browser tool that lets cartridge and tonearm
owners measure their own setup using a standard test record and any
USB ADC. No installation, no licence, no cloud. The intent is to make
the kind of measurements that commercial tools (AnalogMagik, Virtins,
SoundSmith Cartright) charge USD 250–900 for, available in any modern
browser with strict transparency about precision and provenance.

### 4.2 User flow

1. Open `/measurement-lab`.
2. Pick a source mode: **Live capture** for real audio, **Self-test**
   to verify the meter with a synthetic 1 kHz sine (S30A).
3. (Optional) Toggle **Software iRIAA** to Apply if feeding raw
   cartridge output into a high-gain ADC without an external phono
   pre-amp (S30B).
4. Click **Connect**. Grant microphone permission (strict constraints
   force the OS to disable voice-call DSP).
5. Pick a cartridge and tonearm from the runtime dataset (S30A).
6. Pick a test record and a band (S30B onwards).
7. Pick a measurement (Speed, W&F, Channel balance, Crosstalk,
   Frequency response, THD, IMD, Resonance — landing one at a time
   from S30C to S30G).
8. Cue the band on the turntable, click **Start measurement**, watch
   the live chart, read the result.
9. Repeat for further bands.
10. Click **Export JSON** for a provenance-tagged session record.

### 4.3 What appears in the UI today (post-S30B)

Left workbench column:
- 01 Audio source: mode toggle, device picker, **iRIAA toggle**,
  requested format, actual format with honesty classification badge.
- 02 Capture session: Connect / Disconnect buttons, session status,
  honesty summary sentence.
- 03 Slice scope notice: documents what is in S30A/S30B vs. coming.

Right workbench column:
- 04 Level meter: per-channel peak / RMS bars with decaying peak hold
  and clipping warning.

Action bar:
- Action status (planned / active / done / error dot).
- Reset (disconnects + clears state).

### 4.4 What is intentionally NOT in scope for v3.x

From the research-doc audit (see commit history), the following are
listed but explicitly deferred:

- AI/computer-vision stylus profile analysis from a phone camera
- Temperature / humidity sensor integration
- Roon / Dirac / REW API integration
- MEMS-accelerometer motor analysis via phone on the platter
- NFC-tag stylus play-time logging
- Cloud aggregate database (PCML-style upload) — listed as v3.1
- Stylus-renovation booking via API
- Adaptive DSP correction in real time
- Archival playback / historical RIAA-curve selection
- Subscription / paid tier (project is free)

These are forschungs-hypoteser, not product decisions. Do not pull
them into v3 slices without explicit approval.

### 4.5 Precision claims and honest envelopes

| Measurement | Realistic browser precision | Limiter |
|---|---|---|
| Speed | ±0.02 % | OS resampling 0.01–0.05 % drift |
| W&F (AES6 RMS) | ±0.005 % | Test-record excentricity dominates ≥ 0.02 % |
| Channel balance | ±0.1 dB | ADC line balance |
| Crosstalk | floor ≈ −60 dB | ADC EMI, ground loop |
| Frequency response | ±0.3 dB (20 Hz–20 kHz) | RIAA ripple, mjukvaru-iRIAA bilinear warp |
| THD @ 1 kHz | floor ≈ −50 dB | Pickup output vs. ADC dynamic range |

Every measurement reports its confidence tag, the requested vs.
actual sample rate and a band of uncertainty around the central
value.

### 4.6 Browser compatibility

| Browser | AudioWorklet | Strict constraints | 96 kHz | Status |
|---|---|---|---|---|
| Chrome 76+ / Edge | full | full | yes | green |
| Firefox 76+ | full | full | yes | green |
| Safari 14.1+ desktop | full | limited | hardware-bound | amber |
| Safari iOS | full | flat constraints | hardware-bound | amber–red |
| Chrome Android | full | full | USB-OTG dependent | amber |

The lab detects the environment and surfaces an explicit warning
when capabilities are limited; nothing is silently downgraded.

---

## 5. File map (state after S30B)

```
src/
  app/
    home/renderHomePage.ts           tool index, route cards
    router.ts                        adds /measurement-lab
  modules/
    measurement-lab/
      data/loadTestRecords.ts        S30B
      dsp/iriaaNode.ts               S30B browser glue
      engine/iriaaFilter.ts          S30B pure math
      ui/measurementLab.css          S30A
      ui/renderMeasurementLabPage.ts S30A + S30B
      index.ts
      README.md
    tonearm-match-lab/ ...           pre-existing, untouched
    tonearm-geometry-lab/ ...
    vta-sra-lab/ ...
    compliance-estimator/ ...
  shared/
    app/buildVersion.ts
    audio-domain/ ...
    audio-io/
      audioInputDeviceList.ts        S30A
      index.ts                       S30A
      levelMetrics.ts                S30A pure
      measurementAudioContext.ts     S30A
      sampleRateHonesty.ts           S30A pure
      strictAudioStream.ts           S30A
    privacy/analytics.ts
    ui/
      renderToolTopbar.ts            includes 'measurement'
      renderSafe.ts
      runtimePickerModal.ts
      styles/*.css
    util/parseNumberInput.ts
public/data/audio/v3/runtime/
  audio-index.manifest.json          adds test-records.json entry
  cartridges.index.json
  null-points.json
  test-records.json                  S30B
  tonearms.index.json
tools/
  check-measurement-lab.mjs          S30B
  check-render-safe.mjs              S30A: ToolRouteKey union widened
  check-repo-integrity.mjs
  check-token-layout-drift.mjs       S30A: measurementLab.css registered
  check-tonearm-match-lab.mjs
  check-tonearm-runtime-selectors.mjs
  check-ui-doctrine.mjs
  validate-audio-data.mjs            S30B: validateTestRecords
```

---

## 6. Open questions to decide before S30C

These were left open at end of S30B. They are blockers only for the
respective slice; capture them at session start so they do not get
re-asked.

1. **Speed-band reference frequency**: 3150 Hz (DIN) is most common
   on modern records; 3000 Hz (some AES) is the alternative.
   Recommendation: support both, dispatch by the band's declared
   `frequency_hz` in the dataset (already in `test-records.json`).
2. **AudioWorklet build pipeline**: Vite can bundle a worklet via
   `?worker` import or via a custom plugin. Decision needed before
   S30C since the first AudioWorklet ships there.
3. **Live measurement re-routing**: should toggling iRIAA mid-capture
   be supported (kill-and-rebuild graph) or stay disabled-during-live
   as in S30B? Current code locks it during live; S30C should
   re-evaluate when measurements start.
4. **Cartridge / tonearm provenance**: should `/measurement-lab` use
   the same picker as Geometry / VTA, or a measurement-specific
   variant that filters to "has compliance" / "has effective mass"?
   Recommendation: reuse `openRuntimePickerModal` directly, no new
   variant.
5. **Self-test in production**: should self-test mode remain in
   shipped UI forever, or be hidden behind a debug flag once real
   measurements exist? Recommendation: keep — it is genuinely useful
   for verifying meter readings without a test record.

---

## 7. Commit / push protocol

- Each slice ships as one commit on
  `claude/implement-tonearm-vta-labs-W5uif`.
- Commit message convention: `feat(s30x): <title>` for net-new
  measurement modules, `fix(s30x.<n>): <title>` for repair slices,
  `chore(s30x): <title>` for tooling.
- Body includes: what landed (bulleted), gate status, explicit
  out-of-scope.
- Never amend a published commit. Never force-push to this branch
  without explicit user instruction.
- Run before push: `npm run check:sanitation`, `npm run
  check:tokens-layout`, `npm run build`, browser smoke at
  127.0.0.1 covering all six routes.
- Push: `git push -u origin claude/implement-tonearm-vta-labs-W5uif`.

---

## 8. Quick-start for a new session

```
# orient
git fetch origin
git pull --ff-only origin claude/implement-tonearm-vta-labs-W5uif
git log --oneline -10

# verify baseline is green
npm install            # only if node_modules is missing
npm run check:sanitation
npm run check:tokens-layout
npm run build

# smoke
npx vite --port 5180 --host 127.0.0.1 &
for p in / /tonearm-calculator /compliance /geometry-lab /vta-sra-lab /measurement-lab ; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "http://127.0.0.1:5180$p"
done

# read the dossier you are looking at now
$EDITOR docs/release/S30_MEASUREMENT_LAB_PLAN.md
```

Begin the next slice by claiming it in TodoWrite, branching no further
than this branch, and following the engineering rules in section 2.
