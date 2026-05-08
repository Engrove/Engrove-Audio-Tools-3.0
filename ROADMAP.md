# ROADMAP — Engrove Audio Tools 3.0

**Status:** Tool-first plan, version 0.2
**Last updated:** 2026-05-08
**Supersedes:** ROADMAP.md v0.1 (phase 16/17 shell-first plan)

---

## Mission

Engrove Audio Tools 3.0 is not a website. It is a workbench.

The home route is an index of tools, not a brochure. Every tool route is a workspace, not a landing page. There is no hero, anywhere. The user opens the site to do work.

The product is a public, modular, Cloudflare-hosted suite of audio engineering calculators and reference tools, built for turntable and tonearm enthusiasts who care about facts and reproducibility.

---

## Non-negotiable direction

Local `file://` applications are not transferred directly. They are sources for validated calculations, workflows, data contracts, domain insight and edge cases. They are not sources for public UI/UX.

UI/UX is governed by `UI_STYLESHEET.md` (currently v0.3). All routes inherit its tokens, layout doctrine, accessibility baseline, and result/gauge specification. Changes to the stylesheet bump the stylesheet version explicitly.

Domain correctness is governed by the reference model produced for the Tonearm Match Lab (resonance formula, compliance handling, classification bands, propagated uncertainty, generator-type-specific guidance, edge cases including the Ikeda 9 series and the GE 1RM6C). Inherited data defects from v0.3.0 (notably the ZYX 100 Hz vs 10 Hz misclassification reported by Reffc on Lenco Heaven, October 2025) must be resolved before any relaunch announcement.

---

## Sequencing principle

Build the lighthouse tool first. Extract shared primitives only after the first tool exists and reveals what genuinely needs to be shared. Containers emerge from content, not the other way around.

This inverts the v0.1 ROADMAP, which built the application shell, design tokens, and module-card grid before any tool worked end to end. That sequencing was site-shaped and produced site-shaped output.

---

## Phase 1 — Lighthouse tool: Resonance Calculator

**Goal:** ship a single, complete, public-quality Resonance Calculator at `/resonance` (with `/` as a one-click index pointing to it). No second tool starts until this one is complete.

This is the visual and behavioral reference implementation. Every later tool inherits its layout, density, gauge style, provenance treatment, and result rendering from here.

### 1.1 Calculation core

- Pure functions returning `{f_hz, sigma_hz, classification_band, warnings[]}` from `{M_arm, M_cart, M_screws, M_headshell?, C_10, generator_type, damping_type?}`.
- Side-effect-free, fully unit-tested against the eight worked examples in the reference model.
- Property tests: monotonicity, unit-conversion symmetry, classification threshold snapshots.

### 1.2 Data layer

- Cartridge and tonearm canonical schemas per the reference model.
- Provenance flags at field level (`manufacturer_10hz`, `manufacturer_100hz`, `manufacturer_static`, `measured_independent`, `converted`, `community_estimate`).
- Validation thresholds and match-ready filters.
- The ZYX dataset records (and any other 100-Hz-as-10-Hz misclassification) are corrected before this phase ships.

### 1.3 UI

- Tool route layout per UI_STYLESHEET.md §5.7 (two-zone workbench, 1.6fr / 1fr).
- Tool header capped at 120 px total height, title at `--font-size-tool-title` (30 px) max.
- Numeric input panel on the left, sticky result panel on the right at desktop sizes.
- Compact dataset picker buttons adjacent to relevant fields.
- Modal cartridge and tonearm pickers per §12, including focus trap.
- Resonance gauge per §13.4 with confidence band, classification badge, and ARIA text alternative.
- Provenance badges per §11.6 inline with input fields.
- Classification labels: Ideal / Good / Acceptable / Marginal / Poor. No "Perfect."
- Tracking force is visually grouped as setup-only and does not enter the resonance math.

### 1.4 Help and methodology

- A compact `<details>`-collapsed assumptions and notes section beneath the workbench.
- A separate `/methodology` route for the deep explanation: formula derivation, unit standard, classification rationale, uncertainty propagation, generator-type guidance. This is the academic anchor and is the appropriate place for narrative depth.

### 1.5 Acceptance criteria

- At 1920×1080, all primary inputs and the result are simultaneously visible without scrolling.
- At 1440×900, the same.
- At 1100×900 (narrow desktop), the workbench collapses to single column gracefully.
- At 375×812 (mobile), the layout is single-column, controls are 44 px touch targets, modal is near-full-screen.
- Lighthouse a11y score ≥ 95.
- Manual screen-reader pass: result updates announce via polite live region.
- WCAG 2.2 AA contrast verified for every state.
- All gates in UI_STYLESHEET.md §24 pass.

This is a complete tool. It is the only tool the public sees in v3.0.0.

---

## Phase 2 — Compliance Estimator

**Goal:** add the second tool at `/compliance`, inheriting Phase 1's visual contract.

Function: convert published compliance values from one frequency to another (100 Hz → 10 Hz, static → dynamic) using the reference model's per-generator-type defaults (1.5× MM/MI, 2.0× MC LO, 1.7× MC HO, 0.5 static→dynamic), with explicit confidence-widening on the converted result.

This phase tests whether the visual contract from Phase 1 is genuinely reusable. If a second tool can be built using only tokens, layout primitives, and patterns established in Phase 1, the contract is sound. If new patterns are needed, they are added to the stylesheet via an explicit version bump.

---

## Phase 3 — Alignment Calculator

**Goal:** add `/alignment` with Löfgren A (Baerwald), Löfgren B, Löfgren C ("exact" formulas per Jovanovic 2022, JAES), Stevenson, and custom-null geometry.

This is the most computationally rich tool. It will require additional UI primitives: 2D arc rendering, draggable null points, dimension dual-readouts (mm and inches), and a printable 1:1 protractor export. These primitives are added to the stylesheet (charts, draggable elements) only when this phase reveals them as necessary.

Primary citation: Jovanovic, V. M., "New Analytical Results for Löfgren C Tonearm Alignment," JAES Vol. 70 No. 3, March 2022.

---

## Phase 4 — Data Explorer

**Goal:** add `/explore` — a search and filter view across the cartridge and tonearm datasets, consuming the same data layer the calculators use.

This is intentionally the *fourth* tool, not the first. The Data Explorer is most valuable when the calculators already exist to act on its output. Selecting a row sends the user to the appropriate calculator with values pre-filled.

Filters cover the canonical fields: search, generator type, mass range, compliance range, headshell convention, match-ready flag, provenance confidence floor, vintage flag.

---

## Phase 5 — Differentiator tools (Tier 1)

These are short-build, high-differentiation tools identified in the public-tool landscape analysis. They are absent or weakly served by Vinyl Engine, Korf, Audio-Technica, etc.

- **Headshell-swap simulator.** Inside the resonance calculator, a small subpanel that lets the user try three different headshell masses and see the gauge marker move live.
- **Multi-cartridge overlay.** Overlay up to five cartridges on the same arm, with their resonance frequencies and confidence bands rendered together on the gauge.
- **Mat-thickness VTA recompensator.** Given a tonearm length, output the VTA pivot height delta needed for a 1 mm, 2 mm, or N mm mat thickness change.
- **Q-factor / damping aware result modifier.** Damping selector (none / silicone / dynamic stabilizer / unknown) modifies the textual result qualifier and the gauge confidence band.

Each is small and tests a different facet of the visual contract.

---

## Phase 6 — Differentiator tools (Tier 2)

Higher-effort, higher-uniqueness tools. Each warrants its own route.

- **Anti-skate force vs radius curve calculator.** Inputs: stylus profile, offset angle, VTF, groove radius. Output: lateral skating force as a function of radius, plotted.
- **Step-up transformer reflected impedance calculator.** Inputs: SUT ratio, primary/secondary preamp loading. Output: total electrical response including RIAA, with cartridge inductance and capacitance modeled.
- **Trackability vs warp spectrum simulator.** Inputs: compliance, VTF, f₀, Q. Output: mistracking risk over Ladegaard's warp spectrum (Happ–Karlov 1976 data).
- **Lateral vs vertical resonance advanced mode.** Inside the resonance calculator, a toggle that exposes per-axis effective mass and per-axis compliance fields, producing two resonances. Required path for `arm_geometry == linear_tangential`.

Tier 2 work begins after Tier 1 stabilizes the patterns it needs.

---

## Phase 7 — Differentiator tools (Tier 3)

Engrove-domain-exclusive territory. Long build, no public competition.

- **Linear-tangential tonearm physics tool.** Builds on the Astraline and Schröder LT design work. Per-axis mass treatment, friction modeling, sled vs pivot-arm geometry comparisons.
- **Magnetic bearing / eddy-current characterization tool.** Inputs: magnet strength, gap, conductor material. Output: eddy-current damping coefficient, stiffness, hysteresis estimate.
- **Cantilever effective tip mass calculator.** From cantilever material, length, profile, and stylus mass, derive the effective tip mass at the contact point.
- **Suspension aging / break-in compliance estimator.** From release year, hours of use, and storage history, estimate current dynamic compliance vs spec.

These are the tools that justify the project's existence as something other than a Vinyl Engine clone.

---

## Phase 8 — Tonearm Designer (productized)

**Goal:** productize the local prototype TonearmDesigner. Transfer geometry/calculation engine, cartridge integration, resonance/COM/mass logic, validated edge cases.

Do not transfer prototype solver sandbox UI, dense debug panels, file:// workaround mechanisms, or internal release wording.

This is the most ambitious public tool and is appropriate as the eighth phase, after the visual contract has been stress-tested by seven prior tools.

---

## Phase 9 — Test-record analysis (long-horizon)

Concept stage from v0.3.0 (Lenco Heaven, July 2025): upload audio recordings from test LPs, perform sweep analysis, peak detection, channel separation, phase offset visualization. Audio Hub for managing recordings, Results Archive for overlay comparison.

This is multi-month and likely requires Cloudflare Pages Functions or a separate audio-processing endpoint. Sequenced last because it requires backend infrastructure decisions the earlier phases do not.

---

## Cross-phase: data hygiene continuous track

Independent of phase order, a continuous workstream:

- Resolve inherited v0.3.0 data defects (ZYX 100 Hz misclassification, missing Audiomods Series 6 evo, Ikeda 9 MUSA / 9 Supreme integrated-headshell field semantics, GE 1RM6C mono-78 caveat).
- Establish per-field provenance flags on all cartridge and tonearm records.
- Nightly or pre-build validation pass that surfaces match-ready failures.
- Public changelog of data corrections, so users like Reffc and dtroise see their feedback acknowledged.

---

## Cross-phase: legacy continuity

The v0.3.0 / v2.0 deployments at `engrove.pages.dev`, `engrove-audio.pages.dev`, and `engrove.netlify.app` are the project's installed user base. The v3.0 launch must address them explicitly:

**Recommended pattern:** soft parallel. The legacy site stays at `engrove.pages.dev/legacy` (or as a frozen mirror) with a banner pointing to v3.0. The v3.0 site at `engrove-toolbox.pages.dev` is the new canonical address. A short `/changes` route on v3.0 lists the corrections and improvements over v0.3.0, including specific user-reported fixes (Reffc's ZYX correction; dtroise's DL-103 verification path).

This honors the community feedback that built the project and demonstrates that bug reports went somewhere.

---

## Launch readiness gate (per tool, not per release)

A tool is launch-worthy only when it:

- builds on Cloudflare Pages,
- works in modern browsers (Chrome/Edge/Firefox/Safari latest two versions),
- passes WCAG 2.2 AA on every interactive surface,
- has a mobile-usable layout per UI_STYLESHEET.md §17.4,
- has zero app-caused blocking console errors,
- includes public help/copy in English only,
- passes all gates in UI_STYLESHEET.md §24,
- documents domain caveats inline in the result panel,
- makes no unverified claims (no "Perfect," no "Guaranteed," no marketing superlatives),
- has its data layer cleared of known inherited defects affecting that tool.

A tool that does not pass all of these is not shipped, regardless of how complete the rest of the suite is. The whole-suite "v3.0.0" tag is reserved for whenever the first complete tool ships, not for shell-only readiness.

---

## What this ROADMAP does not include

Items deliberately out of scope for the foreseeable phases:

- React / Vue / Svelte / framework migration. The hand-written Vite + TS stack is the chosen substrate.
- A blog or news section. The project is a workbench, not a publication.
- User accounts or saved state on the server. All session state is local; persistent state lives in `localStorage` or in URL parameters that can be bookmarked.
- Marketing pages, hero videos, testimonial sections, "Why Engrove" pages, or any other site-shaped content.
- Affiliate links, analytics tracking beyond minimal Cloudflare default, or anything that compromises the workbench character.

---

## Single-line restatement

Build the resonance calculator. Make it correct. Make it fast. Make it dense. Make it accessible. Make it cite its sources. Then build the next one.
