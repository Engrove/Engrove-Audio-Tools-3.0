# Engrove Audio Tools 3.0

Public modular audio tools for cartridges, tonearms and vinyl setup. Static
TypeScript/Vite SPA, deployed as Cloudflare static assets.

## Shipped tools

| Route | Tool | Purpose |
|---|---|---|
| `/` | Home | Tool index |
| `/tonearm-calculator` | Tonearm Match Lab | Cantilever-arm resonance from cartridge compliance and tonearm effective mass |
| `/compliance` | Compliance Estimator | Convert published 100 Hz dynamic compliance to a 10 Hz quasi-static value |
| `/geometry-lab` | Tonearm Geometry Lab | Compute ideal IEC/DIN alignment (Baerwald / Löfgren A / Löfgren B / Stevenson) and simulate mounting errors against the math; print-ready arc protractor |
| `/vta-sra-lab` | VTA & SRA Lab | Solve stylus rake angle change from pillar and mat adjustments; inverse-solve for a target SRA delta; live SVG side profile |

Every tool computes live in the browser, exports a JSON session, and supports
light/dark theme persisted in `localStorage`.

## Source layout

```
src/
  app/                 router + home page
  modules/
    tonearm-match-lab/      engine, data loader, UI, CSS
    compliance-estimator/   engine, UI, CSS
    tonearm-geometry-lab/   engine, data loader, UI, CSS
    vta-sra-lab/            engine, UI, CSS
  shared/
    app/buildVersion.ts     unified build label
    audio-domain/           cartridge + tonearm domain types
    privacy/analytics.ts    consent-gated analytics loader
    ui/                     renderSafe escape helpers, runtime picker modal, CSS
public/data/audio/v3/runtime/
  audio-index.manifest.json
  cartridges.index.json
  tonearms.index.json
  null-points.json
```

The runtime datasets are mirrored under `src/data/audio/v3/runtime/` for parity
checks; `tools/validate-audio-data.mjs` enforces byte-for-byte parity and
verifies the public manifest's size and SHA-256 for every shipped JSON.

## Quick start

```bash
npm install
npm run dev          # vite dev server on 127.0.0.1
npm run build        # tsc --noEmit && vite build → dist/
npm run preview      # vite preview on 127.0.0.1
```

## Checks

```bash
npm run check                  # TypeScript (tsc --noEmit)
npm run check:ui-doctrine      # no marketing / hero / landing-page strings
npm run check:integrity        # release-critical file integrity
npm run check:render-safe      # XSS escaping gate, compiles UI in a temp tree
npm run check:tonearm          # resonance engine sanity
npm run check:tonearm-selectors # runtime selector and data wiring
npm run validate:data          # public dataset + manifest validation
npm run check:tokens-layout    # CSS token + layout drift (informational)

npm run check:sanitation       # all of the above except tokens-layout
```

`check:sanitation` is the release gate.

## Cloudflare Pages deployment

```text
Production branch: main
Build command: npm run build
Build output directory: dist
Root directory: /
```

`public/_headers` sets `Content-Security-Policy` (with the two analytics
origins allowlisted and no `unsafe-inline` for scripts), `X-Frame-Options:
DENY`, `frame-ancestors 'none'`, HSTS, `Permissions-Policy`, `Referrer-Policy`
and `X-Content-Type-Options`. `wrangler.toml` selects the SPA fallback for
client-side routes. Sourcemaps are not emitted in production builds.

## Analytics and consent

Cloudflare Web Analytics loads unconditionally from `<head>` because the
provider documents it as cookieless and free of fingerprinting. Microsoft
Clarity is **not** loaded by default — it is gated behind
`src/shared/privacy/analytics.ts`, which reads a stored consent value from
`localStorage` and only injects the Clarity script when the user has
explicitly granted analytics consent. The shipped product currently
deny-by-default; a future consent UI can opt the user in by calling
`writeStoredAnalyticsConsent('granted')` followed by `applyAnalyticsConsent`.

## Math acceptance gates

The two new tools have explicit numeric acceptance gates inherited from
`TOOL_SPECS.md`:

- Geometry Lab forward, IEC Baerwald, P = 222.0 mm →
  L = 239.30 mm, OH = 17.30 mm, OA = 22.99° (±0.01)
- Geometry Lab reverse, sim OA = 15° with the same P/OH →
  discriminant goes negative → invalid-geometry flag
- VTA & SRA Lab forward, L = 237 mm, Δh = 1.0 mm, Δm = 0 →
  ΔSRA = 0.2418°, SRA actual = 92.2418° (±0.0001)
- VTA & SRA Lab inverse, target ΔSRA = 1.00°, L = 237 →
  required Δh = 4.137 mm (±0.001)

## Principles

- Build for public users first; hide advanced controls unless genuinely useful.
- Keep algorithms deterministic and testable; engines have no DOM dependency.
- Share data contracts, validation and domain logic across modules.
- Render every user-supplied value through `shared/ui/renderSafe` escape helpers.
- Ship no marketing / launch / brochure surface to the public site.
- Keep Cloudflare Pages deployment simple and reproducible.

## License

Unlicense — see `LICENSE`.
