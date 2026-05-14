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
import {
  enableMeasurementLabInteractions,
  renderMeasurementLabPage,
} from '../modules/measurement-lab';
import { renderMethodologyPage } from './methodology/renderMethodologyPage';
import { renderDataSourcesPage } from './data-sources/renderDataSourcesPage';
import { renderFaqPage } from './faq/renderFaqPage';

export type AppRoute = 'home' | 'tonearm-calculator' | 'compliance' | 'geometry-lab' | 'vta-sra-lab' | 'measurement-lab' | 'methodology' | 'data-sources' | 'faq';

const tonearmCalculatorPath = '/tonearm-calculator';
const tonearmCalculatorHash = '#/tonearm-calculator';
const compliancePath = '/compliance';
const complianceHash = '#/compliance';
const geometryLabPath = '/geometry-lab';
const geometryLabHash = '#/geometry-lab';
const vtaSraLabPath = '/vta-sra-lab';
const vtaSraLabHash = '#/vta-sra-lab';
const measurementLabPath = '/measurement-lab';
const measurementLabHash = '#/measurement-lab';
const methodologyPath = '/methodology';
const dataSourcesPath = '/data-sources';
const faqPath = '/faq';
const applicationRouteHashes = new Set([
  tonearmCalculatorHash,
  complianceHash,
  geometryLabHash,
  vtaSraLabHash,
  measurementLabHash,
]);
const applicationRoutePaths = new Set([
  '/',
  tonearmCalculatorPath,
  compliancePath,
  geometryLabPath,
  vtaSraLabPath,
  measurementLabPath,
  methodologyPath,
  dataSourcesPath,
  faqPath,
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

  if (hash === measurementLabHash || pathname === measurementLabPath) {
    return 'measurement-lab';
  }

  if (pathname === methodologyPath) {
    return 'methodology';
  }

  if (pathname === dataSourcesPath) {
    return 'data-sources';
  }

  if (pathname === faqPath) {
    return 'faq';
  }

  return 'home';
}

function updatePageMeta(title: string, description: string): void {
  document.title = title;
  const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDesc) {
    metaDesc.content = description;
  }
}

function renderRoute(app: HTMLElement, route: AppRoute): void {
  if (route === 'tonearm-calculator') {
    updatePageMeta(
      'Tonearm Match Lab – Engrove Audio Tools',
      'Calculate tonearm–cartridge resonance frequency from effective mass and compliance. Diagnose whether a combination is likely to track well, with provenance-tagged inputs.'
    );
    app.innerHTML = renderTonearmMatchLabPage();
    enableTonearmMatchLabInteractions();
    return;
  }

  if (route === 'compliance') {
    updatePageMeta(
      'Compliance Estimator – Engrove Audio Tools',
      'Convert manufacturer 100 Hz dynamic compliance to the 10 Hz quasi-static value used in the resonance equation. Compare compliance figures measured under different standards.'
    );
    app.innerHTML = renderComplianceEstimatorPage();
    enableComplianceEstimatorInteractions();
    return;
  }

  if (route === 'geometry-lab') {
    updatePageMeta(
      'Tonearm Geometry Lab – Engrove Audio Tools',
      'Compute ideal tonearm alignment for a chosen standard and method, simulate mounting errors against the math, and generate a print-ready arc protractor.'
    );
    app.innerHTML = renderTonearmGeometryLabPage();
    enableTonearmGeometryLabInteractions();
    return;
  }

  if (route === 'vta-sra-lab') {
    updatePageMeta(
      'VTA & SRA Lab – Engrove Audio Tools',
      'Solve stylus rake angle changes from tonearm pillar height and mat adjustments. Live SVG side profile with inverse solving for a target SRA delta.'
    );
    app.innerHTML = renderVtaSraLabPage();
    enableVtaSraLabInteractions();
    return;
  }

  if (route === 'measurement-lab') {
    updatePageMeta(
      'Measurement Lab – Engrove Audio Tools',
      'Capture audio from a test record via your ADC. Device selection, sample-rate honesty and live peak/RMS metering built on the S30A measurement foundation.'
    );
    app.innerHTML = renderMeasurementLabPage();
    enableMeasurementLabInteractions();
    return;
  }

  if (route === 'methodology') {
    updatePageMeta(
      'Methodology – Engrove Audio Tools',
      'Formulas, assumptions, compliance measurement standards (static, 100 Hz, 10 Hz), data confidence levels and known limitations behind the Engrove Audio Tools calculators.'
    );
    app.innerHTML = renderMethodologyPage();
    return;
  }

  if (route === 'data-sources') {
    updatePageMeta(
      'Data Sources – Engrove Audio Tools',
      'Origin, provenance flags, dataset versioning and known limitations for the cartridge and tonearm reference data used by Engrove Audio Tools.'
    );
    app.innerHTML = renderDataSourcesPage();
    return;
  }

  if (route === 'faq') {
    updatePageMeta(
      'FAQ – Engrove Audio Tools',
      'Answers to common questions about tonearm–cartridge matching, compliance, resonance frequency, alignment and how to use the Engrove Audio Tools calculators.'
    );
    app.innerHTML = renderFaqPage();
    return;
  }

  updatePageMeta(
    'Engrove Audio Tools 3.0',
    'Free browser-based DIY audio calculators for checking tonearm–cartridge resonance, estimating compliance, simulating alignment geometry, solving VTA and SRA, and planning better vinyl setups.'
  );
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
