import { renderToolTopbar } from '../../shared/ui/renderToolTopbar';
import { renderDataSubmissionLink } from '../../shared/ui/dataSubmissionLinks';
import { openHelpModal } from '../../shared/ui/helpModal';

const icons = {
  match: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1" y1="18" x2="21" y2="18" stroke-width="1"/><path d="M1 17C5 17 7 17 9 11C10 8 10.5 6 11 6C11.5 6 12 8 13 11C15 17 17 17 21 17"/><line x1="8" y1="9" x2="8" y2="18" stroke-dasharray="2 1.5" stroke-width="1"/><line x1="14" y1="9" x2="14" y2="18" stroke-dasharray="2 1.5" stroke-width="1"/></svg>`,
  compliance: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="11" y1="2" x2="11" y2="4.5"/><polyline points="11,4.5 15.5,6.5 6.5,9.5 15.5,12.5 6.5,15.5 11,17.5"/><line x1="11" y1="17.5" x2="11" y2="20"/><line x1="8" y1="20" x2="14" y2="20"/></svg>`,
  geometry: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4" cy="19" r="1.5" fill="currentColor" stroke="none"/><line x1="4" y1="19" x2="17" y2="5"/><path d="M11 3A17 17 0 0 1 20 13"/><line x1="4" y1="19" x2="21" y2="19" stroke-width="1"/></svg>`,
  vta: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1" y1="18" x2="21" y2="18"/><line x1="15" y1="4" x2="7" y2="18"/><path d="M10 18A4 4 0 0 0 9 14" stroke-width="1"/></svg>`,
  measurement: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><line x1="1" y1="19" x2="21" y2="19" stroke-width="1"/><line x1="3" y1="19" x2="3" y2="15"/><line x1="6.5" y1="19" x2="6.5" y2="7"/><line x1="10" y1="19" x2="10" y2="11"/><line x1="13.5" y1="19" x2="13.5" y2="5"/><line x1="17" y1="19" x2="17" y2="9"/><line x1="20.5" y1="19" x2="20.5" y2="14"/></svg>`,
  data: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="18" height="16" rx="1.5"/><line x1="2" y1="8" x2="20" y2="8"/><line x1="8" y1="8" x2="8" y2="19"/><line x1="2" y1="13" x2="20" y2="13"/></svg>`,
};

type ToolCard = {
  id: string;
  icon: string;
  title: string;
  summary: string;
  href?: string;
  ariaLabel: string;
};

const tools: readonly ToolCard[] = [
  {
    id: 'System matching',
    icon: icons.match,
    title: 'Tonearm Match Lab',
    summary: 'Estimate cartridge–tonearm resonance and see whether the combination falls within a practical setup range.',
    href: '/tonearm-calculator',
    ariaLabel: 'Open Tonearm Match Lab',
  },
  {
    id: 'Conversion',
    icon: icons.compliance,
    title: 'Compliance Estimator',
    summary: 'Estimate the 10 Hz compliance value needed for cartridge–tonearm resonance calculations.',
    href: '/compliance',
    ariaLabel: 'Open Compliance Estimator',
  },
  {
    id: 'Geometry',
    icon: icons.geometry,
    title: 'Tonearm Geometry Lab',
    summary: 'Calculate alignment geometry, null points, overhang and offset angle for a pivoted tonearm.',
    href: '/geometry-lab',
    ariaLabel: 'Open Tonearm Geometry Lab',
  },
  {
    id: 'VTA / SRA',
    icon: icons.vta,
    title: 'VTA & SRA Lab',
    summary: 'Estimate stylus rake angle changes caused by tonearm height or mat thickness adjustments.',
    href: '/vta-sra-lab',
    ariaLabel: 'Open VTA and SRA Lab',
  },
  {
    id: 'Audio capture',
    icon: icons.measurement,
    title: 'Measurement Lab',
    summary: 'Inspect speed, wow & flutter, channel balance and signal levels from test-record measurements.',
    href: '/measurement-lab',
    ariaLabel: 'Open Measurement Lab',
  },
  {
    id: 'Reference data',
    icon: icons.data,
    title: 'Data Explorer',
    summary: 'Browse cartridge and tonearm reference data to find useful setup values, compare specifications and support your calculations across the tools.',
    ariaLabel: 'Data Explorer — coming soon',
  },
];

function renderToolCard(tool: ToolCard): string {
  const content = `
    <span class="ea-tool-card-head">
      <span class="ea-tool-card-icon" aria-hidden="true">${tool.icon}</span>
      <span class="ea-tool-card-id">${tool.id}</span>
    </span>
    <span class="ea-tool-card-title">${tool.title}</span>
    <span class="ea-tool-card-desc">${tool.summary}</span>
  `;

  if (tool.href) {
    return `<a class="ea-tool-card" href="${tool.href}" aria-label="${tool.ariaLabel}">${content}</a>`;
  }

  return `<article class="ea-tool-card" aria-disabled="true" aria-label="${tool.ariaLabel}">${content}</article>`;
}

function storedTheme(): 'light' | 'dark' | null {
  const stored = localStorage.getItem('engrove-theme');
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function applyStoredTheme(): void {
  const theme = storedTheme();
  if (theme) {
    document.documentElement.dataset.theme = theme;
  }
}

function toggleTheme(): void {
  const root = document.documentElement;
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  localStorage.setItem('engrove-theme', next);
}

function renderWelcomeBanner(): string {
  return `
    <div class="welcome-banner" data-welcome-banner aria-label="Welcome message" role="note">
      <p class="welcome-banner__text">New here? Start with the help guide or choose a tool below.</p>
      <div class="welcome-banner__actions">
        <button class="ea-button ea-button--ghost" type="button" data-welcome-help>Open help</button>
        <button class="ea-button ea-button--ghost" type="button" data-welcome-dismiss>Dismiss</button>
      </div>
    </div>
  `;
}

export function renderHomePage(): string {
  return `
    <div class="ea-site-shell">
      ${renderToolTopbar('tools')}

      <main class="ea-home-main" aria-labelledby="home-title">
        ${renderWelcomeBanner()}
        <section class="ea-home-header">
          <h1 id="home-title">Engrove Audio Tools</h1>
          <p class="ea-home-header-sub">
            Precision setup tools for turntable, tonearm and cartridge optimisation.
            Use these tools to estimate cartridge–tonearm resonance, convert compliance figures, calculate tonearm alignment, understand VTA/SRA changes and inspect measurements from test records.
          </p>
        </section>

        <section class="ea-tool-grid" aria-label="Audio tools">
          ${tools.map(renderToolCard).join('')}
        </section>
      </main>
      <footer class="ea-home-footer app-footer">
        <span>Engrove Audio Tools 3.0</span>
        <span class="app-footer-separator" aria-hidden="true">·</span>
        <span>Public work-in-progress</span>
        <span class="app-footer-separator" aria-hidden="true">·</span>
        <span>Reference data is best-effort</span>
        <span class="app-footer-separator" aria-hidden="true">·</span>
        ${renderDataSubmissionLink({ kind: 'choose', label: 'Missing your gear? Submit data here' })}
      </footer>
    </div>
  `;
}

const WELCOME_BANNER_KEY = 'engrove.welcomeBanner.dismissed';

function shouldShowWelcomeBanner(): boolean {
  try {
    return localStorage.getItem(WELCOME_BANNER_KEY) !== 'true';
  } catch {
    return false;
  }
}

function dismissWelcomeBanner(): void {
  try {
    localStorage.setItem(WELCOME_BANNER_KEY, 'true');
  } catch {
    /* localStorage may be unavailable */
  }
  document.querySelector<HTMLElement>('[data-welcome-banner]')?.remove();
}

export function enableHomePageInteractions(): void {
  applyStoredTheme();

  document.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.addEventListener('click', () => {
    toggleTheme();
  });

  const banner = document.querySelector<HTMLElement>('[data-welcome-banner]');
  if (banner) {
    if (!shouldShowWelcomeBanner()) {
      banner.remove();
    } else {
      document.querySelector<HTMLButtonElement>('[data-welcome-help]')?.addEventListener('click', () => {
        openHelpModal();
      });
      document.querySelector<HTMLButtonElement>('[data-welcome-dismiss]')?.addEventListener('click', () => {
        dismissWelcomeBanner();
      });
    }
  }
}
