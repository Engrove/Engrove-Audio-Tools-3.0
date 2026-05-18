import { escapeHtml } from './renderSafe';

export type WebReportSection = {
  readonly id: string;
  readonly title: string;
  readonly html: string;
};

export type WebReportPayload = {
  readonly title: string;
  readonly subtitle?: string;
  readonly generatedAt: string;
  readonly sections: readonly WebReportSection[];
};

const MODAL_STYLE_ID = 'engrove-webreport-modal-styles';
const MODAL_ROOT_ID = 'engrove-webreport-modal-root';

const webReportCss = `
@page {
  size: A4;
  margin: 14mm;
}

.ea-webreport-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: grid;
  place-items: center;
  padding: clamp(0.75rem, 3vw, 2rem);
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: ea-webreport-fade-in 0.15s ease;
}

@keyframes ea-webreport-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.ea-webreport-dialog {
  width: min(860px, 100%);
  max-height: min(90vh, 900px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid var(--ea-border-primary);
  border-radius: var(--ea-radius-lg);
  background: var(--ea-bg-panel);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.48);
  overflow: hidden;
}

.ea-webreport-header {
  display: flex;
  align-items: center;
  gap: var(--ea-space-3);
  padding: var(--ea-space-4) var(--ea-space-5);
  border-bottom: 1px solid var(--ea-border-primary);
  background: var(--ea-bg-panel-header);
  flex-shrink: 0;
}

.ea-webreport-header-titles {
  flex: 1;
  min-width: 0;
}

.ea-webreport-header-title {
  margin: 0;
  color: var(--ea-text-high);
  font-family: var(--ea-font-data);
  font-size: var(--ea-font-size-body);
  font-weight: 700;
  letter-spacing: var(--ea-letter-label);
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ea-webreport-header-meta {
  margin: 2px 0 0;
  color: var(--ea-text-low);
  font-size: var(--ea-text-sm);
}

.ea-webreport-header-actions {
  display: flex;
  align-items: center;
  gap: var(--ea-space-2);
  flex-shrink: 0;
}

.ea-webreport-btn {
  height: 28px;
  padding: 0 var(--ea-space-3);
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--ea-border-primary);
  border-radius: var(--ea-radius-sm);
  background: transparent;
  color: var(--ea-text-high);
  font-family: var(--ea-font-data);
  font-size: var(--ea-text-sm);
  font-weight: 500;
  letter-spacing: var(--ea-letter-label);
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.1s;
}

.ea-webreport-btn:hover {
  background: var(--ea-bg-hover, rgba(255,255,255,0.06));
}

.ea-webreport-btn--print {
  border-color: var(--ea-interactive-accent, #3b82f6);
  color: var(--ea-interactive-accent, #3b82f6);
}

.ea-webreport-btn--close {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 1rem;
}

.ea-webreport-scroll {
  overflow-y: auto;
  padding: var(--ea-space-5);
}

.ea-webreport-section {
  margin-bottom: var(--ea-space-6);
}

.ea-webreport-section:last-child {
  margin-bottom: 0;
}

.ea-webreport-section-title {
  margin: 0 0 var(--ea-space-3);
  padding-bottom: var(--ea-space-2);
  border-bottom: 1px solid var(--ea-border-primary);
  color: var(--ea-text-high);
  font-family: var(--ea-font-data);
  font-size: var(--ea-font-size-body);
  font-weight: 700;
  letter-spacing: var(--ea-letter-label);
  text-transform: uppercase;
}

.ea-webreport-section-body {
  color: var(--ea-text-mid);
  font-size: var(--ea-text-sm);
  line-height: 1.6;
}

.ea-webreport-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ea-text-sm);
  margin: var(--ea-space-2) 0;
}

.ea-webreport-table th,
.ea-webreport-table td {
  padding: var(--ea-space-1) var(--ea-space-2);
  text-align: left;
  border-bottom: 1px solid var(--ea-border-low, rgba(255,255,255,0.08));
  vertical-align: top;
}

.ea-webreport-table th {
  color: var(--ea-text-low);
  font-weight: 600;
  white-space: nowrap;
}

.ea-webreport-kv {
  display: grid;
  grid-template-columns: minmax(160px, max-content) 1fr;
  gap: var(--ea-space-1) var(--ea-space-4);
  margin: var(--ea-space-2) 0;
  align-items: baseline;
}

.ea-webreport-kv-key {
  color: var(--ea-text-low);
  font-weight: 500;
}

.ea-webreport-kv-val {
  color: var(--ea-text-mid);
  word-break: break-word;
}

.ea-webreport-empty {
  color: var(--ea-text-low);
  font-style: italic;
}

.ea-webreport-warning {
  color: var(--ea-color-warn, #f59e0b);
}

.ea-webreport-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64px;
  border: 1px dashed var(--ea-border-low, rgba(255,255,255,0.15));
  border-radius: var(--ea-radius);
  color: var(--ea-text-low);
  font-style: italic;
  font-size: var(--ea-text-sm);
  margin: var(--ea-space-2) 0;
}

.ea-webreport-badge {
  display: inline-block;
  padding: 1px var(--ea-space-2);
  border-radius: var(--ea-radius-sm);
  font-size: 0.7em;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  vertical-align: middle;
  margin-left: var(--ea-space-1);
}

.ea-webreport-badge--ok   { background: rgba(34,197,94,0.15);  color: #22c55e; }
.ea-webreport-badge--warn { background: rgba(245,158,11,0.15); color: #f59e0b; }
.ea-webreport-badge--err  { background: rgba(239,68,68,0.15);  color: #ef4444; }
.ea-webreport-badge--info { background: rgba(59,130,246,0.15); color: #3b82f6; }
.ea-webreport-badge--exp  { background: rgba(168,85,247,0.15); color: #a855f7; }

.ea-webreport-note {
  padding: var(--ea-space-2) var(--ea-space-3);
  border-left: 3px solid var(--ea-border-low);
  background: var(--ea-bg-subtle, rgba(255,255,255,0.03));
  color: var(--ea-text-low);
  font-size: var(--ea-text-sm);
  margin: var(--ea-space-2) 0;
}

.ea-webreport-note--warn {
  border-left-color: var(--ea-color-warn, #f59e0b);
}

.ea-webreport-note--err {
  border-left-color: var(--ea-color-error, #ef4444);
}

/* ── Print / A4 ──────────────────────────────────────────────── */

@media print {
  body > *:not(#engrove-webreport-modal-root) {
    display: none !important;
  }

  .ea-webreport-backdrop {
    position: static;
    padding: 0;
    background: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    animation: none;
    display: block;
  }

  .ea-webreport-dialog {
    width: 100%;
    max-height: none;
    display: block;
    border: none;
    border-radius: 0;
    box-shadow: none;
    background: #fff;
    color: #000;
    overflow: visible;
  }

  .ea-webreport-header {
    padding: 0 0 8mm;
    border-bottom: 1px solid #ccc;
    background: #fff;
  }

  .ea-webreport-header-title {
    color: #000;
    font-size: 14pt;
  }

  .ea-webreport-header-meta {
    color: #555;
    font-size: 9pt;
  }

  .ea-webreport-header-actions {
    display: none;
  }

  .ea-webreport-scroll {
    overflow: visible;
    padding: 8mm 0 0;
  }

  .ea-webreport-section {
    page-break-inside: avoid;
    break-inside: avoid;
    margin-bottom: 8mm;
  }

  .ea-webreport-section-title {
    page-break-after: avoid;
    break-after: avoid;
    color: #000;
    border-bottom-color: #ccc;
    font-size: 11pt;
  }

  .ea-webreport-section-body {
    color: #222;
    font-size: 9pt;
  }

  .ea-webreport-table th,
  .ea-webreport-table td {
    border-bottom-color: #ddd;
    color: #000;
  }

  .ea-webreport-table th {
    color: #555;
  }

  .ea-webreport-table tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .ea-webreport-kv-key { color: #555; }
  .ea-webreport-kv-val { color: #000; }

  .ea-webreport-empty     { color: #777; }
  .ea-webreport-warning   { color: #b45309; }

  .ea-webreport-placeholder {
    border-color: #ccc;
    color: #777;
  }

  .ea-webreport-badge--ok   { background: #dcfce7; color: #15803d; }
  .ea-webreport-badge--warn { background: #fef3c7; color: #92400e; }
  .ea-webreport-badge--err  { background: #fee2e2; color: #b91c1c; }
  .ea-webreport-badge--info { background: #dbeafe; color: #1d4ed8; }
  .ea-webreport-badge--exp  { background: #f3e8ff; color: #7e22ce; }

  .ea-webreport-note {
    border-left-color: #ccc;
    background: #f9f9f9;
    color: #555;
  }

  .ea-webreport-note--warn { border-left-color: #b45309; }
  .ea-webreport-note--err  { border-left-color: #b91c1c; }

  /* ── Freq chart print overrides ─── */
  .ea-webreport-freq-chart-wrap {
    margin: 4mm 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .mlab-freq-chart {
    max-width: 100%;
  }

  .mlab-freq-grid       { stroke: #ccc; }
  .mlab-freq-grid--zero { stroke: #888; stroke-width: 1.5; }
  .mlab-freq-axis-label { fill: #555; }
  .mlab-freq-response   { stroke: #1d4ed8; stroke-width: 1.5; }
  .mlab-freq-riaa       { stroke: #888; }

  .mlab-freq-legend          { color: #555; }
  .mlab-freq-legend-swatch   { background: #1d4ed8; }
  .mlab-freq-legend-swatch--dashed { border-top-color: #888; }
}
`;

function injectStyles(): void {
  if (document.getElementById(MODAL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MODAL_STYLE_ID;
  style.textContent = webReportCss;
  document.head.appendChild(style);
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function openWebReportModal(payload: WebReportPayload): void {
  injectStyles();

  document.getElementById(MODAL_ROOT_ID)?.remove();

  const sectionsHtml = payload.sections
    .map(
      (s) => `
    <section class="ea-webreport-section" id="webreport-section-${escapeHtml(s.id)}">
      <h2 class="ea-webreport-section-title">${escapeHtml(s.title)}</h2>
      <div class="ea-webreport-section-body">${s.html}</div>
    </section>`,
    )
    .join('');

  const metaLine = payload.subtitle
    ? escapeHtml(payload.subtitle)
    : `Generated ${escapeHtml(formatDateTime(payload.generatedAt))}`;

  const modalHtml = `
    <div id="${MODAL_ROOT_ID}" role="dialog" aria-modal="true" aria-label="${escapeHtml(payload.title)}">
      <div class="ea-webreport-backdrop" data-webreport-backdrop>
        <div class="ea-webreport-dialog">
          <header class="ea-webreport-header">
            <div class="ea-webreport-header-titles">
              <h1 class="ea-webreport-header-title">${escapeHtml(payload.title)}</h1>
              <p class="ea-webreport-header-meta">${metaLine}</p>
            </div>
            <div class="ea-webreport-header-actions">
              <button class="ea-webreport-btn ea-webreport-btn--print" type="button" data-webreport-print aria-label="Print or save as PDF">Print / Save as PDF</button>
              <button class="ea-webreport-btn ea-webreport-btn--close" type="button" data-webreport-close aria-label="Close report">✕</button>
            </div>
          </header>
          <div class="ea-webreport-scroll" role="document">
            ${sectionsHtml}
          </div>
        </div>
      </div>
    </div>`;

  const container = document.createElement('div');
  container.innerHTML = modalHtml;
  const root = container.firstElementChild as HTMLElement;
  document.body.appendChild(root);

  const closeBtn = root.querySelector<HTMLButtonElement>('[data-webreport-close]');
  closeBtn?.focus();

  function close(): void {
    root.remove();
    document.removeEventListener('keydown', handleKey);
  }

  closeBtn?.addEventListener('click', close);

  root
    .querySelector<HTMLElement>('[data-webreport-backdrop]')
    ?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close();
    });

  root
    .querySelector<HTMLButtonElement>('[data-webreport-print]')
    ?.addEventListener('click', () => {
      window.print();
    });

  function handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }
  document.addEventListener('keydown', handleKey);
}
