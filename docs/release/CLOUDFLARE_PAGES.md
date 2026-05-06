
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
