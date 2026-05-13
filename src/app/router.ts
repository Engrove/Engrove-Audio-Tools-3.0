import { enableHomePageInteractions, renderHomePage } from './home/renderHomePage';
import {
  enableComplianceEstimatorInteractions,
  renderComplianceEstimatorPage,
} from '../modules/compliance-estimator';
import {
  enableTonearmMatchLabInteractions,
  renderTonearmMatchLabPage,
} from '../modules/tonearm-match-lab';
import {
  enableTonearmGeometryLabInteractions,
  renderTonearmGeometryLabPage,
} from '../modules/tonearm-geometry-lab';
import {
  enableVtaSraLabInteractions,
  renderVtaSraLabPage,
} from '../modules/vta-sra-lab';

export type AppRoute = 'home' | 'tonearm-calculator' | 'compliance' | 'geometry-lab' | 'vta-sra-lab';

const tonearmCalculatorPath = '/tonearm-calculator';
const tonearmCalculatorHash = '#/tonearm-calculator';
const compliancePath = '/compliance';
const complianceHash = '#/compliance';
const geometryLabPath = '/geometry-lab';
const geometryLabHash = '#/geometry-lab';
const vtaSraLabPath = '/vta-sra-lab';
const vtaSraLabHash = '#/vta-sra-lab';
const applicationRouteHashes = new Set([
  tonearmCalculatorHash,
  complianceHash,
  geometryLabHash,
  vtaSraLabHash,
]);
const applicationRoutePaths = new Set([
  '/',
  tonearmCalculatorPath,
  compliancePath,
  geometryLabPath,
  vtaSraLabPath,
]);

function normalizeRoute(pathname: string, hash: string): AppRoute {
  if (hash === tonearmCalculatorHash || pathname === tonearmCalculatorPath) {
    return 'tonearm-calculator';
  }

  if (hash === complianceHash || pathname === compliancePath) {
    return 'compliance';
  }

  if (hash === geometryLabHash || pathname === geometryLabPath) {
    return 'geometry-lab';
  }

  if (hash === vtaSraLabHash || pathname === vtaSraLabPath) {
    return 'vta-sra-lab';
  }

  return 'home';
}

function renderRoute(app: HTMLElement, route: AppRoute): void {
  if (route === 'tonearm-calculator') {
    app.innerHTML = renderTonearmMatchLabPage();
    enableTonearmMatchLabInteractions();
    return;
  }

  if (route === 'compliance') {
    app.innerHTML = renderComplianceEstimatorPage();
    enableComplianceEstimatorInteractions();
    return;
  }

  if (route === 'geometry-lab') {
    app.innerHTML = renderTonearmGeometryLabPage();
    enableTonearmGeometryLabInteractions();
    return;
  }

  if (route === 'vta-sra-lab') {
    app.innerHTML = renderVtaSraLabPage();
    enableVtaSraLabInteractions();
    return;
  }

  app.innerHTML = renderHomePage();
  enableHomePageInteractions();
}

function shouldIgnoreModifiedClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  return (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.target === '_blank' ||
    anchor.hasAttribute('download')
  );
}

function shouldLetBrowserHandleAnchor(anchor: HTMLAnchorElement, url: URL): boolean {
  const isSamePage = url.origin === window.location.origin && url.pathname === window.location.pathname;
  const isHashOnlyNavigation = url.hash.length > 0 && !applicationRouteHashes.has(url.hash);

  return isSamePage && isHashOnlyNavigation;
}

function isApplicationRoute(url: URL): boolean {
  if (url.origin !== window.location.origin) {
    return false;
  }

  if (applicationRouteHashes.has(url.hash)) {
    return true;
  }

  return applicationRoutePaths.has(url.pathname);
}

export function startRouter(selector = '#app'): void {
  const app = document.querySelector<HTMLElement>(selector);

  if (!app) {
    return;
  }

  const route = (): void => {
    renderRoute(app, normalizeRoute(window.location.pathname, window.location.hash));
  };

  document.addEventListener('click', (event) => {
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');

    if (!anchor || shouldIgnoreModifiedClick(event, anchor)) {
      return;
    }

    const url = new URL(anchor.href);

    if (shouldLetBrowserHandleAnchor(anchor, url) || !isApplicationRoute(url)) {
      return;
    }

    event.preventDefault();

    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    route();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', () => {
    if (applicationRouteHashes.has(window.location.hash)) {
      route();
    }
  });

  route();
}
