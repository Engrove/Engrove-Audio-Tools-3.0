import {
  applyAnalyticsConsent,
  readStoredAnalyticsConsent,
  writeStoredAnalyticsConsent,
} from './analytics';

const bannerId = 'engrove-consent-banner';

function removeBanner(): void {
  document.getElementById(bannerId)?.remove();
}

function renderBannerHtml(): string {
  return `
    <div id="${bannerId}" class="ea-consent-banner" role="dialog" aria-label="Analytics consent" aria-modal="false">
      <div class="ea-consent-banner__body">
        <p class="ea-consent-banner__text">
          Engrove Audio Tools uses
          <strong>Microsoft Clarity</strong>
          to record anonymised session data (mouse movements, clicks, scroll depth) so we can improve the tools.
          No audio data or personally identifiable information is collected.
          You can withdraw consent at any time by clearing your browser storage.
        </p>
        <div class="ea-consent-banner__actions">
          <button class="ea-button ea-button--primary ea-consent-banner__accept" type="button" data-consent-accept>
            Accept
          </button>
          <button class="ea-button ea-button--ghost ea-consent-banner__decline" type="button" data-consent-decline>
            No thanks
          </button>
        </div>
      </div>
    </div>
  `;
}

export function mountConsentBanner(): void {
  if (readStoredAnalyticsConsent() !== 'unknown') {
    return;
  }

  if (document.getElementById(bannerId)) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderBannerHtml().trim();
  const banner = wrapper.firstElementChild as HTMLElement;
  document.body.appendChild(banner);

  banner.querySelector('[data-consent-accept]')?.addEventListener('click', () => {
    writeStoredAnalyticsConsent('granted');
    applyAnalyticsConsent('granted');
    removeBanner();
  });

  banner.querySelector('[data-consent-decline]')?.addEventListener('click', () => {
    writeStoredAnalyticsConsent('denied');
    removeBanner();
  });
}
