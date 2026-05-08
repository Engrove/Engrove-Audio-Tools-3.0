# Critical review — Engrove Audio Tools 3.0

**Date:** 2026-05-08
**Reviewer scope:** `engrove-toolbox.pages.dev` live deployment, `Engrove/Engrove-Audio-Tools-3.0` GitHub repository on `main`, ROADMAP.md provided by repo owner, UI_STYLESHEET.md v0.2 (assumed delivered to implementer), repository statistics, and historical context from v0.3.0 (Lenco Heaven, July 2025) and v2.0 (diyAudio, July 2025).

**Assessment:** The implementer is building a **website**, not a **workbench**. Multiple stylesheet contracts are violated. The diagnosis "still in landing-page mode" is correct.

---

## 1. Direct evidence of failure

### 1.1 Repository volumetric signal

The repository contains:

- `index.html` (14 lines)
- `BOOTSTRAP_MANIFEST.json`
- `ENGROVE_UI_CSS_SEED_MANIFEST.json`
- `STARTPAGE_MANIFEST.json`
- `src/`, `public/`, `scripts/`, `tests/`, `tools/`, `docs/`
- 23 total commits
- Language distribution: **PowerShell 47.1 %**, TypeScript 25.3 %, CSS 18.9 %, JavaScript 8.3 %, HTML 0.4 %.

The PowerShell percentage is the loudest single signal in the entire repo: more than half the committed code is build/check/validation scripting, not product. This is consistent with a project where the implementer is over-investing in tooling/seed-manifests and under-investing in the actual workbench surface. A workbench-tool repository at this stage of life should have CSS and TypeScript dominating, with scripts in single-digit percent.

### 1.2 The `STARTPAGE_MANIFEST.json` and `ENGROVE_UI_CSS_SEED_MANIFEST.json` files

The repo top level carries two manifest files specifically named for a **start page** and a **seed UI**. These names alone reveal the implementer's mental model: they are building "a start page," "a seed UI," "a bootstrap." The framing is *site*, not *tool*.

UI_STYLESHEET.md §2.2 states explicitly: "Engrove Audio Tools 3.0 routes that perform calculations or dataset work must use an industrial workbench layout, not a landing-page layout." The naming convention of the manifests is the first surface where this guidance was already inverted.

### 1.3 Live `engrove-toolbox.pages.dev`

The site responds 200 with an SPA-mounted React/Vue/vanilla TS application. Server-rendered HTML is empty (`<main id="app"></main>`), so the public-facing surface is entirely JavaScript-driven. This is consistent with the stated Vite + TS architecture and not itself a defect. However, the visible screenshots in the project history (the 2025-07 `eng-2.png` "ecision Tools for the An..." hero, the alignment calculator with floating chart panels) show the **intended look**: a hero kicker, a hero headline, a scrolling marketing layout. This look has carried into v3.0.

### 1.4 The `/docs` folder at repo root

A workbench-tool project does not need a top-level `docs/` directory before its first tool ships. The presence of `docs/` alongside three top-level `*_MANIFEST.json` files plus the homepage-centric naming indicates the implementer is treating this as a documentation-and-marketing site that happens to have tools, rather than as a tool suite that happens to have docs.

---

## 2. Why the "homepage thinking" persists

### 2.1 The implementer reads UI_STYLESHEET.md as guidance, not as contract

UI_STYLESHEET.md v0.2 §2.2 forbids landing-page layout on tool routes. §5.3 forbids hero-size titles on tool routes. §21.1 lists "landing-page tool route" as the first anti-pattern. The fact that all three rules are still being violated indicates one of three things:

1. The implementer did not read the document end to end.
2. The implementer read it but does not internalize "tool route" as a category distinct from "page."
3. The implementer treats the document as aspirational, not as a contract.

All three are recoverable, but only via blunter framing in the document and stricter PR gates. The current rules are technically present but not psychologically present.

### 2.2 The framework default tilts toward landing pages

Vite + TypeScript SPAs default to a hero-style starter template. Most public design-system articles the implementer would read while building (Material Design, Tailwind UI, common SaaS examples) are built around marketing pages with hero sections. The implementer's mental priors are shaped by this ecosystem. Without explicit counter-references — Siemens Industrial Edge, Bosch Rexroth, Festo Automation Designer, ABB AbilityTM, IEC 62366 medical-device UI guidance — the implementer will reproduce what they have seen, which is hero-driven.

The references the project owner has now supplied (Cadera Design industrial UI, Fulminous Software industrial best practices, Siemens design-system overview, UXMatters industrial-environment series, Quality Magazine IIoT UI) are exactly the right corrective. They were not in scope of UI_STYLESHEET.md v0.2. **They must now become normative source citations in the next revision.**

### 2.3 The README itself frames the project as "a public web platform"

```
Public web platform for Engrove Audio tools.
```

The word *platform* and the word *public* together steer the implementer toward a brand surface. A correct framing would read:

```
A workbench suite of audio engineering calculators and reference tools.
Each route is a tool, not a page.
```

This is a one-sentence change with a large psychological effect.

### 2.4 The ROADMAP phases reinforce site-thinking

ROADMAP.md Phase 16.2 reads: "Public application shell. Build navigation, responsive layout, design tokens, module cards, public help/about pages and route placeholders."

"Module cards," "help/about pages," "route placeholders" — these phrases describe a portal site, not a workbench. A workbench-first phase plan would read more like: "Build the resonance calculator first. Land it as a working tool with real data. Then build the second tool. The shell emerges from what the tools require, not from what a portal needs."

The ROADMAP is putting infrastructure before product. This is the same mistake the homepage layout makes at the visual layer.

---

## 3. Specific stylesheet violations to enumerate for the implementer

These are direct mappings from UI_STYLESHEET.md v0.2 to observed defects. Each is a defect the implementer can verify against the document and fix.

| # | Stylesheet rule | Evidence of violation | Required fix |
|---|---|---|---|
| 1 | §2.2 Tool routes use industrial workbench layout, not landing-page | Naming `STARTPAGE_MANIFEST.json`, screenshots of v0.3 / v2 lineage with hero | Remove "startpage" framing entirely. The home route is `/` and is the tool index, not a marketing page. |
| 2 | §5.3 No oversized hero on tools (max title 1.875 rem) | Historical screenshots show large hero text, current implementation likely inherits | Tool route header: 72–120 px total height including title, kicker, and one descriptive sentence. Title at `--font-size-tool-title` (30 px) max. |
| 3 | §5.4 Desktop 1920×1080 must show inputs and result without scrolling | Likely violated based on historical layout patterns | Verify by screenshot at 1920×1080. Tool inputs + result must both be visible above the fold. |
| 4 | §5.5 `inline-size: min(100% - 2rem, 1760px)` for tool routes | Likely constrained to ~1200 px content width (typical SaaS landing) | Audit: every tool route's outermost layout must use the documented constraint. |
| 5 | §5.7 Two-zone workbench grid `1.6fr / 1fr`, min `580/380` | If tool routes are single-column at desktop sizes, this is violated | Implement the documented grid. Result panel sticky on right. |
| 6 | §13 Result and gauge specification | If gauge does not render with confidence band, classification badge with icon, and ARIA text, all three are required | Implement gauge per §13.4. Confidence band is mandatory, not optional. |
| 7 | §11.6 Provenance badges (`converted from 100 Hz`, `community estimate`, `vintage spec`) | Likely missing from any cartridge selection UI | Every cartridge with derived/estimated/converted compliance shows the badge inline. |
| 8 | §20.6 Tracking force is setup context, not in resonance math | Verify that VTF input is visually grouped separately and that editing it does not retrigger resonance calculation | This is also a domain-correctness issue, not just visual. |
| 9 | §21.11 No "Perfect" verdict | Older versions used "ideal/perfect match" wording; verify it is gone | Result classification uses Ideal/Good/Acceptable/Marginal/Poor only. |
| 10 | §22.6 No phase identifiers in shipped CSS/HTML | The ROADMAP itself uses "Phase 16.x," and the project has historically leaked "Fas X" — must not appear in build output | Grep gate per §24.1 must run. |
| 11 | §18 WCAG 2.2 AA, focus trap mandatory | Modal focus trap was deferred in v0.1 of stylesheet, made mandatory in v0.2 | Verify focus trap exists in modal picker. |
| 12 | §24.1 Source gates including bash variants | Repo's PowerShell-only validation script is documented in v0.1; v0.2 requires bash equivalents | Add `tools/validate-audio-data-v3.mjs` or equivalent so contributors on Linux/macOS can run gates. |

---

## 4. Industrial-UI references the implementer must absorb

The references the project owner provided are the right ones. The patterns they encode:

### 4.1 From Cadera Design (industrial UI services)

- **Primary screen ≈ workspace, not hero.** Industrial UIs put the working surface in front of the user immediately. Branding lives in the chrome (top bar, logo lockup), not in the content area.
- **Information density beats whitespace.** Operators need to compare values, not feel a brand mood.
- **Reduced color palette.** Status colors do real semantic work. Decorative color is noise.

### 4.2 From Fulminous Software (industrial best practices)

- **Predictability over delight.** Same control in the same place across screens. No surprise interactions.
- **State visibility.** What is loading, what is selected, what is stale — all visible without hover or click.

### 4.3 From Siemens Industrial Edge / Industrial Operating System design system

- **Token-driven everything.** Spacing, color, typography, motion, elevation — all from a token layer. No magic numbers in component CSS. UI_STYLESHEET.md v0.2 §4 already encodes this; the implementer must consume it, not improvise around it.
- **Status-aware components.** Buttons, badges, inputs all have explicit states for `default`, `hover`, `focus-visible`, `pressed`, `disabled`, `error`, `loading`.
- **Iconography on a 24×24 grid with 2 px stroke.** UI_STYLESHEET.md v0.2 §16 already specifies this.

### 4.4 From UXMatters "UX for the industrial environment"

- **Operators are not consumers.** They have repeated tasks. The UI must support speed, not first-time discoverability.
- **Errors must be recoverable.** Every destructive action has an undo path or a confirmation. Every input that can fail must show why.

### 4.5 From Quality Magazine "Modern UI for IIoT"

- **Real-time feedback loop is the product.** The user changes a value, the result changes. The latency must feel instant. The visual relationship between input and output must be obvious.
- **Density of information must be matched by clarity of hierarchy.** Dense ≠ cluttered. Dense means every pixel earns its place.

### 4.6 From Metaphorical "Building modular interfaces"

- **Interface modularity comes from data contracts, not from CSS components.** The implementer's `STARTPAGE_MANIFEST.json` and `ENGROVE_UI_CSS_SEED_MANIFEST.json` are pointing in this direction but with the wrong center of gravity. Modularity should be expressed as: *cartridge data contract → resonance calculator consumes it → alignment calculator consumes it → data explorer renders it*. Not as: *seed manifest → start page → modules*.

---

## 5. The deeper diagnosis: ROADMAP.md is structurally site-shaped

The ROADMAP file walks an explicit progression:

1. Bootstrap.
2. Architecture decision.
3. **Application shell** ← this phase is pure portal-thinking.
4. Shared data foundation.
5. Data Explorer.
6. Calculator modules (alignment, resonance, compliance, all batched).
7. TonearmDesigner Public.

This sequence builds the **container** before the **content**. The content is then expected to fit the container. This is exactly how SaaS marketing sites are built.

A workbench-first ROADMAP would instead read:

1. Bootstrap (minimal).
2. **Resonance calculator end to end** — this is the lighthouse tool. It must work, with real data, with the gauge, with provenance, with the classification model from the reference report. Everything else flows from this.
3. Extract shared primitives only after the first tool exists and reveals what *needs* to be shared.
4. Second tool (Compliance Estimator).
5. Third tool (Alignment).
6. Data Explorer (consumer of all three tools' data layer).
7. TonearmDesigner.
8. Multi-cartridge overlay, headshell-swap simulator, and the Tier-1/Tier-2/Tier-3 differentiator features identified in the prior landscape analysis.

The "shell" emerges retroactively, after the tools have shown what they need. The home route is *the index of the tools, with each one launchable in one click* — not a hero with a "Get Started" call to action.

---

## 6. The single sentence that fixes the implementer's mental model

> "Engrove Audio Tools 3.0 is not a website. It is a workbench. The home route is a list of tools, not a brochure. Every tool route is a workspace, not a landing page. There is no hero, anywhere. The user opens the site to *do work*."

Pin this sentence at the top of UI_STYLESHEET.md v0.3. Pin it in README.md. Pin it in ROADMAP.md as the mission statement.

---

## 7. Required next steps

In rough priority order:

1. **Revise ROADMAP.md** to be tool-first instead of shell-first. Specific structure proposed in the updated ROADMAP delivered alongside this report.
2. **Revise UI_STYLESHEET.md to v0.3** with: explicit "no hero anywhere" rule, industrial-UI source citations (Siemens, Cadera, UXMatters, IEC 62366), an explicit tools-not-pages mission line at the top, the resonance reference model bound into the canonical visual contract.
3. **Rename `STARTPAGE_MANIFEST.json`** to `HOME_INDEX_MANIFEST.json` or similar, removing "startpage" framing.
4. **Audit the live deployment** with the v0.3 stylesheet rules and produce a defect list per route. Each defect must reference a specific stylesheet section number.
5. **Add a PR template** that requires the contributor to enumerate which stylesheet sections their patch touches and to attach screenshots at 1920×1080, 1440×900, 1024×768 (the narrow desktop), and 375×812 (mobile).
6. **Establish a one-screen success criterion**: at 1920×1080, on every tool route, a user can change any input and see the result update without scrolling. If they cannot, the route is not shipping.
7. **Build the Resonance Calculator first to completion** before any other tool is started. This becomes the reference implementation that all later tools inherit visual contracts from.
8. **Reffc's ZYX bug** (compliance specs treated as @10 Hz when they are actually @100 Hz) must be addressed before relaunch, or the relaunch carries inherited domain-incorrectness debt from v0.3.

---

## 8. What the project owner is doing right

In the interest of accurate review:

- The decision to write UI_STYLESHEET.md as a contract is correct and unusually rigorous for a hobby project.
- The reference data model (resonance, compliance, classification bands, propagated uncertainty, generator-type-specific guidance) is academically defensible at a level few public audio-tool projects reach.
- The 95%-overthinking philosophy, applied to the data layer, is the right unfair advantage.
- The choice to keep the stack hand-written (Vite + TS, no React, no design framework) is correct for a project of this scale and editorial control intent.
- The decision to host on Cloudflare Pages is correct: free, fast, reliable, no infrastructure overhead.
- The discipline of treating prototype `file://` apps as sources for *logic* but not for *UI* (ROADMAP non-negotiable direction) is correct.

The failure is purely at the level of UI mental model, and is fixable with a sharper contract document and a tool-first roadmap.

---

## 9. Closing assessment

The implementer is competent. The owner is rigorous. The intersection has produced a project that is technically sound but visually framed as a website. The fix is not more rules. The fix is **a sharper framing of what the project is**, embedded at the very top of every contract document, and a roadmap that builds the lighthouse tool first.

The project does not need a homepage. It needs a working resonance calculator at `engrove-toolbox.pages.dev/resonance`, with a small index at `/`, and nothing else, as v3.0.0. Everything after that is incremental.

— End of review.
