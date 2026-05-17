
# S5x Workbench Direction

S5x should not simply stack more panels. The goal is to evolve Measurement Lab
from a long form/panel list into an instrument-class measurement workbench.

## Direction

**Sticky session / status ribbon**
A persistent top ribbon shows live connection status, signal health, selected
test record and active workflow — always visible while scrolling or measuring.

**Active measurement workbench / primary graph**
During a measurement the primary graph (waveform, spectrum or response curve)
dominates the viewport. Setup panels collapse to a compact rail so they stay
accessible without consuming screen space.

**Compact setup / coverage while measuring**
The audio-source setup and coverage panels collapse automatically when a
workflow is active. The user can expand them without stopping the measurement.

**Diagnostic rail for signal health**
A persistent sidebar shows real-time signal health indicators: level, clipping,
sample-rate honesty, and run confidence. These inform the user before and
during capture — not only in the result.

**Run history / overlays / notes / export drawer**
A slide-in drawer (or tab group) holds the activity log, run history, overlay
comparisons between runs, per-run notes, and export controls. This keeps the
main workbench surface clean.

**Run confidence and provenance**
Every result is tagged with: source (live / self-test), test record, band,
sample rate, capture duration and a confidence indicator. Results from
different records or sessions can be overlaid and compared.

**Accessible status: color is not the only signal**
Status badges, dots and grade indicators must use text labels, icons or
patterns in addition to color. WCAG AA contrast is the floor, not the ceiling.

## What this is not

This is a direction note, not a full spec. Individual S5x patches will define
scope, data models and UX copy for each feature as they are implemented. No
feature here should be faked or scaffolded before its engine exists.
