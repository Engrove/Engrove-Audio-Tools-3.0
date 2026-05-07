# Fas 17.0 — Audio Data Contracts + Validation Testlog

## Static checks performed in packaging environment

```text
node --check tools/validate-audio-data.mjs
```

Result:

```text
PASS
```

```text
tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck <new src/shared/audio-domain/**/*.ts files>
```

Result:

```text
PASS
```

## Runtime validation status

The full v3 runtime data was not bundled into this package, so runtime validation should be run after applying the package in the repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Validate-AudioDataV3.ps1
```

or:

```powershell
node tools\validate-audio-data.mjs
```

Expected current baseline from pushed GitHub summary:

```text
cartridges: 2973
cartridges match-ready: 1510
tonearms: 1588
tonearms match-ready: 639
```
