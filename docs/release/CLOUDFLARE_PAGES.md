
# Cloudflare Pages Deploy Check

## Target

Repository:

```text
Engrove/Engrove-Audio-Tools-3.0
```

Cloudflare Pages build settings:

```text
Production branch: main
Build command: npm run build
Build output directory: dist
Root directory: /
```

Optional environment variable if the build image needs explicit Node version:

```text
NODE_VERSION=20
```

## First-chain check

1. Push this start page to `main`.
2. Confirm GitHub commit appears.
3. Confirm Cloudflare Pages starts a production deployment.
4. Confirm build command runs.
5. Confirm `dist` is deployed.
6. Open the Pages URL.
7. Confirm the home page shows:
   - Engrove Audio Tools 3.0
   - Cloudflare chain / Ready for first sync
   - module cards
8. Confirm browser console has no app-caused blocking errors.

## Success criteria

The chain is working when:

```text
local files → GitHub main → Cloudflare Pages build → public URL
```

is proven once with the start page.

## S4A / S4A.1 deploy sanity (Measurement Lab)

After Cloudflare deploy, verify at `https://test-record-coverage.pages.dev/measurement-lab`:

### Mobile notice (S4A.1)

1. Desktop viewport (≥ 768 px): no mobile notice appears.
2. Mobile/small viewport (< 768 px): notice appears automatically.
3. Notice can be dismissed with "Got it" button.
4. Notice can be dismissed with Escape key.
5. Notice does not reappear after dismissal within the same session.
6. Notice text mentions **PC/desktop**.
7. Notice text mentions **Measurement Lab** and **audio interface / line-in / phono**.

### Reference Level Calibration (S4A)

8. Reference Level Calibration panel is present on the Measurement Lab page.
9. Self-test results are labelled **Self-test / Simulated** (badge visible).
10. Live capture results are labelled **Live capture** (badge visible).
11. No fake analyzer states: Planned workflows (VTA / IMD optimizer) remain Planned.

### Test-record dropdown cleanliness (S3–S4)

12. Test-record dropdown shows no "Recommended for Toolbox 3.0" text.
13. Test-record dropdown shows no star or preferred/recommended labels.

### General

14. Measurement Lab page loads without console errors.
15. Coverage badges and panel navigation function correctly.
16. "02 Measurement coverage" panel remains collapsible.

## S4G MVP measurement flows

### Speed & Wow / Flutter (S4F / S4G)

17. Speed/W&F panel shows a source badge (**Live capture** or **Self-test / Simulated**) in the result view.
18. Speed/W&F result view shows the selected band label and frequency.
19. Speed/W&F result view includes the chain-honesty paragraph ("These readings measure playback/capture speed stability and are affected by the test record, turntable and capture chain.").
20. When no test record is selected the Speed/W&F panel shows "Select a test record with a speed / wow & flutter band".
21. When the selected test record has no speed bands the panel shows the unavailability message, not the capture UI.

### THD / IMD (S4E / S4G)

22. THD panel idle state shows band selector and availability status before prompting to connect a source.
23. THD / IMD result view shows source badge and band label.
24. When no test record is selected the THD panel shows a no-record message, not the connect-source prompt.

### Frequency response (S4D / S4G)

25. Frequency response result view shows source badge and sweep band.

### Channel identity (S4G)

26. JSON export and text report for channel identity include **left_band** and **right_band** metadata.

### Export consistency

27. Downloaded JSON includes `source` and `band` for every completed MVP measurement (speed, channel, freq, thd/imd).
28. Downloaded text report includes `Source:` and `Band:` lines for speed and THD/IMD sections.
29. Reference Level Calibration panel present and functional; no fake analyzer states for Planned workflows.

## S5 Advanced analyzers (S5A / S5A.1)

After Cloudflare deploy, verify at `https://test-record-coverage.pages.dev/measurement-lab`:

30. Advanced analyzers panel (panel 09) is visible below Reference Level Calibration.
31. VTA / IMD Optimizer displays as **Skeleton** / **Planned** — not as a runnable tool.
32. With **Ultimate Analogue Test LP** selected, the VTA section shows all four band metadata fields:
    - f1: **60 Hz**
    - f2: **4,000 Hz**
    - Ratio: **4:1**
    - Standard: **IEC_IMD**
33. No VTA start button, capture button, or `data-mlab-vta-start` / `data-mlab-vta-capture` attribute is present.
34. No fake VTA result value, final recommendation, or optimal-setting claim is displayed.
35. The following five analyzers appear as **Planned** (no Start button):
    - Anti-skate / Tracking stress
    - Rumble & noise isolation
    - Pink noise / Spectral balance
    - Vertical null / Azimuth
    - Vertical resonance
36. Coverage panel badge for VTA / IMD Optimizer links to the Advanced analyzers panel (not the THD panel).
37. VTA / IMD Optimizer coverage badge remains **Planned**, not **Available**.
38. All S4 MVP measurement flows (speed, channel, freq, THD/IMD, ref level) remain functional.

## S5F Supported readiness gate (S5F)

39. The **Supported readiness gate** section is visible in the VTA panel when a VTA band is available.
40. Gate status can show: **Not ready** / **Candidate ready** / **Ready for supported review**.
41. Gate displays pass/fail for each criterion with detail text.
42. Gate status `Ready for supported review` does not change the VTA workflow status — it remains **Planned**.
43. JSON export contains a `supported_gate` key with `status`, `passed_count`, `total_count`, `criteria`, `warnings`.
44. Export `vta_imd_optimizer.status` is still `"planned"`.
45. No `best_setting`, `bestSetting`, `recommended_height`, or `optimal_height` fields in export.

## S5G VTA workflow status policy (S5G)

46. **Workflow status policy** section is visible in the VTA panel below the Supported readiness gate.
47. Policy shows **Planned / experimental** when gate is not `ready_for_supported_review`.
48. Policy shows **Ready for review — not yet supported** when gate is `ready_for_supported_review`.
49. Policy section displays the reason text explaining why VTA remains Planned.
50. Policy section shows the **Required before a supported lift** list with at least 5 items.
51. JSON export `vta_imd_optimizer.workflow_status_policy` key is present with `status`, `workflow_status`, `reason`, `required_before_supported`.
52. Export `workflow_status_policy.workflow_status` is `"planned"` (never `"supported"`).
53. Export `workflow_status_policy.status` is either `"planned_experimental"` or `"ready_for_review_not_supported"`.
54. Text report includes **Workflow status policy:** line and **Required before a supported lift:** list.
55. Export `vta_imd_optimizer.status` remains `"planned"` regardless of policy status.
56. No `workflowStatus: "supported"` value anywhere in export or source.

## S5H Guided order, 45 RPM speed context & run history (S5H)

57. **Recommended measurement order** panel is visible on the Measurement Lab page.
58. Track 1 is listed as **Recommended first** for Reference Level.
59. Tracks 2–3 map to Channel Identity / Crosstalk.
60. Tracks 4–6 are labelled **Guidance only** (RIAA HF — no automatic EQ adjustment).
61. Tracks 7–8 are labelled **Guidance only** (RIAA LF — no automatic EQ adjustment).
62. Track 10 shows both **33⅓ RPM** (nominal 3,150 Hz) and **45 RPM** (nominal approx. 4,253 Hz) context.
63. Speed / Wow & Flutter panel shows a **33⅓ RPM / 45 RPM** toggle.
64. At 45 RPM, the panel displays: "At 45 RPM, the 3150 Hz track should read approximately 4253 Hz."
65. Speed measurement results are labelled with the active speed context and nominal frequency.
66. Completed speed measurements are appended to a **Speed run history** table below the latest result.
67. Both 33⅓ and 45 RPM runs can appear in the same session history.
68. **Clear speed run history** button removes all speed runs from the current session.
69. Changing test record clears speed run history (logged: "Speed run history cleared after test record change.").
70. JSON export `measurements.speed.runs` array contains all session speed runs with `speed_context`, `rpm`, `nominal_frequency_hz`, `measured_frequency_hz`, `speed_error_percent`, `wow_flutter_percent`.
71. Text report **SPEED & WOW·FLUTTER** section shows latest result and all speed runs.
72. VTA workflow status remains **Planned** — no `best_setting`, `recommended_height`, or `optimal_height` in export.
