/**
 * Jarvees Academy course catalogue:
 * track filters, live search, shareable URLs (?cat=, ?q=, #course-id)
 * and the accessible course-details dialog.
 */
(() => {
  'use strict';

  const doc = document;
  const App = window.Jarvees || { motionOK: true, lockScroll() {}, unlockScroll() {} };

  function init() {
    const grid = doc.querySelector('[data-course-grid]');
    const search = doc.querySelector('[data-course-search]');
    if (!grid || !search) return;

    const cards = Array.from(grid.querySelectorAll('[data-course]'));
    const chips = Array.from(doc.querySelectorAll('[data-filter]'));
    const count = doc.querySelector('[data-course-count]');
    const empty = doc.querySelector('[data-course-empty]');
    const reset = doc.querySelector('[data-course-reset]');
    const validCats = new Set(chips.map((chip) => chip.dataset.filter));

    /* ---------------- Filter state ---------------- */
    const params = new URLSearchParams(location.search);
    let cat = validCats.has(params.get('cat')) ? params.get('cat') : 'all';
    let query = (params.get('q') || '').trim();
    search.value = query;

    const syncUrl = () => {
      const url = new URL(location.href);
      if (cat === 'all') url.searchParams.delete('cat');
      else url.searchParams.set('cat', cat);
      if (query) url.searchParams.set('q', query);
      else url.searchParams.delete('q');
      history.replaceState(history.state, '', url);
    };

    /** Show matching cards; `reveal` forces entrance state for cards shown by user filtering. */
    const apply = (reveal = true) => {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const card of cards) {
        const match = (cat === 'all' || card.dataset.cat === cat) && terms.every((t) => card.dataset.search.includes(t));
        card.hidden = !match;
        if (match) {
          shown += 1;
          if (reveal) card.classList.add('is-in', 'is-done');
        }
      }
      count.textContent = String(shown);
      empty.hidden = shown !== 0;
      chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.filter === cat)));
    };

    /** Animate layout changes with the View Transitions API where supported. */
    const animate = (fn) => {
      if (!App.motionOK || typeof doc.startViewTransition !== 'function') {
        fn();
        return;
      }
      const root = doc.documentElement;
      const name = (card) => (card.hidden ? '' : `course-${card.id}`);
      cards.forEach((card) => (card.style.viewTransitionName = name(card)));
      root.classList.add('vt-filter');
      const transition = doc.startViewTransition(() => {
        fn();
        cards.forEach((card) => (card.style.viewTransitionName = name(card)));
      });
      transition.finished.finally(() => {
        cards.forEach((card) => (card.style.viewTransitionName = ''));
        root.classList.remove('vt-filter');
      });
    };

    apply(false);

    chips.forEach((chip) =>
      chip.addEventListener('click', () => {
        if (cat === chip.dataset.filter) return;
        cat = chip.dataset.filter;
        animate(() => apply());
        syncUrl();
      })
    );

    let searchTimer = 0;
    search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        query = search.value.trim();
        apply();
        syncUrl();
      }, 120);
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && search.value) {
        search.value = '';
        query = '';
        apply();
        syncUrl();
      }
    });

    reset?.addEventListener('click', () => {
      cat = 'all';
      query = '';
      search.value = '';
      animate(() => apply());
      syncUrl();
      search.focus();
    });

    /* ---------------- Details dialog ---------------- */
    const dialog = doc.querySelector('[data-course-dialog]');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const el = (sel) => dialog.querySelector(sel);
    const dTitle = el('[data-dialog-title]');
    const dSub = el('[data-dialog-sub]');
    const dCat = el('[data-dialog-cat]');
    const dBody = el('[data-dialog-body]');
    const dEnquire = el('[data-dialog-enquire]');
    const dWhatsApp = el('[data-dialog-whatsapp]');
    const waBase = dWhatsApp.getAttribute('href');
    let returnFocus = null;

    const openCourse = (id) => {
      const card = doc.getElementById(id);
      if (!card || !card.matches('[data-course]')) return;
      const title = card.querySelector('.course__title').textContent.trim();
      const sub = card.querySelector('.course__sub');
      dTitle.textContent = title;
      dSub.textContent = sub ? sub.textContent : '';
      dSub.hidden = !sub;
      dCat.textContent = card.querySelector('.course__cat').textContent;
      dBody.replaceChildren(...Array.from(card.querySelector('.course__detail').cloneNode(true).childNodes));
      dEnquire.href = `contact.html?interest=${encodeURIComponent(id)}`;
      dWhatsApp.href = `${waBase}?text=${encodeURIComponent(`Hi Jarvees, I'd like details about the ${title} course (fees and next batch).`)}`;

      returnFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : card.querySelector('[data-open-course]');
      if (!dialog.open) {
        dialog.showModal();
        App.lockScroll();
      }
      dBody.scrollTop = 0;
      if (location.hash !== `#${id}`) history.replaceState(history.state, '', `#${id}`);
    };

    let closing = false;
    const closeCourse = () => {
      if (!dialog.open || closing) return;
      if (!App.motionOK) {
        dialog.close();
        return;
      }
      closing = true;
      dialog.classList.add('is-closing');
      setTimeout(() => {
        dialog.classList.remove('is-closing');
        closing = false;
        dialog.close();
      }, 280);
    };

    dialog.addEventListener('close', () => {
      App.unlockScroll();
      history.replaceState(history.state, '', location.pathname + location.search);
      returnFocus?.focus({ preventScroll: true });
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault(); // run the animated close instead of the instant one
      closeCourse();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeCourse(); // backdrop
    });
    el('[data-dialog-close]').addEventListener('click', closeCourse);

    grid.addEventListener('click', (e) => {
      const trigger = e.target instanceof Element ? e.target.closest('[data-open-course]') : null;
      if (trigger) openCourse(trigger.dataset.openCourse);
    });

    /** Deep links such as courses.html#sap-fico open the matching course. */
    const openFromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const card = id && doc.getElementById(id);
      if (!card || !card.matches('[data-course]')) return;
      if (card.hidden) {
        cat = 'all';
        query = '';
        search.value = '';
        apply();
        syncUrl();
      }
      openCourse(id);
    };
    addEventListener('hashchange', openFromHash);
    if (location.hash) setTimeout(openFromHash, App.motionOK ? 450 : 0);
  }

  if (doc.prerendering) doc.addEventListener('prerenderingchange', init, { once: true });
  else init();
})();
