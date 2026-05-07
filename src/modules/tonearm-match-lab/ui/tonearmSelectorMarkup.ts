import { escapeAttribute, renderText } from '../../../shared/ui/renderSafe';
import type { CartridgeRuntimeRecord, TonearmRuntimeRecord } from '../data/loadTonearmRuntimeData';

export type SelectorKind = 'cartridge' | 'tonearm';
export type SelectorRuntimeRecord = CartridgeRuntimeRecord | TonearmRuntimeRecord;

function numericDetail(record: SelectorRuntimeRecord, kind: SelectorKind): string {
  if (kind === 'cartridge') {
    const cartridge = record as CartridgeRuntimeRecord;
    const details = [
      typeof cartridge.mass_g === 'number' ? `${cartridge.mass_g} g` : undefined,
      typeof cartridge.compliance_10hz_cu === 'number' ? `${cartridge.compliance_10hz_cu} cu @10 Hz` : undefined,
    ].filter(Boolean);
    return details.length > 0 ? details.join(' · ') : 'No match values available';
  }

  const tonearm = record as TonearmRuntimeRecord;
  return typeof tonearm.effective_mass_g === 'number'
    ? `${tonearm.effective_mass_g} g effective mass`
    : 'No match values available';
}

export function selectorEmptyMarkup(message: unknown): string {
  return `<p class="tm-runtime-selector__empty">${renderText(message)}</p>`;
}

export function selectorListMarkup(
  records: readonly SelectorRuntimeRecord[],
  kind: SelectorKind,
): string {
  if (records.length === 0) {
    return selectorEmptyMarkup('No match-ready results found.');
  }

  return records
    .map((record) => {
      const detail = numericDetail(record, kind);
      return `
        <button
          class="tm-runtime-selector__option"
          type="button"
          data-runtime-selector-option="${escapeAttribute(kind)}"
          data-runtime-id="${escapeAttribute(record.id)}"
        >
          <span class="tm-runtime-selector__option-name">${renderText(record.display_name)}</span>
          <span class="tm-runtime-selector__option-detail">${renderText(detail)}</span>
        </button>
      `;
    })
    .join('');
}
