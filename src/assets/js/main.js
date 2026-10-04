/**
 * Jarvees Infotech: core interactions. Deliberately small.
 *
 * - header hairline once the page scrolls (an IntersectionObserver, no scroll listener);
 * - mobile menu with focus trap and Escape to close;
 * - one-off entrances for .rv elements as they reach the viewport.
 *
 * No canvas, no pointer effects, no animation loops. Content renders fully
 * without this file, and prefers-reduced-motion turns the entrances off.
 */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, ctx = doc) => ctx.querySelector(sel);
  const $$ = (sel, ctx = doc) => Array.from(ctx.querySelectorAll(sel));

  /** Shared API for page scripts (courses.js, contact.js). */
  window.Jarvees = {
    motionOK,
    lockScroll: () => root.classList.add('is-locked'),
    unlockScroll: () => root.classList.remove('is-locked'),
  };

  /** Hairline under the header once the top of the page has scrolled away. */
  function initHeader() {
    const header = $('[data-header]');
    if (!header || !('IntersectionObserver' in window)) return;
    const sentinel = doc.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:8px;pointer-events:none';
    doc.body.prepend(sentinel);
    new IntersectionObserver(([entry]) => header.classList.toggle('is-scrolled', !entry.isIntersecting)).observe(sentinel);
  }

  /** Full-screen mobile menu. */
  function initMobileNav() {
    const toggle = $('[data-menu-toggle]');
    const panel = $('[data-mobile-nav]');
    if (!toggle || !panel) return;
    let open = false;
    let timer = 0;

    const setOpen = (next) => {
      if (next === open) return;
      open = next;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      root.classList.toggle('menu-open', open);
      clearTimeout(timer);
      if (open) {
        panel.hidden = false;
        requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-open')));
        window.Jarvees.lockScroll();
        timer = setTimeout(() => $('a', panel)?.focus({ preventScroll: true }), motionOK ? 200 : 0);
      } else {
        panel.classList.remove('is-open');
        window.Jarvees.unlockScroll();
        timer = setTimeout(() => (panel.hidden = true), motionOK ? 300 : 0);
      }
    };

    toggle.addEventListener('click', () => setOpen(!open));
    panel.addEventListener('click', (e) => e.target.closest('a') && setOpen(false));
    doc.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'Escape') {
        setOpen(false);
        toggle.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [toggle, ...$$('a[href], button', panel)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!items.includes(doc.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    matchMedia('(min-width: 1025px)').addEventListener('change', (e) => e.matches && setOpen(false));
  }

  /** Entrances: each .rv element fades up once. Groups marked data-stagger cascade. */
  function initReveal() {
    for (const group of $$('[data-stagger]')) {
      const step = Number(group.dataset.stagger) || 70;
      Array.from(group.children).forEach((child, i) => {
        child.classList.add('rv');
        child.style.setProperty('--d', `${Math.min(i, 6) * step}ms`);
      });
    }
    const targets = $$('.rv');
    if (!motionOK || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    targets.forEach((el) => io.observe(el));
  }

  function boot() {
    initHeader();
    initMobileNav();
    initReveal();
  }

  if (doc.prerendering) doc.addEventListener('prerenderingchange', boot, { once: true });
  else boot();
})();
