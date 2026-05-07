# EAT2 -> EAT3 PowerShell converter v3

## Fix

The v2 converter failed in Windows PowerShell because a literal en dash in a regex was decoded as mojibake.

v3 avoids non-ASCII characters in PowerShell source and saves scripts with UTF-8 BOM.

## Output

```text
src/data/audio/v3/cartridges.v3.json
src/data/audio/v3/tonearms.v3.json
src/data/audio/v3/runtime/cartridges.index.json
src/data/audio/v3/runtime/tonearms.index.json
src/data/audio/v3/audio-data-v3-summary.json
src/data/audio/v3/runtime/audio-index.manifest.json
```

2.0 schemas are still only downloaded/preserved. 3.0 schemas are deferred until after data review.
