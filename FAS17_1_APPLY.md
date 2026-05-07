# Apply Fas 17.1 package

Copy the files in this ZIP into the repository root, preserving paths.

This v2 package is based on GitHub web-read baseline from `main` at commit `ea2501788abe2d13794bdfb2073cd37379cf4685`:
- `package.json`
- `tsconfig.json`
- `src/main.ts`
- `src/app/home/renderHomePage.ts`
- `src/shared/ui/styles/base.css`
- `src/shared/ui/styles/tokens.css`
- `src/shared/ui/styles/components.css`
- `src/shared/ui/styles/home.css`
- `src/shared/audio-domain/index.ts`
- `src/shared/audio-domain/types/cartridge.ts`
- `src/shared/audio-domain/types/tonearm.ts`

Recommended local verification:

```powershell
npm install
npm run check
npm run check:tonearm
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Validate-AudioDataV3.ps1
```

This package was generated as an overlay because the current EIC session has no Git write permission.
GitHub web access was used for repository read/baseline.
