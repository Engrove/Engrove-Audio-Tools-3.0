/*
 * Consent-gated analytics loader.
 *
 * The Cloudflare Web Analytics beacon is loaded unconditionally via index.html
 * because the provider documents it as cookieless and free of fingerprinting
 * or local-storage usage. Microsoft Clarity records session data subject to
 * GDPR / ePrivacy consent rules and must therefore only be loaded after the
 * user has explicitly opted in. This module is the only place that may load
 * Clarity in shipped code.
 *
 * Consent behavior:
 *   unknown  → Clarity is NOT loaded. Banner shown to user.
 *   denied   → Clarity is NOT loaded. Consent V2 denied sent if queue exists.
 *   granted  → Clarity IS loaded using the official snippet pattern.
 *              Consent V2 granted sent immediately after queue is initialised.
 */

const consentStorageKey = 'engrove-analytics-consent';
const clarityProjectId = 'wqtsdirx06';
const clarityScriptSrc = `https://www.clarity.ms/tag/${clarityProjectId}`;
const clarityScriptDataAttribute = 'data-engrove-clarity';

// Minimal Clarity queue type matching the official snippet signature.
type ClarityQueueFn = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    clarity?: ClarityQueueFn;
  }
}

export type AnalyticsConsentState = 'granted' | 'denied' | 'unknown';

function isAnalyticsConsentState(value: unknown): value is AnalyticsConsentState {
  return value === 'granted' || value === 'denied' || value === 'unknown';
}

export function readStoredAnalyticsConsent(): AnalyticsConsentState {
  try {
    const value = window.localStorage.getItem(consentStorageKey);
    return isAnalyticsConsentState(value) ? value : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function writeStoredAnalyticsConsent(state: AnalyticsConsentState): void {
  try {
    window.localStorage.setItem(consentStorageKey, state);
  } catch {
    /* localStorage may be unavailable; the consent is then effectively per-session. */
  }
}

function isClarityAlreadyLoaded(): boolean {
  return document.querySelector(`script[${clarityScriptDataAttribute}]`) !== null;
}

/*
 * Initialise window.clarity as a queuing stub if not already present.
 * This mirrors the official Clarity snippet: calls made before the async
 * script finishes loading are buffered and replayed once it does.
 */
function initClarityQueue(): void {
  if (!window.clarity) {
    const fn: ClarityQueueFn = (...args: unknown[]) => {
      fn.q = fn.q ?? [];
      fn.q.push(args);
    };
    window.clarity = fn;
  }
}

/*
 * Load the Clarity script using the official snippet pattern:
 * queue stub first, then async script inserted before the first <script> tag.
 */
function appendClarityScript(): void {
  if (isClarityAlreadyLoaded()) return;
  initClarityQueue();
  const script = document.createElement('script');
  script.async = true;
  script.src = clarityScriptSrc;
  script.setAttribute(clarityScriptDataAttribute, 'true');
  const first = document.getElementsByTagName('script')[0];
  if (first?.parentNode) {
    first.parentNode.insertBefore(script, first);
  } else {
    document.head.appendChild(script);
  }
}

/*
 * Send Clarity Consent V2. The call is no-op if window.clarity is not yet
 * initialised (e.g. denied state before any script load).
 */
export function applyClarityConsentV2(state: AnalyticsConsentState): void {
  if (typeof window.clarity !== 'function') return;
  if (state === 'granted') {
    window.clarity('consentv2', { ad_Storage: 'granted', analytics_Storage: 'granted' });
  } else if (state === 'denied') {
    window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
  }
}

/*
 * Apply the given consent state: load Clarity if granted, send Consent V2
 * in both grant and deny directions.
 * For unknown state nothing is done — the banner will ask the user.
 */
export function applyAnalyticsConsent(state: AnalyticsConsentState): void {
  if (state === 'granted') {
    appendClarityScript();
    applyClarityConsentV2('granted');
  } else if (state === 'denied') {
    applyClarityConsentV2('denied');
  }
}

/*
 * Boot-time application of stored consent. Called by the app shell.
 * Default is effectively deny: Clarity is not loaded until explicit consent.
 */
export function bootAnalyticsConsent(): AnalyticsConsentState {
  const state = readStoredAnalyticsConsent();
  applyAnalyticsConsent(state);
  return state;
}
