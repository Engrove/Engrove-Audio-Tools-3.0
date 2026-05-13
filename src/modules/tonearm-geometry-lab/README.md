# Tonearm Geometry Lab

Compute ideal alignment geometry for a chosen standard (IEC / DIN) and method
(Baerwald, Loefgren A, Loefgren B, Stevenson) and simulate mounting errors
against the math.

- `engine/geometry.ts` — pure forward and reverse kernels plus the tracking-error
  curve generator. Forward: `L = sqrt(P^2 + N1*N2)`,
  `OH = L - P`, `OA = arcsin((N1 + N2) / (2L))`. Reverse: solves
  `T1 +/- sqrt(T1^2 - T2)` with `T1 = L*sin(OA)` and `T2 = L^2 - P^2`.
- `data/loadNullPoints.ts` — fetches `/data/audio/v3/runtime/null-points.json`.
- `ui/renderTonearmGeometryLabPage.ts` — workbench markup, two canvas
  visualizations (tracking-error chart, B&W arc protractor) and JSON export.

Acceptance gates from `TOOL_SPECS.md` §2.13: forward math at IEC Baerwald with
P = 222.0 mm yields L = 239.30 mm, OH = 17.30 mm, OA = 22.99 degrees;
sim-equal-to-reference yields N1, N2 within 0.05 mm of the table; setting OA
below the discriminant root flags row-error.
