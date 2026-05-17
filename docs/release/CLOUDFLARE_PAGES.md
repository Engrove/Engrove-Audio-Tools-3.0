
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
