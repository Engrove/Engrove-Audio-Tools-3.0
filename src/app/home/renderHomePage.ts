import packageJson from '../../../package.json';

const repoVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

type ToolCard = {
  title: string;
  summary: string;
  status: string;
  href: string;
  actionLabel: string;
};

const tools: readonly ToolCard[] = [
  {
    title: 'Tonearm Match Lab',
    summary: 'Estimate cartridge-tonearm resonance from effective mass and compliance.',
    status: 'Available',
    href: '/tonearm-calculator',
    actionLabel: 'Open Tonearm Match Lab',
  },
];

function formatLastUpdatedHint(): string {
  const modified = new Date(document.lastModified);

  if (Number.isNaN(modified.getTime())) {
    return 'updated recently';
  }

  return `updated ${modified.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })}`;
}

function footerMeta(): string {
  return `
    <span class="ea-footer__meta" title="Package version and browser-provided document timestamp">
      <span>v${repoVersion}</span>
      <span aria-hidden="true">·</span>
      <span>${formatLastUpdatedHint()}</span>
    </span>
  `;
}

function toolCards(): string {
  return tools
    .map(
      (tool) => `
        <article class="ea-tool-card">
          <p class="ea-tool-card__status">${tool.status}</p>
          <h3>${tool.title}</h3>
          <p>${tool.summary}</p>
          <a class="ea-tool-card__link" href="${tool.href}" aria-label="${tool.actionLabel}">
            ${tool.actionLabel}
          </a>
        </article>
      `,
    )
    .join('');
}

export function renderHomePage(): string {
  return `
    <div class="ea-site-shell">
      <div class="ea-scroll-affordance" aria-hidden="true"></div>

      <header class="ea-topbar" aria-label="Primary navigation">
        <a class="ea-wordmark" href="/" aria-label="Engrove Audio home">
          <img class="ea-wordmark__mark" src="/images/engrove.webp" alt="" aria-hidden="true" />
          <span class="ea-wordmark__text">Engrove Audio</span>
        </a>

        <nav class="ea-nav" aria-label="Main navigation">
          <a href="#tools">Tools</a>
        </nav>

        <button class="ea-theme-toggle" type="button" data-theme-toggle aria-label="Toggle light and dark theme">
          <span aria-hidden="true">◐</span>
        </button>
      </header>

      <main class="ea-home-main">
        <section class="ea-tool-index-header ea-page" aria-labelledby="home-title">
          <h1 id="home-title">Engrove Audio Tools</h1>
          <p>Audio setup calculators and reference tools.</p>
        </section>

        <section class="ea-page ea-section" id="tools" aria-labelledby="tools-title">
          <div class="ea-section-heading">
            <h2 id="tools-title">Tools</h2>
            <p>Open the available calculator from the index.</p>
          </div>

          <div class="ea-tool-grid">
            ${toolCards()}
          </div>
        </section>
      </main>

      <footer class="ea-footer">
        <span>Engrove Audio Tools 3.0</span>
        ${footerMeta()}
        <span>Workbench index</span>
      </footer>
    </div>
  `;
}

function updateScrollAffordance(): void {
  const scrollElement = document.scrollingElement ?? document.documentElement;
  const maxScroll = Math.max(0, scrollElement.scrollHeight - window.innerHeight);
  const isScrollable = maxScroll > 4;

  document.documentElement.toggleAttribute('data-page-scrollable', isScrollable);

  if (!isScrollable) {
    document.documentElement.style.setProperty('--ea-scroll-progress', '0%');
    return;
  }

  const rawProgress = scrollElement.scrollTop / maxScroll;
  const progress = Math.min(1, Math.max(0, rawProgress));
  const visibleProgress = Math.max(0.08, progress);
  document.documentElement.style.setProperty('--ea-scroll-progress', `${visibleProgress * 100}%`);
}

function bindScrollAffordance(): void {
  let rafId = 0;

  const scheduleUpdate = (): void => {
    if (rafId) {
      return;
    }

    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      updateScrollAffordance();
    });
  };

  updateScrollAffordance();

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.setTimeout(updateScrollAffordance, 250);
  window.setTimeout(updateScrollAffordance, 1000);
}

export function enableHomePageInteractions(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  const root = document.documentElement;
  const stored = localStorage.getItem('engrove-theme');

  if (stored === 'light' || stored === 'dark') {
    root.dataset.theme = stored;
  }

  button?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    localStorage.setItem('engrove-theme', next);
    updateScrollAffordance();
  });

  bindScrollAffordance();
}
