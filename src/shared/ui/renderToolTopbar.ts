import { buildVersionLabel } from '../app/buildVersion';

export type ToolRouteKey = 'tools' | 'match' | 'estimator' | 'geometry' | 'vta' | 'measurement';

type NavItem = {
  readonly key: ToolRouteKey;
  readonly label: string;
  readonly href: string;
};

const navItems: readonly NavItem[] = [
  { key: 'tools', label: 'Tools', href: '/' },
  { key: 'match', label: 'Match Lab', href: '/tonearm-calculator' },
  { key: 'estimator', label: 'Estimator', href: '/compliance' },
  { key: 'geometry', label: 'Geometry Lab', href: '/geometry-lab' },
  { key: 'vta', label: 'VTA Lab', href: '/vta-sra-lab' },
  { key: 'measurement', label: 'Measurement Lab', href: '/measurement-lab' },
];

function navLink(item: NavItem, active: ToolRouteKey): string {
  const current = item.key === active ? ' aria-current="page"' : '';
  return `<a class="ea-topnav-link" href="${item.href}"${current}>${item.label}</a>`;
}

export function renderToolTopbar(active: ToolRouteKey): string {
  return `
    <header class="ea-topbar" aria-label="Primary navigation">
      <a class="ea-brand" href="/" aria-label="Engrove Audio Tools home">
        <span class="ea-brand-accent" aria-hidden="true">//</span>
        <span>Engrove Audio Tools</span>
      </a>
      <span class="ea-topbar-divider" aria-hidden="true"></span>
      <nav class="ea-topnav" aria-label="Tools navigation">
        ${navItems.map((item) => navLink(item, active)).join('')}
      </nav>
      <div class="ea-topbar-meta">
        <span class="ea-build-status">${buildVersionLabel()}</span>
        <button class="ea-theme-toggle" type="button" data-theme-toggle aria-label="Toggle light and dark theme">&#9788;</button>
        <img class="ea-maintainer-avatar" src="/images/engrove.webp" alt="" aria-hidden="true" />
      </div>
    </header>
  `;
}
