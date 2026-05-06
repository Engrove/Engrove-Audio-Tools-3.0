
type ToolCard = {
  title: string;
  status: 'Live seed' | 'Next' | 'Planned';
  description: string;
  href: string;
};

const tools: ToolCard[] = [
  {
    title: 'Data Explorer',
    status: 'Live seed',
    description: 'A public, clean data browser for cartridges, tonearms and shared component data.',
    href: '#data-explorer',
  },
  {
    title: 'Resonance Calculator',
    status: 'Next',
    description: 'Estimate cartridge/tonearm resonance with clear guidance and public-friendly results.',
    href: '#resonance-calculator',
  },
  {
    title: 'Compliance Estimator',
    status: 'Next',
    description: 'Convert and estimate compliance values with transparent assumptions.',
    href: '#compliance-estimator',
  },
  {
    title: 'Tonearm Designer',
    status: 'Planned',
    description: 'A productized public tool rebuilt from validated prototype functionality, not copied UI.',
    href: '#tonearm-designer',
  },
];

function toolCard(tool: ToolCard): string {
  return `
    <article class="ea-card ea-tool-card" id="${tool.href.slice(1)}">
      <div class="ea-tool-card__preview" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div class="ea-card__body ea-stack">
        <div class="ea-cluster ea-tool-card__meta">
          <span class="ea-badge ea-badge--accent">${tool.status}</span>
        </div>
        <h3>${tool.title}</h3>
        <p>${tool.description}</p>
        <a class="ea-button ea-button--secondary" href="${tool.href}" aria-label="Open ${tool.title} placeholder">
          Open placeholder
        </a>
      </div>
    </article>
  `;
}

export function renderHomePage(mount: HTMLElement): void {
  mount.innerHTML = `
    <div class="ea-app-shell">
      <header class="ea-header">
        <div class="ea-header__inner">
          <a class="ea-brand" href="/" aria-label="Engrove Audio home">
            <span class="ea-brand__mark">EA</span>
            <span>Engrove Audio</span>
          </a>
          <nav class="ea-nav" aria-label="Primary">
            <a href="#tools">Tools</a>
            <a href="#platform">Platform</a>
            <a href="#launch">Launch</a>
          </nav>
        </div>
      </header>

      <section class="ea-hero">
        <div class="ea-page ea-hero__grid">
          <div class="ea-stack">
            <p class="ea-kicker">Engrove Audio Tools 3.0</p>
            <h1>Public audio tools, rebuilt for real users.</h1>
            <p class="ea-lead">
              A clean Cloudflare-ready platform for cartridge, tonearm and vinyl setup tools.
              Prototype functions are refined into focused public modules with shared data and a consistent UI.
            </p>
            <div class="ea-cluster">
              <a class="ea-button ea-button--primary" href="#tools">Explore tools</a>
              <a class="ea-button ea-button--secondary" href="#launch">View deploy status</a>
            </div>
          </div>

          <aside class="ea-panel ea-launch-panel" id="launch" aria-label="Deployment status">
            <p class="ea-kicker">Cloudflare chain</p>
            <h2>Ready for first sync</h2>
            <dl class="ea-status-list">
              <div><dt>Repository</dt><dd>Engrove-Audio-Tools-3.0</dd></div>
              <div><dt>Build</dt><dd><code>npm run build</code></dd></div>
              <div><dt>Output</dt><dd><code>dist</code></dd></div>
              <div><dt>Host</dt><dd>Cloudflare Pages</dd></div>
            </dl>
            <p class="ea-muted">
              Push this start page to <code>main</code> to verify GitHub → Cloudflare Pages deployment.
            </p>
          </aside>
        </div>
      </section>

      <section class="ea-page ea-section" id="tools">
        <div class="ea-section-heading">
          <p class="ea-kicker">Modules</p>
          <h2>Shared platform, separate tools.</h2>
          <p class="ea-muted">
            Each tool will be rebuilt as a public module with shared data contracts, clear copy and mobile-aware workflows.
          </p>
        </div>
        <div class="ea-module-grid">
          ${tools.map(toolCard).join('')}
        </div>
      </section>

      <section class="ea-page ea-section" id="platform">
        <div class="ea-split">
          <div class="ea-stack">
            <p class="ea-kicker">Product rule</p>
            <h2>Functions transfer. Prototype UI does not.</h2>
            <p class="ea-muted">
              Local file:// tools remain workshop sources. The public site gets the validated math, data contracts and
              workflows rebuilt through Engrove's standard UI/UX.
            </p>
          </div>
          <div class="ea-panel">
            <ul class="ea-check-list">
              <li>Modular architecture from day one</li>
              <li>Shared cartridge, tonearm and materials data layer</li>
              <li>Cloudflare Pages deployment target</li>
              <li>Mobile-compressed public flows</li>
              <li>Advanced controls only where they help</li>
            </ul>
          </div>
        </div>
      </section>

      <footer class="ea-footer">
        <div class="ea-page ea-footer__inner">
          <span>Engrove Audio Tools 3.0</span>
          <span>Bootstrap start page for Cloudflare Pages sync.</span>
        </div>
      </footer>
    </div>
  `;
}
