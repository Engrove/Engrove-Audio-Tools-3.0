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
    title: 'Alignment Calculator',
    summary: 'Visualize tonearm alignment choices and compare geometry families with clear setup guidance.',
    status: 'Planned module',
    href: '#tools',
    actionLabel: 'Learn more',
  },
  {
    title: 'Resonance Calculator',
    summary: 'Check whether a cartridge and tonearm combination lands in the safe resonance window.',
    status: 'Available foundation',
    href: '/tonearm-calculator',
    actionLabel: 'Open Tonearm Match Lab',
  },
  {
    title: 'Compliance Estimator',
    summary: 'Convert and estimate compliance values without forcing users into spreadsheet-style workflows.',
    status: 'Planned module',
    href: '#tools',
    actionLabel: 'Learn more',
  },
  {
    title: 'Data Explorer',
    summary: 'Search cartridges, tonearms and related component data from a shared curated database.',
    status: 'Foundation module',
    href: '#tools',
    actionLabel: 'Learn more',
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
          <a href="#platform">Platform</a>
          <a href="#launch">Launch</a>
        </nav>

        <button class="ea-theme-toggle" type="button" data-theme-toggle aria-label="Toggle light and dark theme">
          <span aria-hidden="true">◐</span>
        </button>
      </header>

      <main>
        <section class="ea-hero" aria-labelledby="hero-title">
          <div class="ea-hero__backdrop" aria-hidden="true"></div>

          <div class="ea-hero__content">
            <p class="ea-kicker">Engrove Audio Tools 3.0</p>
            <h1 id="hero-title">Precision Tools for the Analog Enthusiast.</h1>
            <p class="ea-hero__lead">
              A clean public toolkit for cartridge, tonearm and vinyl setup.
              Prototype functions are rebuilt into focused modules with shared data and a consistent UI.
            </p>
            <div class="ea-hero__actions">
              <a class="ea-button ea-button--primary" href="#tools">Explore the Tools</a>
              <a class="ea-button ea-button--secondary" href="#platform">View Platform</a>
            </div>
          </div>
        </section>

        <section class="ea-page ea-section" id="tools" aria-labelledby="tools-title">
          <div class="ea-section-heading">
            <p class="ea-kicker">Toolbox</p>
            <h2 id="tools-title">Focused tools, shared foundation.</h2>
            <p>Each public tool is rebuilt from validated workshop functions, not copied from prototype UI.</p>
          </div>

          <div class="ea-tool-grid">
            ${toolCards()}
          </div>
        </section>

        <section class="ea-page ea-section ea-platform-section" id="platform" aria-labelledby="platform-title">
          <div class="ea-platform-copy">
            <p class="ea-kicker">Platform</p>
            <h2 id="platform-title">Built as modules from day one.</h2>
            <p>
              Engrove Audio Tools 3.0 separates public UI, shared data, domain calculations and deploy logic.
              That keeps the public site approachable while allowing expert-grade engines behind the scenes.
            </p>
          </div>

          <div class="ea-platform-panel">
            <dl>
              <div>
                <dt>Frontend</dt>
                <dd>Vite + TypeScript</dd>
              </div>
              <div>
                <dt>Host</dt>
                <dd>Cloudflare Pages</dd>
              </div>
              <div>
                <dt>Public URL</dt>
                <dd>engrove-toolbox.pages.dev</dd>
              </div>
              <div>
                <dt>Policy</dt>
                <dd>Function transfer, UI rebuild</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="ea-page ea-section" id="launch" aria-labelledby="launch-title">
          <div class="ea-launch-panel">
            <p class="ea-kicker">Launch chain</p>
            <h2 id="launch-title">GitHub to Cloudflare is live.</h2>
            <p>This landing page proves the public deployment chain before the first real module is added.</p>
            <ul class="ea-check-list">
              <li>GitHub repository connected</li>
              <li>Cloudflare Pages deployment verified</li>
              <li>Workers static-assets fallback verified</li>
              <li>Public productization rules established</li>
            </ul>
          </div>
        </section>
      </main>

      <footer class="ea-footer">
        <span>Engrove Audio Tools 3.0</span>
        ${footerMeta()}
        <span>Public productization track</span>
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
