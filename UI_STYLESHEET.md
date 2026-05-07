# UI_STYLESHEET.md

Status: Draft standard  
Scope: Engrove Audio Tools 3.0 public web app  
Primary audience: EIC, Hjalmar, Jan-Eric, future contributors  
Last updated: 2026-05-07  
Applies to: public UI, route layouts, calculation tools, dataset pickers, modal workflows, CSS architecture

---

## 1. Purpose

This document defines the visual, interaction and UX standard for Engrove Audio Tools 3.0.

Engrove Audio Tools 3.0 is not a generic marketing site and not a decorative demo. It is a public, modular, data-backed audio engineering toolset. Its interface must combine a premium Engrove visual identity with the density and stability expected from a professional workbench application.

The goal is:

- fast user work,
- low visual noise,
- high information density where useful,
- clear calculation feedback,
- safe rendering of dataset strings,
- predictable layout on desktop and mobile,
- professional audio-domain credibility.

This file is a product design contract. When code and this document conflict, patch the code or revise this document explicitly. Do not silently drift.

---

## 2. Non-negotiable UI rules

### 2.1 Public UI language

All public user-facing UI copy must be English.

Do not ship:

- Swedish headings,
- Swedish labels,
- Swedish buttons,
- Swedish helper text,
- Swedish error text,
- Swedish empty states,
- Swedish result text,
- internal phase labels such as `Fas 17.x`,
- EIC/Hjalmar/internal workflow terms.

Swedish is allowed in EIC chat and internal planning, not in shipped public UI.

### 2.2 Application type

Engrove Audio Tools 3.0 routes that perform calculations or dataset work must use an **industrial workbench layout**, not a landing-page layout.

A landing-page layout is acceptable for the public home page. It is not acceptable for calculator/tool routes.

Tool routes must prioritize:

- immediate task access,
- visible cause/effect feedback,
- compact control groups,
- useful use of available width,
- minimal scrolling during primary workflows,
- stable result visibility.

### 2.3 No large inline dataset lists

Large cartridge, tonearm or other audio datasets must never be rendered as long inline lists inside a calculator page.

Use a modal, drawer, panel, virtualized list or other bounded picker pattern. The normal calculator flow must stay compact.

### 2.4 Route contracts

Do not break established route contracts without an explicit phase decision.

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

No raw dataset string may be interpolated into `innerHTML`.

### 2.6 No framework drift

The current app is a Vite + TypeScript SPA with hand-written CSS. It is not React.

Do not introduce React, component libraries, styling frameworks or new dependencies unless explicitly approved.

---

## 3. Design model

### 3.1 The intended feel

Engrove Audio Tools should feel like:

- a premium audio measurement/control surface,
- a studio-grade configuration tool,
- a technical calculator with editorial clarity,
- a modern industrial web application.

It should not feel like:

- a blog page,
- a SaaS marketing landing page,
- a generic admin dashboard,
- a raw HTML form,
- a toy demo,
- a mobile-first consumer wizard on desktop.

### 3.2 Core design tension

The interface must balance two goals:

1. **Look**: premium, dark, calm, branded, audio-oriented.
2. **Work**: compact, direct, fast, stable, data-heavy when needed.

When these conflict on tool routes, usability wins. Visual style should support the work, not push it down the page.

---

## 4. Layout doctrine

### 4.1 Home page vs tool routes

The home page may use:

- hero presentation,
- larger typography,
- marketing sections,
- brand-forward imagery,
- looser spacing.

Tool routes must use:

- compact tool headers,
- persistent workspace layout,
- clear panels,
- visible result feedback,
- dense but readable forms,
- minimal scroll for primary work.

### 4.2 Tool route vertical structure

A desktop tool route should generally follow this structure:

```text
Topbar:          56-72 px
Tool header:     72-140 px
Workbench:       fills main viewport
Secondary notes: below or collapsible
```

The primary working area should begin quickly. Avoid large vertical gaps before the first actionable control.

### 4.3 Avoid oversized heroes in tools

Do not use a large landing-page hero on tool routes.

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
Compact tool title + one sentence
Workbench: inputs + result visible
```

### 4.4 Desktop viewport target

On a common desktop viewport such as 1920×1080, the user should be able to see at least:

- compact route header,
- dataset picker controls,
- all primary numeric inputs,
- quick result / diagnosis,
- enough context to understand the setup.

The default desktop workflow should not require scrolling after every value change.

### 4.5 Use available width

Do not constrain the entire tool route to a narrow content-reading width.

Text content benefits from narrow measures. Workbench tools do not.

For tool routes, prefer:

```css
inline-size: min(100% - 2rem, 1760px);
```

or similar.

The page may have a maximum width, but it should be a **functional max**, not a blog/content max. The workbench should use available width to keep inputs and results visible at the same time.

### 4.6 Control width is not panel width

Using full page width does not mean inputs become huge.

Use panel/grid rules to control field widths:

```css
grid-template-columns: repeat(auto-fit, minmax(220px, 320px));
```

or:

```css
.tm-field input {
  max-inline-size: 22rem;
}
```

Panel width should use the viewport. Individual controls should remain ergonomic.

### 4.7 Workbench grid

Desktop tool routes should usually use a two-zone workbench:

```text
┌────────────────────────────────────────────┬─────────────────────────────┐
│ Input, picker and setup controls           │ Result, diagnosis, summary  │
│ 2-3 compact columns where useful           │ sticky or always visible    │
└────────────────────────────────────────────┴─────────────────────────────┘
```

Recommended CSS direction:

```css
.tool-workbench {
  display: grid;
  grid-template-columns: minmax(620px, 1.25fr) minmax(420px, 0.75fr);
  gap: 1rem;
}
```

On narrower screens, collapse to one column.

### 4.8 Result visibility

Calculation result must be near the inputs.

For interactive calculators:

- result should update immediately,
- result should stay visible while editing on desktop,
- result should not be pushed below long setup text,
- result should not require scrolling after normal input changes.

A sticky result panel is acceptable when it does not create overlap or scrolling traps.

### 4.9 Secondary content

Assumptions, notes, explanations and future release text are secondary. They must not dominate the primary calculation route.

Prefer:

- compact notes panel,
- collapsible details,
- below-workbench section,
- short bullet list,
- secondary visual priority.

Do not place long explanatory sections between inputs and results.

---

## 5. Density standard

### 5.1 Density goal

Engrove tool routes should be **dense enough for work** and **spacious enough for readability**.

Avoid both extremes:

- not raw cramped admin UI,
- not oversized marketing UI.

### 5.2 Spacing tokens

Use a consistent compact scale:

```css
--space-1: 0.25rem;
--space-2: 0.5rem;
--space-3: 0.75rem;
--space-4: 1rem;
--space-5: 1.25rem;
--space-6: 1.5rem;
--space-8: 2rem;
```

Primary tool route gaps should often be `0.75rem` to `1.25rem`, not `3rem` to `6rem`.

### 5.3 Control heights

Recommended desktop control heights:

- text/number input: 2.35rem to 2.75rem,
- compact button: 2.25rem to 2.75rem,
- modal primary button: 2.5rem to 3rem,
- icon button: 2.25rem to 2.75rem.

Avoid oversized controls unless the page is touch-first or mobile.

### 5.4 Panel padding

Recommended desktop panel padding:

- compact panel: `1rem`,
- normal panel: `1.25rem`,
- large editorial panel: `1.5rem`.

Avoid `2rem+` padding inside every nested tool panel unless there is a clear reason.

### 5.5 Field rhythm

A numeric field should generally include:

```text
Label
Input
Short helper
```

But each field must not become a large vertical card. Use tight rhythm:

```css
.field {
  display: grid;
  gap: 0.35rem;
}
```

---

## 6. Typography

### 6.1 Tone

Typography should be:

- confident,
- technical,
- clear,
- premium,
- not playful,
- not overly condensed for body text.

### 6.2 Tool route type scale

Recommended desktop scale:

```css
Tool title:        clamp(2.25rem, 5vw, 4.5rem)
Section heading:   1.35rem to 2rem
Panel heading:     1rem to 1.35rem
Label:             0.9rem to 1rem
Body:              0.95rem to 1.05rem
Helper text:       0.8rem to 0.9rem
Microcopy:         0.75rem to 0.85rem
```

For workbench routes, do not let the hero title consume the screen. Huge titles belong on home/marketing pages, not inside the working area.

### 6.3 Text measure

Long paragraphs should have a readable max width.

Controls and workbench panels do not need the same max width.

Use separate constraints:

```css
.tool-header p {
  max-inline-size: 64ch;
}
```

Do not constrain the entire workbench just to make a paragraph readable.

### 6.4 Labels

Labels should be direct and unit-aware.

Good:

```text
Tonearm effective mass, g
Cartridge mass, g
Compliance @10 Hz, cu
Fasteners/screws mass, g
Tracking force, g
```

Avoid labels that require reading helper text to know the unit.

### 6.5 Helper text

Helper text should be concise and functional.

Good:

```text
Arm effective mass as specified by the manufacturer.
```

Avoid long explanations under every field. Put deeper explanation in assumptions/notes.

---

## 7. Color and theme

### 7.1 Base theme

The primary Engrove theme is dark.

Recommended visual character:

- near-black background,
- subtle radial/linear gradients,
- low-contrast panel borders,
- high-contrast text,
- restrained accent colors.

### 7.2 Accent hierarchy

Use accents sparingly.

Possible hierarchy:

- teal/cyan: actionable/selected/active,
- amber/yellow: tool category/kicker/status attention,
- green: good/pass/safe,
- red/orange: error/warning.

Do not overuse multiple accent colors in the same panel.

### 7.3 Status colors

Calculation status must be obvious but not loud.

Examples:

- Good match: green/teal pill or border,
- Low resonance: amber warning,
- High resonance: amber/red warning,
- Input error: red/orange.

### 7.4 Contrast

Text must remain readable on dark backgrounds.

Avoid:

- low opacity body text,
- pale gray on slightly lighter gray,
- accent text used as body text,
- long paragraphs in muted color.

Muted text should still be legible.

---

## 8. Surfaces, borders and depth

### 8.1 Panels

Panels should feel like technical surfaces, not floating marketing cards.

Recommended:

```css
background: rgb(255 255 255 / 0.035);
border: 1px solid rgb(255 255 255 / 0.12);
border-radius: 1rem;
```

Use stronger borders for active/selected states.

### 8.2 Shadow

Use subtle shadows for depth, not heavy card shadows everywhere.

Good:

```css
box-shadow: 0 16px 40px rgb(0 0 0 / 0.28);
```

Avoid stacking multiple large shadows in dense work areas.

### 8.3 Nested panels

Nested panels must be visually clear but not bulky.

For example, dataset picker controls inside a form panel should have lower visual weight than the main panel.

---

## 9. Buttons and actions

### 9.1 Button hierarchy

Define clear action hierarchy:

- primary: Apply / selected dataset action,
- secondary: Cancel / close / neutral action,
- tertiary: link-like navigation or minor action.

### 9.2 Button sizing

Tool buttons should be compact but easy to hit:

```css
min-block-size: 2.35rem;
padding-inline: 0.85rem;
```

Do not make all buttons huge pill buttons unless they are primary route actions.

### 9.3 Dataset picker buttons

On calculator pages, dataset picker launch buttons should be compact and near the fields they affect.

Good:

```text
[Select cartridge from dataset]  Selected cartridge: Denon DL-103
[Select tonearm from dataset]    Selected tonearm: Rega RB300
```

Bad:

```text
Large full-width card with a large button and large text blocks that pushes inputs below the fold.
```

### 9.4 Disabled state

Disabled actions must be visually clear and explainable.

For runtime data:

```text
Loading public runtime data…
```

Then enable buttons when data is ready.

---

## 10. Forms and inputs

### 10.1 Inputs in calculators

Numeric input is core workflow. Treat it as primary UI, not secondary content.

Inputs should:

- be visible without excessive scrolling,
- use consistent width,
- show unit in label,
- have short helper text,
- update results immediately.

### 10.2 Decimal handling

The app should tolerate normal numeric entry patterns where possible. Locale-specific decimal comma may appear in user input on Windows/European keyboards. If supported in code, document it in tests. If not supported yet, do not imply it is supported.

### 10.3 Input layout

Desktop preferred:

```text
2 columns or 3 compact columns
```

Do not put five fields in a single long vertical stack on desktop unless the viewport is narrow.

### 10.4 Helper text priority

Use helper text only where it reduces error.

Examples:

- compliance conversion,
- tracking force not included in moving mass,
- fastener mass estimated.

Avoid repeating obvious labels.

### 10.5 Errors

Error messages must be:

- near the affected control or result panel,
- English,
- specific,
- actionable.

Bad:

```text
Invalid.
```

Good:

```text
Compliance @10 Hz must be a positive number.
```

---

## 11. Data-heavy picker standard

### 11.1 When to use a modal picker

Use a modal picker when:

- dataset is large,
- user must search/filter before selecting,
- selection should not mutate the calculator until confirmed,
- user benefits from previewing values.

Cartridge and tonearm selection must use modal picker behavior, not inline mega lists.

### 11.2 Modal structure

The runtime picker modal should use this structure:

```text
Header:
  Title
  Close button

Body:
  Filter panel
  Results list
  Selected preview

Footer:
  Cancel
  Apply
```

### 11.3 Modal behavior

Required behavior:

- Open from compact control on page.
- Search/filter inside modal.
- Result list is capped.
- Row click changes draft selection only.
- Preview updates from draft selection.
- Apply mutates calculator fields.
- Cancel does not mutate.
- X close does not mutate.
- Escape does not mutate.
- Backdrop click does not mutate.
- Apply dispatches input/change event so result recalculates.

### 11.4 Result cap

Do not render thousands of rows.

Default cap:

```text
100 visible results
```

Future versions may add pagination, virtualization or sorting. For now, cap and filter.

### 11.5 Filtering

Minimum cartridge filters:

- search text,
- type contains,
- mass min/max,
- compliance min/max.

Minimum tonearm filters:

- search text,
- effective mass min/max.

Filtering should be predictable, simple and fast.

### 11.6 Preview

Preview should show selected item and values that will be applied.

For cartridge:

- name,
- type,
- mass,
- compliance @10 Hz.

For tonearm:

- name,
- effective mass.

Preview must explain that Apply copies values and Cancel/close does not.

### 11.7 Modal density

The modal may be denser than the main page because it is a focused data-selection workspace.

Do not make modal list rows excessively tall. A user should see enough options to compare.

### 11.8 Modal accessibility

Minimum requirements:

- role `dialog`,
- `aria-modal="true"`,
- visible title,
- close button with accessible label,
- Escape closes,
- keyboard focus enters modal reasonably.

Future improvement: focus trap.

---

## 12. Result and diagnosis standard

### 12.1 Result priority

The result is the feedback loop. It must be visually prominent and near the inputs.

For Tonearm Match Lab, show:

- resonance frequency,
- qualitative diagnosis,
- target zone,
- key explanation,
- suggestions.

### 12.2 Numerical formatting

Use consistent units:

```text
8.2 Hz
19.3 g
12 cu @10 Hz
```

Do not overload result panels with raw implementation fields.

### 12.3 Diagnosis language

Diagnosis copy should be calm and practical.

Good:

```text
Good match
Resonance is inside the common 8–12 Hz target zone.
```

Avoid exaggerated claims:

```text
Perfect match!
Guaranteed safe!
```

### 12.4 Suggestions

Suggestions should be short and operational:

- confirm recommended tracking force,
- use measured resonance checks if critical,
- recheck compliance conversion if outside target.

---

## 13. Responsive behavior

### 13.1 Breakpoints

Recommended functional breakpoints:

```css
wide desktop:       >= 1440px
desktop:            1024px - 1439px
tablet/narrow:      720px - 1023px
mobile:             < 720px
```

### 13.2 Desktop

Desktop should use multi-column workbench layout.

Primary inputs and result should be simultaneously visible.

### 13.3 Tablet/narrow

Collapse from two-zone workbench to stacked panels. Result should appear directly after inputs, not after long notes.

### 13.4 Mobile

Mobile may scroll. Use:

- single column,
- compact topbar,
- compact header,
- controls full width,
- modal nearly full-screen.

### 13.5 Avoid horizontal overflow

No route should create accidental horizontal scrolling.

Use:

```css
min-width: 0;
box-sizing: border-box;
overflow-wrap: anywhere;
```

where needed.

---

## 14. Navigation and topbar

### 14.1 Topbar purpose

Topbar provides:

- product identity,
- primary route navigation,
- theme toggle.

It should not consume excessive vertical space.

### 14.2 Wordmark

The Engrove mark should display correctly.

If image fails, layout should not collapse into raw broken appearance. Use dimensions and alt rules.

### 14.3 Navigation density

Primary nav items should be visible on desktop without large spacing.

Do not create a topbar that feels like a marketing header on tool routes.

---

## 15. CSS architecture

### 15.1 CSS location

Current shared CSS lives in:

```text
src/shared/ui/styles/
```

When appending route-specific CSS to shared files, clearly mark sections.

Example:

```css
/* Tonearm Match Lab workbench layout */
```

### 15.2 Class naming

Prefer route/module prefixes:

```text
ea-*         global Engrove app shell
tm-*         Tonearm module
tm-lab-*     Tonearm Lab page shell/workbench
runtime-*    shared runtime picker modal
```

Avoid ambiguous generic classes such as:

```text
.card
.panel
.button
.title
```

unless scoped.

### 15.3 Do not silently change class contracts

If markup emits `tm-lab-*`, CSS must style `tm-lab-*`.

If CSS expects `tm-*`, markup must emit `tm-*`.

A mismatch between emitted classes and CSS selectors is a blocker.

### 15.4 Avoid fragile CSS

Avoid selectors that depend on deep DOM structure unless necessary.

Prefer intentional class hooks.

### 15.5 Avoid global resets that damage pages

Do not add broad rules like:

```css
button { ... }
input { ... }
main { ... }
```

unless they are part of a reviewed base layer.

Prefer scoped selectors.

### 15.6 CSS comments

Comments should clarify purpose, not narrate phases.

Allowed:

```css
/* Tonearm Match Lab workbench layout */
```

Not allowed in public shipped CSS:

```css
/* Fas 17.2d fix */
```

Internal phase identifiers must not ship in public CSS/HTML.

---

## 16. Performance and rendering

### 16.1 DOM volume

Do not render thousands of controls or rows.

Use:

- caps,
- filters,
- pagination,
- virtualization in future.

### 16.2 Runtime data loading

Runtime data should load asynchronously after page interaction binding.

Loading states must be clear and English.

### 16.3 Avoid re-rendering large pages unnecessarily

When filtering a modal, re-render only the modal content/list as practical.

For current small phase implementation, simple re-rendering is acceptable if capped and responsive.

### 16.4 Bundle discipline

Avoid dependencies for UI polish. Hand-written TypeScript/CSS is preferred until an explicit architecture decision changes this.

---

## 17. Accessibility

### 17.1 Minimum baseline

All interactive UI must have:

- visible focus state,
- keyboard-accessible controls,
- semantic buttons for actions,
- labels for inputs,
- readable contrast,
- accessible names for icon-only buttons.

### 17.2 Focus

Modal open should move focus into the modal.

Close should not strand keyboard users.

Future improvement: focus restoration and focus trap.

### 17.3 Target sizes

Controls should be easy to click:

- desktop: at least ~32 px high for dense controls,
- touch/mobile: closer to 44 px.

### 17.4 Reduced motion

Avoid required motion. If animations are added, respect reduced-motion preferences.

---

## 18. Public copy standard

### 18.1 Voice

Voice should be:

- clear,
- technical,
- calm,
- concise,
- trustworthy.

### 18.2 Avoid hype

Do not use:

- magic,
- perfect,
- guaranteed,
- revolutionary,
- AI-like exaggeration.

### 18.3 Preferred wording

Use:

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
```

### 18.4 Error wording

Errors should explain what failed and what the user can do.

Example:

```text
Runtime picker data could not be loaded. Check the public data route and try again.
```

### 18.5 Empty states

Empty states should be useful.

Example:

```text
No matching dataset items found.
```

Do not use vague empty states such as:

```text
Nothing here.
```

---

## 19. Tonearm Match Lab specific standard

### 19.1 Intended desktop layout

Tonearm Match Lab should use a compact workbench:

```text
Topbar
Compact tool header
Workbench:
  Left/main:
    Dataset picker controls
    Numeric setup fields
  Right:
    Quick Match result
    Diagnosis
    compact assumptions/notes if room
```

### 19.2 Primary visible items

On desktop, the user should usually see:

- selected cartridge summary,
- selected tonearm summary,
- tonearm effective mass input,
- cartridge mass input,
- fastener mass input,
- tracking force input,
- compliance input,
- resonance result.

### 19.3 Dataset pickers

Dataset picker controls should not dominate the page. They are support controls.

Good:

```text
Dataset pickers
[Select cartridge] Selected cartridge: Denon DL-103
[Select tonearm]   Selected tonearm: Rega RB300
```

### 19.4 Result card

Result card must remain close to inputs.

Do not place result below long notes.

### 19.5 Assumptions

Assumptions should be secondary and compact.

Possible pattern:

```text
Assumptions and notes
[collapsed by default] or small side panel
```

### 19.6 Tracking force

Tracking force is setup context and must not be added to moving mass in the current model.

UI copy must not imply it is part of moving mass.

### 19.7 Compliance

Compliance should be clearly labeled as @10 Hz.

If future conversion support is added, it must be explicit.

---

## 20. Visual anti-patterns

The following are blockers or strong needs-patch signals.

### 20.1 Landing-page tool route

A tool route that begins with a huge hero and pushes the actual tool below the fold is wrong.

### 20.2 Excessive scroll for primary workflow

If the user must scroll every time they change a value and check a result, the layout is wrong.

### 20.3 Arbitrary narrow max-width

A workbench constrained like an article page wastes desktop space.

### 20.4 Huge input controls

Oversized inputs reduce information density and slow comparison work.

### 20.5 Inline mega lists

Thousands of dataset records inline are forbidden.

### 20.6 CSS/markup mismatch

If markup emits classes that CSS does not style, the patch is not complete.

### 20.7 Internal phase copy

No `Fas`, `phase`, EIC/Hjalmar/internal workflow wording in public UI.

### 20.8 Unescaped dataset rendering

Any raw dataset string in `innerHTML` is a render-safety defect.

---

## 21. Review checklist

Before a UI patch is accepted, check:

### 21.1 Source gates

Run:

```powershell
npm run check
npm run check:tonearm
npm run validate:data
npm run check:integrity
npm run check:render-safe
npm run check:tonearm-selectors
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Validate-AudioDataV3.ps1
```

Run public UI grep:

```powershell
Select-String -Path .\src\**\*.ts,.\src\**\*.css,.\src\**\*.html -Pattern "Passar|pickup med|min tonarm|Fas 17|kommer" -ErrorAction SilentlyContinue
```

### 21.2 Visual gates

For tool routes, verify desktop screenshots at minimum:

- top of route,
- primary workbench area,
- result area,
- modal open,
- after Apply.

### 21.3 UX gates

Confirm:

- primary task begins quickly,
- controls and result are close,
- no large inline dataset list,
- no unnecessary scroll for core desktop workflow,
- modal Apply/Cancel mutation rule holds,
- public UI copy is English only.

### 21.4 Browser gates

Confirm:

- no console errors,
- runtime public data paths load,
- route reload works,
- direct `/tonearm-calculator` route works.

---

## 22. Hjalmar delivery requirements for UI patches

When Hjalmar delivers UI work, require:

```text
Changed files
Implementation summary
CSS/class-contract explanation
UX behavior notes
Render-safety notes where relevant
Modal/data behavior notes where relevant
Static/test output if actually run
Remaining blockers
```

For larger code/text delivery:

- Canvas may be used for review,
- durable delivery should use EIC code revision `source_file` artifacts,
- avoid sandbox links as the primary delivery path,
- include checksums and exact file paths.

---

## 23. Phase guidance

### 23.1 Next layout direction

The next Tonearm page layout patch should normalize the route to an industrial workbench.

Expected changes:

- reduce hero height,
- use full available desktop width,
- keep controls and result visible together,
- reduce vertical gaps,
- use compact dataset picker controls,
- keep modal logic intact,
- preserve all gates.

### 23.2 What not to do next

Do not add new features until layout usability is corrected.

Avoid:

- new dataset filters,
- new routes,
- new data quality work,
- visual redesign of modal logic,
- package/dependency changes.

---

## 24. Summary standard

Engrove Audio Tools 3.0 UI should be:

```text
premium but functional
dark but readable
dense but not cramped
technical but understandable
wide when useful
compact where work demands it
safe with dataset strings
English-only in public UI
```

The guiding sentence:

> A tool route is a workbench, not a landing page.
