# Fas 17.0 — Audio Data Contracts + Validation

## Purpose

Fas 17.0 freezes the first Engrove Audio Tools 3.0 audio data contract.

The goal is to protect the first public tool modules from accidental data-shape changes before `/tonearm-calculator` is built.

## Verified baseline

The current v3 audio data is generated from Engrove Audio Tools 2.0 public data.

Verified current baseline:

```text
cartridges-data.json: row_array, 2973 records
tonearms-data.json: row_array, 1588 records

generated cartridges: 2973
match-ready cartridges: 1510

generated tonearms: 1588
match-ready tonearms: 639
```

## Runtime files

```text
src/data/audio/v3/runtime/cartridges.index.json
src/data/audio/v3/runtime/tonearms.index.json
src/data/audio/v3/audio-data-v3-summary.json
src/data/audio/v3/runtime/audio-index.manifest.json
```

## Contract principles

1. Runtime indexes must be compact.
2. Runtime indexes must not contain legacy/source metadata.
3. Match-ready cartridge means:
   - `match_ready === true`
   - `mass_g` is numeric
   - `compliance_10hz_cu` is numeric
4. Match-ready tonearm means:
   - `match_ready === true`
   - `effective_mass_g` is numeric
5. Missing data is allowed, but must prevent `match_ready`.
6. Estimated compliance is allowed, but must remain visible through source/confidence fields.
7. Full raw 2.0 data remains under `src/data/legacy/engrove-2.0/` for traceability.

## TypeScript contract files

```text
src/shared/audio-domain/types/audioData.ts
src/shared/audio-domain/types/cartridge.ts
src/shared/audio-domain/types/tonearm.ts
src/shared/audio-domain/contracts/audioDataContract.ts
src/shared/audio-domain/validation/audioDataValidation.ts
src/shared/audio-domain/index.ts
```

## Validation commands

PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Validate-AudioDataV3.ps1
```

Node:

```powershell
node tools\validate-audio-data.mjs
```

NPM, when available:

```powershell
npm run validate:data
```

## Next phase

After this contract is committed and validation passes, the next implementation phase should be:

```text
Fas 17.1 — Tonearm Match Lab Foundation
```

Scope:

```text
/tonearm-calculator
manual quick match inputs
resonance engine
result diagnosis card
assumptions/confidence panel
data-backed selector only after engine is stable
```
