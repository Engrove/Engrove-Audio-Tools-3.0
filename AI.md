# AI Collaboration Guide — Engrove Audio Tools 3.0

## Prime directive

AI is wrong by default until proven otherwise.

For this repository:

- make small, reviewable changes
- prove behavior with tests or static checks
- do not claim deployment or release status without evidence
- do not import file:// prototype UI directly
- transfer validated function, not workshop clutter

## Public-site rule

The public site is for ordinary users.

Do not copy local prototype layouts directly. Prototype apps may contain dense controls, debug state, experimental flows and Jan-Eric-specific needs. Public modules must be rebuilt with standard UI/UX, clear copy, sensible defaults and mobile-aware flows.

## Module rule

Every tool should be a module with clear boundaries:

```text
modules/<tool>/
  components/
  engine/
  data/
  state/
  pages/
  tests/
  README.md
```

A module may use shared code from `src/shared`, but shared code must not depend on one specific module.

## Data rule

Keep these separate:

- raw imported source data
- normalized public data
- derived indexes
- runtime state

## UI/UX rule

Use shared design tokens and shared UI primitives. Public UI should be clear, compact, responsive, accessible and touch-friendly.

Advanced controls should be behind an explicit Advanced mode.

## Cloudflare rule

Cloudflare Pages is the default public hosting target. Cloudflare Pages Functions may be used only when they provide clear value.

## TonearmDesigner extraction rule

Prototype artifacts may be used as function sources for geometry, cartridge handling, resonance/COM logic, solver concepts and edge cases.

Do not copy dense prototype UI, debug copy, internal release wording or file:// workarounds as public UX.

## Definition of done

A change is done only when behavior is implemented, tests/checks pass, public UX is reviewed, docs are updated where needed, and no false release claims are made.
