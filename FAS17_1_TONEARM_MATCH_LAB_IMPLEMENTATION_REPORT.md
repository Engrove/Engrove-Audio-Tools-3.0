# Fas 17.1 — Tonearm Match Lab Foundation

## Scope
This package implements a public-first Tonearm Match Lab foundation for `/tonearm-calculator`.

## GitHub web baseline
Verified through GitHub web/raw reads from `main`:
- latest commit shown by GitHub: `ea2501788abe2d13794bdfb2073cd37379cf4685`
- `package.json`: Vite + TypeScript, scripts `dev`, `build`, `preview`, `check`, no runtime dependencies
- `src/main.ts`: imports shared base CSS and renders home directly
- `src/app/home/renderHomePage.ts`: Resonance Calculator was still a planned card before this overlay
- shared styling uses `base.css` importing `tokens.css`, `reset.css`, `layout.css`, `components.css`, `home.css`
- audio-domain exports cartridge/tonearm contracts through `src/shared/audio-domain/index.ts`

## Implemented
- Minimal dependency-free client router for `/`, `/tonearm-calculator`, and `#/tonearm-calculator`.
- Router leaves same-page anchors such as `#quick-match`, `#assumptions`, and `#tools` to the browser instead of re-rendering.
- Pure TypeScript resonance engine with input validation.
- Resonance diagnosis object model.
- Manual Quick Match UI with live recalculation.
- Assumptions/confidence panel.
- Module-scoped responsive CSS using existing `ea-*` tokens.
- Home card update for Resonance Calculator.
- Deterministic engine check script.

## Test status in GPT runtime
- `npm run check`: PASS in generated local harness.
- `npm run check:tonearm`: PASS in generated local harness.
- `npm run build`: not fully verified in GPT runtime because Vite package is not installed here; local repo should run it after `npm install`.
- `Validate-AudioDataV3`: not run in GPT runtime because full repo data files are not mounted here.

## Known note
The requested formula includes tracking force in total moving mass:
`159 / sqrt((12 + 6.5 + 1 + 1.8) * 18) = 8.1 Hz`.
The prompt also says the same default should be approximately 8.4 Hz. That 8.4 value is only consistent if tracking force is excluded from the mass term. This implementation follows the explicit formula and therefore tests approximately 8.1 Hz with a `good` diagnosis.
