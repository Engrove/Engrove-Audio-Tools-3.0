import { enableHomePageInteractions, renderHomePage } from './home/renderHomePage';
import {
  enableTonearmMatchLabInteractions,
  renderTonearmMatchLabPage,
} from '../modules/tonearm-match-lab';

export type AppRoute = 'home' | 'tonearm-calculator';

const tonearmCalculatorPath = '/tonearm-calculator';
const tonearmCalculatorHash = '#/tonearm-calculator';

function normalizeRoute(pathname: string, hash: string): AppRoute {
  if (hash === tonearmCalculatorHash || pathname === tonearmCalculatorPath) {
    return 'tonearm-calculator';
  }

  return 'home';
}

function renderRoute(app: HTMLElement, route: AppRoute): void {
  if (route === 'tonearm-calculator') {
    app.innerHTML = renderTonearmMatchLabPage();
    enableTonearmMatchLabInteractions();
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
  const isHashOnlyNavigation = url.hash.length > 0 && url.hash !== tonearmCalculatorHash;

  return isSamePage && isHashOnlyNavigation;
}

function isApplicationRoute(url: URL): boolean {
  if (url.origin !== window.location.origin) {
    return false;
  }

  if (url.hash === tonearmCalculatorHash) {
    return true;
  }

  return url.pathname === '/' || url.pathname === tonearmCalculatorPath;
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
    if (window.location.hash === tonearmCalculatorHash) {
      route();
    }
  });

  route();
}
