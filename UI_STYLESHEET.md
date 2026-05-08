# UI_STYLESHEET.md

**Status:** Draft standard, version 0.3
**Scope:** Engrove Audio Tools 3.0 public web app
**Last updated:** 2026-05-08
**Supersedes:** v0.2 (2026-05-08, partially adopted in repo)
**Applies to:** every route, every component, every CSS file, every TypeScript renderer that produces public markup.

---

## STOP. READ THIS BEFORE WRITING ANY CODE.

This project builds **tools**, not a website.

There is no hero. Anywhere. Not on the home page, not on tool pages.
There is no "Explore" button. There is no "Get Started" call to action.
There is no "Launch chain" section bragging about CI.
There is no marketing copy. There is no `__lede`, no `__backdrop`.

The home route is **an index of working tools**. The user opens the site, sees the tools available, clicks one, starts working. Total time from URL to first calculation: under five seconds.

If you are about to build something that looks like a SaaS landing page, **stop and re-read this document**. If anything in your patch contains the word "hero," the word "platform" used as a section heading, or a kicker followed by a giant headline, **the patch is wrong**.

The single sentence that defines this project:

> **Engrove Audio Tools 3.0 is a workbench. The home route is a list of tools, not a brochure. Every tool route is a workspace, not a landing page. There is no hero, anywhere. The user opens the site to do work.**

This sentence is binding. It overrides any conflict elsewhere in this document or in the codebase.

---

## Changelog

| Version | Date | Notes |
|---|---|---|
| 0.1 | 2026-05-07 | Initial draft (English-only rules, layout doctrine, density tokens). |
| 0.2 | 2026-05-08 | Added complete design-token layer, gauge spec, accessibility WCAG 2.2 AA, Match Lab classification UI binding. Removed personal names. |
| 0.3 | 2026-05-08 | Hard ban on hero patterns including `.ea-hero` and `.tm-lab-hero`. Industrial-UI source citations as normative references. Tokens layer expanded to mandatory completeness. `--ea-page-max` deprecated; workbench width replaces it. Marketing copy ban with named forbidden phrases. CSS file responsibility clarified. Class-contract reconciliation. PR-template attachment requirements. Domain-correctness binding from reference report. ROADMAP-aligned v0.2 tool-first sequencing. |

Rule: any non-trivial change to this document increments the minor version, with a changelog row stating what changed and why. Conflicts between code and this document are resolved by either patching the code or by a deliberate revision committed here. Silent drift is a defect.

Rule: every contributor must read the entire current version of this document before opening a PR. PRs that violate explicit rules in this document are rejected without further review.

---

## 1. Purpose and product framing

### 1.1 What this project is

Engrove Audio Tools 3.0 is a **public, modular workbench suite** of audio engineering calculators and reference tools, built for turntable and tonearm enthusiasts who care about facts and reproducibility.

Each tool is a workspace. The home is an index. There is no marketing surface.

### 1.2 What this project is not

It is not a SaaS product. It is not a startup landing page. It is not a portfolio site. It is not a documentation portal. It is not a blog. It is not a brand showcase. It is not an open-source project marketing page.

The implementer is encouraged to look at the references in §3 and **mentally erase every Tailwind UI / Material Design / SaaS landing-page pattern they have seen**. Those references are wrong for this product. The correct references are industrial control-room UIs, machine HMIs, and engineering calculators.

### 1.3 The audience

The audience is audiophile and DIY-audio enthusiasts with technical literacy. They read manufacturer datasheets. They know that compliance is specified at different frequencies. They argue about Löfgren A vs Löfgren B. They are not consumers being introduced to a product. **They are operators using a tool.**

Treat them accordingly. No condescending helper text. No "Welcome to the Engrove Audio Toolkit!" greetings. No emoji in copy. No hype.

---

## 2. Non-negotiable rules

### 2.1 Public UI language

All public user-facing UI copy must be English.

Forbidden in shipped output:

- Swedish headings, labels, buttons, helper text, error text, empty states, result text.
- Internal phase identifiers (`Fas 17.x`, `Phase 4`, etc.).
- Internal contributor names, role names, or workflow terms.
- Internal release wording ("preview build", "internal", "draft", "prototype").

Swedish is allowed in commit messages and internal planning. It must not leak into the bundle.

### 2.2 Industrial workbench layout

All routes that perform calculations or dataset work must use an **industrial workbench layout**, not a landing-page layout.

The home route is also a workbench layout. The home route is the **tool index**. It is not a landing page.

There is no exception to this rule. Including for the home page.

### 2.3 No large inline dataset lists

Cartridge, tonearm, and other audio datasets must never render as long inline lists. Use a modal, drawer, panel, or virtualized list. The normal calculator flow stays compact.

### 2.4 Route contracts

Established route contracts are not broken without an explicit, version-bumped revision of this document.

For Tonearm Match Lab:

```ts
renderTonearmMatchLabPage(): string
enableTonearmMatchLabInteractions(): void
```

### 2.5 Render safety

Dataset strings are untrusted. Any dataset-sourced string rendered into HTML must pass through:

```ts
renderText(value)
escapeAttribute(value)
escapeHtml(value)
```

No raw dataset string may be interpolated into `innerHTML`. Static analysis must catch violations (see §24).

### 2.6 No framework drift

Vite + TypeScript SPA with hand-written CSS. No React. No Vue. No Tailwind. No Material UI. No Radix. No shadcn. No design framework. Adding any of these requires an explicit, version-bumped revision of this document and an architectural-decision document under `/docs/architecture/`.

### 2.7 No hero patterns

This rule is new in v0.3 and is binding.

Forbidden CSS class names anywhere in the codebase:

- `.ea-hero`
- `.tm-lab-hero`
- `.*-hero`, `.*__hero`, `.hero-*`
- `.ea-hero__backdrop`, `.tm-lab-hero__backdrop`, `.*-backdrop`, `.*__backdrop`
- `.ea-hero__actions`, `.*-hero-actions`
- `.ea-hero__lead`, `.tm-lab-lede`, `.*-lede`, `.*-lead`

If a CSS file or a TypeScript renderer contains any of the above, that file is a defect and must be patched in the same change that adds this version of the document.

Forbidden HTML structures (semantic equivalents to the above):

- A `<section>` followed by a `<p class="kicker">` followed by an `<h1>` larger than `--font-size-tool-title` (30 px).
- A backdrop image set as `background-image` on any element above the workbench.
- A pair of buttons positioned center-screen with marketing labels ("Explore", "Get Started", "Learn more", "View Platform", "Open Toolkit").

A workbench tool route's first viewport must contain working controls and a result, not introductory content.

### 2.8 No marketing voice

Forbidden phrases in shipped public copy:

- "Precision Tools for the Analog Enthusiast"
- "Built as modules from day one"
- "Focused tools, shared foundation"
- "A clean public toolkit"
- "Explore the Tools"
- "Public productization track"
- "Launch chain"
- "GitHub to Cloudflare is live"
- "Cloudflare Pages deployment verified"
- "Workers static-assets fallback verified"
- "Public productization rules established"
- Any sentence that describes infrastructure status to the end user.
- Any sentence that uses "we" referring to the project team to the end user.

The user is opening a tool. They do not care that the deployment chain is verified. They do not care that the project is built as modules from day one. They care that they can compute a resonance frequency and get a defensible answer.

Replace marketing copy with operational copy:

- Bad: "Precision Tools for the Analog Enthusiast."
- Good: "Engrove Audio Tools" (wordmark only, no tagline).
- Bad: "Built as modules from day one."
- Good: nothing — delete the section.
- Bad: "GitHub to Cloudflare is live."
- Good: nothing — delete the section.

### 2.9 No infrastructure self-congratulation

Do not ship sections, panels, or copy that describe the project's own deployment, build pipeline, hosting, or technical stack to end users. This information belongs in `/docs`, in `README.md`, in `wrangler.toml`, in `package.json`. It does not belong on any public route.

### 2.10 No "Planned" or "Coming soon" tool cards

A tool either ships or it does not exist on the home index. There are no placeholder cards for tools that are not yet built. The user opening the site sees only working tools.

If only one tool works, the home route shows one tool plus a single line of meta text ("More tools coming. This is a hobby project."). It does not show four cards with three of them disabled.

---

## 3. Normative source references for industrial UI

The following are normative references for this project's UI character. The implementer must consult at least one of these per design decision and must not consult SaaS marketing references (Tailwind UI, Stripe, Linear, etc.) for layout or copy patterns.

### 3.1 Industrial UI design firms

- **Cadera Design** — `caderadesign.de/en/services/user-interface-design`. Industrial UI services. Patterns: working-surface-first, density beats whitespace, reduced color palette doing semantic work.
- **Design Mark** — `design-mark.com/understanding-user-interface-design-for-industrial-applications/`. Industrial application UI patterns: state visibility, predictability over delight.
- **Scream Pixel** — `screampixel.com/industries/industrial/`. Industrial vertical UI examples. Patterns: dense control panels, calm visual hierarchy.
- **David Taylor Digital** — `davidtaylordigital.com/blog/manufacturing-web-design/`. Manufacturing web design patterns: function over form.

### 3.2 Engineering and operational UI references

- **Siemens Industrial Design System** — `developer.siemens.com/resources/design-systems/overview.html`. Token-driven, status-aware, monochromatic-first. The reference design system for this project.
- **UXMatters: UX for the Industrial Environment** — `uxmatters.com/mt/archives/2017/08/ux-for-the-industrial-environment-part-1.php`. Operators are not consumers. Speed over discoverability. Recoverable errors.
- **Quality Magazine: Modern UI for IIoT** — `qualitymag.com/articles/94389-modern-ui-design-for-the-industrial-internet-of-things`. Real-time feedback loop is the product. Density of information matched by clarity of hierarchy.
- **Fulminous Software: Industrial Best Practices** — `fulminoussoftware.com/user-interface-best-practices-for-industrial-websites`. Predictability, state visibility, repeated-task support.

### 3.3 Architectural pattern reference

- **Metaphorical: Building Modular Interfaces** — `metaphorical.medium.com/building-modular-interfaces-a4e4076b4307`. Modularity comes from data contracts, not from CSS components. Tools share a domain model, not a shell.

### 3.4 Domain-correctness reference (binding)

The reference data model produced for the Tonearm Match Lab (resonance formula derivation, compliance handling per generator type, classification bands with physical justification, propagated uncertainty, Ladegaard B&K AN 17-233, Carlson AES 1954, IEC 60098, Jovanovic JAES 2022) is binding for any UI element that displays calculation results. UI choices that contradict the reference model (e.g., displaying "Perfect," including tracking force in the resonance mass term, treating Japanese 100 Hz compliance as if it were 10 Hz) are defects regardless of how visually polished they are.

The Reffc bug report (Lenco Heaven, October 2025) — ZYX cartridge compliance values misclassified as 10 Hz when they are published at 100 Hz — must be resolved in the data layer before any relaunch announcement.

---

## 4. Design tokens (canonical reference, complete)

This is the **single source of truth** for visual values. All routes consume these tokens. Hard-coded color, spacing, font-size, motion, or z-index literals outside this token layer are defects.

CSS that uses fallback values like `var(--color-status-ideal, #34d399)` is a **partial defect**: the fallback indicates the token is missing from the canonical layer. The fix is to add the token to the layer, not to keep the fallback. Token completeness is a precondition for shipping.

### 4.1 Token namespace

All tokens use the `--ea-*` prefix (Engrove App). Sub-prefixes:

- `--ea-color-*` color tokens
- `--ea-text-*` text-color subset (high/medium/low/disabled)
- `--ea-bg-*` background-color subset
- `--ea-border-*` border-color subset
- `--ea-status-*` status-color subset
- `--ea-space-*` spacing scale
- `--ea-size-*` size scale (control heights, panel widths)
- `--ea-radius-*` corner radius scale
- `--ea-shadow-*` elevation scale
- `--ea-z-*` z-index scale
- `--ea-motion-duration-*` motion duration scale
- `--ea-motion-easing-*` motion easing scale
- `--ea-font-family-*` font-family stacks
- `--ea-font-weight-*` font weight scale
- `--ea-font-size-*` font size scale
- `--ea-line-height-*` line height scale
- `--ea-letter-spacing-*` letter spacing scale

The legacy v0.2 namespace `--color-*`, `--space-*`, etc. (no prefix) is **deprecated**. The Tonearm Match Lab CSS that uses `var(--color-status-ideal, ...)` is using a defunct namespace and must be migrated. All variants must be `--ea-*`.

### 4.2 Spacing scale

```css
:root {
  --ea-space-0: 0;
  --ea-space-1: 0.25rem;   /*  4px */
  --ea-space-2: 0.5rem;    /*  8px */
  --ea-space-3: 0.75rem;   /* 12px */
  --ea-space-4: 1rem;      /* 16px */
  --ea-space-5: 1.25rem;   /* 20px */
  --ea-space-6: 1.5rem;    /* 24px */
  --ea-space-7: 2rem;      /* 32px */
  --ea-space-8: 2.5rem;    /* 40px */
  --ea-space-9: 3rem;      /* 48px */
  --ea-space-10: 4rem;     /* 64px */
}
```

Workbench routes use `--ea-space-2` to `--ea-space-5` for primary gaps. The home index may use `--ea-space-6` to `--ea-space-7` between tool tiles. **No route uses `--ea-space-9` or `--ea-space-10` for layout gaps.** They exist as a safety valve, not as recommended values.

### 4.3 Color tokens — dark theme (default)

```css
:root,
[data-theme="dark"] {
  color-scheme: dark;

  /* Surface */
  --ea-bg-app: #0B0E12;
  --ea-bg-app-from: #0B0E12;
  --ea-bg-app-to: #11161D;
  --ea-bg-panel: rgb(255 255 255 / 0.035);
  --ea-bg-panel-elevated: rgb(255 255 255 / 0.06);
  --ea-bg-panel-overlay: rgb(0 0 0 / 0.45);
  --ea-bg-input: rgb(0 0 0 / 0.25);
  --ea-bg-input-focus: rgb(0 0 0 / 0.35);

  /* Border */
  --ea-border-subtle: rgb(255 255 255 / 0.08);
  --ea-border-default: rgb(255 255 255 / 0.12);
  --ea-border-strong: rgb(255 255 255 / 0.20);
  --ea-border-focus: #4FD1C5;

  /* Text */
  --ea-text-high: #E8EAED;       /* contrast 13.5:1 on --ea-bg-app */
  --ea-text-medium: #B0B4BA;     /* contrast 7.8:1 */
  --ea-text-low: #8A9099;        /* contrast 4.9:1, body floor */
  --ea-text-disabled: #5A6068;   /* non-text only */
  --ea-text-on-accent: #0B0E12;

  /* Accent */
  --ea-color-accent: #4FD1C5;
  --ea-color-accent-hover: #5EE0D4;
  --ea-color-accent-pressed: #3FB8AC;
  --ea-color-accent-soft: rgb(79 209 197 / 0.16);
  --ea-color-kicker: #F6AD55;
  --ea-color-kicker-soft: rgb(246 173 85 / 0.15);

  /* Status — bands matching the resonance reference model */
  --ea-status-ideal: #34D399;
  --ea-status-ideal-soft: rgb(52 211 153 / 0.16);
  --ea-status-good: #48BB78;
  --ea-status-good-soft: rgb(72 187 120 / 0.14);
  --ea-status-acceptable: #ECC94B;
  --ea-status-acceptable-soft: rgb(236 201 75 / 0.16);
  --ea-status-marginal: #ED8936;
  --ea-status-marginal-soft: rgb(237 137 54 / 0.16);
  --ea-status-poor: #F56565;
  --ea-status-poor-soft: rgb(245 101 101 / 0.16);
  --ea-status-info: #63B3ED;
  --ea-status-info-soft: rgb(99 179 237 / 0.16);

  /* Confidence band (uncertainty visualization on gauge) */
  --ea-color-confidence-band: rgb(79 209 197 / 0.18);
  --ea-color-confidence-band-edge: rgb(79 209 197 / 0.4);

  /* Provenance badges */
  --ea-color-provenance-converted: var(--ea-color-kicker);
  --ea-color-provenance-converted-soft: var(--ea-color-kicker-soft);
  --ea-color-provenance-estimate: var(--ea-status-info);
  --ea-color-provenance-estimate-soft: var(--ea-status-info-soft);
  --ea-color-provenance-vintage: #B794F4;
  --ea-color-provenance-vintage-soft: rgb(183 148 244 / 0.15);
}
```

### 4.4 Color tokens — light theme (parity)

```css
[data-theme="light"] {
  color-scheme: light;

  --ea-bg-app: #F7F8FA;
  --ea-bg-app-from: #F7F8FA;
  --ea-bg-app-to: #ECEFF3;
  --ea-bg-panel: rgb(0 0 0 / 0.025);
  --ea-bg-panel-elevated: rgb(0 0 0 / 0.045);
  --ea-bg-panel-overlay: rgb(0 0 0 / 0.35);
  --ea-bg-input: #FFFFFF;
  --ea-bg-input-focus: #FFFFFF;

  --ea-border-subtle: rgb(0 0 0 / 0.06);
  --ea-border-default: rgb(0 0 0 / 0.12);
  --ea-border-strong: rgb(0 0 0 / 0.22);
  --ea-border-focus: #0E7C72;

  --ea-text-high: #161A1F;
  --ea-text-medium: #3D434B;
  --ea-text-low: #5A6068;
  --ea-text-disabled: #9AA0A6;
  --ea-text-on-accent: #FFFFFF;

  --ea-color-accent: #0E7C72;
  --ea-color-accent-hover: #117D72;
  --ea-color-accent-pressed: #0A6058;
  --ea-color-accent-soft: rgb(14 124 114 / 0.12);
  --ea-color-kicker: #B7791F;
  --ea-color-kicker-soft: rgb(183 121 31 / 0.12);

  --ea-status-ideal: #166534;
  --ea-status-ideal-soft: rgb(22 101 52 / 0.12);
  --ea-status-good: #2F855A;
  --ea-status-good-soft: rgb(47 133 90 / 0.10);
  --ea-status-acceptable: #B7791F;
  --ea-status-acceptable-soft: rgb(183 121 31 / 0.12);
  --ea-status-marginal: #C05621;
  --ea-status-marginal-soft: rgb(192 86 33 / 0.12);
  --ea-status-poor: #C53030;
  --ea-status-poor-soft: rgb(197 48 48 / 0.12);
  --ea-status-info: #2B6CB0;
  --ea-status-info-soft: rgb(43 108 176 / 0.10);

  --ea-color-confidence-band: rgb(14 124 114 / 0.14);
  --ea-color-confidence-band-edge: rgb(14 124 114 / 0.35);
}
```

All tokens above target WCAG 2.2 AA contrast (§19). When a contributor adds a new color token, contrast must be verified and the result documented next to the token.

### 4.5 Typography stack

```css
:root {
  --ea-font-family-sans:
      "Inter", "Inter var", system-ui, -apple-system, "Segoe UI",
      Roboto, "Helvetica Neue", Arial, sans-serif;
  --ea-font-family-mono:
      "JetBrains Mono", "Fira Code", "SF Mono", Menlo,
      Consolas, "Liberation Mono", monospace;
  --ea-font-family-numeric: var(--ea-font-family-mono);

  --ea-font-weight-regular: 400;
  --ea-font-weight-medium: 500;
  --ea-font-weight-semibold: 600;
  --ea-font-weight-bold: 700;

  /* Font sizes — every value used in the codebase must come from here */
  --ea-font-size-microcopy: 0.78rem;        /* 12.5px — provenance badges, scale labels */
  --ea-font-size-helper: 0.86rem;           /* ~14px — helper text, secondary labels */
  --ea-font-size-label: 0.95rem;            /* ~15px — form labels */
  --ea-font-size-body: 1rem;                /* 16px — body text */
  --ea-font-size-body-large: 1.05rem;       /* ~17px — emphasized body */
  --ea-font-size-panel-heading: 1.15rem;    /* ~18px — panel titles */
  --ea-font-size-section-heading: 1.5rem;   /* 24px — section titles */
  --ea-font-size-tool-title: 1.875rem;      /* 30px — tool route h1 (MAX) */
  --ea-font-size-result-large: 2.5rem;      /* 40px — primary result number */

  /* Legacy alias for compatibility — REMOVE in v0.4 */
  --ea-font-size-small: var(--ea-font-size-helper);

  --ea-line-height-tight: 1.2;
  --ea-line-height-normal: 1.5;
  --ea-line-height-relaxed: 1.65;
  --ea-line-height-small: 1.4;

  --ea-letter-spacing-tight: -0.01em;
  --ea-letter-spacing-normal: 0;
  --ea-letter-spacing-kicker: 0.08em;
}
```

**The largest h1 anywhere in this product is `--ea-font-size-tool-title` (1.875rem = 30 px).** There is no exception. The home page does not need a larger h1. Tool routes do not need a larger h1. The wordmark in the topbar uses 1.125rem.

The result number on the gauge (e.g., "9.5 Hz") may use `--ea-font-size-result-large` (2.5rem = 40 px). This is a **value display**, not a heading, and is the only typographic element allowed above the tool-title size.

Numeric values in result panels use `--ea-font-family-numeric` with `font-variant-numeric: tabular-nums`.

### 4.6 Radius

```css
:root {
  --ea-radius-sm: 0.375rem;   /*  6px — badges, small chips */
  --ea-radius-md: 0.5rem;     /*  8px — inputs, buttons */
  --ea-radius-lg: 0.75rem;    /* 12px — panels */
  --ea-radius-xl: 1rem;       /* 16px — modals */
  --ea-radius-pill: 9999px;
}
```

`--ea-radius-xl` is reserved for modal dialogs only. Do not use it on tool cards on the home page.

### 4.7 Shadow

```css
:root {
  --ea-shadow-none: none;
  --ea-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.18);
  --ea-shadow-md: 0 6px 16px rgb(0 0 0 / 0.22);
  --ea-shadow-lg: 0 16px 40px rgb(0 0 0 / 0.28);
  --ea-shadow-modal: 0 24px 64px rgb(0 0 0 / 0.45);
  --ea-shadow-focus-ring: 0 0 0 2px var(--ea-bg-app), 0 0 0 4px var(--ea-border-focus);
}
```

Avoid stacking multiple `--ea-shadow-lg` shadows in dense work areas. Tool route panels use `--ea-shadow-md`. Modals use `--ea-shadow-modal`. Tool index cards on the home use `--ea-shadow-sm` only.

### 4.8 Motion

```css
:root {
  --ea-motion-duration-instant: 80ms;
  --ea-motion-duration-fast: 160ms;
  --ea-motion-duration-normal: 240ms;
  --ea-motion-duration-slow: 360ms;
  --ea-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --ea-motion-easing-emphasized: cubic-bezier(0.2, 0, 0.2, 1.4);
  --ea-motion-easing-decelerate: cubic-bezier(0, 0, 0, 1);
}
```

All motion respects `prefers-reduced-motion` (see §19).

### 4.9 Z-index scale

```css
:root {
  --ea-z-base: 0;
  --ea-z-elevated: 10;
  --ea-z-dropdown: 100;
  --ea-z-sticky-result: 200;
  --ea-z-overlay: 1000;
  --ea-z-modal: 1100;
  --ea-z-popover: 1200;
  --ea-z-tooltip: 1300;
  --ea-z-toast: 1400;
}
```

Hard-coded z-index outside this scale is a defect.

### 4.10 Layout sizes and widths

```css
:root {
  /* Workbench — wide */
  --ea-size-workbench-max: 1760px;
  --ea-size-workbench-padding: clamp(1rem, 2.5vw, 2rem);
  --ea-size-workbench-gap: clamp(1rem, 1.5vw, 1.25rem);

  /* Home index — narrower than workbench, wider than article */
  --ea-size-home-max: 1280px;

  /* Reading measure (long prose only — methodology page, help) */
  --ea-size-reading-max: 64ch;

  /* Control heights */
  --ea-size-control-compact: 2.25rem;   /* 36px */
  --ea-size-control-default: 2.5rem;    /* 40px */
  --ea-size-control-large: 2.75rem;     /* 44px touch baseline */
  --ea-size-control-xl: 3rem;           /* 48px primary modal action */

  /* Panel padding */
  --ea-size-panel-padding-compact: var(--ea-space-4);
  --ea-size-panel-padding-default: var(--ea-space-5);
  --ea-size-panel-padding-editorial: var(--ea-space-6);
}
```

**The legacy `--ea-page-max: 1180px` is deprecated as of v0.3 and must be removed.** It constrained workbenches to article width and is the root cause of the wasted horizontal space on the live deployment. Replace every reference with `--ea-size-workbench-max` for tool routes or `--ea-size-home-max` for the home index.

### 4.11 Breakpoints

```css
:root {
  --ea-bp-mobile: 720px;
  --ea-bp-tablet: 1024px;
  --ea-bp-desktop: 1100px;
  --ea-bp-wide: 1440px;
  --ea-bp-ultra: 1920px;
}
```

Note: desktop breakpoint is **1100 px**, not 1024 px. This is the smallest viewport at which the two-zone workbench (§5.5) renders without overflow.

---

## 5. Layout doctrine

### 5.1 Home route

The home route is the **tool index**. It is built as a workbench, not a landing page.

Required structure:

```
Topbar (sticky, ≤ 56 px)
Wordmark + theme toggle
Brief project descriptor (single line, 1 sentence, ≤ 12 words, sized at --ea-font-size-body)
Tool tiles (2-4 per row at desktop)
Optional: Methodology link, About link (footer-anchor)
```

Forbidden on the home route:

- Hero section.
- Backdrop image.
- Marketing headline.
- Two-button CTA cluster.
- "Platform" or "Toolkit" sections.
- "Launch chain" or any deployment-status content.
- Cards for tools that do not yet work ("Planned", "Foundation module", "Coming soon").

The home route uses width `--ea-size-home-max` (1280 px). Tool tiles are functional launchers — clicking one navigates to the tool, not to a marketing description. The tile shows: tool name, one-line operational description, current status if relevant ("Beta" / "Stable").

Maximum total height of the home route at 1920×1080 desktop: **one viewport**. The user sees all available tools without scrolling. If there are more tools than fit in one viewport, the layout uses a denser grid, not a longer page.

### 5.2 Tool route

Tool route structure:

```
Topbar (sticky, ≤ 56 px)
Tool header (≤ 80 px total, NOT a hero)
  - h1 (--ea-font-size-tool-title MAX, single line)
  - One-sentence description (--ea-font-size-helper, optional)
Workbench (fills viewport)
  - Two-zone grid at ≥ 1100 px desktop
  - Single column below
Secondary panel (collapsed <details> by default)
```

The first viewport of a tool route at 1920×1080 contains all primary inputs and the result. **The user does not scroll to compute.** This is a hard acceptance criterion (§24).

### 5.3 Hero ban (binding)

There is no hero on any route.

The implementer is reminded: this means the live code in `renderHomePage.ts` containing `<section class="ea-hero">` and the live code in `renderTonearmMatchLabPage.ts` containing `<section class="tm-lab-hero">` are both defects and must be removed in the same PR that adopts this version of the document.

The replacement for `.ea-hero` is `.ea-tool-index-header` (compact, ≤ 80 px tall, no backdrop image, h1 at `--ea-font-size-tool-title`).

The replacement for `.tm-lab-hero` is deletion. The Tonearm Match Lab does not need its own page-level header at all because the global topbar already provides identity. A single h1 inside the workbench panel with `--ea-font-size-tool-title` is sufficient.

### 5.4 Workbench width

```css
.ea-route--tool {
  inline-size: min(100% - var(--ea-space-4) * 2, var(--ea-size-workbench-max));
  margin-inline: auto;
  padding-inline: var(--ea-size-workbench-padding);
}
```

Rationale for 1760 px: leaves ~80 px outer breathing room on a 1920 px viewport while preventing extreme stretch on ultrawide displays.

### 5.5 Two-zone workbench grid

```css
.ea-workbench {
  display: grid;
  grid-template-columns: minmax(580px, 1.6fr) minmax(380px, 1fr);
  gap: var(--ea-size-workbench-gap);
}

@media (max-width: 1099px) {
  .ea-workbench {
    grid-template-columns: 1fr;
  }
}
```

Minimum widths (580 + 380 + gap ≈ 976 px content) align with the 1100 px desktop breakpoint allowing for outer padding.

### 5.6 Sticky result panel

```css
.ea-workbench__result {
  position: sticky;
  inset-block-start: calc(56px + var(--ea-space-4));  /* topbar + spacing */
  z-index: var(--ea-z-sticky-result);
  align-self: start;
}

@media (max-width: 1099px) {
  .ea-workbench__result {
    position: static;
  }
}
```

Result panel stays visible while editing on desktop. Collapses to natural flow below 1100 px.

### 5.7 Control widths

Panel width uses the viewport. Individual controls remain ergonomic:

```css
.ea-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 320px));
  gap: var(--ea-space-4);
}
.ea-field input {
  inline-size: 100%;
  max-inline-size: 22rem;
}
```

### 5.8 Secondary content

Assumptions, notes, methodology references, and explanations are **secondary**. They live in:

1. A `<details>` element collapsed by default beneath the workbench, OR
2. A separate `/methodology` route reachable from a footer-anchor link.

They do not occupy primary visual real estate. They do not appear between inputs and result.

---

## 6. Density

### 6.1 Density principle

Tool routes are dense enough for work and spacious enough for readability. Both extremes are wrong.

### 6.2 Control heights

Tool routes use `--ea-size-control-default` (40 px) for inputs and buttons. Mobile uses `--ea-size-control-large` (44 px) minimum. Modal primary actions may use `--ea-size-control-xl` (48 px).

### 6.3 Panel padding

Tool route panels use `--ea-size-panel-padding-default` (`--ea-space-5`, 20 px). Compact panels (e.g., dataset picker controls inside the workbench) use `--ea-size-panel-padding-compact` (16 px). The methodology page may use editorial padding (24 px).

Padding above 24 px on tool routes is forbidden.

### 6.4 Field rhythm

```css
.ea-field {
  display: grid;
  gap: 0.35rem;
}
.ea-field-group {
  display: grid;
  gap: var(--ea-space-4);
}
```

Each field's vertical footprint: label (1 line) + input + optional helper (1 line). Total ≈ 5.5–6 rem.

---

## 7. Typography (applied)

### 7.1 Tool route type scale

```css
.ea-tool-title {
  font-size: var(--ea-font-size-tool-title);
  font-weight: var(--ea-font-weight-semibold);
  line-height: var(--ea-line-height-tight);
  letter-spacing: var(--ea-letter-spacing-tight);
  margin: 0;
}

.ea-section-heading {
  font-size: var(--ea-font-size-section-heading);
  font-weight: var(--ea-font-weight-semibold);
}

.ea-panel-heading {
  font-size: var(--ea-font-size-panel-heading);
  font-weight: var(--ea-font-weight-medium);
}

.ea-label {
  font-size: var(--ea-font-size-label);
  font-weight: var(--ea-font-weight-medium);
  color: var(--ea-text-medium);
}

.ea-body {
  font-size: var(--ea-font-size-body);
  line-height: var(--ea-line-height-normal);
}

.ea-helper {
  font-size: var(--ea-font-size-helper);
  color: var(--ea-text-low);
  line-height: var(--ea-line-height-small);
}

.ea-microcopy {
  font-size: var(--ea-font-size-microcopy);
  color: var(--ea-text-low);
}

.ea-kicker {
  font-size: var(--ea-font-size-microcopy);
  text-transform: uppercase;
  letter-spacing: var(--ea-letter-spacing-kicker);
  color: var(--ea-color-kicker);
  font-weight: var(--ea-font-weight-semibold);
}

.ea-numeric {
  font-family: var(--ea-font-family-numeric);
  font-variant-numeric: tabular-nums;
}

.ea-result-value {
  font-family: var(--ea-font-family-numeric);
  font-size: var(--ea-font-size-result-large);
  font-weight: var(--ea-font-weight-bold);
  line-height: 1;
  letter-spacing: var(--ea-letter-spacing-tight);
  font-variant-numeric: tabular-nums;
}
```

### 7.2 Reading measure

Long prose has a maximum width:

```css
.ea-prose {
  max-inline-size: var(--ea-size-reading-max); /* 64ch */
}
```

Workbench panels do not have this constraint.

### 7.3 Labels (binding)

Labels are direct and unit-aware:

```text
Tonearm effective mass, g
Cartridge mass, g
Compliance @10 Hz, µm/mN
Mounting screws/fasteners, g
Tracking force, g (setup only — not in resonance calc)
```

The compliance unit is `µm/mN`. Helper text may note "1 µm/mN equals 1 cu" for users with vintage data sheets.

### 7.4 Helper text

Concise and operational. Long explanations live in the `<details>` notes section or on `/methodology`.

---

## 8. Color and theme (applied)

### 8.1 Theme switching

Theme is selected by `data-theme` on `<html>`:

```html
<html data-theme="dark">  <!-- default -->
<html data-theme="light">
```

Theme toggle writes to `localStorage.engrove-theme`. Default is dark. `prefers-color-scheme` is consulted on first load if no stored preference.

### 8.2 Status color binding

The status colors are bound to the resonance reference model. The same colors appear in the gauge (§13), in result-card badges, and in any other classifier-style visualization.

| Band | Token | Use |
|---|---|---|
| Ideal | `--ea-status-ideal` | central optimal subzone (9–11 Hz) |
| Good | `--ea-status-good` | inside accepted band (8–9, 11–12 Hz) |
| Acceptable | `--ea-status-acceptable` | edges of accepted band (7–8, 12–13 Hz) |
| Marginal | `--ea-status-marginal` | outside, recoverable (6–7, 13–14 Hz) |
| Poor | `--ea-status-poor` | outside, not recommended (<6, >14 Hz) |

Color is **never the only indicator**. Every status is paired with a textual label and an icon (✓, ★, ⚠, ✗). See §13.3.

---

## 9. Surfaces, borders, depth

### 9.1 Panels

```css
.ea-panel {
  background: var(--ea-bg-panel);
  border: 1px solid var(--ea-border-default);
  border-radius: var(--ea-radius-lg);
  padding: var(--ea-size-panel-padding-default);
}
.ea-panel--active,
.ea-panel--selected {
  border-color: var(--ea-border-strong);
  background: var(--ea-bg-panel-elevated);
}
```

### 9.2 Shadow

`--ea-shadow-md` for elevated panels. `--ea-shadow-lg` only for the topmost surface in a stacked section. `--ea-shadow-modal` for dialogs.

### 9.3 Nested panels

Nested panels use `--ea-bg-panel-elevated` and `--ea-border-subtle` to register as inset rather than as a second floating card.

---

## 10. Buttons and actions

### 10.1 Hierarchy

- **Primary** filled accent. One per panel/route.
- **Secondary** outlined. Cancel, neutral.
- **Tertiary** text-only. Minor or link-like.
- **Destructive** red filled. Used only when the action removes or overwrites user-visible state.

### 10.2 Sizing

```css
.ea-btn {
  min-block-size: var(--ea-size-control-default);
  padding-inline: var(--ea-space-4);
  border-radius: var(--ea-radius-md);
  font-weight: var(--ea-font-weight-medium);
  font-size: var(--ea-font-size-body);
  transition: background-color var(--ea-motion-duration-fast) var(--ea-motion-easing-standard),
              border-color var(--ea-motion-duration-fast) var(--ea-motion-easing-standard);
}
.ea-btn--compact { min-block-size: var(--ea-size-control-compact); padding-inline: var(--ea-space-3); }
.ea-btn--large   { min-block-size: var(--ea-size-control-xl); padding-inline: var(--ea-space-5); }
```

### 10.3 States

Every interactive control declares: default, hover, focus-visible, active/pressed, disabled, loading. Focus-visible uses `--ea-shadow-focus-ring`.

### 10.4 Forbidden button labels

The following button labels are forbidden anywhere in the bundle:

- "Explore the Tools"
- "Get Started"
- "View Platform"
- "Learn more"
- "Discover"
- Any button label that does not state what the click will do.

Operational labels are required:

- "Open Resonance Calculator"
- "Open Compliance Estimator"
- "Calculate"
- "Apply"
- "Cancel"
- "Reset"
- "Select cartridge from dataset"

---

## 11. Forms and inputs

### 11.1 Inputs in calculators

Numeric input is the primary workflow. Inputs:

- visible without scrolling on tool routes,
- consistent width,
- unit in label,
- short helper text,
- result updates immediately.

### 11.2 Decimal handling

Accept `.` and `,` as decimal separators. Internal model uses dot. Helper text declares conversion when it happens.

### 11.3 Input layout

Desktop preferred: 2 columns or 3 compact columns. A single vertical stack of five inputs at desktop is a defect.

### 11.4 Default values at load

Tool routes may pre-populate inputs with sensible default values to demonstrate the calculation. When they do:

- The result panel must clearly label the result as **"Example values"** until the user changes any input.
- The first user edit removes the "Example values" label and treats the input as the user's setup.
- The default values must be physically sensible (e.g., not 0 g effective mass) and produce a result inside the Good or Ideal band, so the example is informative.

The current implementation pre-fills `tonearmEffectiveMassG: 12, cartridgeMassG: 6.5, fastenerMassG: 1, trackingForceG: 1.8, compliance10HzCu: 18` — fine values, but the resulting example must be labeled.

### 11.5 Errors

Error messages are placed near the affected control or result panel, in English, specific, actionable.

Bad: `Invalid.`
Good: `Compliance @10 Hz must be a positive number.`

### 11.6 Provenance and confidence indicators (binding)

Every numeric input that derives from converted, estimated, or aged-spec data displays a provenance badge inline:

```html
<span class="ea-provenance-badge ea-provenance-badge--converted">
  converted from 100 Hz · ×1.7
</span>
<span class="ea-provenance-badge ea-provenance-badge--estimate">
  community estimate
</span>
<span class="ea-provenance-badge ea-provenance-badge--vintage">
  vintage spec — see notes
</span>
```

```css
.ea-provenance-badge {
  display: inline-flex;
  gap: var(--ea-space-1);
  padding: 0 var(--ea-space-2);
  border-radius: var(--ea-radius-sm);
  font-size: var(--ea-font-size-microcopy);
  font-weight: var(--ea-font-weight-medium);
  vertical-align: middle;
}
.ea-provenance-badge--converted {
  background: var(--ea-color-provenance-converted-soft);
  color: var(--ea-color-provenance-converted);
}
.ea-provenance-badge--estimate {
  background: var(--ea-color-provenance-estimate-soft);
  color: var(--ea-color-provenance-estimate);
}
.ea-provenance-badge--vintage {
  background: var(--ea-color-provenance-vintage-soft);
  color: var(--ea-color-provenance-vintage);
}
```

The current Tonearm Match Lab does not surface provenance. This is a defect to fix before relaunch.

---

## 12. Data-heavy picker standard

### 12.1 When to use a modal picker

- dataset is large,
- user must search/filter before selecting,
- selection should not mutate the calculator until confirmed,
- user benefits from previewing values.

Cartridge and tonearm selection use modal pickers, never inline mega lists.

### 12.2 Modal structure

```text
Header: title + accessible close button
Body: filter panel + results list (capped) + selected preview
Footer: Cancel + Apply (primary)
```

### 12.3 Modal behavior (binding)

- Open from compact control on page.
- Search/filter inside modal.
- Result list capped (default 100 rows).
- Row click changes draft selection only.
- Preview updates from draft.
- **Apply** mutates fields and dispatches `input`/`change` events.
- **Cancel**, **X close**, **Escape**, **backdrop click** do not mutate.
- Modal traps focus while open (binding, not future).
- Focus returns to opener on close.

### 12.4 Filtering

Cartridge: search, generator type (MM/MI/MC LO/MC HO/SG), mass min/max, compliance min/max, match-ready flag, provenance confidence floor.

Tonearm: search, effective-mass min/max, headshell convention.

### 12.5 Preview

Preview shows the values that will be applied with provenance badges visible.

For cartridge: name, type, mass, compliance @10 Hz (with badge if converted/estimated).
For tonearm: name, effective mass (with badge if community-estimated).

Preview text: "Apply copies these values to the calculator. Cancel does not."

### 12.6 Modal accessibility (binding)

- `role="dialog"`,
- `aria-modal="true"`,
- `aria-labelledby` to a visible title,
- close button with accessible name,
- Escape closes,
- focus enters modal on open,
- focus trap retains focus,
- focus restores to opener on close.

---

## 13. Result and gauge (binding)

### 13.1 Result priority

The result is the feedback loop. Visually prominent, near the inputs.

For Tonearm Match Lab the result panel shows:

- resonance frequency `f₀` (1 decimal, e.g., `9.5 Hz`),
- propagated uncertainty band (`±1.0 Hz`),
- classification badge (Ideal/Good/Acceptable/Marginal/Poor),
- one-sentence diagnosis,
- target zone text ("Target zone 8–12 Hz, ideal 9–11 Hz"),
- 2–3 short suggestions if applicable.

### 13.2 Numerical formatting

```text
9.5 Hz            (1 decimal)
±1.0 Hz           (1 decimal)
19.3 g            (1 decimal)
12 µm/mN @10 Hz   (integer or 1 decimal)
```

Result panels do not display raw implementation fields.

### 13.3 Classification badges (binding)

| Band | Label | Token | Icon |
|---|---|---|---|
| Ideal | `Ideal` | `--ea-status-ideal` | `★` |
| Good | `Good` | `--ea-status-good` | `✓` |
| Acceptable | `Acceptable but not optimal` | `--ea-status-acceptable` | `⚠` |
| Marginal | `Marginal` | `--ea-status-marginal` | `⚠` |
| Poor | `Poor` | `--ea-status-poor` | `✗` |

```css
.ea-result-badge {
  display: inline-flex;
  gap: var(--ea-space-2);
  align-items: center;
  padding: var(--ea-space-1) var(--ea-space-3);
  border-radius: var(--ea-radius-pill);
  font-size: var(--ea-font-size-helper);
  font-weight: var(--ea-font-weight-semibold);
}
.ea-result-badge--ideal      { background: var(--ea-status-ideal-soft);      color: var(--ea-status-ideal); }
.ea-result-badge--good       { background: var(--ea-status-good-soft);       color: var(--ea-status-good); }
.ea-result-badge--acceptable { background: var(--ea-status-acceptable-soft); color: var(--ea-status-acceptable); }
.ea-result-badge--marginal   { background: var(--ea-status-marginal-soft);   color: var(--ea-status-marginal); }
.ea-result-badge--poor       { background: var(--ea-status-poor-soft);       color: var(--ea-status-poor); }
```

The legacy `.tm-lab-result--low` and `.tm-lab-result--high` variants in the current codebase are deprecated and must be removed in the same PR that adopts v0.3.

### 13.4 Resonance gauge

A horizontal gauge spanning 5–16 Hz visualizes the result.

Specification:

- **Display range:** 5–16 Hz, linear.
- **Background zones:** Poor (5–6) red, Marginal (6–7) orange, Acceptable (7–8) yellow, Good (8–12) green, Ideal subzone (9–11) deep-green strip with border, Acceptable (12–13) yellow, Marginal (13–14) orange, Poor (14–16) red.
- **Marker:** vertical line at `f₀`, 1 decimal precision, 2px stroke, color `--ea-text-high`.
- **Confidence band:** translucent horizontal bracket of width `±σ_f` centered on the marker. Color `--ea-color-confidence-band`, edges `--ea-color-confidence-band-edge`. Always rendered. Wider when provenance flags weaken.
- **Out-of-range result:** if `f₀ < 5` or `> 16`, marker pegs at edge with chevron and a textual "f = X.X Hz, outside displayed range" line below.
- **Missing input:** gauge in disabled state with prompt: "Enter cartridge mass, compliance, and tonearm effective mass to compute resonance."

Accessibility:

- gauge has `role="img"` with `aria-label` summarizing the result,
- a textual sibling line presents the same data,
- shape/icon at zone boundaries (✓, ★, ⚠, ✗) for monochrome rendering.

The current Tonearm Match Lab gauge implementation (`tm-lab-gauge__*` classes) is essentially correct in structure but uses the deprecated `--color-*` namespace. Migration to `--ea-*` namespace required.

### 13.5 Diagnosis language (binding)

Calm and practical.

Good: `Resonance is inside the common 8–12 Hz target zone.`

Forbidden:

- `Perfect match!`
- `Guaranteed safe!`
- `Magic number!`
- `You nailed it!`
- Any exclamation mark in result diagnosis.

Per reference data model: avoid the word "Perfect" entirely. The defensible terminology is "Ideal" (9–11 Hz subzone). Propagated uncertainty (~±1 Hz at 10 Hz) is larger than the entire ideal subzone, so "Perfect" is an overpromise.

### 13.6 Suggestions

Short and operational:

- "Recheck compliance value if it was converted from a 100 Hz spec."
- "Confirm tracking force is set within the cartridge manufacturer range (display only — does not affect this calculation)."
- "Consider headshell mass if the tonearm's effective-mass spec excludes it."

---

## 14. Tables

For result lists, comparison views, dataset summaries.

```css
.ea-table {
  inline-size: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--ea-font-size-helper);
}
.ea-table th {
  position: sticky;
  inset-block-start: 0;
  background: var(--ea-bg-panel-elevated);
  border-block-end: 1px solid var(--ea-border-default);
  font-weight: var(--ea-font-weight-semibold);
  text-align: start;
  padding: var(--ea-space-3);
}
.ea-table td {
  padding: var(--ea-space-3);
  border-block-end: 1px solid var(--ea-border-subtle);
}
.ea-table tr:hover td {
  background: var(--ea-bg-panel-elevated);
}
.ea-table .ea-numeric {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
```

Row height: 2.25–2.75 rem. No zebra striping. Sticky header for any table > 10 rows.

---

## 15. Charts

For frequency response, IM-distortion vs Q, warp-spectrum, similar plots.

```css
:root {
  --ea-chart-axis-color: var(--ea-text-low);
  --ea-chart-grid-color: var(--ea-border-subtle);
  --ea-chart-label-size: var(--ea-font-size-microcopy);
  --ea-chart-line-width: 2px;
  --ea-chart-line-width-emphasized: 3px;
  --ea-chart-marker-radius: 4px;
}
```

Series colors in order: `--ea-color-accent`, `--ea-status-acceptable`, `--ea-status-marginal`, `--ea-color-kicker`, `--ea-status-info`, `--ea-status-poor`. Beyond six series, switch to a categorical scheme or split.

Every chart has a textual summary alternative (`<figcaption>` or `aria-describedby`), a tabular fallback toggle, and color paired with shape/dash patterns when more than two series share a region.

---

## 16. Iconography

Inline SVG, rendered at `currentColor`, drawn on a 24×24 grid with 2 px stroke.

```css
.ea-icon {
  inline-size: 1.25em;
  block-size: 1.25em;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  vertical-align: middle;
}
.ea-icon--sm { inline-size: 1em; block-size: 1em; }
.ea-icon--lg { inline-size: 1.5em; block-size: 1.5em; }
```

Icon-only buttons require `aria-label`. SVG is `aria-hidden="true"`. Icons live under `src/shared/ui/icons/` as individual SVG files. No icon-font runtime dependency. Only commit icons that are actually used.

---

## 17. CSS architecture

### 17.1 File responsibility (binding)

| Path | Responsibility |
|---|---|
| `src/shared/ui/styles/reset.css` | CSS reset, base typography, scroll behavior. |
| `src/shared/ui/styles/tokens.css` | All `--ea-*` design tokens. Single source of truth. |
| `src/shared/ui/styles/base.css` | Global element styles using tokens. |
| `src/shared/ui/styles/layout.css` | Shared layout primitives: app shell, topbar, footer, workbench grid. |
| `src/shared/ui/styles/components.css` | Shared components: buttons, inputs, panels, badges, modal frame. |
| `src/shared/ui/styles/home.css` | Home-route-specific styles only. **Not for tool-specific styles.** |
| `src/modules/<module>/ui/<module>.css` | One CSS file per module, scoped to that module's classes. |

The current `home.css` contains 1849 lines with Tonearm Match Lab styles appended after line 516. **This is a defect.** All `.tm-lab-*` selectors must be moved to `src/modules/tonearm-match-lab/ui/tonearmMatchLab.css` (which already exists, 315 lines, but is incomplete because the appended rules in `home.css` were never moved).

### 17.2 Class naming

```text
ea-*               global Engrove app shell, layout, shared components
ea-route--*        route-specific scope (e.g., ea-route--home, ea-route--tool)
tm-*               Tonearm module (legacy alias for tonearm-match-lab)
tm-lab-*           Tonearm Match Lab specific
runtime-*          shared runtime picker modal
util-*             single-purpose utility classes
```

### 17.3 Class contract is binding (binding)

If markup emits `ea-site-shell`, CSS styles `ea-site-shell`. The current code emits `ea-site-shell` and `ea-topbar` while `layout.css` defines `ea-app-shell` and `ea-header`. The unused definitions must be removed.

### 17.4 No fragile selectors

Avoid selectors that depend on deep DOM structure. Prefer intentional class hooks.

### 17.5 No global resets that damage pages

```css
/* not allowed except in reset.css: */
button { ... }
input { ... }
main { ... }
```

### 17.6 CSS comments

Comments clarify purpose, not narrate workflow phases.

Allowed:
```css
/* Tonearm Match Lab workbench layout */
```

Forbidden in shipped CSS:
```css
/* Phase 17.2d fix */
/* TODO: remove after Hjalmar review */
/* Engrove Audio Tools 3.0 — 2.0-inspired public landing page */
```

The third example appears literally in the current `home.css` line 1. This is a defect. Internal phase identifiers and references to v2.0 inspiration must be removed.

### 17.7 No fallback values that hide token gaps

Forbidden:
```css
color: var(--color-status-ideal, #34d399);
```

The fallback hides the fact that `--color-status-ideal` is not defined in the token layer. Either the token must exist in `tokens.css`, or the property must use the canonical `--ea-*` token.

Permitted only for graceful degradation in CSS-in-JS injected runtime fragments where token availability cannot be guaranteed at parse time. This is rare and must be documented inline.

---

## 18. Responsive behavior

### 18.1 Breakpoints (binding)

```css
/* mobile:        < 720px            */
/* tablet:        720-1023px         */
/* narrow desktop: 1024-1099px       */
/* desktop:       1100-1439px        */
/* wide desktop:  1440-1919px        */
/* ultra:         >= 1920px          */
```

The two-zone workbench (§5.5) requires `>= 1100 px`. Below that it collapses to single-column.

### 18.2 Desktop (≥ 1100 px)

Two-zone workbench. Primary inputs and result simultaneously visible.

### 18.3 Narrow desktop / tablet (720–1099 px)

Single-column stacked panels. Result appears directly after inputs, never after long notes.

### 18.4 Mobile (< 720 px)

Single column. Compact topbar (≤ 56 px). Compact header (≤ 96 px). Controls full width. Modals nearly full-screen. Touch target minimum 44 px (`--ea-size-control-large`).

### 18.5 No horizontal overflow

```css
.ea-container {
  min-inline-size: 0;
  box-sizing: border-box;
  overflow-wrap: anywhere;
}
```

---

## 19. Accessibility (binding)

Compliance target: **WCAG 2.2 Level AA**.

### 19.1 Baseline

- visible focus state via `:focus-visible` and `--ea-shadow-focus-ring`,
- keyboard-accessible operation,
- semantic HTML (`<button>` for actions, `<a>` for navigation),
- labels for all inputs,
- accessible names for icon-only controls,
- contrast meeting §4.3 / §4.4.

### 19.2 Focus management

- `:focus-visible` for keyboard focus styling,
- focus moves into modal on open,
- focus is **trapped** in modal while open (mandatory),
- focus restores to originating control on modal close,
- skip-link from topbar to main content.

### 19.3 Target sizes

- desktop dense controls: ≥ 32 px,
- desktop standard: ≥ 36 px,
- touch/mobile: ≥ 44 px.

### 19.4 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 19.5 Forced colors

UI components remain operable with system colors. Test with `forced-colors: active`. Borders and focus rings use `currentColor` or system tokens.

### 19.6 Screen reader

- `<main>`, `<nav>`, `<header>`, `<footer>` landmarks,
- one `<h1>` per route,
- monotonic heading hierarchy,
- live regions (`aria-live="polite"`) for result updates,
- charts and gauges have textual alternatives,
- form errors use `aria-describedby`.

---

## 20. Public copy

### 20.1 Voice

Clear, technical, calm, concise, trustworthy. Treats the user as a competent operator.

### 20.2 Forbidden phrases

In addition to §2.8, the following are forbidden:

- "magic"
- "perfect"
- "guaranteed"
- "revolutionary"
- "AI-powered" (unless literally describing AI use, which this product does not have)
- "Welcome to the Engrove Audio Toolkit"
- "We hope you enjoy"
- Any second-person sentence that addresses the user with a marketing tone.

### 20.3 Preferred wording

```text
Estimate
Check
Match
Target zone
Dataset
Runtime data
Selected cartridge
Selected tonearm
Apply
Cancel
Close
Open
Calculate
Reset
Ideal / Good / Acceptable / Marginal / Poor   (band labels)
Converted from 100 Hz spec   (provenance)
Community estimate            (provenance)
Vintage spec — aged elastomer note   (provenance)
```

### 20.4 Error wording

Errors explain what failed and what the user can do.

```text
Runtime picker data could not be loaded. Check the public data route and try again.
```

### 20.5 Empty states

```text
No matching dataset items found. Try broadening the filters.
```

Forbidden: `Nothing here.`

### 20.6 Footer copy

The footer contains:

- product wordmark or short product name,
- version number (`v3.0.0`),
- last-updated hint,
- link to `/methodology`,
- link to GitHub repository,
- license note.

The footer does not contain marketing taglines like "Public productization track."

---

## 21. Tonearm Match Lab specific (binding)

### 21.1 Required layout

```text
Topbar (global, sticky)
Tool header (≤ 80 px total):
  - h1 "Tonearm Match Lab" (--ea-font-size-tool-title)
  - One-sentence operational description
Workbench (two-zone at desktop):
  Left: dataset pickers + numeric setup fields (2-3 columns)
  Right: result panel with gauge (sticky)
Secondary: <details> assumptions/notes, collapsed by default
```

The current implementation has a `.tm-lab-hero` section between topbar and workbench. **This section must be removed** in the same PR that adopts this version of the document. The h1 lives inside the workbench panel intro, not in a hero.

### 21.2 Primary visible items at 1920×1080

Without scrolling:

- selected cartridge summary with provenance badge if applicable,
- selected tonearm summary with provenance badge if applicable,
- tonearm effective mass input,
- cartridge mass input,
- mounting screws/fasteners input,
- compliance input with `@10 Hz` label and provenance badge if converted,
- resonance result with frequency, uncertainty, classification badge,
- gauge with confidence band,
- tracking force display visibly separated from resonance fields.

### 21.3 Tracking force grouping (binding)

Tracking force is **setup context only**.

UI rules:

- Tracking force input is in a separate visual group from the resonance math fields. Use a panel divider, separate sub-heading, or a dedicated `.tm-lab-setup-context` container. The current implementation places it as field `trackingForceG` in the same `.tm-lab-form` grid as the resonance fields, which is **wrong**. Move it.
- Helper text states: `Tracking force is set during turntable setup. It does not affect the resonance calculation.`
- When a cartridge is selected from the dataset, the recommended VTF range pre-fills (display only).
- Editing tracking force does **not** trigger a resonance recalculation.

### 21.4 Compliance handling (binding)

- Compliance label: `Compliance @10 Hz, µm/mN`.
- If the dataset record provides only a 100 Hz value, the UI:
  - applies the per-generator-type conversion factor from the reference model (1.5× MM/MI, 2.0× MC LO, 1.7× MC HO),
  - displays a `converted from 100 Hz · ×1.7` provenance badge,
  - widens the gauge confidence band.
- Converted values never appear without the provenance badge.

### 21.5 Generator-type awareness

When the cartridge has a known generator type (MM, MI, MC LO, MC HO, SG), a small generator-type pill appears near the cartridge name. The conversion factor and warning thresholds adapt per reference model.

### 21.6 Vintage flag

Cartridges with `release_year < 1985` carry a "Vintage spec — aged elastomer may differ" badge (`--ea-color-provenance-vintage`).

### 21.7 Linear-tracking warning

When the selected tonearm has `arm_geometry: linear_tangential`, the result panel surfaces a hard warning: `Linear-tracking arms have very different lateral and vertical effective masses. A single-axis resonance is a strong simplification.`

### 21.8 ZYX bug fix (binding before relaunch)

The data layer must correct the ZYX cartridge records that are currently stored as 10 Hz compliance when the published values are at 100 Hz (Reffc, Lenco Heaven, October 2025). Either:

- Tag affected records with `compliance_source_freq: 100` and apply the runtime conversion per §21.4, or
- Replace the stored values with manufacturer-published 10 Hz values where available.

The relaunch announcement must not occur until this is fixed.

---

## 22. Visual anti-patterns (binding)

The following are blockers.

### 22.1 Hero on any route
Selectors `.ea-hero`, `.tm-lab-hero`, `.*-hero`, `.*__hero`, and the structural pattern (giant centered headline + backdrop + two CTAs) are forbidden on every route.

### 22.2 Marketing voice
Phrases listed in §2.8 and §20.2 are forbidden in shipped output.

### 22.3 Infrastructure self-congratulation
"Launch chain" / "GitHub to Cloudflare is live" / deployment-status panels are forbidden in user-facing copy.

### 22.4 Placeholder tool cards
Cards for tools that do not yet work ("Planned module", "Foundation module", "Coming soon") are forbidden.

### 22.5 Article-width workbench
`--ea-page-max: 1180px` is deprecated. Workbench must use `--ea-size-workbench-max` (1760 px).

### 22.6 Token-layer gaps with fallback values
CSS using `var(--missing-token, hardcoded-fallback)` is a defect. Token must exist in `tokens.css` under the `--ea-*` namespace.

### 22.7 CSS file responsibility violation
Tool-specific CSS in `home.css` is a defect. Move to `src/modules/<module>/ui/<module>.css`.

### 22.8 Class contract drift
Markup emitting class names that no CSS file styles, or CSS styling class names no markup emits. Both are defects.

### 22.9 Excessive hero text
Any `font-size` above `--ea-font-size-tool-title` (1.875 rem) on a heading element is a defect, except for the result-value display which uses `--ea-font-size-result-large` (2.5 rem) and is not a heading.

### 22.10 Internal phase or contributor identifiers
`Fas`, `Phase`, `EIC`, internal contributor names, or workflow terms in shipped CSS, HTML, or visible copy.

### 22.11 Unescaped dataset rendering
Raw dataset string in `innerHTML`.

### 22.12 Missing focus state
Any interactive control without `:focus-visible` styling.

### 22.13 "Perfect" verdict
Result UI using "Perfect" as a status label.

### 22.14 Tracking force in resonance form group
Tracking force visually placed inside the resonance-math input group rather than separated.

### 22.15 Scroll for primary task
At 1920×1080 desktop, if the user must scroll to see inputs and result simultaneously on any tool route, the layout is wrong.

---

## 23. CSS migration plan from current state

This section is non-permanent. It documents the migration required to bring the current repo to v0.3 compliance. Once complete (target: same PR that adopts v0.3), this section is moved to `/docs/release/v0.3-migration-complete.md` and removed from this stylesheet.

### 23.1 Token namespace migration

| Current | Replace with |
|---|---|
| `--color-bg-app` (anywhere) | `--ea-bg-app` |
| `--color-bg-panel` | `--ea-bg-panel` |
| `--color-bg-panel-elevated` | `--ea-bg-panel-elevated` |
| `--color-text-primary` | `--ea-text-high` |
| `--color-text-secondary` | `--ea-text-medium` |
| `--color-text-muted` | `--ea-text-low` |
| `--color-status-ideal` | `--ea-status-ideal` |
| `--color-status-good` | `--ea-status-good` |
| `--color-status-acceptable` | `--ea-status-acceptable` |
| `--color-status-marginal` | `--ea-status-marginal` |
| `--color-status-poor` | `--ea-status-poor` |
| `--color-confidence-band` | `--ea-color-confidence-band` |
| `--color-confidence-band-edge` | `--ea-color-confidence-band-edge` |
| `--space-*` | `--ea-space-*` |
| `--font-size-*` | `--ea-font-size-*` |
| `--radius-*` | `--ea-radius-*` |

All fallback values in `var(--token, fallback)` patterns must be removed once the canonical token is added.

### 23.2 Page-max migration

| File | Replace |
|---|---|
| `tokens.css` line 42 | Remove `--ea-page-max`. Add `--ea-size-workbench-max` and `--ea-size-home-max` per §4.10. |
| `layout.css` line 22 | `width: min(100%, var(--ea-page-max));` → `width: min(100%, var(--ea-size-home-max));` for home shell. |
| `home.css` topbar | Same migration. |
| `home.css` `.tm-lab-*` topbar | Migrate to `--ea-size-workbench-max`. |

### 23.3 Hero deletion

Files that must lose hero markup and CSS:

- `src/app/home/renderHomePage.ts`: delete `<section class="ea-hero">` block (lines 108–123). Also delete the "Platform" section (lines 137–167) and the "Launch chain" section (lines 169–181). The home becomes: topbar + tool-index header (compact) + tool grid + footer.
- `src/modules/tonearm-match-lab/ui/renderTonearmMatchLabPage.ts`: delete `<section class="tm-lab-hero">` block (lines 676–683). Move h1 inside the first workbench panel header.
- `src/shared/ui/styles/home.css`: delete all `.ea-hero*` rules and all `.tm-lab-hero*` rules.

### 23.4 CSS file split

Tonearm Match Lab styles in `home.css` (lines 516–1849) must be moved to `src/modules/tonearm-match-lab/ui/tonearmMatchLab.css`. After the move, `home.css` should be < 500 lines and contain only home-route styles.

### 23.5 Class contract reconciliation

`layout.css` defines `.ea-app-shell` / `.ea-header` (unused). `home.css` defines `.ea-site-shell` / `.ea-topbar` (used). Pick one canonical name for each (recommended: `.ea-app-shell` and `.ea-topbar`), update the renderer to emit those, and delete the other.

### 23.6 Result classification deduplication

`home.css` lines 814–823 define `.tm-lab-result--ideal` / `.tm-lab-result--low` / `.tm-lab-result--high` (legacy). The renderer emits `--ideal/--good/--acceptable/--marginal/--poor` (current). Delete the legacy variants.

### 23.7 Comment cleanup

`home.css` line 1: `/* Engrove Audio Tools 3.0 — 2.0-inspired public landing page */` — delete. The reference to "2.0-inspired" and "landing page" both contradict v0.3 framing.

---

## 24. Review checklist

Every PR runs all of the following.

### 24.1 Source gates

```bash
npm run check
npm run check:tonearm
npm run validate:data
npm run check:integrity
npm run check:render-safe
npm run check:tonearm-selectors
npm run build
```

Plus data-validation script with both shells:

```bash
node tools/validate-audio-data.mjs
```
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./tools/Validate-AudioDataV3.ps1
```

The bash variant is required — it does not currently exist in `tools/` and must be added (`tools/validate-audio-data-v3.mjs` or rename of existing `tools/validate-audio-data.mjs` to satisfy the contract).

### 24.2 Hero grep gate (new)

```bash
# Must return zero matches
grep -REn 'class="[^"]*hero|tm-lab-hero|ea-hero|__lede|__backdrop|--lede|--backdrop' src/ || echo "OK"
grep -REn '"ea-page-max"|--ea-page-max' src/ || echo "OK"
grep -REn 'Precision Tools|Built as modules|Launch chain|GitHub to Cloudflare|Public productization' src/ || echo "OK"
```

### 24.3 Token namespace gate (new)

```bash
# Must return zero matches in src/ outside of tokens.css and migration scaffolding
grep -REn 'var\(--color-|var\(--space-|var\(--font-size-|var\(--radius-' src/modules src/app src/shared/ui/styles/home.css src/shared/ui/styles/layout.css src/shared/ui/styles/components.css src/shared/ui/styles/base.css || echo "OK"
```

### 24.4 Visual gates

For tool routes, screenshots required at:

- 1920×1080 (top of route, full primary workflow visible),
- 1440×900 (workbench grid),
- 1100×900 (narrow desktop boundary),
- 375×812 (mobile),
- modal open (focus visible inside),
- after Apply (result updated).

### 24.5 UX gates

- primary task begins in first viewport at 1920×1080,
- inputs and result simultaneously visible at desktop breakpoint,
- no large inline dataset list,
- no scroll to compute,
- modal Apply/Cancel mutation rule holds,
- public UI copy is English-only,
- "Perfect" verdict is not present,
- provenance badges render where required,
- tracking force visibly separated from resonance fields,
- no hero anywhere,
- no marketing copy.

### 24.6 Accessibility gates

- contrast meets WCAG 2.2 AA,
- all interactive controls have `:focus-visible` styles,
- modal focus trap works (tab cycles, Escape closes, focus returns),
- icon-only buttons have `aria-label`,
- charts/gauges have textual alternatives,
- `prefers-reduced-motion` respected,
- skip-link present in topbar.

### 24.7 Browser gates

- no console errors,
- runtime public data paths load,
- route reload works,
- `forced-colors: active` does not break layout,
- light theme parity verified.

---

## 25. PR template requirements

Every PR includes:

```text
## Stylesheet sections touched
List each §X section number from UI_STYLESHEET.md v0.3 that this patch touches.
If none, state explicitly: "No stylesheet sections touched."

## Files changed
List with brief reason per file.

## Implementation summary
2-4 sentences.

## Class-contract changes
List any new, renamed, or removed CSS classes. If markup changed, list the
emitted class names. CSS and markup must match.

## Token additions or changes
If tokens.css changed, list the token, its value, its rationale, and the
WCAG contrast result if it is a color token.

## Render-safety notes
If any dataset string is rendered, confirm escapeHtml/renderText/escapeAttribute usage.

## Modal behavior
If a modal is touched, confirm: focus trap works, Apply/Cancel mutation rule,
Escape closes, backdrop click does not mutate.

## Screenshots
Attach screenshots at:
- 1920×1080 (full route)
- 1440×900
- 1100×900
- 375×812
- Modal open if applicable

## Source gates output
Paste output of npm run check + grep gates from §24.

## Remaining blockers
Be specific.
```

PRs missing any of the above are rejected without further review.

---

## 26. Phase guidance (current cycle, aligned with ROADMAP v0.2)

### 26.1 Adoption of v0.3

In the first PR that adopts this version:

1. Add v0.3 of UI_STYLESHEET.md.
2. Bump `tokens.css` to the complete `--ea-*` namespace per §4.
3. Delete all `.ea-hero*` and `.tm-lab-hero*` selectors and markup.
4. Delete the home page "Platform" and "Launch chain" sections.
5. Reduce home page to: topbar + tool-index header + tool grid + footer.
6. Move Tonearm Match Lab styles from `home.css` to `tonearmMatchLab.css`.
7. Reconcile `.ea-app-shell`/`.ea-site-shell` and `.ea-header`/`.ea-topbar`.
8. Replace `--ea-page-max` with `--ea-size-workbench-max` / `--ea-size-home-max`.
9. Add the bash variant of the validation script.
10. Add hero/marketing/token grep gates to npm scripts.
11. Verify all §24 gates pass at 1920×1080.

### 26.2 Phase 1: Resonance Calculator completion

Per ROADMAP v0.2 Phase 1. The Tonearm Match Lab is the lighthouse tool. After v0.3 is adopted, Phase 1 work focuses on:

- Provenance UI (§11.6) with real flags from the data layer.
- Tracking force visual separation (§21.3).
- ZYX dataset correction (§21.8).
- Gauge migration to `--ea-*` token namespace.
- Confidence-band uncertainty propagation rendering.
- Mobile layout review.

No second tool starts until Phase 1 is complete.

---

## 27. Summary

```text
A workbench, not a website.
A tool index, not a brochure.
A workspace, not a landing page.
No hero, anywhere.
The user opens the site to do work.

WCAG 2.2 AA at minimum.
English-only in public UI.
Tokens are the single source of truth.
Marketing voice forbidden.
Infrastructure self-congratulation forbidden.
"Perfect" forbidden in result copy.
Honest about uncertainty.

Industrial reference: Cadera, Siemens, UXMatters, Quality Magazine IIoT.
Domain reference: Carlson 1954, Ladegaard B&K 17-233, Jovanovic JAES 2022.
```

The implementer is reminded: when in doubt, **err toward less visual content, denser controls, and more direct copy**. The product gets better as the visual surface gets quieter.
