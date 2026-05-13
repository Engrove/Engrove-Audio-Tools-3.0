/*
 * Consent-gated analytics loader.
 *
 * The Cloudflare Web Analytics beacon is loaded unconditionally via index.html
 * because the provider documents it as cookieless and free of fingerprinting
 * or local-storage usage. Microsoft Clarity records session data subject to
 * GDPR / ePrivacy consent rules and must therefore only be loaded after the
 * user has explicitly opted in. This module is the only place that may load
 * Clarity in shipped code.
 */

const consentStorageKey = 'engrove-analytics-consent';
const clarityProjectId = 'wpyhxqzalt';
const clarityScriptSrc = `https://www.clarity.ms/tag/${clarityProjectId}`;
const clarityScriptDataAttribute = 'data-engrove-clarity';

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

function appendClarityScript(): void {
  if (isClarityAlreadyLoaded()) {
    return;
  }
  const script = document.createElement('script');
  script.async = true;
  script.src = clarityScriptSrc;
  script.setAttribute(clarityScriptDataAttribute, 'true');
  document.head.appendChild(script);
}

export function applyAnalyticsConsent(state: AnalyticsConsentState): void {
  if (state === 'granted') {
    appendClarityScript();
  }
}

/*
 * Boot-time application of stored consent. Called by the app shell. If no
 * stored consent exists the default is deny: Clarity is not loaded until a
 * future consent UI explicitly grants it via writeStoredAnalyticsConsent
 * followed by applyAnalyticsConsent.
 */
export function bootAnalyticsConsent(): AnalyticsConsentState {
  const state = readStoredAnalyticsConsent();
  applyAnalyticsConsent(state);
  return state;
}
