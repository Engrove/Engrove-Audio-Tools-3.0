import { escapeAttribute, renderText } from './renderSafe';

export type RuntimePickerKind = 'cartridge' | 'tonearm';

export type RuntimePickerItem = {
  id: string;
  kind: RuntimePickerKind;
  displayName: string;
  type?: string;
  massG?: number;
  compliance10HzCu?: number;
  effectiveMassG?: number;
};

export type RuntimePickerFilters = {
  search: string;
  type: string;
  massMin?: number;
  massMax?: number;
  complianceMin?: number;
  complianceMax?: number;
  effectiveMassMin?: number;
  effectiveMassMax?: number;
};

export type RuntimePickerFieldUpdates = Partial<{
  cartridgeMassG: number;
  compliance10HzCu: number;
  tonearmEffectiveMassG: number;
}>;

export type RuntimePickerModalOptions = {
  kind: RuntimePickerKind;
  title: string;
  items: readonly RuntimePickerItem[];
  appliedItemId?: string | null;
  onApply: (item: RuntimePickerItem) => void;
};

export const RUNTIME_PICKER_RESULT_LIMIT = 100;

const styleElementId = 'engrove-runtime-picker-modal-styles';

const runtimePickerCss = `
.runtime-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: clamp(1rem, 3vw, 2rem);
  background: rgb(0 0 0 / 0.68);
}

.runtime-picker-dialog {
  width: min(1080px, 100%);
  max-height: min(820px, calc(100vh - 2rem));
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr auto;
  border: 1px solid rgb(148 163 184 / 0.28);
  border-radius: 1.25rem;
  background: #101216;
  color: #f8fafc;
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.44);
}

.runtime-picker-header,
.runtime-picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid rgb(148 163 184 / 0.18);
}

.runtime-picker-footer {
  border-top: 1px solid rgb(148 163 184 / 0.18);
  border-bottom: 0;
  justify-content: flex-end;
}

.runtime-picker-title {
  margin: 0;
  font-size: clamp(1.2rem, 2vw, 1.55rem);
}

.runtime-picker-close,
.runtime-picker-cancel,
.runtime-picker-apply,
.runtime-picker-result {
  font: inherit;
}

.runtime-picker-close {
  border: 0;
  border-radius: 999px;
  width: 2.4rem;
  height: 2.4rem;
  color: inherit;
  background: rgb(148 163 184 / 0.18);
  cursor: pointer;
}

.runtime-picker-body {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(320px, 1fr) minmax(260px, 320px);
  gap: 1rem;
  min-height: 0;
  overflow: hidden;
  padding: 1rem;
}

.runtime-picker-panel {
  min-height: 0;
  overflow: auto;
  border: 1px solid rgb(148 163 184 / 0.18);
  border-radius: 1rem;
  background: rgb(15 23 42 / 0.32);
  padding: 1rem;
}

.runtime-picker-panel h3 {
  margin-top: 0;
}

.runtime-picker-field {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.8rem;
  font-size: 0.92rem;
}

.runtime-picker-field input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgb(148 163 184 / 0.28);
  border-radius: 0.55rem;
  padding: 0.6rem 0.7rem;
  color: inherit;
  background: rgb(2 6 23 / 0.36);
}

.runtime-picker-filter-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.runtime-picker-count {
  margin: 0 0 0.75rem;
  color: #cbd5e1;
  font-size: 0.92rem;
}

.runtime-picker-results {
  display: grid;
  gap: 0.45rem;
}

.runtime-picker-result {
  width: 100%;
  text-align: left;
  border: 1px solid rgb(148 163 184 / 0.16);
  border-radius: 0.75rem;
  padding: 0.75rem;
  color: inherit;
  background: rgb(255 255 255 / 0.05);
  cursor: pointer;
}

.runtime-picker-result[aria-selected="true"] {
  border-color: rgb(20 184 166 / 0.85);
  background: rgb(20 184 166 / 0.16);
}

.runtime-picker-result-name,
.runtime-picker-preview-name {
  display: block;
  font-weight: 700;
}

.runtime-picker-result-detail,
.runtime-picker-preview-detail,
.runtime-picker-empty {
  color: #cbd5e1;
  font-size: 0.9rem;
}

.runtime-picker-preview-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.45rem 0.8rem;
  margin-top: 1rem;
}

.runtime-picker-preview-list dt {
  color: #cbd5e1;
}

.runtime-picker-preview-list dd {
  margin: 0;
}

.runtime-picker-preview-note {
  margin-top: 1rem;
  border-left: 3px solid rgb(20 184 166 / 0.8);
  padding: 0.75rem;
  background: rgb(2 6 23 / 0.34);
  color: #cbd5e1;
}

.runtime-picker-cancel,
.runtime-picker-apply {
  border: 0;
  border-radius: 0.55rem;
  padding: 0.7rem 1.2rem;
  cursor: pointer;
}

.runtime-picker-cancel {
  background: rgb(148 163 184 / 0.28);
  color: inherit;
}

.runtime-picker-apply {
  background: rgb(20 184 166 / 0.88);
  color: white;
  font-weight: 700;
}

.runtime-picker-apply:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

@media (max-width: 860px) {
  .runtime-picker-body {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .runtime-picker-panel {
    overflow: visible;
  }
}

/* Runtime picker stable modal height */
.runtime-picker-backdrop {
  align-items: center;
  overflow: hidden;
}

.runtime-picker-dialog {
  block-size: min(42rem, calc(100dvh - 4rem));
  max-block-size: calc(100dvh - 4rem);
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.runtime-picker-body {
  min-block-size: 0;
  overflow: hidden;
}

.runtime-picker-body > .runtime-picker-panel {
  min-block-size: 0;
  overflow: hidden;
}

.runtime-picker-panel[aria-label="Search and filters"],
.runtime-picker-panel[aria-label="Selected item preview"] {
  display: flex;
  flex-direction: column;
}

.runtime-picker-panel[aria-label="Search and filters"] {
  overflow: auto;
}

.runtime-picker-panel[aria-label="Results"] {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.75rem;
}

.runtime-picker-panel[aria-label="Selected item preview"] {
  overflow: auto;
}

.runtime-picker-results {
  min-block-size: 0;
  overflow: auto;
  align-content: start;
  padding-inline-end: 0.15rem;
}

.runtime-picker-empty {
  min-block-size: 100%;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 1rem;
  border: 1px dashed rgb(148 163 184 / 0.28);
  border-radius: 0.75rem;
  text-align: center;
}

@supports not (height: 100dvh) {
  .runtime-picker-dialog {
    block-size: min(42rem, calc(100vh - 4rem));
    max-block-size: calc(100vh - 4rem);
  }
}

@media (max-width: 860px) {
  .runtime-picker-backdrop {
    align-items: stretch;
    padding: 0.75rem;
  }

  .runtime-picker-dialog {
    block-size: min(44rem, calc(100dvh - 1.5rem));
    max-block-size: calc(100dvh - 1.5rem);
  }

  .runtime-picker-body {
    min-block-size: 0;
    overflow: auto;
  }

  .runtime-picker-body > .runtime-picker-panel {
    overflow: visible;
  }

  .runtime-picker-panel[aria-label="Results"] {
    min-block-size: min(18rem, 46dvh);
  }

  .runtime-picker-results {
    min-block-size: 12rem;
  }
}
/* End runtime picker stable modal height */
`;

function ensureRuntimePickerStyles(): void {
  if (document.getElementById(styleElementId)) {
    return;
  }

  const style = document.createElement('style');
  style.id = styleElementId;
  style.textContent = runtimePickerCss;
  document.head.append(style);
}

function formatNumber(value: number | undefined, suffix: string): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
}

function detailText(item: RuntimePickerItem): string {
  if (item.kind === 'cartridge') {
    return [
      item.type,
      formatNumber(item.massG, ' g'),
      formatNumber(item.compliance10HzCu, ' cu @10 Hz'),
    ].filter(Boolean).join(' · ') || 'No match values available';
  }

  return formatNumber(item.effectiveMassG, ' g effective mass') ?? 'No match values available';
}

function withinNumberRange(value: number | undefined, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) {
    return true;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  if (min !== undefined && value < min) {
    return false;
  }
  if (max !== undefined && value > max) {
    return false;
  }
  return true;
}

function parseNumberInput(value: string): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readFilters(root: ParentNode): RuntimePickerFilters {
  const value = (name: string): string =>
    root.querySelector<HTMLInputElement>(`[data-runtime-picker-filter="${name}"]`)?.value ?? '';

  return {
    search: value('search'),
    type: value('type'),
    massMin: parseNumberInput(value('massMin')),
    massMax: parseNumberInput(value('massMax')),
    complianceMin: parseNumberInput(value('complianceMin')),
    complianceMax: parseNumberInput(value('complianceMax')),
    effectiveMassMin: parseNumberInput(value('effectiveMassMin')),
    effectiveMassMax: parseNumberInput(value('effectiveMassMax')),
  };
}

export function runtimePickerFieldUpdates(
  kind: RuntimePickerKind,
  item: RuntimePickerItem,
): RuntimePickerFieldUpdates {
  if (kind === 'cartridge') {
    return {
      cartridgeMassG: item.massG,
      compliance10HzCu: item.compliance10HzCu,
    };
  }

  return {
    tonearmEffectiveMassG: item.effectiveMassG,
  };
}

export function filterRuntimePickerItems(
  items: readonly RuntimePickerItem[],
  kind: RuntimePickerKind,
  filters: RuntimePickerFilters,
  limit = RUNTIME_PICKER_RESULT_LIMIT,
): RuntimePickerItem[] {
  const normalizedSearch = filters.search.trim().toLocaleLowerCase('en-US');
  const normalizedType = filters.type.trim().toLocaleLowerCase('en-US');

  const filtered = items.filter((item) => {
    if (item.kind !== kind) {
      return false;
    }

    if (normalizedSearch.length > 0) {
      const searchable = [item.displayName, item.type]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('en-US');

      if (!searchable.includes(normalizedSearch)) {
        return false;
      }
    }

    if (kind === 'cartridge') {
      if (normalizedType.length > 0 && !(item.type ?? '').toLocaleLowerCase('en-US').includes(normalizedType)) {
        return false;
      }

      return (
        withinNumberRange(item.massG, filters.massMin, filters.massMax) &&
        withinNumberRange(item.compliance10HzCu, filters.complianceMin, filters.complianceMax)
      );
    }

    return withinNumberRange(item.effectiveMassG, filters.effectiveMassMin, filters.effectiveMassMax);
  });

  return filtered.slice(0, limit);
}

export function runtimePickerEmptyMarkup(message: unknown): string {
  return `<p class="runtime-picker-empty">${renderText(message)}</p>`;
}

export function runtimePickerResultListMarkup(
  items: readonly RuntimePickerItem[],
  kind: RuntimePickerKind,
  filters: RuntimePickerFilters,
  selectedId: string | null,
  limit = RUNTIME_PICKER_RESULT_LIMIT,
): { markup: string; total: number; shown: number } {
  const matches = filterRuntimePickerItems(items, kind, filters, Number.MAX_SAFE_INTEGER);
  const visible = matches.slice(0, limit);

  if (visible.length === 0) {
    return {
      markup: runtimePickerEmptyMarkup('No matching dataset items found.'),
      total: matches.length,
      shown: 0,
    };
  }

  return {
    total: matches.length,
    shown: visible.length,
    markup: visible.map((item) => `
      <button
        class="runtime-picker-result"
        type="button"
        data-runtime-picker-result="${escapeAttribute(item.id)}"
        aria-selected="${escapeAttribute(item.id === selectedId ? 'true' : 'false')}"
      >
        <span class="runtime-picker-result-name">${renderText(item.displayName)}</span>
        <span class="runtime-picker-result-detail">${renderText(detailText(item))}</span>
      </button>
    `).join(''),
  };
}

function previewMarkup(item: RuntimePickerItem | undefined): string {
  if (!item) {
    return runtimePickerEmptyMarkup('Select a result to preview values before applying.');
  }

  const rows = item.kind === 'cartridge'
    ? [
        ['Name', item.displayName],
        ['Type', item.type ?? 'Not specified'],
        ['Mass', formatNumber(item.massG, ' g') ?? 'Not available'],
        ['Compliance 10 Hz', formatNumber(item.compliance10HzCu, ' cu') ?? 'Not available'],
      ]
    : [
        ['Name', item.displayName],
        ['Effective mass', formatNumber(item.effectiveMassG, ' g') ?? 'Not available'],
      ];

  return `
    <span class="runtime-picker-preview-name">${renderText(item.displayName)}</span>
    <span class="runtime-picker-preview-detail">${renderText(detailText(item))}</span>
    <dl class="runtime-picker-preview-list">
      ${rows.map(([label, value]) => `
        <dt>${renderText(label)}</dt>
        <dd>${renderText(value)}</dd>
      `).join('')}
    </dl>
    <p class="runtime-picker-preview-note">Apply copies available values into Quick Match. Cancel, close and backdrop keep the current calculator values unchanged.</p>
  `;
}

function filterPanelMarkup(kind: RuntimePickerKind, filters: RuntimePickerFilters): string {
  const cartridgeFields = `
    <label class="runtime-picker-field">
      <span>Type contains</span>
      <input data-runtime-picker-filter="type" type="search" value="${escapeAttribute(filters.type)}" placeholder="Optional type filter" />
    </label>
    <div class="runtime-picker-filter-grid">
      <label class="runtime-picker-field">
        <span>Mass min, g</span>
        <input data-runtime-picker-filter="massMin" type="number" step="0.1" value="${escapeAttribute(filters.massMin ?? '')}" placeholder="min" />
      </label>
      <label class="runtime-picker-field">
        <span>Mass max, g</span>
        <input data-runtime-picker-filter="massMax" type="number" step="0.1" value="${escapeAttribute(filters.massMax ?? '')}" placeholder="max" />
      </label>
      <label class="runtime-picker-field">
        <span>Compliance min, cu</span>
        <input data-runtime-picker-filter="complianceMin" type="number" step="0.1" value="${escapeAttribute(filters.complianceMin ?? '')}" placeholder="min" />
      </label>
      <label class="runtime-picker-field">
        <span>Compliance max, cu</span>
        <input data-runtime-picker-filter="complianceMax" type="number" step="0.1" value="${escapeAttribute(filters.complianceMax ?? '')}" placeholder="max" />
      </label>
    </div>
  `;

  const tonearmFields = `
    <div class="runtime-picker-filter-grid">
      <label class="runtime-picker-field">
        <span>Effective mass min, g</span>
        <input data-runtime-picker-filter="effectiveMassMin" type="number" step="0.1" value="${escapeAttribute(filters.effectiveMassMin ?? '')}" placeholder="min" />
      </label>
      <label class="runtime-picker-field">
        <span>Effective mass max, g</span>
        <input data-runtime-picker-filter="effectiveMassMax" type="number" step="0.1" value="${escapeAttribute(filters.effectiveMassMax ?? '')}" placeholder="max" />
      </label>
    </div>
  `;

  return `
    <label class="runtime-picker-field">
      <span>Search</span>
      <input data-runtime-picker-filter="search" type="search" value="${escapeAttribute(filters.search)}" placeholder="${kind === 'cartridge' ? 'Search cartridges' : 'Search tonearms'}" />
    </label>
    ${kind === 'cartridge' ? cartridgeFields : tonearmFields}
  `;
}

function dialogMarkup(
  options: RuntimePickerModalOptions,
  filters: RuntimePickerFilters,
  draftSelectedId: string | null,
): string {
  const result = runtimePickerResultListMarkup(options.items, options.kind, filters, draftSelectedId);
  const selectedItem = options.items.find((item) => item.id === draftSelectedId);

  return `
    <div class="runtime-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="runtime-picker-title">
      <header class="runtime-picker-header">
        <h2 class="runtime-picker-title" id="runtime-picker-title">${renderText(options.title)}</h2>
        <button class="runtime-picker-close" type="button" data-runtime-picker-close aria-label="Close picker">×</button>
      </header>

      <div class="runtime-picker-body">
        <section class="runtime-picker-panel" aria-label="Search and filters">
          ${filterPanelMarkup(options.kind, filters)}
        </section>

        <section class="runtime-picker-panel" aria-label="Results">
          <p class="runtime-picker-count">${renderText(`${result.total} result${result.total === 1 ? '' : 's'}, showing first ${result.shown}`)}</p>
          <div class="runtime-picker-results">${result.markup}</div>
        </section>

        <section class="runtime-picker-panel" aria-label="Selected item preview">
          <h3>Selected preview</h3>
          ${previewMarkup(selectedItem)}
        </section>
      </div>

      <footer class="runtime-picker-footer">
        <button class="runtime-picker-cancel" type="button" data-runtime-picker-cancel>Cancel</button>
        <button class="runtime-picker-apply" type="button" data-runtime-picker-apply ${selectedItem ? '' : 'disabled'}>Apply</button>
      </footer>
    </div>
  `;
}

export function openRuntimePickerModal(options: RuntimePickerModalOptions): void {
  ensureRuntimePickerStyles();

  const overlay = document.createElement('div');
  overlay.className = 'runtime-picker-backdrop';
  document.body.append(overlay);

  let filters: RuntimePickerFilters = {
    search: '',
    type: '',
  };
  let draftSelectedId = options.appliedItemId ?? null;

  const close = () => {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const selectedPreviewPanel = (): HTMLElement | null =>
    Array.from(overlay.querySelectorAll<HTMLElement>('.runtime-picker-panel'))
      .find((panel) => panel.getAttribute('aria-label') === 'Selected item preview') ?? null;

  const renderDynamicRegions = () => {
    const result = runtimePickerResultListMarkup(
      options.items,
      options.kind,
      filters,
      draftSelectedId,
    );
    const selectedItem = options.items.find((item) => item.id === draftSelectedId);
    const countElement = overlay.querySelector<HTMLElement>('.runtime-picker-count');
    const resultsElement = overlay.querySelector<HTMLElement>('.runtime-picker-results');
    const previewPanel = selectedPreviewPanel();
    const applyButton = overlay.querySelector<HTMLButtonElement>('[data-runtime-picker-apply]');

    if (countElement) {
      countElement.textContent = `${result.total} result${result.total === 1 ? '' : 's'}, showing first ${result.shown}`;
    }

    if (resultsElement) {
      resultsElement.innerHTML = result.markup;
      resultsElement.querySelectorAll<HTMLButtonElement>('[data-runtime-picker-result]').forEach((button) => {
        button.addEventListener('click', () => {
          draftSelectedId = button.dataset.runtimePickerResult ?? null;
          renderDynamicRegions();
        });
      });
    }

    if (previewPanel) {
      previewPanel.innerHTML = `
        <h3>Selected preview</h3>
        ${previewMarkup(selectedItem)}
      `;
    }

    if (applyButton) {
      applyButton.disabled = !selectedItem;
    }
  };

  const bindStableControls = () => {
    overlay.querySelectorAll<HTMLInputElement>('[data-runtime-picker-filter]').forEach((input) => {
      input.addEventListener('input', () => {
        filters = readFilters(overlay);
        renderDynamicRegions();
      });
    });

    overlay.querySelector<HTMLButtonElement>('[data-runtime-picker-apply]')?.addEventListener('click', () => {
      const item = options.items.find((candidate) => candidate.id === draftSelectedId);
      if (!item) {
        return;
      }

      options.onApply(item);
      close();
    });

    overlay.querySelector<HTMLButtonElement>('[data-runtime-picker-cancel]')?.addEventListener('click', close);
    overlay.querySelector<HTMLButtonElement>('[data-runtime-picker-close]')?.addEventListener('click', close);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      close();
    }
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  document.addEventListener('keydown', onKeyDown);

  overlay.innerHTML = dialogMarkup(options, filters, draftSelectedId);
  bindStableControls();
  renderDynamicRegions();
  overlay.querySelector<HTMLInputElement>('[data-runtime-picker-filter="search"]')?.focus();
}
