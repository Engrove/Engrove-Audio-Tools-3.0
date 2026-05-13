/*
 * Unified parser for numeric input fields.
 *
 * Accepts both decimal point and decimal comma. Returns a tagged result so
 * callers can distinguish:
 *   - blank        : the field is empty and the caller should render an
 *                    "input needed" state, not silently fall back to zero
 *                    or the previous value.
 *   - invalid      : the field contains something that is not a finite number
 *                    or violates a sign/range constraint. The caller should
 *                    mark the field aria-invalid and refuse to compute.
 *   - ok           : a valid finite number, ready to use.
 */

export type ParseNumberOptions = {
  readonly allowNegative?: boolean;
  readonly allowZero?: boolean;
};

export type ParseNumberResult =
  | { readonly kind: 'ok'; readonly value: number }
  | { readonly kind: 'blank' }
  | { readonly kind: 'invalid'; readonly reason: 'not-a-number' | 'negative' | 'zero' };

const decimalCommaPattern = /,/g;

export function parseNumberInput(
  raw: string | null | undefined,
  options: ParseNumberOptions = {},
): ParseNumberResult {
  if (raw === null || raw === undefined) {
    return { kind: 'blank' };
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return { kind: 'blank' };
  }

  const normalized = trimmed.replace(decimalCommaPattern, '.');
  const value = Number(normalized);

  if (!Number.isFinite(value)) {
    return { kind: 'invalid', reason: 'not-a-number' };
  }

  if (!options.allowNegative && value < 0) {
    return { kind: 'invalid', reason: 'negative' };
  }

  if (!options.allowZero && value === 0) {
    return { kind: 'invalid', reason: 'zero' };
  }

  return { kind: 'ok', value };
}

/*
 * Read a number from an HTMLInputElement and set its aria-invalid attribute
 * to match the parse result. Convenience for the common "validate one
 * required positive input" case in workbench tools.
 */
export function readNumberFromInput(
  input: HTMLInputElement | null,
  options: ParseNumberOptions = {},
): ParseNumberResult {
  if (!input) {
    return { kind: 'blank' };
  }
  const result = parseNumberInput(input.value, options);
  if (result.kind === 'ok') {
    input.removeAttribute('aria-invalid');
  } else {
    input.setAttribute('aria-invalid', 'true');
  }
  return result;
}
