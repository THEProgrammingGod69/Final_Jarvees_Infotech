/**
 * Jarvees Infotech: core interactions.
 *
 * Vanilla JS, no build step. Lenis (vendored) adds smooth wheel scrolling on
 * desktop when available. Content stays fully usable without this file:
 * every effect is progressive enhancement and respects prefers-reduced-motion.
 */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const $ = (sel, ctx = doc) => ctx.querySelector(sel);
  const $$ = (sel, ctx = doc) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /** Shared API for page-specific scripts (courses.js, contact.js). */
  const App = (window.Jarvees = {
    motionOK,
    lenis: null,
    lockScroll() {
      root.classList.add('is-locked');
      App.lenis?.stop();
    },
    unlockScroll() {
      root.classList.remove('is-locked');
      App.lenis?.start();
    },
  });

  /* ------------------------------------------------------------------ */
  /* Scroll: one passive listener, work batched into a single frame      */
  /* ------------------------------------------------------------------ */
  const scrollSubscribers = [];
  let scrollQueued = false;
  const onScroll = (fn) => {
    scrollSubscribers.push(fn);
    fn();
  };
  addEventListener(
    'scroll',
    () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        for (const fn of scrollSubscribers) fn();
      });
    },
    { passive: true }
  );

  /* ------------------------------------------------------------------ */
  /* Header: glass on scroll, hides on scroll-down, returns on scroll-up */
  /* ------------------------------------------------------------------ */
  function initHeader() {
    const header = $('[data-header]');
    if (!header) return;
    let lastY = scrollY;

    onScroll(() => {
      const y = scrollY;
      header.classList.toggle('is-scrolled', y > 16);
      const dy = y - lastY;
      if (Math.abs(dy) < 1) return;
      const hide = dy > 0 && y > 200 && !root.classList.contains('menu-open');
      header.classList.toggle('is-hidden', hide);
      root.classList.toggle('header-hidden', hide);
      lastY = y;
    });

    // Keyboard users tabbing into the header must always see it.
    header.addEventListener('focusin', () => {
      header.classList.remove('is-hidden');
      root.classList.remove('header-hidden');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Mobile navigation overlay                                           */
  /* ------------------------------------------------------------------ */
  function initMobileNav() {
    const toggle = $('[data-menu-toggle]');
    const panel = $('[data-mobile-nav]');
    if (!toggle || !panel) return;
    let open = false;
    let hideTimer = 0;

    const setOpen = (next) => {
      if (next === open) return;
      open = next;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      root.classList.toggle('menu-open', open);
      clearTimeout(hideTimer);

      if (open) {
        panel.hidden = false;
        $('[data-header]')?.classList.remove('is-hidden');
        requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-open')));
        App.lockScroll();
        hideTimer = setTimeout(() => $('a', panel)?.focus({ preventScroll: true }), 420);
      } else {
        panel.classList.remove('is-open');
        App.unlockScroll();
        hideTimer = setTimeout(() => (panel.hidden = true), motionOK ? 760 : 0);
      }
    };

    toggle.addEventListener('click', () => setOpen(!open));
    panel.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false);
    });

    doc.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'Escape') {
        setOpen(false);
        toggle.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      // Keep focus inside the menu (toggle + panel links).
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

  /* ------------------------------------------------------------------ */
  /* Smooth scrolling (desktop pointer devices only)                     */
  /* ------------------------------------------------------------------ */
  function initSmoothScroll() {
    if (!motionOK || !finePointer || typeof window.Lenis !== 'function') return;
    App.lenis = new window.Lenis({
      autoRaf: true,
      lerp: 0.1,
      prevent: (node) => !!node.closest?.('dialog, [data-lenis-prevent]'),
    });
  }

  /** Same-page anchor links: smooth scroll that clears the fixed header. */
  function initAnchors() {
    doc.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest('a[href*="#"]') : null;
      if (!link || link.classList.contains('skip-link') || link.target === '_blank') return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
      const id = decodeURIComponent(url.hash.slice(1));
      const target = id === 'top' ? doc.body : doc.getElementById(id);
      // Course anchors are handled by courses.js (they open the details dialog).
      if (!target || target.matches('[data-course]')) return;
      e.preventDefault();

      const behavior = motionOK ? 'smooth' : 'auto';
      if (id === 'top') {
        if (App.lenis) {
          App.lenis.reset();
          App.lenis.scrollTo(0);
        } else {
          scrollTo({ top: 0, behavior });
        }
        history.replaceState(history.state, '', location.pathname + location.search);
        return;
      }
      // Both paths honour the CSS scroll-padding-top that clears the fixed header.
      if (App.lenis) {
        App.lenis.reset(); // sync with any native scroll Lenis has not seen yet
        App.lenis.scrollTo(target);
      } else {
        target.scrollIntoView({ behavior, block: 'start' });
      }
      history.replaceState(history.state, '', url.hash);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Scroll progress bar                                                 */
  /* ------------------------------------------------------------------ */
  function initProgress() {
    const bar = $('[data-progress]');
    if (!bar) return;
    const update = () => {
      const max = root.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? clamp(scrollY / max, 0, 1) : 0})`;
    };
    onScroll(update);
    addEventListener('resize', update, { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /* Split headings into words for the staggered rise                    */
  /* ------------------------------------------------------------------ */
  function splitWords(el) {
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    let index = 0;
    const walk = (node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = doc.createDocumentFragment();
          for (const part of child.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) {
              frag.append(' ');
              continue;
            }
            const word = doc.createElement('span');
            word.className = 'w';
            word.setAttribute('aria-hidden', 'true');
            const inner = doc.createElement('span');
            inner.className = 'w__i';
            inner.style.setProperty('--wi', index++);
            inner.textContent = part;
            word.append(inner);
            frag.append(word);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      }
    };
    walk(el);
    el.setAttribute('aria-label', label);
    el.classList.add('is-split');
  }

  /* ------------------------------------------------------------------ */
  /* Reveal on scroll                                                    */
  /* ------------------------------------------------------------------ */
  function initReveal() {
    for (const group of $$('[data-stagger]')) {
      const step = Number(group.dataset.stagger) || 80;
      Array.from(group.children).forEach((child, i) => {
        child.classList.add('reveal');
        child.style.setProperty('--d', `${i * step}ms`);
      });
    }

    const splits = $$('.split');
    const targets = $$('.reveal, .split, .steps');

    if (!motionOK || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in', 'is-done'));
      return;
    }

    splits.forEach(splitWords);

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          io.unobserve(el);
          el.classList.add('is-in');
          const delay = parseFloat(el.style.getPropertyValue('--d')) || 0;
          setTimeout(() => el.classList.add('is-done'), 1300 + delay);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0 }
    );

    // On the first home visit, hold hero entrances until the intro curtain lifts.
    const start = () => targets.forEach((el) => io.observe(el));
    if (root.classList.contains('is-intro')) setTimeout(start, 1150);
    else start();
  }

  function initIntro() {
    const intro = $('.intro');
    if (!intro || !root.classList.contains('is-intro')) return;
    const finish = () => root.classList.remove('is-intro');
    intro.addEventListener('animationend', (e) => e.animationName === 'intro-out' && finish());
    setTimeout(finish, 2600); // safety net
  }

  /* ------------------------------------------------------------------ */
  /* Animated counters                                                   */
  /* ------------------------------------------------------------------ */
  function initCounters() {
    const els = $$('[data-count]');
    if (!els.length || !motionOK || !('IntersectionObserver' in window)) return; // HTML holds final values
    const render = (el, v) => (el.textContent = v.toFixed(Number(el.dataset.decimals || 0)));
    els.forEach((el) => render(el, Number(el.dataset.from || 0)));

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          io.unobserve(el);
          const from = Number(el.dataset.from || 0);
          const to = Number(el.dataset.count);
          const duration = 1900;
          const t0 = performance.now();
          const tick = (now) => {
            const t = clamp((now - t0) / duration, 0, 1);
            const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            render(el, from + (to - from) * eased);
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    els.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------ */
  /* Pointer effects: spotlight cards, magnetic buttons, tilt, cursor    */
  /* ------------------------------------------------------------------ */
  function initSpotlight() {
    if (!finePointer) return;
    let queued = false;
    let last = null;
    doc.addEventListener(
      'pointermove',
      (e) => {
        last = e;
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          const el = last.target instanceof Element ? last.target.closest('.spot') : null;
          if (!el) return;
          const r = el.getBoundingClientRect();
          el.style.setProperty('--mx', `${last.clientX - r.left}px`);
          el.style.setProperty('--my', `${last.clientY - r.top}px`);
        });
      },
      { passive: true }
    );
  }

  function initMagnetic() {
    if (!finePointer || !motionOK) return;
    for (const el of $$('.magnetic')) {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.22;
        const y = (e.clientY - r.top - r.height / 2) * 0.32;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      });
      el.addEventListener('pointerleave', () => (el.style.transform = ''));
    }
  }

  function initTilt() {
    if (!finePointer || !motionOK) return;
    for (const el of $$('[data-tilt]')) {
      const max = Number(el.dataset.tilt) || 5;
      el.addEventListener('pointermove', (e) => {
        if (!el.classList.contains('is-done') && el.classList.contains('reveal')) return;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(1100px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-4px)`;
      });
      el.addEventListener('pointerleave', () => (el.style.transform = ''));
    }
  }

  function initCursor() {
    const cursor = $('[data-cursor]');
    if (!cursor) return;
    if (!finePointer || !motionOK) {
      cursor.remove();
      return;
    }
    let x = -100;
    let y = -100;
    let cx = x;
    let cy = y;
    let raf = 0;
    let visible = false;
    const loop = () => {
      cx = lerp(cx, x, 0.22);
      cy = lerp(cy, y, 0.22);
      cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      raf = Math.abs(cx - x) + Math.abs(cy - y) > 0.2 ? requestAnimationFrame(loop) : 0;
    };
    doc.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        x = e.clientX;
        y = e.clientY;
        if (!visible) {
          visible = true;
          cx = x;
          cy = y;
          cursor.classList.add('is-visible');
        }
        const t = e.target instanceof Element ? e.target : null;
        cursor.classList.toggle('is-text', !!t?.closest('input:not([type="radio"]):not([type="checkbox"]), textarea'));
        cursor.classList.toggle('is-active', !!t?.closest('a, button, summary, label, select, [data-open-course]'));
        if (!raf) raf = requestAnimationFrame(loop);
      },
      { passive: true }
    );
    root.addEventListener('mouseleave', () => {
      visible = false;
      cursor.classList.remove('is-visible');
    });
  }

  /** Hero chips drift with the pointer (CSS reads --px / --py). */
  function initHeroParallax() {
    const visual = $('[data-parallax]');
    if (!visual || !finePointer || !motionOK) return;
    const hero = visual.closest('.hero') || visual;
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      visual.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      visual.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    });
    hero.addEventListener('pointerleave', () => {
      visual.style.setProperty('--px', '0');
      visual.style.setProperty('--py', '0');
    });
  }

  /* ------------------------------------------------------------------ */
  /* FAQ accordions with height animation                                */
  /* ------------------------------------------------------------------ */
  function initFaq() {
    for (const item of $$('.faq__item')) {
      const summary = $('summary', item);
      const body = $('.faq__a', item);
      if (!summary || !body || !motionOK || !body.animate) continue;
      summary.addEventListener('click', (e) => {
        e.preventDefault();
        if (item.dataset.animating) return;
        item.dataset.animating = '1';
        const done = () => delete item.dataset.animating;
        if (!item.open) {
          item.open = true;
          const h = body.scrollHeight;
          body.animate(
            [
              { height: '0px', opacity: 0 },
              { height: `${h}px`, opacity: 1 },
            ],
            { duration: 460, easing: 'cubic-bezier(.16,1,.3,1)' }
          ).onfinish = done;
        } else {
          const h = body.scrollHeight;
          body.animate(
            [
              { height: `${h}px`, opacity: 1 },
              { height: '0px', opacity: 0 },
            ],
            { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' }
          ).onfinish = () => {
            item.open = false;
            done();
          };
        }
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Canvas effects                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Sizes a canvas to its CSS box (DPR-aware) and runs `draw` only while the
   * canvas is on screen and the tab is visible. Reduced motion: one static frame.
   */
  function canvasLoop(canvas, draw, onResize) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = { ctx, w: 0, h: 0, dpr: 1, running: false, visible: false, raf: 0, last: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      s.dpr = Math.min(window.devicePixelRatio || 1, 2);
      s.w = Math.max(1, Math.round(rect.width * s.dpr));
      s.h = Math.max(1, Math.round(rect.height * s.dpr));
      canvas.width = s.w;
      canvas.height = s.h;
      onResize?.(s);
      if (!s.running) draw(s, performance.now(), 16);
    };
    const frame = (now) => {
      const dt = Math.min(50, now - (s.last || now));
      s.last = now;
      draw(s, now, dt || 16);
      s.raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (s.running || !motionOK) return;
      s.running = true;
      s.last = 0;
      s.raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      s.running = false;
      cancelAnimationFrame(s.raf);
    };

    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else addEventListener('resize', resize);

    new IntersectionObserver(([entry]) => {
      s.visible = entry.isIntersecting;
      s.visible && !doc.hidden ? start() : stop();
    }).observe(canvas);
    doc.addEventListener('visibilitychange', () => (doc.hidden ? stop() : s.visible && start()));
  }

  /** Rotating dotted globe with data arcs and orbiting satellites (home hero). */
  function initGlobe(canvas) {
    const small = innerWidth < 760;
    const N = small ? 620 : 1100;
    const pts = new Float32Array(N * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = golden * i;
      pts[i * 3] = Math.cos(t) * r;
      pts[i * 3 + 1] = y;
      pts[i * 3 + 2] = Math.sin(t) * r;
    }

    const pick = () => {
      const i = (Math.random() * N) | 0;
      return [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
    };
    const makeArc = (from) => {
      const a = from || pick();
      let b;
      let d;
      let guard = 0;
      do {
        b = pick();
        d = Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
      } while ((d < 0.6 || d > 2.1) && ++guard < 60);
      return { a, b, d, t: 0, speed: 0.00022 + Math.random() * 0.00028, lift: 0.1 + d * 0.13, crimson: Math.random() < 0.28 };
    };
    const arcs = Array.from({ length: small ? 5 : 9 }, () => {
      const arc = makeArc();
      arc.t = Math.random() * 1.3;
      return arc;
    });

    let rotY = 0.9;
    const baseX = -0.42;
    let targetY = 0;
    let targetX = 0;
    let offY = 0;
    let offX = 0;
    const hero = canvas.closest('.hero');
    if (hero && finePointer && motionOK) {
      hero.addEventListener(
        'pointermove',
        (e) => {
          const r = hero.getBoundingClientRect();
          targetY = ((e.clientX - r.left) / r.width - 0.5) * 0.9;
          targetX = ((e.clientY - r.top) / r.height - 0.5) * 0.45;
        },
        { passive: true }
      );
      hero.addEventListener('pointerleave', () => (targetY = targetX = 0));
    }

    const P = [0, 0, 0];
    const S = [0, 0, 0];
    const slerp = (a, b, d, t, out) => {
      const sd = Math.sin(d) || 1e-6;
      const k1 = Math.sin((1 - t) * d) / sd;
      const k2 = Math.sin(t * d) / sd;
      out[0] = a[0] * k1 + b[0] * k2;
      out[1] = a[1] * k1 + b[1] * k2;
      out[2] = a[2] * k1 + b[2] * k2;
      return out;
    };

    canvasLoop(canvas, (s, now, dt) => {
      const { ctx, w, h, dpr } = s;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.34;
      ctx.clearRect(0, 0, w, h);

      if (s.running) rotY += dt * 0.00009;
      offY = lerp(offY, targetY, 0.05);
      offX = lerp(offX, targetX, 0.05);
      const ry = rotY + offY;
      const rx = baseX + offX;
      const cY = Math.cos(ry);
      const sY = Math.sin(ry);
      const cX = Math.cos(rx);
      const sX = Math.sin(rx);
      const project = (x, y, z, out) => {
        const x1 = x * cY + z * sY;
        const z1 = -x * sY + z * cY;
        const y1 = y * cX - z1 * sX;
        out[0] = cx + x1 * R;
        out[1] = cy + y1 * R;
        out[2] = y * sX + z1 * cX; // >0 faces the viewer
        return out;
      };

      // Atmosphere halo + sphere body.
      const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.5);
      halo.addColorStop(0, 'rgba(201,164,92,0.13)');
      halo.addColorStop(0.35, 'rgba(91,147,255,0.07)');
      halo.addColorStop(1, 'rgba(91,147,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2);
      ctx.fill();

      const body = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.05, cx, cy, R);
      body.addColorStop(0, 'rgba(40,52,92,0.55)');
      body.addColorStop(0.7, 'rgba(10,14,28,0.55)');
      body.addColorStop(1, 'rgba(5,7,14,0.25)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // Back orbit halves first, so the globe hides them.
      const orbits = [
        { rx: 1.38, ry: 0.34, rot: -0.34, speed: 0.00032, phase: 0, color: '233,217,178' },
        { rx: 1.2, ry: 0.28, rot: 0.52, speed: -0.00045, phase: 2.1, color: '224,57,63' },
      ];
      const drawOrbit = (o, back) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(o.rot);
        ctx.strokeStyle = `rgba(${o.color},${back ? 0.08 : 0.22})`;
        ctx.lineWidth = dpr;
        ctx.setLineDash([3 * dpr, 6 * dpr]);
        ctx.beginPath();
        ctx.ellipse(0, 0, R * o.rx, R * o.ry, 0, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
        const a = o.phase + now * o.speed;
        const isBack = Math.sin(a) < 0;
        if (isBack === back) {
          const px = Math.cos(a) * R * o.rx;
          const py = Math.sin(a) * R * o.ry;
          ctx.fillStyle = `rgba(${o.color},${back ? 0.35 : 0.22})`;
          ctx.beginPath();
          ctx.arc(px, py, 9 * dpr, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(${o.color},${back ? 0.5 : 1})`;
          ctx.beginPath();
          ctx.arc(px, py, 3.2 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      };
      orbits.forEach((o) => drawOrbit(o, true));

      // Dots: far side (blue, dim) then near side (warm, bright).
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? 'rgb(91,147,255)' : 'rgb(244,228,194)';
        for (let i = 0; i < N; i++) {
          project(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], P);
          const front = P[2] >= 0;
          if (front !== (pass === 1)) continue;
          const depth = (P[2] + 1) / 2;
          ctx.globalAlpha = pass === 0 ? 0.05 + depth * 0.3 : 0.18 + depth * 0.8;
          const size = (0.7 + depth * 1.6) * dpr;
          ctx.fillRect(P[0] - size / 2, P[1] - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;

      // Data arcs travelling between points on the surface.
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.3 * dpr;
      const SEG = 30;
      for (const arc of arcs) {
        if (s.running) arc.t += dt * arc.speed;
        if (arc.t > 1.4) {
          Object.assign(arc, makeArc(arc.b));
        }
        const head = Math.min(arc.t, 1);
        const tail = clamp(arc.t - 0.5, 0, 1);
        const rgb = arc.crimson ? '224,57,63' : '233,217,178';
        if (head > tail) {
          let px = 0;
          let py = 0;
          for (let k = 0; k <= SEG; k++) {
            const t = tail + (head - tail) * (k / SEG);
            slerp(arc.a, arc.b, arc.d, t, S);
            const lift = 1 + Math.sin(Math.PI * t) * arc.lift;
            project(S[0] * lift, S[1] * lift, S[2] * lift, P);
            if (k > 0) {
              const vis = P[2] > -0.2 ? 1 : 0.18;
              ctx.strokeStyle = `rgba(${rgb},${((k / SEG) * 0.9 * vis).toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(P[0], P[1]);
              ctx.stroke();
            }
            px = P[0];
            py = P[1];
          }
          if (arc.t <= 1 && P[2] > -0.2) {
            ctx.fillStyle = `rgba(${rgb},0.18)`;
            ctx.beginPath();
            ctx.arc(px, py, 8 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgb(${rgb})`;
            ctx.beginPath();
            ctx.arc(px, py, 2.4 * dpr, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Landing pulse.
        if (arc.t > 1 && arc.t < 1.4) {
          project(arc.b[0], arc.b[1], arc.b[2], P);
          if (P[2] > 0) {
            const k = (arc.t - 1) / 0.4;
            ctx.strokeStyle = `rgba(${rgb},${(1 - k) * 0.8})`;
            ctx.beginPath();
            ctx.arc(P[0], P[1], (3 + k * 16) * dpr, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      orbits.forEach((o) => drawOrbit(o, false));
    });
  }

  /** Drifting constellation for inner-page heroes; links react to the pointer. */
  function initNetwork(canvas) {
    let nodes = [];
    const mouse = { x: -1e4, y: -1e4, active: false };
    let scale = 1;
    const host = canvas.closest('.hero') || canvas.parentElement;
    if (host && finePointer && motionOK) {
      host.addEventListener(
        'pointermove',
        (e) => {
          const r = canvas.getBoundingClientRect();
          mouse.x = (e.clientX - r.left) * scale;
          mouse.y = (e.clientY - r.top) * scale;
          mouse.active = true;
        },
        { passive: true }
      );
      host.addEventListener('pointerleave', () => (mouse.active = false));
    }

    canvasLoop(
      canvas,
      (s, _now, dt) => {
        const { ctx, w, h, dpr } = s;
        ctx.clearRect(0, 0, w, h);
        const k = dt / 16.67;
        const link = 150 * dpr;
        const link2 = link * link;
        const reach = 200 * dpr;

        for (const n of nodes) {
          if (s.running) {
            n.x += n.vx * k;
            n.y += n.vy * k;
            if (mouse.active) {
              const dx = mouse.x - n.x;
              const dy = mouse.y - n.y;
              const d = Math.hypot(dx, dy);
              if (d < reach && d > 1) {
                n.x += (dx / d) * 0.25 * dpr * k;
                n.y += (dy / d) * 0.25 * dpr * k;
              }
            }
          }
          if (n.x < -20) n.x = w + 20;
          else if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          else if (n.y > h + 20) n.y = -20;
        }

        ctx.lineWidth = dpr;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > link2) continue;
            ctx.strokeStyle = `rgba(201,164,92,${((1 - d2 / link2) * 0.22).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          if (mouse.active) {
            const dx = a.x - mouse.x;
            const dy = a.y - mouse.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < reach * reach) {
              ctx.strokeStyle = `rgba(233,217,178,${((1 - d2 / (reach * reach)) * 0.45).toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(mouse.x, mouse.y);
              ctx.stroke();
            }
          }
        }

        for (const n of nodes) {
          ctx.fillStyle = n.gold ? 'rgba(244,228,194,0.9)' : 'rgba(91,147,255,0.85)';
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      (s) => {
        scale = s.dpr;
        const count = clamp(Math.round((s.w * s.h) / (s.dpr * s.dpr) / 15000), 26, 96);
        nodes = Array.from({ length: count }, () => ({
          x: Math.random() * s.w,
          y: Math.random() * s.h,
          vx: (Math.random() - 0.5) * 0.3 * s.dpr,
          vy: (Math.random() - 0.5) * 0.3 * s.dpr,
          r: (Math.random() * 1.3 + 0.7) * s.dpr,
          gold: Math.random() < 0.6,
        }));
      }
    );
  }

  function initFx() {
    if (!('IntersectionObserver' in window)) return;
    $$('canvas[data-fx="globe"]').forEach(initGlobe);
    $$('canvas[data-fx="network"]').forEach(initNetwork);
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */
  function boot() {
    $$('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
    initSmoothScroll();
    initAnchors();
    initHeader();
    initMobileNav();
    initProgress();
    initIntro();
    initReveal();
    initCounters();
    initSpotlight();
    initMagnetic();
    initTilt();
    initCursor();
    initHeroParallax();
    initFaq();
    initFx();
    doc.dispatchEvent(new CustomEvent('jarvees:ready'));
  }

  // Pages prerendered by Speculation Rules start animating only once shown.
  if (doc.prerendering) doc.addEventListener('prerenderingchange', boot, { once: true });
  else boot();
})();
