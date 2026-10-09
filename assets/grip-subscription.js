/**
 * <grip-subscription> — Subscribe & Save selector.
 *
 * The radios are UI only (no `form` attribute), so FormData ignores them.
 * The single hidden `selling_plan` input is linked to the buy-buttons form and
 * is disabled for one-time purchase, so nothing empty is posted.
 *
 * Customizer-safe: all listeners are tied to an AbortController created in
 * connectedCallback and aborted in disconnectedCallback, so section reloads
 * (shopify:section:load / unload) never leave duplicate listeners behind.
 */
class GripSubscription extends HTMLElement {
  /** @type {AbortController | undefined} */
  #controller;

  /** @type {MutationObserver | undefined} */
  #observer;

  connectedCallback() {
    this.#controller = new AbortController();

    this.addEventListener(
      'change',
      (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        if (!target.matches('.grip-subscription__radio')) return;
        this.#apply(true);
      },
      { signal: this.#controller.signal }
    );

    // Horizon's product-price.js replaces the price container on variant change,
    // which would wipe our subscription price. Re-apply after each replacement.
    const priceHost = this.closest('.shopify-section')?.querySelector('product-price');
    if (priceHost && this.#syncEnabled) {
      this.#observer = new MutationObserver(() => this.#apply(false));
      this.#observer.observe(priceHost, { childList: true });
    }

    this.#apply(false);
  }

  disconnectedCallback() {
    this.#controller?.abort();
    this.#observer?.disconnect();
  }

  /** @returns {string} The selected selling plan id, or '' for one-time purchase. */
  get selectedPlanId() {
    return this.#checkedRadio?.value ?? '';
  }

  get #syncEnabled() {
    return this.dataset.syncPrice === 'true';
  }

  /** @returns {HTMLInputElement | null} */
  get #checkedRadio() {
    return this.querySelector('.grip-subscription__radio:checked');
  }

  /** @param {boolean} announce */
  #apply(announce) {
    const radio = this.#checkedRadio;
    /** @type {HTMLInputElement | null} */
    const hidden = this.querySelector('[data-grip-selling-plan]');
    if (!radio || !hidden) return;

    const planId = radio.value;
    hidden.value = planId;
    hidden.disabled = planId === '';
    this.dataset.mode = planId ? 'subscription' : 'one-time';

    if (this.#syncEnabled) this.#syncPrice(radio.dataset.price ?? '', planId !== '');

    if (announce) {
      const live = this.querySelector('[data-grip-live]');
      const label = radio.closest('label');
      if (live && label) live.textContent = label.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }

    this.dispatchEvent(
      new CustomEvent('grip:selling-plan-change', {
        bubbles: true,
        detail: { sellingPlanId: planId },
      })
    );
  }

  /**
   * @param {string} priceText - Price already formatted by Liquid
   * @param {boolean} isSubscription
   */
  #syncPrice(priceText, isSubscription) {
    if (!priceText) return;

    const container = this.closest('.shopify-section')?.querySelector('product-price [ref="priceContainer"]');
    if (!container) return;

    const priceEl = container.querySelector('.price');
    if (!priceEl) return;

    // Idempotent: only touch the DOM when the visible price differs.
    if (priceEl.textContent?.trim().endsWith(priceText)) return;

    const hiddenLabel = priceEl.querySelector('.visually-hidden');
    priceEl.replaceChildren(...(hiddenLabel ? [hiddenLabel, ' '] : []), priceText);

    for (const compare of container.querySelectorAll('.compare-at-price')) {
      /** @type {HTMLElement} */ (compare).hidden = isSubscription;
    }
  }
}

if (!customElements.get('grip-subscription')) {
  customElements.define('grip-subscription', GripSubscription);
}
