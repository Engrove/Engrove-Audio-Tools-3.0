
# Engrove Audio Tools 3.0

Public web platform for Engrove Audio tools.

This repository is a clean-sheet public rebuild. Local `file://` applications are workshop/prototype sources only. Their validated functions, algorithms, data contracts and useful workflows may be transferred; their prototype UI/UX must not be copied directly into the public site.

## Start page

The repository currently contains a Cloudflare-ready public start page.

## Quick start

```bash
npm install
npm run build
npm run preview
```

Build output:

```text
dist
```

## Cloudflare Pages

Recommended configuration:

```text
Production branch: main
Build command: npm run build
Build output directory: dist
Root directory: /
```

If the Cloudflare build image needs an explicit Node version, set:

```text
NODE_VERSION=20
```

## Product direction

Engrove Audio Tools 3.0 is a modular public web application for ordinary users.

Initial modules may include:

- Data Explorer
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
