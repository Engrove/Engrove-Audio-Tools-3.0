# ADR-0003 — Engrove UI CSS Standard Seed

## Status

Accepted for bootstrap.

## Context

Engrove Audio Tools 3.0 is a clean-sheet public application. It must not copy the local `file://` prototype UI directly. The public site needs a reusable CSS foundation based on the Engrove Audio Tools 2.0 UI standard documents.

## Decision

Create a centralized CSS structure:

```text
src/shared/ui/styles/
  tokens.css
  reset.css
  layout.css
  components.css
  base.css
```

The CSS uses design tokens implemented as custom properties and supports dark theme default, light theme, comfortable density default, compact density through `.compact-theme`, and reusable public component primitives with the `ea-` prefix.

## Source principles

The seed follows the Engrove UI standard principles:

- precision
- clarity
- trust
- centralized CSS custom properties
- shared component library
- Inter for UI text
- JetBrains Mono for numeric/code data
- dark and light color token palettes
- responsive layout
- touch target awareness
- component states
- density awareness

## Consequences

All modules must import the shared stylesheet through `base.css`.

Module-specific CSS may extend layout, but must not redefine global tokens unless there is an accepted ADR.
