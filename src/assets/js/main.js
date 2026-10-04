/**
 * Jarvees Infotech: core interactions.
 *
 * Vanilla JS, no dependencies. Performance rules followed throughout:
 * - native scrolling (no scroll hijacking), one batched scroll listener;
 * - only transform/opacity are animated; hero entrances are pure CSS, so
 *   they start at first paint instead of waiting for this file;
 * - canvases batch their drawing, cap pixel density, pause off-screen, in
 *   background tabs and while the page is scrolling, and drop to 30 fps on
 *   low-power devices;
 * - everything respects prefers-reduced-motion and degrades without JS.
 */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const motionOK = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const lowPower =
    (navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory || 8) <= 4 ||
    Boolean(navigator.connection?.saveData) ||
    matchMedia('(max-width: 760px)').matches;

  const $ = (sel, ctx = doc) => ctx.querySelector(sel);
  const $$ = (sel, ctx = doc) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /** Shared API for page-specific scripts (courses.js, contact.js). */
  const App = (window.Jarvees = {
    motionOK,
    lockScroll: () => root.classList.add('is-locked'),
    unlockScroll: () => root.classList.remove('is-locked'),
  });

  /* ------------------------------------------------------------------ */
  /* Scroll: one passive listener, work batched into a single frame      */
  /* ------------------------------------------------------------------ */
  const scrollSubscribers = [];
  let scrollQueued = false;
  let lastScrollAt = 0;
  const onScroll = (fn) => {
    scrollSubscribers.push(fn);
    fn();
  };
  addEventListener(
    'scroll',
    () => {
      lastScrollAt = performance.now();
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        for (const fn of scrollSubscribers) fn();
      });
    },
    { passive: true }
  );
  /** True while the user is actively scrolling: canvases yield the main thread. */
  const isScrolling = () => performance.now() - lastScrollAt < 140;

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
      if (Math.abs(dy) < 4) return;
      const hide = dy > 0 && y > 240 && !root.classList.contains('menu-open');
      header.classList.toggle('is-hidden', hide);
      root.classList.toggle('header-hidden', hide);
      lastY = y;
    });

    header.addEventListener('focusin', () => {
      header.classList.remove('is-hidden');
      root.classList.remove('header-hidden');
    });
  }

  /** Hover pill that glides between desktop nav links. */
  function initNavIndicator() {
    const list = $('.nav__list');
    if (!list || !finePointer || !motionOK) return;
    const links = $$('.nav__link', list);
    const pill = doc.createElement('span');
    pill.className = 'nav__indicator';
    pill.setAttribute('aria-hidden', 'true');
    list.prepend(pill);
    const moveTo = (link) => {
      pill.style.width = `${link.offsetWidth}px`;
      pill.style.transform = `translateX(${link.offsetLeft}px)`;
      pill.classList.add('is-visible');
    };
    links.forEach((link) => link.addEventListener('pointerenter', () => moveTo(link)));
    list.addEventListener('pointerleave', () => pill.classList.remove('is-visible'));
  }

  /* ------------------------------------------------------------------ */
  /* Mobile navigation overlay                                           */
  /* ------------------------------------------------------------------ */
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
        $('[data-header]')?.classList.remove('is-hidden');
        requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-open')));
        App.lockScroll();
        timer = setTimeout(() => $('a', panel)?.focus({ preventScroll: true }), 380);
      } else {
        panel.classList.remove('is-open');
        App.unlockScroll();
        timer = setTimeout(() => (panel.hidden = true), motionOK ? 560 : 0);
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
  /* Scroll progress bar                                                 */
  /* ------------------------------------------------------------------ */
  function initProgress() {
    const bar = $('[data-progress]');
    if (!bar) return;
    let max = 1;
    const measure = () => (max = Math.max(1, root.scrollHeight - innerHeight));
    measure();
    addEventListener('resize', measure, { passive: true });
    addEventListener('load', measure);
    onScroll(() => (bar.style.transform = `scaleX(${clamp(scrollY / max, 0, 1)})`));
  }

  /* ------------------------------------------------------------------ */
  /* Text decode effect for mono labels (kickers, HUD values)            */
  /* ------------------------------------------------------------------ */
  const GLYPHS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789/#%+<>';
  function scramble(el, duration = 650) {
    if (el.dataset.scrambled) return;
    el.dataset.scrambled = '1';
    const final = el.textContent;
    const t0 = performance.now();
    const tick = (now) => {
      const p = clamp((now - t0) / duration, 0, 1);
      const settled = Math.floor(p * final.length);
      let out = final.slice(0, settled);
      for (let i = settled; i < final.length; i++) {
        out += /\s/.test(final[i]) ? final[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = final;
    };
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------ */
  /* Reveal on scroll (headings are pre-split into words at build time)  */
  /* ------------------------------------------------------------------ */
  function initReveal() {
    for (const group of $$('[data-stagger]')) {
      const step = Number(group.dataset.stagger) || 70;
      Array.from(group.children).forEach((child, i) => {
        child.classList.add('reveal');
        child.style.setProperty('--d', `${Math.min(i, 8) * step}ms`);
      });
    }

    const targets = $$('.reveal, .split, .steps, .stats');
    const decoders = $$('.kicker, .hud__row b, [data-scramble]');

    if (!motionOK || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in', 'is-done'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          io.unobserve(el);
          el.classList.add('is-in');
          const delay = parseFloat(el.style.getPropertyValue('--d')) || 0;
          setTimeout(() => el.classList.add('is-done'), 900 + delay);
        }
      },
      { rootMargin: '0px 0px -6% 0px' }
    );
    targets.forEach((el) => io.observe(el));

    const introDelay = root.classList.contains('is-intro') ? 700 : 0;
    const dio = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          dio.unobserve(entry.target);
          setTimeout(() => scramble(entry.target), introDelay + 150);
        }
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    decoders.forEach((el) => dio.observe(el));
  }

  function initIntro() {
    const intro = $('.intro');
    if (!intro || !root.classList.contains('is-intro')) return;
    const finish = () => root.classList.remove('is-intro');
    intro.addEventListener('animationend', (e) => e.animationName === 'intro-out' && finish());
    intro.addEventListener('click', finish);
    setTimeout(finish, 1700); // safety net
  }

  /* ------------------------------------------------------------------ */
  /* Animated counters                                                   */
  /* ------------------------------------------------------------------ */
  function initCounters() {
    const els = $$('[data-count]');
    if (!els.length || !motionOK || !('IntersectionObserver' in window)) return;
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
          const t0 = performance.now();
          const tick = (now) => {
            const t = clamp((now - t0) / 1400, 0, 1);
            render(el, from + (to - from) * (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)));
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
  /* Pointer effects: spotlight, magnetic, tilt, ripple, cursor          */
  /* ------------------------------------------------------------------ */
  function initPointerFx() {
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

    if (!motionOK) return;

    for (const el of $$('.magnetic')) {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.22;
        const y = (e.clientY - r.top - r.height / 2) * 0.32;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      });
      el.addEventListener('pointerleave', () => (el.style.transform = ''));
    }

    for (const el of $$('[data-tilt]')) {
      const max = Number(el.dataset.tilt) || 5;
      el.addEventListener('pointermove', (e) => {
        if (el.classList.contains('reveal') && !el.classList.contains('is-done')) return;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(1100px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-4px)`;
      });
      el.addEventListener('pointerleave', () => (el.style.transform = ''));
    }

    // Hero chips drift with the pointer (CSS reads --px / --py).
    const visual = $('[data-parallax]');
    const hero = visual?.closest('.hero');
    if (visual && hero) {
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

    // Cursor aura.
    const cursor = $('[data-cursor]');
    if (cursor) {
      let x = -100;
      let y = -100;
      let cx = x;
      let cy = y;
      let raf = 0;
      let visible = false;
      const loop = () => {
        cx = lerp(cx, x, 0.35);
        cy = lerp(cy, y, 0.35);
        cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
        raf = Math.abs(cx - x) + Math.abs(cy - y) > 0.3 ? requestAnimationFrame(loop) : 0;
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
          cursor.classList.toggle('is-text', !!t?.closest('input:not([type="radio"]), textarea'));
          cursor.classList.toggle('is-active', !!t?.closest('a, button, summary, label, select'));
          if (!raf) raf = requestAnimationFrame(loop);
        },
        { passive: true }
      );
      root.addEventListener('mouseleave', () => {
        visible = false;
        cursor.classList.remove('is-visible');
      });
    }
  }

  /** Click ripple on buttons and filter chips (all pointer types). */
  function initRipple() {
    if (!motionOK) return;
    doc.addEventListener(
      'pointerdown',
      (e) => {
        const btn = e.target instanceof Element ? e.target.closest('.btn, .filter') : null;
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2.2;
        const dot = doc.createElement('span');
        dot.className = 'ripple';
        dot.setAttribute('aria-hidden', 'true');
        dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
        btn.append(dot);
        dot.addEventListener('animationend', () => dot.remove(), { once: true });
      },
      { passive: true }
    );
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
            { duration: 360, easing: 'cubic-bezier(.16,1,.3,1)' }
          ).onfinish = done;
        } else {
          const h = body.scrollHeight;
          body.animate(
            [
              { height: `${h}px`, opacity: 1 },
              { height: '0px', opacity: 0 },
            ],
            { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' }
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
   * Sizes a canvas to its box (DPR capped), and runs `draw` only while it is
   * on screen, the tab is visible and the user is not scrolling. Low-power
   * devices run at 30 fps; reduced motion draws a single static frame.
   */
  function canvasLoop(canvas, draw, onResize) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    const s = { ctx, w: 0, h: 0, dpr: 1, running: false, visible: false, raf: 0, last: 0 };
    const frameGap = lowPower ? 32 : 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      s.dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.5);
      s.w = Math.max(1, Math.round(rect.width * s.dpr));
      s.h = Math.max(1, Math.round(rect.height * s.dpr));
      canvas.width = s.w;
      canvas.height = s.h;
      onResize?.(s);
      draw(s, performance.now(), 16);
    };
    const frame = (now) => {
      s.raf = requestAnimationFrame(frame);
      const dt = now - (s.last || now);
      if (dt < frameGap || isScrolling()) return;
      s.last = now;
      draw(s, now, Math.min(dt || 16, 50));
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
    let resizeTimer = 0;
    const debounced = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    };
    if ('ResizeObserver' in window) new ResizeObserver(debounced).observe(canvas);
    else addEventListener('resize', debounced);

    new IntersectionObserver(([entry]) => {
      s.visible = entry.isIntersecting;
      s.visible && !doc.hidden ? start() : stop();
    }).observe(canvas);
    doc.addEventListener('visibilitychange', () => (doc.hidden ? stop() : s.visible && start()));
  }

  /** Rotating dotted globe with data arcs and orbiting satellites (home hero). */
  function initGlobe(canvas) {
    const N = lowPower ? 420 : 760;
    const BUCKETS = 6;
    const pts = new Float32Array(N * 3);
    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const key = new Uint8Array(N);
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
      return { a, b, d, t: 0, speed: 0.00026 + Math.random() * 0.0003, lift: 0.1 + d * 0.13, rgb: Math.random() < 0.3 ? '224,57,63' : '233,217,178' };
    };
    const arcs = Array.from({ length: lowPower ? 4 : 7 }, () => Object.assign(makeArc(), { t: Math.random() * 1.3 }));

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
    let halo = null;
    let body = null;
    const orbits = [
      { rx: 1.38, ry: 0.34, rot: -0.34, speed: 0.00032, phase: 0, rgb: '233,217,178' },
      { rx: 1.2, ry: 0.28, rot: 0.52, speed: -0.00045, phase: 2.1, rgb: '224,57,63' },
    ];

    canvasLoop(
      canvas,
      (s, now, dt) => {
        const { ctx, w, h, dpr } = s;
        const cx = w / 2;
        const cy = h / 2;
        const R = Math.min(w, h) * 0.34;
        ctx.clearRect(0, 0, w, h);

        if (s.running) rotY += dt * 0.00009;
        offY = lerp(offY, targetY, 0.06);
        offX = lerp(offX, targetX, 0.06);
        const cY = Math.cos(rotY + offY);
        const sY = Math.sin(rotY + offY);
        const cX = Math.cos(baseX + offX);
        const sX = Math.sin(baseX + offX);
        const project = (x, y, z, out) => {
          const x1 = x * cY + z * sY;
          const z1 = -x * sY + z * cY;
          out[0] = cx + x1 * R;
          out[1] = cy + (y * cX - z1 * sX) * R;
          out[2] = y * sX + z1 * cX; // > 0 faces the viewer
          return out;
        };

        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        const drawOrbit = (o, back) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(o.rot);
          ctx.strokeStyle = `rgba(${o.rgb},${back ? 0.08 : 0.22})`;
          ctx.lineWidth = dpr;
          ctx.setLineDash([3 * dpr, 6 * dpr]);
          ctx.beginPath();
          ctx.ellipse(0, 0, R * o.rx, R * o.ry, 0, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI);
          ctx.stroke();
          ctx.setLineDash([]);
          const a = o.phase + now * o.speed;
          if (Math.sin(a) < 0 === back) {
            const ox = Math.cos(a) * R * o.rx;
            const oy = Math.sin(a) * R * o.ry;
            ctx.fillStyle = `rgba(${o.rgb},${back ? 0.3 : 0.2})`;
            ctx.beginPath();
            ctx.arc(ox, oy, 9 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(${o.rgb},${back ? 0.5 : 1})`;
            ctx.beginPath();
            ctx.arc(ox, oy, 3.2 * dpr, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        };
        orbits.forEach((o) => drawOrbit(o, true));

        // Project once, bucket by depth, then fill each bucket as one path.
        for (let i = 0; i < N; i++) {
          project(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], P);
          px[i] = P[0];
          py[i] = P[1];
          const depth = (P[2] + 1) / 2;
          key[i] = (P[2] >= 0 ? BUCKETS : 0) + Math.min(BUCKETS - 1, (depth * BUCKETS) | 0);
        }
        for (let k = 0; k < BUCKETS * 2; k++) {
          const front = k >= BUCKETS;
          const depth = ((k % BUCKETS) + 0.5) / BUCKETS;
          const size = (0.8 + depth * 1.6) * dpr;
          const half = size / 2;
          ctx.globalAlpha = front ? 0.18 + depth * 0.8 : 0.05 + depth * 0.3;
          ctx.fillStyle = front ? '#f4e4c2' : '#5b93ff';
          ctx.beginPath();
          for (let i = 0; i < N; i++) if (key[i] === k) ctx.rect(px[i] - half, py[i] - half, size, size);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Data arcs: one gradient stroke per arc.
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.4 * dpr;
        for (const arc of arcs) {
          if (s.running) arc.t += dt * arc.speed;
          if (arc.t > 1.4) Object.assign(arc, makeArc(arc.b));
          const head = Math.min(arc.t, 1);
          const tail = clamp(arc.t - 0.5, 0, 1);
          if (head > tail) {
            ctx.beginPath();
            let sx = 0;
            let sy = 0;
            const SEG = 16;
            for (let k = 0; k <= SEG; k++) {
              const t = tail + (head - tail) * (k / SEG);
              slerp(arc.a, arc.b, arc.d, t, S);
              const lift = 1 + Math.sin(Math.PI * t) * arc.lift;
              project(S[0] * lift, S[1] * lift, S[2] * lift, P);
              if (k === 0) {
                ctx.moveTo(P[0], P[1]);
                sx = P[0];
                sy = P[1];
              } else ctx.lineTo(P[0], P[1]);
            }
            const vis = P[2] > -0.2 ? 0.9 : 0.2;
            const grad = ctx.createLinearGradient(sx, sy, P[0], P[1]);
            grad.addColorStop(0, `rgba(${arc.rgb},0)`);
            grad.addColorStop(1, `rgba(${arc.rgb},${vis})`);
            ctx.strokeStyle = grad;
            ctx.stroke();
            if (arc.t <= 1 && P[2] > -0.2) {
              ctx.fillStyle = `rgba(${arc.rgb},0.2)`;
              ctx.beginPath();
              ctx.arc(P[0], P[1], 7 * dpr, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = `rgb(${arc.rgb})`;
              ctx.beginPath();
              ctx.arc(P[0], P[1], 2.3 * dpr, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          if (arc.t > 1 && arc.t < 1.4) {
            project(arc.b[0], arc.b[1], arc.b[2], P);
            if (P[2] > 0) {
              const k = (arc.t - 1) / 0.4;
              ctx.strokeStyle = `rgba(${arc.rgb},${(1 - k) * 0.8})`;
              ctx.beginPath();
              ctx.arc(P[0], P[1], (3 + k * 16) * dpr, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }

        orbits.forEach((o) => drawOrbit(o, false));
      },
      (s) => {
        const cx = s.w / 2;
        const cy = s.h / 2;
        const R = Math.min(s.w, s.h) * 0.34;
        halo = s.ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.5);
        halo.addColorStop(0, 'rgba(201,164,92,0.13)');
        halo.addColorStop(0.35, 'rgba(91,147,255,0.07)');
        halo.addColorStop(1, 'rgba(91,147,255,0)');
        body = s.ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.05, cx, cy, R);
        body.addColorStop(0, 'rgba(40,52,92,0.55)');
        body.addColorStop(0.7, 'rgba(10,14,28,0.55)');
        body.addColorStop(1, 'rgba(5,7,14,0.25)');
      }
    );
  }

  /** Drifting constellation for inner-page heroes; links react to the pointer. */
  function initNetwork(canvas) {
    let nodes = [];
    const mouse = { x: -1e4, y: -1e4, active: false };
    let scale = 1;
    const LEVELS = 4;
    const buckets = Array.from({ length: LEVELS }, () => []);
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
        const reach = 190 * dpr;
        const reach2 = reach * reach;

        for (const n of nodes) {
          if (s.running) {
            n.x += n.vx * k;
            n.y += n.vy * k;
            if (mouse.active) {
              const dx = mouse.x - n.x;
              const dy = mouse.y - n.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < reach2 && d2 > 1) {
                const d = Math.sqrt(d2);
                n.x += (dx / d) * 0.22 * dpr * k;
                n.y += (dy / d) * 0.22 * dpr * k;
              }
            }
          }
          if (n.x < -20) n.x = w + 20;
          else if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          else if (n.y > h + 20) n.y = -20;
        }

        // Bucket links by strength so each bucket is a single stroke.
        for (const b of buckets) b.length = 0;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < link2) buckets[Math.min(LEVELS - 1, ((1 - d2 / link2) * LEVELS) | 0)].push(a.x, a.y, b.x, b.y);
          }
        }
        ctx.lineWidth = dpr;
        ctx.strokeStyle = '#c9a45c';
        buckets.forEach((seg, level) => {
          if (!seg.length) return;
          ctx.globalAlpha = ((level + 0.5) / LEVELS) * 0.22;
          ctx.beginPath();
          for (let i = 0; i < seg.length; i += 4) {
            ctx.moveTo(seg[i], seg[i + 1]);
            ctx.lineTo(seg[i + 2], seg[i + 3]);
          }
          ctx.stroke();
        });

        if (mouse.active) {
          ctx.strokeStyle = '#e9d9b2';
          ctx.globalAlpha = 0.28;
          ctx.beginPath();
          for (const n of nodes) {
            const dx = n.x - mouse.x;
            const dy = n.y - mouse.y;
            if (dx * dx + dy * dy < reach2) {
              ctx.moveTo(n.x, n.y);
              ctx.lineTo(mouse.x, mouse.y);
            }
          }
          ctx.stroke();
        }

        ctx.globalAlpha = 0.9;
        for (const gold of [true, false]) {
          ctx.fillStyle = gold ? '#f4e4c2' : '#5b93ff';
          ctx.beginPath();
          for (const n of nodes) {
            if (n.gold !== gold) continue;
            ctx.moveTo(n.x + n.r, n.y);
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          }
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      (s) => {
        scale = s.dpr;
        const count = clamp(Math.round((s.w * s.h) / (s.dpr * s.dpr) / (lowPower ? 26000 : 17000)), 18, lowPower ? 40 : 70);
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

  /** Pause looping CSS animations in regions that are off screen. */
  function initOffscreenPause() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) e.target.classList.toggle('is-paused', !e.isIntersecting);
    });
    $$('.hero, .marquee, .arms, .bento, .section--cta, .pin-visual, .hud').forEach((el) => io.observe(el));
  }

  function initFx() {
    if (!('IntersectionObserver' in window)) return;
    const start = () => {
      $$('canvas[data-fx="globe"]').forEach(initGlobe);
      $$('canvas[data-fx="network"]').forEach(initNetwork);
    };
    // Let the page finish its first paint before spinning up canvases.
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 400 });
    else setTimeout(start, 60);
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */
  function boot() {
    $$('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
    initHeader();
    initNavIndicator();
    initMobileNav();
    initProgress();
    initIntro();
    initReveal();
    initCounters();
    initPointerFx();
    initRipple();
    initFaq();
    initOffscreenPause();
    initFx();
    doc.dispatchEvent(new CustomEvent('jarvees:ready'));
  }

  // Pages prerendered by Speculation Rules start animating only once shown.
  if (doc.prerendering) doc.addEventListener('prerenderingchange', boot, { once: true });
  else boot();
})();
