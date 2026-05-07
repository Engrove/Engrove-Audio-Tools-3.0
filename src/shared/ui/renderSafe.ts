const htmlEscapePattern = /[&<>"']/g;

const htmlEscapeMap: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function renderableString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  try {
    return String(value);
  } catch {
    return '';
  }
}

export function escapeHtml(value: unknown): string {
  return renderableString(value).replace(
    htmlEscapePattern,
    (character) => htmlEscapeMap[character] ?? character,
  );
}

export function escapeAttribute(value: unknown): string {
  return escapeHtml(value);
}

export function renderText(value: unknown): string {
  return escapeHtml(value);
}
