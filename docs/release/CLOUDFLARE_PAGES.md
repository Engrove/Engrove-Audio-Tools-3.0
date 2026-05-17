
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
