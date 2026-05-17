const STYLE_ID = 'engrove-mobile-notice-styles';
const SESSION_KEY = 'engrove-mobile-desktop-notice-dismissed';

let dismissedInMemory = false;

function isDismissed(): boolean {
  if (dismissedInMemory) return true;
  try {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function markDismissed(): void {
  dismissedInMemory = true;
  try {
    sessionStorage.setItem(SESSION_KEY, 'true');
  } catch {
    /* sessionStorage may be unavailable */
  }
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.ea-mobile-notice-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: clamp(0.75rem, 4vw, 2rem);
  background: var(--ea-bg-modal-scrim, rgba(0, 0, 0, 0.75));
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: ea-mobile-notice-fade-in 0.18s ease;
}

@keyframes ea-mobile-notice-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.ea-mobile-notice-dialog {
  width: min(400px, 100%);
  border: 1px solid var(--ea-border-primary);
  border-radius: var(--ea-radius-lg);
  background: var(--ea-bg-panel);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.48);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ea-mobile-notice-header {
  display: flex;
  align-items: center;
  gap: var(--ea-space-3);
  padding: var(--ea-space-4) var(--ea-space-5);
  border-bottom: 1px solid var(--ea-border-primary);
  background: var(--ea-bg-panel-header);
}

.ea-mobile-notice-title {
  font-family: var(--ea-font-ui);
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ea-text-high);
  margin: 0;
  flex: 1;
}

.ea-mobile-notice-body {
  padding: var(--ea-space-5);
  font-family: var(--ea-font-ui);
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ea-text-medium);
}

.ea-mobile-notice-body p {
  margin: 0 0 var(--ea-space-3) 0;
}

.ea-mobile-notice-body p:last-child {
  margin-bottom: 0;
}

.ea-mobile-notice-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--ea-space-3) var(--ea-space-5) var(--ea-space-4);
}

.ea-mobile-notice-btn {
  font-family: var(--ea-font-ui);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ea-interactive-accent);
  background: var(--ea-interactive-accent-soft, transparent);
  border: 1px solid var(--ea-interactive-accent);
  border-radius: calc(var(--ea-radius-lg) / 2);
  padding: var(--ea-space-2) var(--ea-space-4);
  cursor: pointer;
  transition: opacity 0.12s;
}

.ea-mobile-notice-btn:hover {
  opacity: 0.8;
}

.ea-mobile-notice-btn:focus-visible {
  outline: 2px solid var(--ea-interactive-accent);
  outline-offset: 2px;
}
`;
  document.head.appendChild(style);
}

function createNotice(): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'ea-mobile-notice-backdrop';

  backdrop.innerHTML = `
<div
  class="ea-mobile-notice-dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="ea-mobile-notice-title"
  aria-describedby="ea-mobile-notice-desc"
>
  <div class="ea-mobile-notice-header">
    <h2 class="ea-mobile-notice-title" id="ea-mobile-notice-title">Optimized for desktop</h2>
  </div>
  <div class="ea-mobile-notice-body" id="ea-mobile-notice-desc">
    <p>This application is designed for use on a PC or desktop computer. Some tools — especially the Measurement Lab — require an audio interface, line-in connection, or phono chain that is typically only available in a desktop setup.</p>
    <p>You can still browse on a smaller screen, but for the full experience we recommend switching to a desktop.</p>
  </div>
  <div class="ea-mobile-notice-footer">
    <button class="ea-mobile-notice-btn" type="button" id="ea-mobile-notice-dismiss">Got it</button>
  </div>
</div>
`;

  function dismiss(): void {
    markDismissed();
    backdrop.remove();
    document.removeEventListener('keydown', handleKey);
  }

  function handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  }

  backdrop.querySelector<HTMLButtonElement>('#ea-mobile-notice-dismiss')!
    .addEventListener('click', dismiss);

  document.addEventListener('keydown', handleKey);

  return backdrop;
}

export function mountMobileDesktopNotice(): void {
  if (!window.matchMedia('(max-width: 767px)').matches) return;
  if (isDismissed()) return;

  injectStyles();
  const notice = createNotice();
  document.body.appendChild(notice);

  requestAnimationFrame(() => {
    const btn = notice.querySelector<HTMLButtonElement>('#ea-mobile-notice-dismiss');
    btn?.focus();
  });
}
