# Engrove Audio Tools 3.0

Public web platform for Engrove Audio tools.

This is a clean-sheet rebuild. Local `file://` applications are workshop/prototype sources only. Their validated functions, algorithms, data contracts and useful workflows may be transferred; their prototype UI/UX must not be copied directly into the public site.

## Direction

Engrove Audio Tools 3.0 is a modular public web application for ordinary users.

Initial modules may include:

- Data Explorer
- Alignment Calculator
- Resonance Calculator
- Compliance Estimator
- Tonearm Designer, productized from validated prototype functionality

## Principles

- Build for public users first.
- Use standard, consistent UI/UX.
- Keep mobile and tablet flows simple.
- Hide advanced controls unless genuinely useful.
- Share data, validation and domain logic across modules.
- Keep algorithms deterministic and testable.
- Keep Cloudflare Pages deployment simple.
- Do not ship debug/workshop UI to the public site.

## Repository layout

```text
src/
  app/                 App shell, routing and layout
  modules/             Public tools, one module per tool
  shared/              Shared UI, data, math, validation and domain code
  data/                Curated public datasets and adapters
  workers/             Optional Cloudflare Pages Functions
docs/                  Architecture, decisions and release process
tests/                 Cross-module tests and release gates
```

## Current status

Bootstrap only.
