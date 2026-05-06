# Landing Page 2.0 Style Port

This implementation applies the Engrove Audio Tools 2.0 landing-page visual direction to the 3.0 public shell.

## Source assets

The 2.0 repository contains:

- `public/images/bg_black.webp`
- `public/images/bg_white.webp`
- `public/images/engrove.webp`

This 3.0 package uses the black and white hero background files.

## Required asset step

Run from the repo root:

```powershell
.\scripts\fetch-2.0-landing-assets.ps1
```

This downloads the two hero backgrounds into:

```text
public/images/bg_black.webp
public/images/bg_white.webp
```

## Public design policy

The 3.0 landing page inherits the visual language from 2.0, but does not copy the full 2.0 app shell or debug/density controls.

3.0 keeps:

- premium hero image treatment
- large centered headline
- clean topbar
- dark/light mode
- public landing-page tone

3.0 removes from the public default:

- debug controls
- density controls
- internal-only labels
- prototype/workshop workflows

## Smoke test

```powershell
npm run build
git add .
git commit -m "ui: align landing page with Engrove 2.0 visual style"
git push
```

Expected Cloudflare result:

- `https://engrove-toolbox.pages.dev/` shows the updated 2.0-inspired landing page.
