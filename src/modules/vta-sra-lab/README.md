# VTA & SRA Lab

Compute the change in stylus rake angle (SRA) caused by adjustments to tonearm
pillar height (Δh) and platter mat thickness (Δm), and back-solve the pillar
adjustment required for a target SRA delta.

- `engine/vtaSra.ts` — pure forward and inverse kernels.
  Forward: `ΔV = Δh − Δm`, `ΔSRA = arcsin(ΔV / L) · 180/π`,
  `SRA_actual = SRA_ref + ΔSRA`. Inverse: `Δh = L · sin(target_rad)`.
- `ui/renderVtaSraLabPage.ts` — workbench markup, live SVG side profile,
  inverse-solve panel and JSON export.

Acceptance gates from `TOOL_SPECS.md` §3.11: with L = 237, Δh = 1.0, Δm = 0,
ΔSRA = 0.2418° and SRA_actual = 92.2418°. Inverse: target ΔSRA = 1.00°,
L = 237 → Δh = 4.137 mm. Reduced motion snaps SVG transforms.
