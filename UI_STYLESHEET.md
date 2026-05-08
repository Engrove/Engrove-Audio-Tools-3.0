# UI_STYLESHEET.md

Status: Draft standard, version 0.2
Scope: Engrove Audio Tools 3.0 public web app
Primary audience: lead implementer, contributors
Last updated: 2026-05-08
Applies to: public UI, route layouts, calculation tools, dataset pickers, modal workflows, CSS architecture, design tokens, accessibility baseline

---

## Changelog

| Version | Date | Notes |
|---|---|---|
| 0.1 | 2026-05-07 | Initial draft (English-only rules, layout doctrine, density tokens, route contracts). |
| 0.2 | 2026-05-08 | Resolved internal contradictions (hero size, breakpoint vs grid). Added complete design-token layer (colors, typography, motion, z-index). Added data-viz, gauge, table, icon specifications. Strengthened accessibility to WCAG 2.2 AA explicit. Removed personal names. Added Match Lab classification UI binding. Added changelog and versioning rule. |

Rule: any non-trivial change to this document increments the minor version, with a changelog row stating what changed and why. Conflicts between code and this document are resolved by either patching the code or by a deliberate revision committed here. Silent drift is a defect.

---

## 1. Purpose

This document defines the visual, interaction and UX standard for Engrove Audio Tools 3.0.

Engrove Audio Tools 3.0 is not a generic marketing site and not a decorative demo. It is a public, modular, data-backed audio engineering toolset. Its interface combines a premium Engrove visual identity with the density and stability expected from a professional workbench application.

The goals are, in priority order:

1. fast user work,
2. correct calculation feedback,
3. low visual noise,
4. high information density where useful,
5. safe rendering of dataset strings,
6. predictable layout on desktop and mobile,
7. professional audio-domain credibility.

This file is a product design contract. When code and this document conflict, patch the code or revise this document explicitly.

---

## 2. Non-negotiable UI rules

### 2.1 Public UI language

All public user-facing UI copy must be English.

Do not ship:

- Swedish headings, labels, buttons, helper text, error text, empty states, result text,
- internal phase identifiers (`Fas 17.x`, `Phase 4`, etc.),
- internal contributor names or workflow terms.

Swedish is allowed in internal planning channels and commit messages, not in shipped public UI.

### 2.2 Application type

Engrove Audio Tools 3.0 routes that perform calculations or dataset work must use an **industrial workbench layout**, not a landing-page layout.

A landing-page layout is acceptable for the public home page only. It is not acceptable for calculator/tool routes.

Tool routes must prioritize:

- immediate task access,
- visible cause/effect feedback,
- compact control groups,
- useful use of available width,
- minimal scrolling during primary workflows,
- stable result visibility.

### 2.3 No large inline dataset lists

Large cartridge, tonearm or other audio datasets must never be rendered as long inline lists inside a calculator page. Use a modal, drawer, panel, or virtualized list pattern. The normal calculator flow stays compact.

### 2.4 Route contracts

Established route contracts are not broken without an explicit, version-bumped revision of this document.

For Tonearm Match Lab:

```ts
renderTonearmMatchLabPage(): string
enableTonearmMatchLabInteractions(): void
```

### 2.5 Render safety

Dataset strings are untrusted for rendering purposes.

Any dataset-sourced string rendered into HTML must pass through the shared render-safe helpers:

```ts
renderText(value)
escapeAttribute(value)
escapeHtml(value)
```

No raw dataset string may be interpolated into `innerHTML`. Static analysis must catch violations (see §22).

### 2.6 No framework drift

The current app is a Vite + TypeScript SPA with hand-written CSS. It is not React. Component libraries, styling frameworks, and new dependencies require an explicit, version-bumped revision of this document.

---

## 3. Design model

### 3.1 The intended feel

Engrove Audio Tools should feel like:

- a premium audio measurement/control surface,
- a studio-grade configuration tool,
- a technical calculator with editorial clarity,
- a modern industrial web application.

It must not feel like:

- a blog page,
- a SaaS marketing landing page,
- a generic admin dashboard,
- a raw HTML form,
- a toy demo,
- a mobile-first consumer wizard on desktop.

### 3.2 Core design tension

Two goals must be balanced:

1. **Look**: premium, dark, calm, branded, audio-oriented.
2. **Work**: compact, direct, fast, stable, data-heavy when needed.

When these conflict on tool routes, usability wins. Visual style supports the work, it does not push it down the page.

---

## 4. Design tokens (canonical reference)

This is the single source of truth for visual values. All routes consume these tokens. Hard-coded color or spacing literals outside this token layer are defects.

### 4.1 Spacing scale

```css
--space-0: 0;
--space-1: 0.25rem;   /*  4px */
--space-2: 0.5rem;    /*  8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-7: 2rem;      /* 32px */
--space-8: 2.5rem;    /* 40px */
--space-9: 3rem;      /* 48px */
--space-10: 4rem;     /* 64px */
```

Tool routes use `--space-2` to `--space-5` for primary gaps. Home page may use `--space-7` to `--space-10` for hero spacing.

### 4.2 Color tokens — dark theme (default)

All values are explicit. Comments document intended use.

```css
:root, [data-theme="dark"] {
  /* Surface */
  --color-bg-app: #0B0E12;            /* page background */
  --color-bg-app-gradient-from: #0B0E12;
  --color-bg-app-gradient-to: #11161D;
  --color-bg-panel: rgb(255 255 255 / 0.035);  /* primary panel surface */
  --color-bg-panel-elevated: rgb(255 255 255 / 0.06);  /* nested or active */
  --color-bg-panel-overlay: rgb(0 0 0 / 0.4);  /* modal scrim */
  --color-bg-input: rgb(0 0 0 / 0.25);
  --color-bg-input-focus: rgb(0 0 0 / 0.35);

  /* Border */
  --color-border-subtle: rgb(255 255 255 / 0.08);
  --color-border-default: rgb(255 255 255 / 0.12);
  --color-border-strong: rgb(255 255 255 / 0.20);
  --color-border-focus: #4FD1C5;

  /* Text */
  --color-text-primary: #E8EAED;       /* contrast 13.5:1 on #0B0E12 */
  --color-text-secondary: #B0B4BA;     /* contrast 7.8:1 */
  --color-text-muted: #8A9099;         /* contrast 4.9:1, body-OK floor */
  --color-text-disabled: #5A6068;      /* contrast 2.6:1, non-text only */
  --color-text-on-accent: #0B0E12;

  /* Accents */
  --color-accent-teal: #4FD1C5;        /* interactive, selected, primary action */
  --color-accent-teal-hover: #5EE0D4;
  --color-accent-teal-pressed: #3FB8AC;
  --color-accent-amber: #F6AD55;       /* tool category, kicker, attention */
  --color-accent-amber-soft: rgb(246 173 85 / 0.15);

  /* Status (must remain readable on bg-panel) */
  --color-status-ideal: #34D399;       /* central deep-green (9-11 Hz band) */
  --color-status-good: #48BB78;        /* good (8-12 Hz band) */
  --color-status-acceptable: #ECC94B;  /* yellow (7-8, 12-13 Hz) */
  --color-status-marginal: #ED8936;    /* orange (6-7, 13-14 Hz) */
  --color-status-poor: #F56565;        /* red (<6, >14 Hz) */
  --color-status-info: #63B3ED;        /* informational neutral */

  /* Status soft fills (for badge backgrounds) */
  --color-status-ideal-soft: rgb(52 211 153 / 0.16);
  --color-status-good-soft: rgb(72 187 120 / 0.14);
  --color-status-acceptable-soft: rgb(236 201 75 / 0.16);
  --color-status-marginal-soft: rgb(237 137 54 / 0.16);
  --color-status-poor-soft: rgb(245 101 101 / 0.16);

  /* Confidence bands (uncertainty visualization) */
  --color-confidence-band: rgb(79 209 197 / 0.18);
  --color-confidence-band-edge: rgb(79 209 197 / 0.4);
}
```

### 4.3 Color tokens — light theme (parity)

```css
[data-theme="light"] {
  --color-bg-app: #F7F8FA;
  --color-bg-app-gradient-from: #F7F8FA;
  --color-bg-app-gradient-to: #ECEFF3;
  --color-bg-panel: rgb(0 0 0 / 0.025);
  --color-bg-panel-elevated: rgb(0 0 0 / 0.045);
  --color-bg-panel-overlay: rgb(0 0 0 / 0.35);
  --color-bg-input: #FFFFFF;
  --color-bg-input-focus: #FFFFFF;

  --color-border-subtle: rgb(0 0 0 / 0.06);
  --color-border-default: rgb(0 0 0 / 0.12);
  --color-border-strong: rgb(0 0 0 / 0.22);
  --color-border-focus: #0E7C72;

  --color-text-primary: #161A1F;
  --color-text-secondary: #3D434B;
  --color-text-muted: #5A6068;
  --color-text-disabled: #9AA0A6;
  --color-text-on-accent: #FFFFFF;

  --color-accent-teal: #0E7C72;
  --color-accent-teal-hover: #117D72;
  --color-accent-teal-pressed: #0A6058;
  --color-accent-amber: #B7791F;
  --color-accent-amber-soft: rgb(183 121 31 / 0.12);

  --color-status-ideal: #166534;
  --color-status-good: #2F855A;
  --color-status-acceptable: #B7791F;
  --color-status-marginal: #C05621;
  --color-status-poor: #C53030;
  --color-status-info: #2B6CB0;
}
```

All status, accent, and text tokens above target WCAG 2.2 AA contrast (4.5:1 for body text, 3:1 for graphical UI components and large text). When a contributor adds a new token, contrast must be verified and the result documented next to the token.

### 4.4 Typography stack

```css
--font-family-sans: "Inter", "Inter var", system-ui, -apple-system, "Segoe UI",
                    Roboto, "Helvetica Neue", Arial, sans-serif;
--font-family-mono: "JetBrains Mono", "Fira Code", "SF Mono", Menlo,
                    Consolas, "Liberation Mono", monospace;
--font-family-numeric: var(--font-family-mono);

--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

--font-size-microcopy: 0.78rem;      /* 12.5px */
--font-size-helper: 0.86rem;         /*  ~14px */
--font-size-label: 0.95rem;          /*  ~15px */
--font-size-body: 1rem;              /*   16px */
--font-size-body-large: 1.05rem;     /*  ~17px */
--font-size-panel-heading: 1.15rem;  /*  ~18px */
--font-size-section-heading: 1.5rem; /*   24px */
--font-size-tool-title: 1.875rem;    /*   30px */  /* tool routes */
--font-size-page-hero: clamp(2.25rem, 5vw, 3.75rem); /* home page only */

--line-height-tight: 1.2;
--line-height-normal: 1.5;
--line-height-relaxed: 1.65;

--letter-spacing-kicker: 0.08em;     /* uppercase category tags */
```

Numeric values in result panels use `--font-family-numeric` to keep digit widths stable across refresh.

### 4.5 Radius

```css
--radius-sm: 0.375rem;   /*  6px (badges, small chips) */
--radius-md: 0.5rem;     /*  8px (inputs, buttons) */
--radius-lg: 0.75rem;    /* 12px (panels) */
--radius-xl: 1rem;       /* 16px (modals, hero cards) */
--radius-pill: 9999px;
```

### 4.6 Shadow

```css
--shadow-none: none;
--shadow-sm: 0 1px 2px rgb(0 0 0 / 0.18);
--shadow-md: 0 6px 16px rgb(0 0 0 / 0.22);
--shadow-lg: 0 16px 40px rgb(0 0 0 / 0.28);
--shadow-modal: 0 24px 64px rgb(0 0 0 / 0.45);
--shadow-focus-ring: 0 0 0 2px var(--color-bg-app), 0 0 0 4px var(--color-border-focus);
```

Avoid stacking multiple `--shadow-lg` shadows in dense work areas.

### 4.7 Motion

```css
--motion-duration-instant: 80ms;     /* state flip (focus, press) */
--motion-duration-fast: 160ms;       /* small UI transitions */
--motion-duration-normal: 240ms;     /* default */
--motion-duration-slow: 360ms;       /* modal open/close */
--motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
--motion-easing-emphasized: cubic-bezier(0.2, 0, 0.2, 1.4);
--motion-easing-decelerate: cubic-bezier(0, 0, 0, 1);
```

All motion respects `prefers-reduced-motion` (see §18).

### 4.8 Z-index scale

```css
--z-base: 0;
--z-elevated: 10;        /* sticky panels */
--z-dropdown: 100;
--z-sticky-result: 200;
--z-overlay: 1000;
--z-modal: 1100;
--z-popover: 1200;
--z-tooltip: 1300;
--z-toast: 1400;
```

Hard-coded z-index outside this scale is a defect.

### 4.9 Breakpoints

```css
--bp-mobile: 720px;
--bp-tablet: 1024px;
--bp-desktop: 1100px;     /* aligned with workbench grid minimum, see §5.7 */
--bp-wide: 1440px;
--bp-ultra: 1920px;
```

Note: desktop breakpoint is **1100 px**, not 1024 px. This is the smallest viewport at which the two-zone workbench layout (§5.7) renders without overflow.

---

## 5. Layout doctrine

### 5.1 Home page vs tool routes

Home page may use:

- hero presentation,
- larger typography (`--font-size-page-hero`),
- marketing sections,
- looser spacing (`--space-7` to `--space-10`).

Tool routes must use:

- compact tool headers (max title size `--font-size-tool-title`, 30 px),
- persistent workspace layout,
- clear panels,
- visible result feedback,
- dense but readable forms,
- minimal scroll for primary work.

### 5.2 Tool route vertical structure

Desktop tool route structure:

```text
Topbar:           56-72 px
Tool header:      72-120 px (compact title + one sentence)
Workbench:        fills main viewport
Secondary notes:  below or collapsible
```

The primary working area must begin within the first viewport. Large vertical gaps before the first actionable control are defects.

### 5.3 No oversized hero on tools

Bad pattern:

```text
Topbar
Large decorative hero
Large heading
Large description
Large empty space
Then tool
```

Good pattern:

```text
Topbar
Compact tool title (1.875rem) + one sentence
Workbench: inputs + result visible
```

The previous version of this document allowed `clamp(2.25rem, 5vw, 4.5rem)` for tool titles. That is a hero-size title and is now explicitly forbidden on tool routes. Use `--font-size-tool-title` (1.875rem) for tool routes; reserve `--font-size-page-hero` for the home page only.

### 5.4 Desktop viewport target

On a common desktop viewport (1920×1080), the user must be able to see at least:

- compact route header,
- dataset picker controls,
- all primary numeric inputs,
- quick result / diagnosis,
- enough context to understand the setup.

The default desktop workflow does not require scrolling after every value change.

### 5.5 Use available width

Do not constrain the entire tool route to a narrow content-reading width.

For tool routes:

```css
.tool-route {
  inline-size: min(100% - 2rem, 1760px);
  margin-inline: auto;
}
```

Rationale for 1760 px: leaves ~80 px outer breathing room on a 1920 px viewport while preventing extreme stretch on ultrawide displays. On viewports >1920 px, content remains capped.

### 5.6 Control width is not panel width

Full page width does not mean inputs become huge.

```css
.tm-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 320px));
  gap: var(--space-4);
}
.tm-field input {
  inline-size: 100%;
  max-inline-size: 22rem;
}
```

Panel width uses the viewport. Individual controls remain ergonomic.

### 5.7 Workbench grid

Desktop tool routes use a two-zone workbench:

```text
┌──────────────────────────────────────────┬─────────────────────────────┐
│ Input, picker and setup controls         │ Result, diagnosis, summary  │
│ 2-3 compact columns where useful         │ sticky or always visible    │
└──────────────────────────────────────────┴─────────────────────────────┘
```

```css
.tool-workbench {
  display: grid;
  grid-template-columns: minmax(580px, 1.6fr) minmax(380px, 1fr);
  gap: var(--space-4);
}

@media (max-width: 1099px) {
  .tool-workbench {
    grid-template-columns: 1fr;
  }
}
```

Rationale for 1.6fr / 1fr: golden-ratio-inspired allocation favoring the input panel. The previous 1.25fr / 0.75fr ratio was arbitrary and produced a left panel barely wider than the right; result-heavy routes were unbalanced. Minimum widths (580 + 380 + gap = ~976 px content) align with the 1100 px desktop breakpoint (§4.9) accounting for outer padding.

### 5.8 Result visibility

Calculation result must be near the inputs.

For interactive calculators:

- result updates immediately on input change,
- result stays visible while editing on desktop (sticky if needed),
- result is not pushed below long setup text,
- result does not require scrolling after normal input changes.

A sticky result panel uses `position: sticky; top: var(--space-4); z-index: var(--z-sticky-result);` and must not overlap input controls. It collapses on viewports below `--bp-desktop`.

### 5.9 Secondary content

Assumptions, notes, explanations and future-release text are secondary. They do not dominate the primary calculation route.

Prefer:

- compact notes panel,
- collapsible details (`<details>` element),
- below-workbench section,
- short bullet list,
- secondary visual priority (lower contrast, smaller heading).

Long explanatory sections must not be placed between inputs and results.

---

## 6. Density standard

### 6.1 Density goal

Tool routes are dense enough for work and spacious enough for readability. Avoid both extremes.

### 6.2 Control heights

```css
--control-height-compact: 2.25rem;   /* 36px */
--control-height-default: 2.5rem;    /* 40px */
--control-height-large: 2.75rem;     /* 44px - touch baseline */
--control-height-xl: 3rem;           /* 48px - primary modal action */
```

Tool routes use `--control-height-default`. Modal primary actions may use `--control-height-xl`. Mobile uses `--control-height-large` minimum.

### 6.3 Panel padding

```css
--panel-padding-compact: var(--space-4);   /* 1rem */
--panel-padding-default: var(--space-5);   /* 1.25rem */
--panel-padding-editorial: var(--space-6); /* 1.5rem */
```

Avoid `--space-7+` padding inside every nested tool panel.

### 6.4 Field rhythm

```css
.field {
  display: grid;
  gap: 0.35rem;
}
.field-group {
  display: grid;
  gap: var(--space-4);
}
```

Each field occupies: label (1 line) + input + optional helper (1 line). Total vertical footprint: ~5.5–6 rem.

---

## 7. Typography (applied)

### 7.1 Tone

Typography is confident, technical, clear, premium. Not playful. Not condensed for body text.

### 7.2 Tool route type scale

```css
.tool-title       { font-size: var(--font-size-tool-title); font-weight: var(--font-weight-semibold); line-height: var(--line-height-tight); }
.section-heading  { font-size: var(--font-size-section-heading); font-weight: var(--font-weight-semibold); }
.panel-heading    { font-size: var(--font-size-panel-heading); font-weight: var(--font-weight-medium); }
.label            { font-size: var(--font-size-label); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); }
.body             { font-size: var(--font-size-body); line-height: var(--line-height-normal); }
.helper           { font-size: var(--font-size-helper); color: var(--color-text-muted); }
.microcopy        { font-size: var(--font-size-microcopy); color: var(--color-text-muted); }
.kicker           { font-size: var(--font-size-microcopy); text-transform: uppercase; letter-spacing: var(--letter-spacing-kicker); color: var(--color-accent-amber); font-weight: var(--font-weight-semibold); }
.numeric          { font-family: var(--font-family-numeric); font-variant-numeric: tabular-nums; }
```

### 7.3 Text measure

Long paragraphs have a readable max width:

```css
.tool-header p {
  max-inline-size: 64ch;
}
```

The entire workbench is not constrained to make a paragraph readable.

### 7.4 Labels

Labels are direct and unit-aware:

```text
Tonearm effective mass, g
Cartridge mass, g
Compliance @10 Hz, µm/mN
Mounting screws/fasteners, g
Tracking force, g (setup only — not in resonance calc)
```

Note on compliance unit: Modern manufacturer specifications use `µm/mN`. The legacy `cu` is dimensionally identical (`1 cu = 1 µm/mN = 10⁻³ m/N`). UI labels use `µm/mN`; helper text may note "also called cu" for users with vintage data sheets.

### 7.5 Helper text

Helper text is concise and functional. Long explanations live in the assumptions/notes section.

---

## 8. Color and theme (applied)

### 8.1 Theme switching

Theme is selected by a `data-theme` attribute on `<html>`:

```html
<html data-theme="dark">  <!-- default -->
<html data-theme="light">
```

The theme toggle in the topbar (§16) writes to `localStorage` (key: `engrove-theme`) and updates the attribute. Default is dark. The `prefers-color-scheme` media query is consulted on first load if no stored preference exists.

### 8.2 Accent hierarchy

Use accents sparingly. Per panel, no more than two accent colors except in calibrated status visualizations (e.g., the resonance gauge in §13).

### 8.3 Status colors (canonical mapping)

This mapping is binding for any calculator that produces a band-classified result. The same colors appear in the gauge (§13) and in result-card badges:

| Band | Token | Hex (dark) | Use |
|---|---|---|---|
| Ideal | `--color-status-ideal` | `#34D399` | central optimal subzone |
| Good | `--color-status-good` | `#48BB78` | inside accepted band |
| Acceptable | `--color-status-acceptable` | `#ECC94B` | edges of accepted band |
| Marginal | `--color-status-marginal` | `#ED8936` | outside accepted band, recoverable |
| Poor | `--color-status-poor` | `#F56565` | outside, not recommended |

### 8.4 Contrast (binding)

WCAG 2.2 AA minimum:

- body text on its background: ≥ 4.5:1,
- large text (≥ 18.66 px regular, or ≥ 14 px bold) on its background: ≥ 3:1,
- UI component / graphical object boundary: ≥ 3:1,
- non-text indicator (icon, status fill): ≥ 3:1 against adjacent surface.

Muted text (`--color-text-muted`) is the floor for body content (4.9:1 in dark, 5.1:1 in light). `--color-text-disabled` is for non-text or non-essential UI only.

`forced-colors` mode (Windows high contrast) must not break layout. UI components should declare `forced-color-adjust: auto` and remain functional with system colors.

---

## 9. Surfaces, borders, depth

### 9.1 Panels

```css
.panel {
  background: var(--color-bg-panel);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-lg);
  padding: var(--panel-padding-default);
}
.panel--active,
.panel--selected {
  border-color: var(--color-border-strong);
  background: var(--color-bg-panel-elevated);
}
```

### 9.2 Shadow

Use `--shadow-md` for elevated panels. Use `--shadow-lg` only for the topmost surface in a stacked section. Use `--shadow-modal` for dialogs.

### 9.3 Nested panels

Nested panels use `--color-bg-panel-elevated` and `--color-border-subtle` to register as inset rather than as a second floating card.

---

## 10. Buttons and actions

### 10.1 Hierarchy

- **Primary**: filled accent. One per panel/route.
- **Secondary**: outlined. Cancel, neutral.
- **Tertiary**: text-only. Minor or link-like.
- **Destructive**: red filled. Used only when the action removes or overwrites user-visible state.

### 10.2 Sizing

```css
.btn {
  min-block-size: var(--control-height-default);
  padding-inline: var(--space-4);
  border-radius: var(--radius-md);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-body);
  transition: background-color var(--motion-duration-fast) var(--motion-easing-standard),
              border-color var(--motion-duration-fast) var(--motion-easing-standard);
}
.btn--compact { min-block-size: var(--control-height-compact); padding-inline: var(--space-3); }
.btn--large   { min-block-size: var(--control-height-xl); padding-inline: var(--space-5); }
```

### 10.3 States

Every interactive control declares: default, hover, focus-visible, active/pressed, disabled. Focus-visible uses `--shadow-focus-ring`.

### 10.4 Dataset picker buttons

Dataset picker buttons are compact and adjacent to the field they affect.

Good:

```text
[Select cartridge from dataset]   Selected cartridge: Denon DL-103
[Select tonearm from dataset]     Selected tonearm: Rega RB300
```

Bad: full-width banner buttons that displace inputs below the fold.

### 10.5 Disabled state

Disabled actions are visually clear and explainable. Loading states use a determinate label:

```text
Loading public runtime data…
```

Buttons enable when data is ready.

---

## 11. Forms and inputs

### 11.1 Inputs in calculators

Numeric input is core workflow.

- visible without excessive scrolling,
- consistent width,
- unit in label,
- short helper text,
- result updates immediately.

### 11.2 Decimal handling

The app accepts both `.` and `,` as decimal separators on numeric inputs (European keyboards). The internal model uses dot. UI never echoes back a converted form silently — if conversion happened, helper text declares it. If full locale handling is not yet implemented, the current behavior is documented in tests, not implied in UI.

### 11.3 Input layout

Desktop preferred:

```text
2 columns or 3 compact columns
```

Five fields in a single vertical stack on desktop (when viewport supports columns) is a defect.

### 11.4 Helper text priority

Use helper text only where it reduces error:

- compliance source frequency (10 Hz vs 100 Hz),
- conversion factor used,
- tracking force not included in moving mass,
- estimated/community-source data flag.

### 11.5 Errors

Error messages are:

- placed near the affected control or result panel,
- in English,
- specific,
- actionable.

Bad: `Invalid.`
Good: `Compliance @10 Hz must be a positive number.`

### 11.6 Provenance/confidence indicators

Per the reference data model, every input that derives from converted or estimated data displays a provenance badge inline:

```text
[ converted from 100 Hz · ×1.7 ]
[ community estimate ]
[ vintage spec — see notes ]
```

Badges use `--color-accent-amber-soft` background, `--color-text-secondary` text, `--font-size-microcopy`, and `--radius-sm`.

---

## 12. Data-heavy picker standard

### 12.1 When to use a modal picker

Modal picker required when:

- dataset is large,
- user must search/filter before selecting,
- selection should not mutate the calculator until confirmed,
- user benefits from previewing values.

Cartridge and tonearm selection use modal picker behavior, never inline mega lists.

### 12.2 Modal structure

```text
Header:
  Title
  Close button (accessible label)

Body:
  Filter panel
  Results list (capped)
  Selected preview

Footer:
  Cancel
  Apply (primary)
```

### 12.3 Modal behavior (binding)

- Open from compact control on page.
- Search/filter inside modal.
- Result list is capped (default 100 rows).
- Row click changes draft selection only.
- Preview updates from draft selection.
- **Apply** mutates calculator fields and dispatches `input`/`change` events so derived results recalculate.
- **Cancel**, **X close**, **Escape**, and **backdrop click** do not mutate.
- Modal traps focus while open (see §18).

### 12.4 Result cap

Default cap: 100 visible results. Future: virtualization or pagination. For now, cap and filter.

### 12.5 Filtering

Cartridge minimum filters: search text, type, mass min/max, compliance min/max, generator type (MM/MI/MC LO/MC HO/SG), match-ready flag.

Tonearm minimum filters: search text, effective-mass min/max, headshell convention (integrated/detachable/unknown).

### 12.6 Preview

Preview shows the values that will be applied:

For cartridge: name, type, mass, compliance @10 Hz (with provenance badge if converted/estimated).

For tonearm: name, effective mass (with provenance badge if community-estimated).

Preview text explains: "Apply copies these values to the calculator. Cancel does not."

### 12.7 Modal density

Modal may be denser than the main page. Row height: 2.5–3 rem. Font size: `--font-size-helper` for secondary fields, `--font-size-body` for primary.

### 12.8 Modal accessibility (binding)

- `role="dialog"`,
- `aria-modal="true"`,
- `aria-labelledby` pointing to a visible title,
- close button with accessible name (`aria-label="Close"` if icon-only),
- Escape closes,
- focus moves into the modal on open,
- focus trap retains focus inside while open,
- focus restores to the originating control on close.

Focus trap is **required**, not deferred.

---

## 13. Result and gauge standard

### 13.1 Result priority

The result is the feedback loop. Visually prominent, near the inputs.

For Tonearm Match Lab, the result panel shows:

- resonance frequency `f₀` (1 decimal, e.g., `9.5 Hz`),
- propagated uncertainty band (e.g., `±1.0 Hz`),
- classification badge (Ideal/Good/Acceptable/Marginal/Poor),
- short diagnosis sentence,
- target-zone text (e.g., "Target zone 8–12 Hz"),
- 2–3 short suggestions if applicable.

### 13.2 Numerical formatting

```text
9.5 Hz                  (1 decimal)
±1.0 Hz                 (1 decimal)
19.3 g                  (1 decimal)
12 µm/mN @10 Hz         (integer, optional 1 decimal)
```

Result panels do not display raw implementation fields (e.g., internal float64 values).

### 13.3 Classification badges

Per the reference data model:

| Band | Label | Color token | Icon (Unicode pair) |
|---|---|---|---|
| Ideal | `Ideal` | `--color-status-ideal` | `★` |
| Good | `Good` | `--color-status-good` | `✓` |
| Acceptable | `Acceptable but not optimal` | `--color-status-acceptable` | `⚠` |
| Marginal | `Marginal` | `--color-status-marginal` | `⚠` |
| Poor | `Poor` | `--color-status-poor` | `✗` |

Badge style:

```css
.result-badge {
  display: inline-flex;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-helper);
  font-weight: var(--font-weight-semibold);
}
.result-badge--ideal      { background: var(--color-status-ideal-soft);      color: var(--color-status-ideal); }
.result-badge--good       { background: var(--color-status-good-soft);       color: var(--color-status-good); }
.result-badge--acceptable { background: var(--color-status-acceptable-soft); color: var(--color-status-acceptable); }
.result-badge--marginal   { background: var(--color-status-marginal-soft);   color: var(--color-status-marginal); }
.result-badge--poor       { background: var(--color-status-poor-soft);       color: var(--color-status-poor); }
```

Per accessibility (§18), color is paired with both a textual label and an icon — color alone is never the indicator.

### 13.4 Resonance gauge

A horizontal gauge spanning 5–16 Hz visualizes the result.

Specification:

- **Display range:** 5–16 Hz, linear scale.
- **Background zones (left to right):** poor (5–6) red — marginal (6–7) orange — acceptable (7–8) yellow — good (8–12) green — within good, ideal subzone (9–11) deep-green strip — acceptable (12–13) yellow — marginal (13–14) orange — poor (14–16) red.
- **Marker:** vertical line at `f₀`, one decimal precision, `2px` stroke, color `--color-text-primary`.
- **Confidence band:** translucent horizontal bracket of width `±σ_f` centered on the marker, color `--color-confidence-band`, edges `--color-confidence-band-edge`. Always rendered. When provenance flags weaken (converted, community-estimated, vintage), band widens.
- **Out-of-range result:** if `f₀ < 5` or `> 16`, marker pegs at edge with chevron and a textual "f = X.X Hz, outside displayed range" line below.
- **Missing input:** gauge renders disabled (greyed) with prompt: "Enter cartridge mass, compliance, and tonearm effective mass to compute resonance."

Accessibility:

- gauge has `role="img"` with `aria-label` summarizing the result (e.g., "Resonance 9.5 Hz, status Ideal, confidence ±1.0 Hz"),
- a textual sibling line presents the same data for screen readers,
- shape/icon at zone boundaries (✓, ★, ⚠, ✗) ensures monochrome rendering remains parseable.

### 13.5 Diagnosis language

Diagnosis copy is calm and practical.

Good: `Resonance is inside the common 8–12 Hz target zone.`

Avoid: `Perfect match!` `Guaranteed safe!` `Magic number!`

Per reference data model: avoid the word "Perfect" entirely. The defensible terminology is "Ideal" (9–11 Hz subzone). Propagated uncertainty (~±1 Hz at 10 Hz) is larger than the entire ideal subzone, so "Perfect" is an overpromise.

### 13.6 Suggestions

Suggestions are short and operational:

- "Recheck compliance value if it was converted from a 100 Hz spec."
- "Confirm tracking force is set within the cartridge manufacturer range (display only — does not affect this calculation)."
- "Consider headshell mass if the tonearm's effective-mass spec excludes it."

---

## 14. Tables

For result lists, comparison views, and dataset summaries.

```css
.table {
  inline-size: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--font-size-helper);
}
.table th {
  position: sticky;
  inset-block-start: 0;
  background: var(--color-bg-panel-elevated);
  border-block-end: 1px solid var(--color-border-default);
  font-weight: var(--font-weight-semibold);
  text-align: start;
  padding: var(--space-3);
}
.table td {
  padding: var(--space-3);
  border-block-end: 1px solid var(--color-border-subtle);
}
.table tr:hover td {
  background: var(--color-bg-panel-elevated);
}
.table .numeric {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
```

Row height: 2.25–2.75 rem. No zebra striping by default — rely on subtle row borders. Sticky header is mandatory for any table > 10 rows.

---

## 15. Charts and data visualization

For frequency response, IM-distortion vs Q, warp-spectrum, and similar plots.

### 15.1 Tokens

```css
--chart-axis-color: var(--color-text-muted);
--chart-grid-color: var(--color-border-subtle);
--chart-label-size: var(--font-size-microcopy);
--chart-line-width: 2px;
--chart-line-width-emphasized: 3px;
--chart-marker-radius: 4px;
```

### 15.2 Series colors

Sequential series in a single chart use, in order: `--color-accent-teal`, `--color-status-acceptable`, `--color-status-marginal`, `--color-accent-amber`, `--color-status-info`, `--color-status-poor`. Beyond six series, switch to a categorical scheme or split the chart.

### 15.3 Axis and grid

Axes use `--chart-axis-color` and `1px` stroke. Grid lines use `--chart-grid-color` and `1px` stroke. Both are toggleable per chart.

### 15.4 Tooltips

Chart tooltips render in a small panel using `--shadow-md`, `--radius-md`, `--panel-padding-compact`. Numeric values use `--font-family-numeric`.

### 15.5 Accessibility

Every chart has:

- a textual summary alternative (`<figcaption>` or `aria-describedby`),
- a tabular data fallback toggle (button to swap to a `<table>`),
- color paired with shape/dash patterns when more than two series share a region.

---

## 16. Iconography

### 16.1 Icon system

Icons are inline SVG, rendered at `currentColor`, drawn on a 24×24 grid with 2 px stroke.

```css
.icon {
  inline-size: 1.25em;
  block-size: 1.25em;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
  vertical-align: middle;
}
.icon--sm { inline-size: 1em; block-size: 1em; }
.icon--lg { inline-size: 1.5em; block-size: 1.5em; }
```

### 16.2 Icon-only buttons

```html
<button class="btn btn--icon" aria-label="Close picker">
  <svg class="icon" aria-hidden="true">…</svg>
</button>
```

`aria-label` is mandatory for icon-only buttons. The SVG is `aria-hidden="true"`.

### 16.3 Icon source

Icons are committed under `src/shared/ui/icons/` as individual SVG files. No icon-font runtime dependency. Only commit icons that are actually used.

---

## 17. Responsive behavior

### 17.1 Breakpoints (binding)

```css
/* mobile:        < --bp-mobile  (< 720px)   */
/* tablet:        --bp-mobile to --bp-tablet (720-1023px) */
/* narrow desktop: --bp-tablet to --bp-desktop (1024-1099px) */
/* desktop:       --bp-desktop to --bp-wide (1100-1439px) */
/* wide desktop:  --bp-wide to --bp-ultra (1440-1919px) */
/* ultra:         >= --bp-ultra (>= 1920px) */
```

The two-zone workbench grid (§5.7) requires `>= --bp-desktop`. Below that it collapses to single-column.

### 17.2 Desktop (≥ 1100 px)

Two-zone workbench. Primary inputs and result simultaneously visible.

### 17.3 Narrow desktop / tablet (720–1099 px)

Single-column stacked panels. Result appears directly after inputs, never after long notes.

### 17.4 Mobile (< 720 px)

Single column. Compact topbar (≤ 56 px). Compact header (≤ 96 px). Controls full width. Modals nearly full-screen. Touch target minimum 44 px (use `--control-height-large`).

### 17.5 Avoid horizontal overflow

```css
.container {
  min-inline-size: 0;
  box-sizing: border-box;
  overflow-wrap: anywhere;
}
```

No route creates accidental horizontal scrolling.

---

## 18. Accessibility (binding)

Compliance target: **WCAG 2.2 Level AA**.

### 18.1 Baseline

All interactive UI has:

- visible focus state via `:focus-visible` and `--shadow-focus-ring`,
- keyboard-accessible operation (Tab, Enter, Space as appropriate),
- semantic HTML (use `<button>` for actions, `<a>` for navigation),
- labels for all inputs (`<label for>` or `aria-labelledby`),
- accessible names for icon-only controls (`aria-label`),
- contrast meeting §8.4.

### 18.2 Focus management

- `:focus-visible` selector used for keyboard focus styling (no `:focus` outline removal without replacement),
- focus moves into modal on open (first interactive element or the title),
- focus is trapped in modal while open (mandatory, not future),
- focus restores to the originating control on modal close,
- skip-link from topbar to main content for keyboard users.

### 18.3 Target sizes

- desktop dense controls: ≥ 32 px,
- desktop standard: ≥ 36 px (`--control-height-compact`),
- touch/mobile: ≥ 44 px (`--control-height-large`).

### 18.4 Reduced motion

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

No animation conveys information that is not also conveyed in a static state.

### 18.5 Forced colors / Windows high contrast

UI components remain operable with system colors. Test with `forced-colors: active` media query. Borders and focus rings must use `currentColor` or system tokens (`Highlight`, `ButtonText`) when appropriate.

### 18.6 Screen reader support

- `<main>`, `<nav>`, `<header>`, `<footer>` landmarks,
- one `<h1>` per route,
- heading hierarchy is monotonic (no h2 → h4 jumps),
- live regions (`aria-live="polite"`) for result updates that change without explicit user action,
- charts and gauges have textual alternatives (§13.4, §15.5),
- form errors use `aria-describedby` to associate message with field.

### 18.7 Internationalization scope

Public UI is English-only (§2.1). The CSS uses logical properties (`inline-size`, `padding-inline`, `margin-inline-start`) throughout to keep RTL adaptation possible without rewriting layout, but RTL is not currently in scope.

---

## 19. Public copy standard

### 19.1 Voice

Clear, technical, calm, concise, trustworthy.

### 19.2 Avoid hype

Do not use: `magic`, `perfect`, `guaranteed`, `revolutionary`, AI-style superlatives.

### 19.3 Preferred wording

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
Ideal / Good / Acceptable / Marginal / Poor   (band labels)
Converted from 100 Hz spec   (provenance)
Community estimate            (provenance)
```

### 19.4 Error wording

Errors explain what failed and what the user can do.

```text
Runtime picker data could not be loaded. Check the public data route and try again.
```

### 19.5 Empty states

Empty states are useful.

```text
No matching dataset items found. Try broadening the filters.
```

Avoid: `Nothing here.`

---

## 20. Tonearm Match Lab specific standard

### 20.1 Intended desktop layout

```text
Topbar
Compact tool header (title 1.875rem max, single-sentence description)
Workbench (two-zone):
  Left/main:
    Dataset picker controls
    Numeric setup fields (2-3 columns)
  Right:
    Quick Match result (sticky)
    Resonance gauge
    Diagnosis + classification badge
    Compact assumptions/notes if room
```

### 20.2 Primary visible items (desktop)

User must see without scrolling:

- selected cartridge summary (with provenance badge if applicable),
- selected tonearm summary (with provenance badge if applicable),
- tonearm effective mass input,
- cartridge mass input,
- mounting screws/fasteners input,
- compliance input (with frequency selector or label clearly stating @10 Hz),
- resonance result with classification badge,
- gauge with confidence band,
- tracking force display (visibly separated from resonance math).

### 20.3 Dataset pickers

Dataset picker controls do not dominate the page. They are support controls.

```text
Dataset pickers
[Select cartridge] Selected cartridge: Denon DL-103
[Select tonearm]   Selected tonearm: Rega RB300
```

### 20.4 Result card

Result card stays close to inputs. Result is never placed below long notes.

### 20.5 Assumptions

Assumptions are secondary and compact. Pattern:

```text
<details> Assumptions and notes </details>
```

Collapsed by default. Or rendered as a small side panel below the workbench.

### 20.6 Tracking force (binding)

Tracking force is **setup context**. It is not added to moving mass in the resonance calculation.

UI rules:

- Tracking force input is visually grouped with cartridge setup, not with the resonance math fields.
- Helper text states: `Tracking force is set during turntable setup. It does not affect the resonance calculation.`
- When a cartridge is selected from the dataset, the recommended VTF range pre-fills (display only).
- Editing tracking force does not trigger a resonance recalculation.

### 20.7 Compliance handling (binding)

- Compliance is labeled with explicit frequency: `Compliance @10 Hz, µm/mN`.
- If the dataset record provides only a 100 Hz value, the UI either:
  - prompts the user to confirm the conversion and the factor used (default 1.7×, with per-generator-type defaults from the reference model), or
  - applies the conversion automatically and displays a `converted from 100 Hz · ×1.7` provenance badge plus a widened confidence band.
- Converted values never appear without their provenance badge.

### 20.8 Generator-type awareness

When the cartridge has a known generator type (MM, MI, MC LO, MC HO, SG), the suggested compliance conversion factor and the warning thresholds adapt per the reference model. The UI surfaces this with a small generator-type pill near the cartridge name.

### 20.9 Vintage / aged-suspension flag

Cartridges with `release_year < 1985` carry a "Vintage spec — aged elastomer may differ" note in the cartridge preview and in the result panel's confidence-band tooltip.

### 20.10 Linear-tracking arms

When the selected tonearm has `arm_geometry: linear_tangential`, the result panel surfaces a hard warning: `Linear-tracking arms have very different lateral and vertical effective masses. A single-axis resonance is a strong simplification.` Optionally exposes an advanced mode for per-axis input.

---

## 21. Visual anti-patterns

The following are blockers or strong needs-patch signals.

### 21.1 Landing-page tool route

A tool route that begins with a hero pushing the actual tool below the fold is wrong.

### 21.2 Excessive scroll for primary workflow

If the user must scroll every time they change a value to see the result, the layout is wrong.

### 21.3 Arbitrary narrow max-width

A workbench constrained to article width wastes desktop space.

### 21.4 Huge input controls

Oversized inputs reduce information density and slow comparison work.

### 21.5 Inline mega lists

Thousands of dataset records inline are forbidden.

### 21.6 CSS/markup mismatch

If markup emits classes that CSS does not style (or vice versa), the patch is incomplete.

### 21.7 Internal phase copy

No internal phase identifiers, internal contributor names, or workflow terms in public UI, public CSS, public HTML, or public commit-visible files in the production bundle.

### 21.8 Unescaped dataset rendering

Any raw dataset string in `innerHTML` is a render-safety defect.

### 21.9 Hard-coded color or spacing literals

Color or spacing literals outside the token layer (§4) are defects. Use tokens.

### 21.10 Missing focus state

Any interactive control without a `:focus-visible` style is a defect.

### 21.11 "Perfect" verdict in result UI

Result UI must not use "Perfect" as a status label. The defensible label is "Ideal" (§13.5).

---

## 22. CSS architecture

### 22.1 CSS location

Shared CSS lives in `src/shared/ui/styles/`. Route-specific CSS lives alongside the route or in clearly marked sections of shared files.

### 22.2 Class naming

Route/module prefixes:

```text
ea-*         global Engrove app shell (topbar, footer, app frame)
tm-*         Tonearm module
tm-lab-*     Tonearm Lab page shell/workbench
runtime-*    shared runtime picker modal
util-*       single-purpose utility classes
```

Avoid ambiguous generic classes (`.card`, `.panel`, `.button`) unless scoped or used as a base layer documented here.

### 22.3 Class contract is binding

If markup emits `tm-lab-*`, CSS styles `tm-lab-*`. A mismatch between emitted classes and CSS selectors is a blocker.

### 22.4 Avoid fragile CSS

Avoid selectors that depend on deep DOM structure. Prefer intentional class hooks.

### 22.5 Avoid global resets that damage pages

```css
/* not allowed except in the documented base layer: */
button { ... }
input { ... }
main { ... }
```

Global resets live in a single, reviewed `base.css`.

### 22.6 CSS comments

Comments clarify purpose, not narrate workflow phases.

Allowed:
```css
/* Tonearm Match Lab workbench layout */
```

Not allowed in shipped CSS:
```css
/* Phase 17.2d fix */
```

---

## 23. Performance and rendering

### 23.1 DOM volume

Do not render thousands of controls or rows. Use caps, filters, pagination, and (in future) virtualization.

### 23.2 Runtime data loading

Runtime data loads asynchronously after page interaction binding. Loading states are clear and English.

### 23.3 Avoid unnecessary re-renders

When filtering a modal, re-render only the modal content/list. Whole-page re-renders are acceptable in current phase only when the impact is bounded; document the boundary.

### 23.4 Bundle discipline

Avoid dependencies for UI polish. Hand-written TypeScript/CSS preferred until an explicit, version-bumped revision approves a dependency.

---

## 24. Review checklist

Before a UI patch is accepted, all of the following pass.

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

Plus data-validation script:

- bash:        `node tools/validate-audio-data-v3.mjs`
- powershell:  `powershell -NoProfile -ExecutionPolicy Bypass -File ./tools/Validate-AudioDataV3.ps1`

Public UI grep (ensures no leakage of internal/Swedish strings):

```bash
# bash / linux / macOS
grep -REn "Passar|pickup med|min tonarm|Phase 17|kommer|Fas " ./src/**/*.{ts,css,html} || echo "OK"
```

```powershell
# windows
Select-String -Path .\src\**\*.ts,.\src\**\*.css,.\src\**\*.html `
  -Pattern "Passar|pickup med|min tonarm|Fas 17|kommer" -ErrorAction SilentlyContinue
```

Both forms must be present in repo tooling so the gate runs on any contributor's OS.

### 24.2 Visual gates

For tool routes, verify desktop screenshots at minimum:

- top of route (compact header visible),
- primary workbench area (inputs and result both in viewport at 1920×1080),
- result area (gauge + classification + diagnosis),
- modal open (focus visibly inside modal),
- after Apply (result updated, badge visible).

### 24.3 UX gates

Confirm:

- primary task begins in first viewport,
- controls and result are simultaneously visible at desktop breakpoint,
- no large inline dataset list,
- no unnecessary scroll for core desktop workflow,
- modal Apply/Cancel mutation rule holds,
- public UI copy is English-only,
- "Perfect" verdict is not present,
- provenance badges render where required.

### 24.4 Accessibility gates

Confirm:

- contrast meets WCAG 2.2 AA (§8.4),
- all interactive controls have `:focus-visible` styles,
- modal focus trap works (tab cycles within, Escape closes, focus returns to opener),
- icon-only buttons have `aria-label`,
- charts/gauges have textual alternatives,
- `prefers-reduced-motion` respected.

### 24.5 Browser gates

- no console errors,
- runtime public data paths load,
- route reload works,
- direct `/tonearm-calculator` route works,
- forced-colors mode does not break layout.

---

## 25. Patch delivery requirements

When a contributor delivers UI work, the patch includes:

```text
Changed files
Implementation summary
CSS/class-contract explanation
UX behavior notes
Render-safety notes (where relevant)
Modal/data behavior notes (where relevant)
Static/test output (if test gates were run)
Remaining blockers
```

For larger code/text deliveries:

- review canvas may be used for inspection,
- durable delivery uses repository commits with explicit file paths,
- avoid sandbox/preview links as the primary delivery path,
- include checksums or commit SHAs.

---

## 26. Phase guidance (current cycle)

### 26.1 Next layout direction

Normalize the Tonearm Match Lab route to the workbench specification:

- compact tool title (`--font-size-tool-title`, max 1.875rem),
- full available desktop width via §5.5,
- two-zone workbench grid per §5.7,
- inputs and result simultaneously visible on 1920×1080,
- compact dataset picker controls (§10.4),
- modal logic preserved,
- gauge + classification badges per §13,
- all gates from §24 pass.

### 26.2 What not to change in this cycle

- new dataset filters,
- new routes,
- new data-quality work beyond what §11.6 / §20.7 require,
- visual redesign of modal logic,
- package/dependency changes,
- light-theme rollout (token layer is ready; full audit is a separate cycle).

---

## 27. Summary standard

Engrove Audio Tools 3.0 UI is:

```text
premium but functional
dark by default, light theme tokenized for parity
dense but not cramped
technical but understandable
wide when useful
compact where work demands it
safe with dataset strings
WCAG 2.2 AA at minimum
English-only in public UI
honest about uncertainty (Ideal, not Perfect)
```

Guiding sentence:

> A tool route is a workbench, not a landing page.
