# AI Collaboration Guide — Engrove Audio Tools 3.0

## Prime directive

AI is wrong by default until proven otherwise.

For this repository:

- make small, reviewable changes
- preserve the current architecture unless a change is explicitly requested
- prove behavior with tests or static checks
- do not claim deployment, commit, push, release, or test status without evidence
- do not import file:// prototype UI directly
- transfer validated function, data, algorithms, and edge cases, not workshop clutter
- use the live GitHub repository as the current baseline

Repository:

```text
https://github.com/Engrove/Engrove-Audio-Tools-3.0
````

## Collaboration roles

This project uses a strict companion-coding model.

```text
EIC = orchestrator, requirements owner, reviewer, gatekeeper
Jan-Eric = local operator; applies patches, runs tests, commits and pushes
Hjalmar = coder; produces code, diffs, patch packages or implementation reports
```

### Hjalmar role boundary

Hjalmar must not act as EIC.

Hjalmar must not give Jan-Eric operational instructions such as:

* run this command
* delete this file
* commit this change
* push this branch
* proceed to the next phase

Hjalmar should deliver only:

* changed files
* implementation summary
* patch/diff or apply script
* test strategy or test output if tests were actually run
* blockers when repository files cannot be modified

EIC reviews the delivery and gives Jan-Eric operational instructions.

### Jan-Eric role boundary

Jan-Eric applies patches locally, runs gates, commits and pushes when EIC has reviewed the result.

### EIC role boundary

EIC verifies the current project/repository state, defines phase scope, reviews Hjalmar output, classifies results as PASS / PASS-WARN / NEEDS PATCH / BLOCKER, and gives Jan-Eric the next operational steps.

## Source of truth

Use this priority order:

1. current explicit task
2. current GitHub repository files
3. local test output supplied by Jan-Eric
4. project documentation
5. reasoning

Do not invent repository structure, APIs, routes, or file contents.

When coding, inspect the current repository files first. Do not use remembered or hypothetical files as the implementation baseline.

## Public-site rule

The public site is for ordinary users.

All shipped public UI copy must be English.

Do not ship:

* Swedish headings
* Swedish labels
* Swedish buttons
* Swedish helper text
* Swedish validation messages
* Swedish empty states
* Swedish result text
* internal phase wording such as "Fas 17.x"

Swedish is allowed in EIC chat with Jan-Eric, but not in the shipped site.

## Public UI productization rule

Do not copy local prototype layouts directly.

Prototype apps may contain dense controls, debug state, experimental flows, file:// workarounds and Jan-Eric-specific needs. Public modules must be rebuilt with standard UI/UX, clear copy, sensible defaults and mobile-aware flows.

Prototype artifacts may be used as sources for:

* algorithms
* data contracts
* edge cases
* geometry/resonance/compliance logic
* validated domain behavior

They must not be copied as public UI.

## Architecture rule

This is a Vite + TypeScript SPA, not React.

Preserve existing route and module contracts unless the phase explicitly asks to change them.

Current route contracts must not be rewritten casually.

For example, if the router currently expects:

```ts
renderTonearmMatchLabPage(): string
enableTonearmMatchLabInteractions(): void
```

then a patch must preserve that contract unless the task explicitly includes a router refactor.

Do not replace the app structure with an invented architecture.

## Module rule

Every tool should be a module with clear boundaries.

Preferred module shape:

```text
src/modules/<tool>/
  engine/
  ui/
  tests/
```

A module may use shared code from `src/shared`, but shared code must not depend on one specific module.

## Shared UI rule

Shared UI utilities belong under:

```text
src/shared/ui/
```

Render-safety helpers belong under:

```text
src/shared/ui/renderSafe.ts
```

Dynamic text rendered into HTML template strings must be escaped before it reaches `innerHTML`.

Required render-safe helper API:

```ts
escapeHtml(value: unknown): string
escapeAttribute(value: unknown): string
renderText(value: unknown): string
```

Minimum escaping behavior:

```text
&  -> &amp;
<  -> &lt;
>  -> &gt;
"  -> &quot;
'  -> &#39;
null / undefined -> empty string
number / boolean -> safe String(value)
```

Do not add a dependency for basic escaping.

## Data rule

Keep these separate:

* raw imported source data
* normalized public data
* derived indexes
* runtime state
* public static delivery data

Public runtime data that must be fetched by the browser belongs under:

```text
public/data/
```

Source/canonical data may remain under:

```text
src/data/
```

Do not reference `src/data/...` paths from public runtime manifests.

## Static delivery rule

Cloudflare Pages is the default public hosting target.

Runtime files intended for browser fetch must be available as static public paths, for example:

```text
/data/audio/v3/runtime/audio-index.manifest.json
/data/audio/v3/runtime/cartridges.index.json
/data/audio/v3/runtime/tonearms.index.json
```

Manifests should use public fetch paths and include verifiable metadata such as records, byte size and SHA-256 when applicable.

## Integrity rule

Release-critical files should be UTF-8 without BOM and use LF line endings.

The integrity check currently focuses on release-critical/static-delivery files, not all historical repository debt.

Do not turn a small phase into a large noisy normalization commit unless explicitly requested.

## Apply script rule

Temporary apply or patch scripts must not be placed in the repository root.

If an `.mjs` apply script is delivered, it must be intended for:

```text
tools/
```

Example:

```text
tools/apply-fas-17-1-2-render-safe.mjs
```

Temporary apply scripts should not be committed unless the phase explicitly says they are permanent project tooling.

Hjalmar may provide apply-script content, but EIC decides how Jan-Eric should apply or remove it.

## Package/dependency rule

Do not add dependencies unless explicitly requested.

Do not add or commit:

```text
package-lock.json
node_modules
dist
.vs
temporary ZIP files
local apply scripts
platform-specific esbuild dependencies
```

Do not add `@esbuild/win32-x64` as a direct dependency.

## PowerShell / Windows rule

Jan-Eric works on Windows PowerShell.

Do not include terminal prompts such as:

```text
PS C:\...>
```

inside commands.

Do not ask Jan-Eric to paste old output as commands.

When writing JSON, TS, CSS, HTML, MD or script files from PowerShell, use UTF-8 without BOM when possible:

```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
```

When using .NET file APIs in PowerShell, prefer absolute paths built from the repository root:

```powershell
$target = Join-Path (Get-Location) $relativePath
```

## Cloudflare rule

Cloudflare Pages is the default public hosting target.

Cloudflare Pages Functions may be used only when they provide clear value.

Do not claim a Cloudflare deployment is live unless it has been verified.

## Tonearm Match Lab rule

Tonearm Match Lab must preserve the established resonance model unless a phase explicitly changes it.

Tracking force is an input setting but must not be added to total moving mass in the resonance calculation unless a future domain decision explicitly changes that rule.

The preferred public route is:

```text
/tonearm-calculator
```

Tonearm UI must remain English-only and render-safe.

## Test gates

Standard local gates:

```text
npm run check
npm run check:tonearm
npm run validate:data
npm run check:integrity
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Validate-AudioDataV3.ps1
```

When render-safe work is changed, also run:

```text
npm run check:render-safe
```

When public UI copy is touched, also run a Swedish/mixed-language grep.

Known non-blocking data warnings until a data-quality cleanup phase:

```text
Ikeda 9 MUSA mass_g = 43
Ikeda 9 Supreme mass_g = 47
General Electric 1RM6C compliance_10hz_cu = 0.87
```

## Review status model

EIC reviews work using:

```text
PASS
PASS-WARN
NEEDS PATCH
BLOCKER
```

A change is done only when:

* implementation matches the requested scope
* route/API contracts are preserved unless explicitly changed
* tests/checks pass
* public UX is reviewed where relevant
* public UI copy is English-only
* no false deployment, commit, push or release claims are made
* local `git status --short` contains only intended files before commit

## Definition of done

A change is done only when behavior is implemented, tests/checks pass, public UX is reviewed, docs are updated where needed, and no false release claims are made.

