/**
 * <grip-belt-rail> — horizontal belt rail.
 *
 * - Enables/disables the previous/next buttons at the scroll ends.
 * - Scrolls one belt at a time (instant under prefers-reduced-motion).
 * - In the theme editor, scrolls a selected belt block into view.
 * - Notify-me fallback: if Shopify's customer form state can't tell which belt
 *   was submitted, reveal the success message for the last-submitted belt.
 *
 * Customizer-safe: per-instance listeners use an AbortController and a
 * ResizeObserver that are torn down in disconnectedCallback.
 */
const NOTIFY_STORAGE_KEY = 'grip-notify-block';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class GripBeltRail extends HTMLElement {
  /** @type {AbortController | undefined} */
  #controller;

  /** @type {ResizeObserver | undefined} */
  #resizeObserver;

  connectedCallback() {
    this.#controller = new AbortController();
    const { signal } = this.#controller;
    const track = this.#track;
    if (!track) return;

    track.addEventListener('scroll', () => this.#updateButtons(), { passive: true, signal });

    for (const button of this.querySelectorAll('.grip-belt-rail__button')) {
      button.addEventListener('click', () => this.#scrollByItem(Number(button.getAttribute('data-direction'))), {
        signal,
      });
    }

    this.addEventListener('submit', (event) => this.#rememberNotify(event), { signal });

    this.#resizeObserver = new ResizeObserver(() => this.#updateButtons());
    this.#resizeObserver.observe(track);

    this.#updateButtons();
    this.#revealNotifyFallback();
  }

  disconnectedCallback() {
    this.#controller?.abort();
    this.#resizeObserver?.disconnect();
  }

  /** @returns {HTMLElement | null} */
  get #track() {
    return this.querySelector('.grip-belt-rail__track');
  }

  #updateButtons() {
    const track = this.#track;
    if (!track) return;

    const maxScroll = track.scrollWidth - track.clientWidth;
    const atStart = track.scrollLeft <= 1;
    const atEnd = track.scrollLeft >= maxScroll - 1;

    for (const button of this.querySelectorAll('.grip-belt-rail__button')) {
      const direction = Number(button.getAttribute('data-direction'));
      /** @type {HTMLButtonElement} */ (button).disabled = direction < 0 ? atStart : atEnd;
    }
  }

  /** @param {number} direction */
  #scrollByItem(direction) {
    const track = this.#track;
    const item = track?.querySelector('.grip-belt');
    if (!track || !item) return;

    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    track.scrollBy({
      left: direction * (item.getBoundingClientRect().width + gap),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  /** @param {Event} event */
  #rememberNotify(event) {
    const form = /** @type {HTMLElement} */ (event.target);
    const blockId = form.getAttribute('data-grip-notify');
    if (!blockId) return;

    try {
      sessionStorage.setItem(NOTIFY_STORAGE_KEY, blockId);
    } catch {
      // Storage unavailable (private mode): the server-rendered message still applies.
    }
  }

  #revealNotifyFallback() {
    // A card's notify form lives in a collapsed <details>: open any card whose
    // server-rendered success or error message is visible so the shopper sees it.
    for (const visible of this.querySelectorAll('.grip-notify__message:not([hidden])')) {
      visible.closest('details')?.setAttribute('open', '');
    }

    if (window.Shopify?.designMode) return;

    let blockId = null;
    try {
      blockId = sessionStorage.getItem(NOTIFY_STORAGE_KEY);
    } catch {
      return;
    }
    if (!blockId) return;

    const params = new URL(window.location.href).searchParams;
    if (params.get('customer_posted') !== 'true') return;

    // Server already isolated the message: nothing more to do.
    if (this.querySelector('.grip-notify__message:not([hidden])')) {
      sessionStorage.removeItem(NOTIFY_STORAGE_KEY);
      return;
    }

    const message = this.querySelector(`#GripNotifySuccess-${CSS.escape(blockId)}`);
    if (!message) return;

    message.closest('details')?.setAttribute('open', '');
    /** @type {HTMLElement} */ (message).hidden = false;
    /** @type {HTMLElement} */ (message).focus({ preventScroll: true });
    message.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    sessionStorage.removeItem(NOTIFY_STORAGE_KEY);
  }
}

if (!customElements.get('grip-belt-rail')) {
  customElements.define('grip-belt-rail', GripBeltRail);

  // Theme editor: bring the selected belt into view inside the rail.
  document.addEventListener('shopify:block:select', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!target.closest?.('grip-belt-rail')) return;
    target.scrollIntoView({ inline: 'start', block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });
}
