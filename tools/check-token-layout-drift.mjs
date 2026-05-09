#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const strictMode = process.argv.includes('--strict');

const SOURCE_EXTENSIONS = new Set(['.ts', '.css', '.html']);
const CSS_AUDIT_FILES = [
  'src/shared/ui/styles/tokens.css',
  'src/shared/ui/styles/layout.css',
  'src/shared/ui/styles/components.css',
  'src/shared/ui/styles/home.css',
  'src/modules/tonearm-match-lab/ui/tonearmMatchLab.css',
];
const DYNAMIC_EA_FALLBACK_ALLOWLIST = new Set(['--ea-scroll-progress']);
const MAX_CLASS_DRIFT_ITEMS_PER_SIDE = 80;

const groups = [
  { id: 'deprecated-width-token', title: 'Deprecated width token' },
  { id: 'legacy-fallback-token-patterns', title: 'Legacy fallback token patterns' },
  { id: 'ea-fallback-token-patterns', title: 'EA fallback token patterns' },
  { id: 'missing-global-ea-tokens', title: 'Tokens used but not globally defined' },
  { id: 'module-local-token-definitions', title: 'Module-local token definitions' },
  { id: 'duplicate-css-selectors', title: 'Duplicate CSS selectors' },
  { id: 'class-contract-drift', title: 'Emitted vs styled class drift' },
  { id: 'route-css-global-selectors', title: 'Global element selectors inside route CSS' },
  { id: 'doctrine-candidates', title: 'Doctrine false-negative candidates' },
];

function normalizePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function pathExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function isDirectory(filePath) {
  return pathExists(filePath) && fs.statSync(filePath).isDirectory();
}

function shouldSkipDirectory(relPath) {
  if (relPath === '') {
    return false;
  }

  return (
    relPath === '.git' ||
    relPath === 'node_modules' ||
    relPath === 'dist' ||
    relPath === 'docs' ||
    relPath === 'src/data' ||
    relPath === 'public/data' ||
    relPath.startsWith('.git/') ||
    relPath.startsWith('node_modules/') ||
    relPath.startsWith('dist/') ||
    relPath.startsWith('docs/') ||
    relPath.startsWith('src/data/') ||
    relPath.startsWith('public/data/')
  );
}

function walkFiles(dirPath, files = []) {
  if (!isDirectory(dirPath)) {
    return files;
  }

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = normalizePath(fullPath);

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(relPath)) {
        walkFiles(fullPath, files);
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function isShippedSourceFile(filePath) {
  const relPath = normalizePath(filePath);
  const extension = path.extname(filePath);

  if (!SOURCE_EXTENSIONS.has(extension)) {
    return false;
  }

  if (relPath === 'index.html' || relPath === 'public/index.html') {
    return true;
  }

  return relPath.startsWith('src/') && !relPath.startsWith('src/data/');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function linesOf(text) {
  return text.split(/\r?\n/);
}

function addWarning(warnings, group, file, line, detail) {
  warnings.push({
    group,
    file,
    line,
    detail,
  });
}

function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => ' '.repeat(match.length));
}

function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function addClassLocation(classes, className, file, line) {
  if (!/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(className)) {
    return;
  }

  if (!classes.has(className)) {
    classes.set(className, []);
  }

  const locations = classes.get(className);
  const duplicate = locations.some((location) => location.file === file && location.line === line);
  if (!duplicate) {
    locations.push({ file, line });
  }
}

function collectGlobalTokenDefinitions(tokensPath) {
  const definitions = new Set();

  if (!pathExists(tokensPath)) {
    return definitions;
  }

  const text = readText(tokensPath);
  const definitionPattern = /(--ea-[A-Za-z0-9_-]+)\s*:/g;
  let match;

  while ((match = definitionPattern.exec(text)) !== null) {
    definitions.add(match[1]);
  }

  return definitions;
}

function collectTokenDefinitionsOutsideTokens(sourceFiles) {
  const localDefinitions = new Map();

  for (const filePath of sourceFiles) {
    const relPath = normalizePath(filePath);
    if (relPath === 'src/shared/ui/styles/tokens.css') {
      continue;
    }

    const text = readText(filePath);
    const pattern = /(--ea-[A-Za-z0-9_-]+)\s*:/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (!localDefinitions.has(match[1])) {
        localDefinitions.set(match[1], []);
      }
      localDefinitions.get(match[1]).push({
        file: relPath,
        line: lineForIndex(text, match.index),
      });
    }
  }

  return localDefinitions;
}

function collectUsedEaTokens(sourceFiles) {
  const used = new Map();

  for (const filePath of sourceFiles) {
    const relPath = normalizePath(filePath);
    const text = readText(filePath);
    const pattern = /var\(\s*(--ea-[A-Za-z0-9_-]+)/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (!used.has(match[1])) {
        used.set(match[1], []);
      }
      used.get(match[1]).push({
        file: relPath,
        line: lineForIndex(text, match.index),
      });
    }
  }

  return used;
}

function extractTypeScriptCssFragments(text) {
  const fragments = [];
  const runtimeCssPattern =
    /\b(?:const|let|var)\s+[A-Za-z0-9_]*(?:Css|CSS|Styles|Style)[A-Za-z0-9_]*\s*=\s*(`[\s\S]*?`|'[\s\S]*?'|"[\s\S]*?")/g;
  let assignmentMatch;

  while ((assignmentMatch = runtimeCssPattern.exec(text)) !== null) {
    const literal = assignmentMatch[1];
    const quote = literal[0];
    const body = literal.slice(1, -1);
    const decoded = quote === '`' ? body : body.replace(/\\n/g, '\n');
    if (decoded.includes('{') && /\.[A-Za-z_-][A-Za-z0-9_-]*\s*[{,:#.\s]/.test(decoded)) {
      fragments.push({
        text: decoded,
        startIndex: assignmentMatch.index + assignmentMatch[0].indexOf(literal) + 1,
      });
    }
  }

  return fragments;
}

function collectClassesFromCssText(text, relPath, classes, baseIndex = 0) {
  const cleanText = stripCssComments(text);
  const pattern = /\.([A-Za-z_-][A-Za-z0-9_-]*)/g;
  let match;

  while ((match = pattern.exec(cleanText)) !== null) {
    addClassLocation(classes, match[1], relPath, lineForIndex(text, match.index + baseIndex));
  }
}

function collectCssClassSelectors(cssFiles, sourceFiles) {
  const classes = new Map();

  for (const filePath of cssFiles) {
    if (!pathExists(filePath)) {
      continue;
    }

    const relPath = normalizePath(filePath);
    collectClassesFromCssText(readText(filePath), relPath, classes);
  }

  for (const filePath of sourceFiles) {
    if (path.extname(filePath) !== '.ts') {
      continue;
    }

    const relPath = normalizePath(filePath);
    const text = readText(filePath);
    for (const fragment of extractTypeScriptCssFragments(text)) {
      collectClassesFromCssText(fragment.text, relPath, classes, fragment.startIndex);
    }
  }

  return classes;
}

function collectClassNamesFromAttributeValue(attrValue) {
  return attrValue
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(value));
}

function collectEmittedClasses(sourceFiles) {
  const classes = new Map();

  for (const filePath of sourceFiles) {
    const relPath = normalizePath(filePath);
    const text = readText(filePath);
    const patterns = [
      /\bclass\s*=\s*["'`]([^"'`]+)["'`]/g,
      /\bclassName\s*=\s*["'`]([^"'`]+)["'`]/g,
      /\b(?:const|let|var)\s+[A-Za-z0-9_]*Class(?:Name|Names)?\s*=\s*["'`]([^"'`]+)["'`]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        for (const className of collectClassNamesFromAttributeValue(match[1])) {
          addClassLocation(classes, className, relPath, lineForIndex(text, match.index));
        }
      }
    }
  }

  return classes;
}

function reportDeprecatedWidthToken(sourceFiles, warnings) {
  for (const filePath of sourceFiles) {
    const relPath = normalizePath(filePath);
    const text = readText(filePath);
    const pattern = /--ea-page-max/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      addWarning(
        warnings,
        'deprecated-width-token',
        relPath,
        lineForIndex(text, match.index),
        '--ea-page-max is present',
      );
    }
  }
}

function reportLegacyFallbackPatterns(sourceFiles, warnings) {
  const pattern = /var\(\s*(--(?:color|space|radius|font-size)-[A-Za-z0-9_-]+)\s*,[^)]+\)/g;

  for (const filePath of sourceFiles) {
    const relPath = normalizePath(filePath);
    const text = readText(filePath);
    let match;

    while ((match = pattern.exec(text)) !== null) {
      addWarning(
        warnings,
        'legacy-fallback-token-patterns',
        relPath,
        lineForIndex(text, match.index),
        match[0].trim(),
      );
    }
  }
}

function reportEaFallbackPatterns(sourceFiles, warnings) {
  const pattern = /var\(\s*(--ea-[A-Za-z0-9_-]+)\s*,[^)]+\)/g;

  for (const filePath of sourceFiles) {
    const relPath = normalizePath(filePath);
    const text = readText(filePath);
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const tokenName = match[1];
      if (DYNAMIC_EA_FALLBACK_ALLOWLIST.has(tokenName)) {
        continue;
      }

      addWarning(
        warnings,
        'ea-fallback-token-patterns',
        relPath,
        lineForIndex(text, match.index),
        match[0].trim(),
      );
    }
  }
}

function reportMissingGlobalTokens(sourceFiles, warnings) {
  const globalDefinitions = collectGlobalTokenDefinitions(
    path.join(repoRoot, 'src/shared/ui/styles/tokens.css'),
  );
  const localDefinitions = collectTokenDefinitionsOutsideTokens(sourceFiles);
  const usedTokens = collectUsedEaTokens(sourceFiles);

  for (const [tokenName, locations] of [...usedTokens.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (globalDefinitions.has(tokenName)) {
      continue;
    }

    const firstLocation = locations[0];
    const localDefinitionLocations = localDefinitions.get(tokenName) ?? [];
    const localNote =
      localDefinitionLocations.length > 0
        ? 'missing from tokens.css; locally defined elsewhere'
        : 'missing from tokens.css';

    addWarning(
      warnings,
      'missing-global-ea-tokens',
      firstLocation.file,
      firstLocation.line,
      tokenName + ' ' + localNote,
    );
  }
}

function reportModuleLocalTokenDefinitions(sourceFiles, warnings) {
  const localDefinitions = collectTokenDefinitionsOutsideTokens(sourceFiles);

  for (const [tokenName, locations] of [...localDefinitions.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const location of locations) {
      addWarning(
        warnings,
        'module-local-token-definitions',
        location.file,
        location.line,
        tokenName + ' defined outside tokens.css',
      );
    }
  }
}

function selectorPreludeAt(text, matchIndex) {
  const before = text.slice(0, matchIndex);
  const lastClose = before.lastIndexOf('}');
  const lastOpen = before.lastIndexOf('{');
  const start = Math.max(lastClose, lastOpen) + 1;
  return before.slice(start).trim();
}

function normalizeSelector(selector) {
  return selector.replace(/\s+/g, ' ').trim();
}

function reportDuplicateCssSelectors(cssFiles, warnings) {
  for (const filePath of cssFiles) {
    if (!pathExists(filePath)) {
      continue;
    }

    const relPath = normalizePath(filePath);
    const rawText = readText(filePath);
    const text = stripCssComments(rawText);
    const seen = new Map();
    const openBracePattern = /\{/g;
    let match;

    while ((match = openBracePattern.exec(text)) !== null) {
      const prelude = selectorPreludeAt(text, match.index);
      if (!prelude || prelude.startsWith('@') || prelude.includes('@keyframes')) {
        continue;
      }

      for (const selector of prelude.split(',')) {
        const normalized = normalizeSelector(selector);
        if (!normalized || normalized.startsWith('@')) {
          continue;
        }

        const line = lineForIndex(text, match.index);
        if (!seen.has(normalized)) {
          seen.set(normalized, { line });
          continue;
        }

        const first = seen.get(normalized);
        addWarning(
          warnings,
          'duplicate-css-selectors',
          relPath,
          line,
          normalized + ' duplicates selector first seen at line ' + first.line,
        );
      }
    }
  }
}

function reportClassContractDrift(sourceFiles, cssFiles, warnings) {
  const styled = collectCssClassSelectors(cssFiles, sourceFiles);
  const emitted = collectEmittedClasses(sourceFiles);

  let styledMissingCount = 0;
  for (const [className, locations] of [...styled.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (emitted.has(className)) {
      continue;
    }

    styledMissingCount += 1;
    if (styledMissingCount <= MAX_CLASS_DRIFT_ITEMS_PER_SIDE) {
      const first = locations[0];
      addWarning(
        warnings,
        'class-contract-drift',
        first.file,
        first.line,
        '.' + className + ' styled but not found in emitted source',
      );
    }
  }

  if (styledMissingCount > MAX_CLASS_DRIFT_ITEMS_PER_SIDE) {
    addWarning(
      warnings,
      'class-contract-drift',
      '(summary)',
      0,
      (styledMissingCount - MAX_CLASS_DRIFT_ITEMS_PER_SIDE) +
        ' additional styled-only classes omitted from detailed output',
    );
  }

  let emittedMissingCount = 0;
  for (const [className, locations] of [...emitted.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (styled.has(className)) {
      continue;
    }

    emittedMissingCount += 1;
    if (emittedMissingCount <= MAX_CLASS_DRIFT_ITEMS_PER_SIDE) {
      const first = locations[0];
      addWarning(
        warnings,
        'class-contract-drift',
        first.file,
        first.line,
        '.' + className + ' emitted but no CSS selector found',
      );
    }
  }

  if (emittedMissingCount > MAX_CLASS_DRIFT_ITEMS_PER_SIDE) {
    addWarning(
      warnings,
      'class-contract-drift',
      '(summary)',
      0,
      (emittedMissingCount - MAX_CLASS_DRIFT_ITEMS_PER_SIDE) +
        ' additional emitted-only classes omitted from detailed output',
    );
  }
}

function reportRouteCssGlobalSelectors(warnings) {
  const homeCssPath = path.join(repoRoot, 'src/shared/ui/styles/home.css');
  if (!pathExists(homeCssPath)) {
    return;
  }

  const relPath = normalizePath(homeCssPath);
  const lines = linesOf(readText(homeCssPath));
  const globalPatterns = [
    { name: 'html selector', pattern: /^\s*html(?:\b|[:.{#[\s])/ },
    { name: 'body selector', pattern: /^\s*body(?:\b|[:.{#[\s])/ },
    { name: '#app selector', pattern: /^\s*#app(?:\b|[:.{#[\s])/ },
    { name: 'scrollbar selector', pattern: /::-webkit-scrollbar|scrollbar-/ },
  ];

  lines.forEach((line, index) => {
    for (const item of globalPatterns) {
      if (item.pattern.test(line)) {
        addWarning(
          warnings,
          'route-css-global-selectors',
          relPath,
          index + 1,
          item.name + ' inside home.css',
        );
      }
    }
  });
}

function reportDoctrineCandidates(cssFiles, sourceFiles, warnings) {
  const candidatePattern = /\b[A-Za-z0-9_-]*(?:lead|lede)[A-Za-z0-9_-]*\b/gi;
  const files = [...cssFiles, ...sourceFiles]
    .filter((value, index, array) => array.indexOf(value) === index)
    .filter(pathExists)
    .sort((a, b) => normalizePath(a).localeCompare(normalizePath(b)));

  for (const filePath of files) {
    const relPath = normalizePath(filePath);
    const text = readText(filePath);
    let match;

    while ((match = candidatePattern.exec(text)) !== null) {
      const token = match[0];
      if (token === '__lead' || token === '--lede') {
        continue;
      }

      addWarning(
        warnings,
        'doctrine-candidates',
        relPath,
        lineForIndex(text, match.index),
        token + ' may be a lead/lede class or marker not covered by doctrine gate',
      );
    }
  }
}

function printGroupedWarnings(warnings) {
  const byGroup = new Map();

  for (const warning of warnings) {
    if (!byGroup.has(warning.group)) {
      byGroup.set(warning.group, []);
    }
    byGroup.get(warning.group).push(warning);
  }

  for (const group of groups) {
    const items = byGroup.get(group.id) ?? [];
    console.log('');
    console.log('[' + group.title + '] ' + items.length);
    for (const item of items) {
      const line = item.line > 0 ? ':' + item.line : '';
      console.log('- ' + item.file + line + ' | ' + item.detail);
    }
  }
}

function main() {
  const allFiles = walkFiles(repoRoot).sort((a, b) => normalizePath(a).localeCompare(normalizePath(b)));
  const sourceFiles = allFiles.filter(isShippedSourceFile);
  const cssAuditFiles = CSS_AUDIT_FILES.map((relPath) => path.join(repoRoot, relPath));
  const warnings = [];

  reportDeprecatedWidthToken(sourceFiles, warnings);
  reportLegacyFallbackPatterns(sourceFiles, warnings);
  reportEaFallbackPatterns(sourceFiles, warnings);
  reportMissingGlobalTokens(sourceFiles, warnings);
  reportModuleLocalTokenDefinitions(sourceFiles, warnings);
  reportDuplicateCssSelectors(cssAuditFiles, warnings);
  reportClassContractDrift(sourceFiles, cssAuditFiles, warnings);
  reportRouteCssGlobalSelectors(warnings);
  reportDoctrineCandidates(cssAuditFiles, sourceFiles, warnings);

  if (strictMode && warnings.length > 0) {
    console.log('FAIL check-token-layout-drift');
  } else {
    console.log('PASS check-token-layout-drift');
  }

  console.log('Mode: ' + (strictMode ? 'strict' : 'normal'));
  console.log('Files scanned: ' + sourceFiles.length);
  console.log('Report groups checked: ' + groups.length);
  console.log('Warnings: ' + warnings.length);
  printGroupedWarnings(warnings);

  if (strictMode && warnings.length > 0) {
    process.exitCode = 1;
  }
}

main();
