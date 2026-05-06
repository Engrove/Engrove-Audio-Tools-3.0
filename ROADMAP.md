# Roadmap — Engrove Audio Tools 3.0

## Mission

Build a public, modular, Cloudflare-hosted suite of Engrove Audio tools.

## Non-negotiable direction

Local `file://` applications are not transferred directly.

They are used as sources for validated calculations, workflows, data contracts, domain insight and edge cases.

They are not sources for public UI/UX.

## Phase 16.0 — Bootstrap

Goal: create the clean foundation.

Deliverables:

- `README.md`
- `AI.md`
- `ROADMAP.md`
- modular skeleton folder structure
- initial Cloudflare/Vite-ready configuration
- public productization rules

## Phase 16.1 — Architecture decision

Decide frontend framework, routing model, component/design system approach, data loading model, test strategy, Cloudflare Pages setup and whether Pages Functions are used.

## Phase 16.2 — Public application shell

Build navigation, responsive layout, design tokens, module cards, public help/about pages and route placeholders.

## Phase 16.3 — Shared data foundation

Create reusable data contracts for cartridges, tonearms, materials, geometry presets and compliance/resonance helpers.

## Phase 16.4 — Data Explorer 3.0

Rebuild Data Explorer for public use with simple search, filters, comparison, export where useful and clear missing-data handling.

## Phase 16.5 — Calculator modules

Rebuild Alignment Calculator, Resonance Calculator and Compliance Estimator as standard public modules.

## Phase 17.0 — TonearmDesigner Public

Productize TonearmDesigner from validated prototype functionality.

Transfer geometry/calculation engine, cartridge integration, resonance/COM/mass logic, selected solver concepts and validated edge cases.

Do not ship prototype solver sandbox as public default, file:// workaround UI, dense debug panels or internal release wording.

## Launch readiness gate

A module is launch-worthy only when it builds on Cloudflare Pages, works in modern browsers, has a mobile-usable layout, has no app-caused blocking console errors, has public help/copy, passes tests/checks, documents caveats and makes no unverified release claims.
