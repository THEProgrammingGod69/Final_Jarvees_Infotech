#!/usr/bin/env node
/**
 * Jarvees Infotech — static site builder (zero dependencies).
 *
 *   src/pages/*.html     Page bodies. Each starts with a JSON front-matter comment:
 *                        <!--meta { "title": "...", "description": "...", "nav": "about" } -->
 *   src/partials/*.html  Reusable fragments, included with {{> name}}.
 *   src/data/*.json      Content consumed by generators, called with {{@name arg}}.
 *   src/assets/**        Copied to dist/assets.
 *   src/static/**        Copied to the dist root (favicon, manifest, robots…).
 *
 * Template tags:
 *   {{> partial}}        include a partial (recursive)
 *   {{@generator arg}}   insert generated HTML (see GENERATORS)
 *   {{key.path}}         insert an escaped value from the page context
 *   {{{key.path}}}       insert a raw (unescaped) value
 *
 * Usage: node scripts/build.mjs   →   dist/
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Resolve "a.b.c" against an object. */
const lookup = (obj, keyPath) => keyPath.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

const readJson = async (file) => JSON.parse(await readFile(path.join(SRC, 'data', file), 'utf8'));

async function readDir(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Load sources                                                        */
/* ------------------------------------------------------------------ */

const site = await readJson('site.json');
const catalog = await readJson('courses.json');
const services = await readJson('services.json');

const partials = {};
for (const file of await readDir(path.join(SRC, 'partials'))) {
  if (file.endsWith('.html')) partials[file.replace(/\.html$/, '')] = await readFile(path.join(SRC, 'partials', file), 'utf8');
}

const categoryById = Object.fromEntries(catalog.categories.map((c) => [c.id, c]));
const coursesIn = (catId) => catalog.courses.filter((c) => c.cat === catId);

/** Content hashes for cache-busting asset URLs (?v=hash). */
const assetHashes = new Map();
async function assetHash(relPath) {
  if (!assetHashes.has(relPath)) {
    const buf = await readFile(path.join(SRC, relPath));
    assetHashes.set(relPath, createHash('sha1').update(buf).digest('hex').slice(0, 8));
  }
  return assetHashes.get(relPath);
}

/* ------------------------------------------------------------------ */
/* Generators — {{@name arg}}                                          */
/* ------------------------------------------------------------------ */

const icon = (id, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const GENERATORS = {
  /** Cache-busted asset URL. */
  async asset(arg, ctx) {
    return `${ctx.base}${arg}?v=${await assetHash(arg)}`;
  },

  /** Page-specific deferred scripts listed in front matter. */
  async pageScripts(_arg, ctx) {
    const tags = [];
    for (const name of ctx.scripts || []) {
      const rel = `assets/js/${name}`;
      tags.push(`<script src="${ctx.base}${rel}?v=${await assetHash(rel)}" defer></script>`);
    }
    return tags.join('\n');
  },

  courseCount: () => String(catalog.courses.length),
  categoryCount: () => String(catalog.categories.length),

  /** Filter chips for the catalogue. */
  courseFilters() {
    const chip = (id, label, count) =>
      `<button class="filter" type="button" data-filter="${id}" aria-pressed="${id === 'all'}">${escapeHtml(label)}<span class="filter__count">${count}</span></button>`;
    return [chip('all', 'All', catalog.courses.length), ...catalog.categories.map((c) => chip(c.id, c.name, coursesIn(c.id).length))].join('\n');
  },

  /** Full course grid with hidden detail panes (used by the dialog). */
  courseGrid() {
    return catalog.courses
      .map((course, index) => {
        const cat = categoryById[course.cat];
        const search = [course.title, course.subtitle, course.short, cat.name, ...course.topics].join(' ').toLowerCase();
        const preview = course.topics.slice(0, 3);
        const more = course.topics.length - preview.length;
        const includes = course.includes || cat.includes;
        return `
<article class="course card spot reveal" id="${course.id}" data-course data-cat="${course.cat}" data-search="${escapeHtml(search)}" style="--d:${(index % 3) * 70}ms">
  <div class="course__top">
    <span class="course__cat">${escapeHtml(cat.name)}</span>
    <span class="icon-tile icon-tile--sm">${icon(cat.icon)}</span>
  </div>
  <h3 class="course__title">${escapeHtml(course.title)}</h3>
  ${course.subtitle ? `<p class="course__sub">${escapeHtml(course.subtitle)}</p>` : ''}
  <p class="course__text">${escapeHtml(course.short)}</p>
  <ul class="course__topics" role="list">
    ${preview.map((t) => `<li class="pill">${escapeHtml(t)}</li>`).join('')}${more > 0 ? `<li class="pill pill--more">+${more} more</li>` : ''}
  </ul>
  <div class="course__foot">
    <span class="course__modes">${icon('laptop')} Online · Classroom</span>
    <button class="course__open" type="button" data-open-course="${course.id}">Details ${icon('arrow-up-right')}</button>
  </div>
  <div class="course__detail" hidden>
    <p class="dialog__lead">${escapeHtml(course.short)}</p>
    <div class="dialog__cols">
      <section>
        <h4 class="dialog__h">What you'll learn</h4>
        <ul class="check-list" role="list">${course.topics.map((t) => `<li>${icon('check')}<span>${escapeHtml(t)}</span></li>`).join('')}</ul>
      </section>
      <section class="dialog__side">
        <h4 class="dialog__h">Who it's for</h4>
        <p>${escapeHtml(course.audience)}</p>
        <h4 class="dialog__h">Format</h4>
        <p>Instructor-led · Online or classroom · Customised batches and timings</p>
        <h4 class="dialog__h">Included</h4>
        <ul class="tag-list" role="list">${includes.map((i) => `<li class="tag">${escapeHtml(i)}</li>`).join('')}</ul>
      </section>
    </div>
  </div>
</article>`;
      })
      .join('\n');
  },

  /** Category tiles linking into the filtered catalogue. */
  categoryTiles(_arg, ctx) {
    return catalog.categories
      .map((cat, i) => {
        const n = coursesIn(cat.id).length;
        return `<a class="cat-tile card spot" href="${ctx.base}courses.html?cat=${cat.id}" style="--d:${i * 60}ms">
  <span class="icon-tile">${icon(cat.icon)}</span>
  <span class="cat-tile__body"><span class="cat-tile__name">${escapeHtml(cat.name)}</span><span class="cat-tile__blurb">${escapeHtml(cat.blurb)}</span></span>
  <span class="cat-tile__count">${n} ${n === 1 ? 'course' : 'courses'}</span>
  ${icon('arrow-up-right', 'i cat-tile__arrow')}
</a>`;
      })
      .join('\n');
  },

  /** <option>s for the enquiry form, grouped by category. */
  interestOptions() {
    const serviceGroup = `<optgroup label="Consulting services">${services
      .map((s) => `<option value="${s.id}">${escapeHtml(s.title)}</option>`)
      .join('')}</optgroup>`;
    const courseGroups = catalog.categories
      .map(
        (cat) =>
          `<optgroup label="${escapeHtml(cat.name)}">${coursesIn(cat.id)
            .map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`)
            .join('')}</optgroup>`
      )
      .join('');
    const programmes = `<optgroup label="Programmes">${catalog.programmes
      .map((p) => `<option value="${p.id}">${escapeHtml(p.title)}</option>`)
      .join('')}</optgroup>`;
    return `${serviceGroup}${courseGroups}${programmes}<option value="other">Something else</option>`;
  },

  /** Footer list of flagship courses. */
  footerCourses(_arg, ctx) {
    return catalog.featured
      .map((id) => catalog.courses.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => `<li><a href="${ctx.base}courses.html#${c.id}">${escapeHtml(c.title)}</a></li>`)
      .join('');
  },

  /** Programmes (add-ons) cards for the academy page. */
  programmeCards() {
    return catalog.programmes
      .map(
        (p, i) => `<article class="card spot program reveal" style="--d:${i * 80}ms">
  <span class="icon-tile">${icon(p.icon)}</span>
  <h3 class="h3">${escapeHtml(p.title)}</h3>
  <p>${escapeHtml(p.text)}</p>
</article>`
      )
      .join('\n');
  },

  /** schema.org structured data. */
  jsonLd() {
    const address = {
      '@type': 'PostalAddress',
      streetAddress: `${site.address.line1}, ${site.address.line2}`,
      addressLocality: site.address.city,
      addressRegion: site.address.region,
      postalCode: site.address.postal,
      addressCountry: site.address.country,
    };
    const data = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${site.url}/#organization`,
          name: site.name,
          legalName: site.legalName,
          url: site.url,
          logo: `${site.url}/assets/img/icon-512.png`,
          slogan: site.tagline,
          foundingDate: site.founded,
          email: site.email,
          telephone: site.phones.map((p) => p.e164),
          address,
          sameAs: [site.facebook],
          subOrganization: {
            '@type': 'EducationalOrganization',
            name: site.academy,
            url: `${site.url}/academy.html`,
            address,
            telephone: site.phones[0].e164,
          },
        },
      ],
    };
    return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  },
};

/* ------------------------------------------------------------------ */
/* Template engine                                                     */
/* ------------------------------------------------------------------ */

function includePartials(str, depth = 0) {
  if (depth > 10) throw new Error('Partial include depth exceeded (circular include?)');
  return str.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_m, name) => {
    if (!(name in partials)) throw new Error(`Unknown partial: ${name}`);
    return includePartials(partials[name], depth + 1);
  });
}

async function runGenerators(str, ctx) {
  const pattern = /\{\{@([\w-]+)(?:\s+([^}]*?))?\s*\}\}/g;
  const jobs = [];
  str.replace(pattern, (match, name, arg) => {
    if (!GENERATORS[name]) throw new Error(`Unknown generator: ${name}`);
    jobs.push(Promise.resolve(GENERATORS[name](arg?.trim(), ctx)).then((out) => [match, out]));
    return match;
  });
  const results = await Promise.all(jobs);
  let out = str;
  for (const [match, html] of results) out = out.replace(match, () => html);
  return out;
}

/** Single pass, so inserted raw HTML is never re-scanned for tags. */
function interpolate(str, ctx) {
  return str.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g, (_m, rawKey, key) => {
    const value = lookup(ctx, rawKey ?? key);
    if (value === undefined) throw new Error(`Missing template value: ${rawKey ?? key}`);
    return rawKey ? String(value) : escapeHtml(value);
  });
}

async function render(str, ctx) {
  return interpolate(await runGenerators(includePartials(str), ctx), ctx);
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/** Closing call-to-action band; pages override any field via "cta" in front matter. */
const DEFAULT_CTA = {
  kicker: 'Next step',
  title: 'Your next SAP milestone <em>starts here.</em>',
  text: 'Planning an SAP project or choosing a course? Talk to the team today. We reply every day between 9 AM and 9 PM.',
  primaryLabel: 'Start a conversation',
  primaryHref: 'contact.html',
  secondaryLabel: 'Browse courses',
  secondaryHref: 'courses.html',
};

async function build() {
  const started = Date.now();
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  await cp(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true });
  await cp(path.join(SRC, 'static'), OUT, { recursive: true });

  const pageFiles = (await readDir(path.join(SRC, 'pages'))).filter((f) => f.endsWith('.html')).sort();
  const sitemap = [];

  for (const file of pageFiles) {
    const raw = await readFile(path.join(SRC, 'pages', file), 'utf8');
    const metaMatch = raw.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
    if (!metaMatch) throw new Error(`${file}: missing <!--meta {...} --> front matter`);
    const meta = JSON.parse(metaMatch[1]);
    const slug = file.replace(/\.html$/, '');
    const pagePath = slug === 'index' ? '' : `${slug}.html`;

    const ctx = {
      site,
      year: new Date().getFullYear(),
      base: '',
      bodyClass: '',
      scripts: [],
      htmlAttrs: '',
      nav: '',
      robots: 'index, follow',
      ...meta,
      cta: { ...DEFAULT_CTA, ...meta.cta },
      slug,
      canonical: `${site.url}/${pagePath}`,
    };

    ctx.content = await render(raw.slice(metaMatch[0].length), ctx);
    let html = await render(partials.layout, ctx);

    // Mark the active navigation item in every menu.
    if (ctx.nav) html = html.replaceAll(`data-nav="${ctx.nav}"`, `data-nav="${ctx.nav}" aria-current="page"`);

    await writeFile(path.join(OUT, file), html);
    if (meta.sitemap !== false) sitemap.push({ loc: ctx.canonical, priority: slug === 'index' ? '1.0' : '0.8' });
  }

  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
      .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`)
      .join('\n')}\n</urlset>\n`
  );
  await writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);

  console.log(`Built ${pageFiles.length} pages → dist/ in ${Date.now() - started} ms`);
}

build().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
