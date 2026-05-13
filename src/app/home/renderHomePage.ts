import packageJson from '../../../package.json';

const repoVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

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
    summary: 'Compute cantilever-arm resonance from cartridge compliance and tonearm effective mass, with provenance tracking and a closed classification vocabulary.',
    href: '/tonearm-calculator',
    ariaLabel: 'Open Tonearm Match Lab',
  },
  {
    id: 'Conversion',
    icon: '⇄',
    title: 'Compliance Estimator',
    summary: 'Convert manufacturer 100 Hz dynamic compliance to the 10 Hz quasi-static value used in the resonance equation.',
    href: '/compliance',
    ariaLabel: 'Open Compliance Estimator',
  },
  {
    id: 'Geometry',
    icon: '◎',
    title: 'Tonearm Geometry Lab',
    summary: 'Compute ideal alignment for a chosen standard and method, then simulate mounting errors against the math. Print-ready arc protractor.',
    href: '/geometry-lab',
    ariaLabel: 'Open Tonearm Geometry Lab',
  },
  {
    id: 'VTA / SRA',
    icon: '⌞',
    title: 'VTA & SRA Lab',
    summary: 'Solve stylus rake angle changes from pillar and mat adjustments. Live SVG side profile; inverse solve for a target SRA delta.',
    href: '/vta-sra-lab',
    ariaLabel: 'Open VTA and SRA Lab',
  },
  {
    id: 'Reference data',
    icon: '▤',
    title: 'Data Explorer',
    summary: 'Browse the cartridge and tonearm reference dataset with provenance flags and dataset-version pinning.',
    ariaLabel: 'Data Explorer is not routed in this build',
  },
];

function renderTopbar(active: 'tools' | 'match' | 'estimator'): string {
  const nav = [
    { key: 'tools', label: 'Tools', href: '/' },
    { key: 'match', label: 'Match Lab', href: '/tonearm-calculator' },
    { key: 'estimator', label: 'Estimator', href: '/compliance' },
  ];

  return `
    <header class="ea-topbar" aria-label="Primary navigation">
      <a class="ea-brand" href="/" aria-label="Engrove Audio Tools home">
        <span class="ea-brand-accent" aria-hidden="true">//</span>
        <span>Engrove Audio Tools</span>
      </a>
      <span class="ea-topbar-divider" aria-hidden="true"></span>
      <nav class="ea-topnav" aria-label="Tools navigation">
        ${nav.map((item) => `
          <a class="ea-topnav-link" href="${item.href}"${active === item.key ? ' aria-current="page"' : ''}>${item.label}</a>
        `).join('')}
      </nav>
      <div class="ea-topbar-meta">
        <span class="ea-build-status">Build v${repoVersion}</span>
        <button class="ea-theme-toggle" type="button" data-theme-toggle aria-label="Toggle light and dark theme">☼</button>
        <img class="ea-maintainer-avatar" src="/images/engrove.webp" alt="" aria-hidden="true" />
      </div>
    </header>
  `;
}

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
      ${renderTopbar('tools')}

      <main class="ea-home-main" aria-labelledby="home-title">
        <section class="ea-home-header">
          <h1 id="home-title">Engrove Audio Tools</h1>
          <p class="ea-home-header-sub">
            Precision tools and reference data for analog optimization. Select a tool to begin.
            Every tool is a workspace, not a page; every result is provenance-tagged and recomputes live.
          </p>
        </section>

        <section class="ea-tool-grid" aria-label="Audio tools">
          ${tools.map(renderToolCard).join('')}
        </section>
      </main>
    </div>
  `;
}

export function enableHomePageInteractions(): void {
  applyStoredTheme();

  document.querySelector<HTMLButtonElement>('[data-theme-toggle]')?.addEventListener('click', () => {
    toggleTheme();
  });
}
