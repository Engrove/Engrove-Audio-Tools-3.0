import { renderToolTopbar } from '../../shared/ui/renderToolTopbar';

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
    icon: '∿',
    title: 'Tonearm Match Lab',
    summary: 'Estimate cartridge–tonearm resonance and see whether the combination falls within a practical setup range.',
    href: '/tonearm-calculator',
    ariaLabel: 'Open Tonearm Match Lab',
  },
  {
    id: 'Conversion',
    icon: '⇄',
    title: 'Compliance Estimator',
    summary: 'Estimate the 10 Hz compliance value needed for cartridge–tonearm resonance calculations.',
    href: '/compliance',
    ariaLabel: 'Open Compliance Estimator',
  },
  {
    id: 'Geometry',
    icon: '◎',
    title: 'Tonearm Geometry Lab',
    summary: 'Calculate alignment geometry, null points, overhang and offset angle for a pivoted tonearm.',
    href: '/geometry-lab',
    ariaLabel: 'Open Tonearm Geometry Lab',
  },
  {
    id: 'VTA / SRA',
    icon: '⌞',
    title: 'VTA & SRA Lab',
    summary: 'Estimate stylus rake angle changes caused by tonearm height or mat thickness adjustments.',
    href: '/vta-sra-lab',
    ariaLabel: 'Open VTA and SRA Lab',
  },
  {
    id: 'Audio capture',
    icon: '◉',
    title: 'Measurement Lab',
    summary: 'Inspect speed, wow & flutter, channel balance and signal levels from test-record measurements.',
    href: '/measurement-lab',
    ariaLabel: 'Open Measurement Lab',
  },
  {
    id: 'Reference data',
    icon: '▤',
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

export function renderHomePage(): string {
  return `
    <div class="ea-site-shell">
      ${renderToolTopbar('tools')}

      <main class="ea-home-main" aria-labelledby="home-title">
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
      <footer class="ea-home-footer">
        Engrove Audio Tools 3.0 · Public work-in-progress · Reference data is best-effort
      </footer>
    </div>
  `;
}

export function enableHomePageInteractions(): void {
  applyStoredTheme();

  document.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.addEventListener('click', () => {
    toggleTheme();
  });
}
