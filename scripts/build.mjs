#!/usr/bin/env node
/**
 * Jarvees Infotech — static site builder (zero dependencies).
 *
 *   src/pages/*.html     Page bodies. Each starts with a JSON front-matter comment:
 *                        <!--meta { "title": "...", "description": "...", "nav": "about" } -->
 *   src/templates/*.html Bodies rendered once per data record (course.html → course/<id>.html).
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
import { spiralSvg } from './lib/spiral.mjs';

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

async function readHtmlDir(dir) {
  const out = {};
  for (const file of await readDir(path.join(SRC, dir))) {
    if (file.endsWith('.html')) out[file.replace(/\.html$/, '')] = await readFile(path.join(SRC, dir, file), 'utf8');
  }
  return out;
}

const partials = await readHtmlDir('partials');
const templates = await readHtmlDir('templates');

const categoryById = Object.fromEntries(catalog.categories.map((c) => [c.id, c]));
const coursesIn = (catId) => catalog.courses.filter((c) => c.cat === catId);
const coursePath = (id) => `course/${id}.html`;
const courseIncludes = (course) => course.includes || categoryById[course.cat].includes;

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

/** Details shown in the catalogue's quick-view dialog (cloned from the card by courses.js). */
function quickViewPane(course, ctx) {
  return `<div class="course__detail" hidden>
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
        <ul class="tags" role="list">${courseIncludes(course).map((i) => `<li class="tag">${escapeHtml(i)}</li>`).join('')}</ul>
      </section>
    </div>
    <p class="dialog__more"><a class="link" href="${ctx.base}${coursePath(course.id)}">Full ${escapeHtml(course.title)} course page ${icon('arrow-up-right')}</a></p>
  </div>`;
}

/**
 * Course card. Its link always points at the course page; in the catalogue
 * (`quickView`) courses.js turns a plain click into the quick-view dialog.
 */
function courseCard(course, ctx, { quickView = false } = {}) {
  const cat = categoryById[course.cat];
  const preview = course.topics.slice(0, 3);
  const more = course.topics.length - preview.length;
  const search = [course.title, course.subtitle, course.short, cat.name, ...course.topics].join(' ').toLowerCase();
  const attrs = quickView ? ` id="${course.id}" data-course data-cat="${course.cat}" data-search="${escapeHtml(search)}"` : '';
  return `
<article class="course"${attrs}>
  <div class="course__top">
    <span class="course__cat">${escapeHtml(cat.name)}</span>
    ${icon(cat.icon)}
  </div>
  <h3 class="course__title">${escapeHtml(course.title)}</h3>
  ${course.subtitle ? `<p class="course__sub">${escapeHtml(course.subtitle)}</p>` : ''}
  <p class="course__text">${escapeHtml(course.short)}</p>
  <ul class="course__topics" role="list">
    ${preview.map((t) => `<li class="pill">${escapeHtml(t)}</li>`).join('')}${more > 0 ? `<li class="pill pill--more">+${more} more</li>` : ''}
  </ul>
  <div class="course__foot">
    <span class="course__modes">${icon('laptop')} Online · Classroom</span>
    <a class="course__open" href="${ctx.base}${coursePath(course.id)}"${quickView ? ` data-open-course="${course.id}"` : ''}>${quickView ? 'Details' : 'View course'}<span class="sr-only">: ${escapeHtml(course.title)}</span> ${icon('arrow-up-right')}</a>
  </div>
  ${quickView ? quickViewPane(course, ctx) : ''}
</article>`;
}

/** Up to three courses to suggest next: same track first, then flagship courses. */
function relatedTo(course) {
  const picks = coursesIn(course.cat).filter((c) => c.id !== course.id);
  for (const id of catalog.featured) {
    const c = catalog.courses.find((x) => x.id === id);
    if (c && c.id !== course.id && !picks.includes(c)) picks.push(c);
  }
  return picks.slice(0, 3);
}

const faqItem = (q, a) => `<details class="faq__item">
  <summary class="faq__q">${escapeHtml(q)}<span class="faq__icon" aria-hidden="true"></span></summary>
  <div class="faq__a"><p>${escapeHtml(a)}</p></div>
</details>`;

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

  /** Full course grid; each card carries a hidden quick-view pane for the dialog. */
  courseGrid(_arg, ctx) {
    return catalog.courses.map((course) => courseCard(course, ctx, { quickView: true })).join('\n');
  },

  /** Track index rows linking into the filtered catalogue. */
  categoryTiles(_arg, ctx) {
    return catalog.categories
      .map((cat) => {
        const n = coursesIn(cat.id).length;
        return `<a class="track" href="${ctx.base}courses.html?cat=${cat.id}">
  <span class="track__name">${escapeHtml(cat.name)}</span>
  <span class="track__blurb">${escapeHtml(cat.blurb)}</span>
  <span class="track__count">${n} ${n === 1 ? 'course' : 'courses'}</span>
  ${icon('arrow-up-right')}
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
      .map((c) => `<li><a href="${ctx.base}${coursePath(c.id)}">${escapeHtml(c.title)}</a></li>`)
      .join('');
  },

  /* ---------- Course pages (ctx.course is set by buildCoursePages) ---------- */

  /** Numbered syllabus tiles. */
  courseSyllabus(_arg, ctx) {
    return ctx.course.topics
      .map((t, i) => `<li class="syllabus__item"><span class="journey__num">${String(i + 1).padStart(2, '0')}</span><p>${escapeHtml(t)}</p></li>`)
      .join('\n');
  },

  /** "Included" tags. */
  courseIncludes(_arg, ctx) {
    return courseIncludes(ctx.course)
      .map((i) => `<li class="tag">${escapeHtml(i)}</li>`)
      .join('');
  },

  /** FAQ answers built only from facts in the catalogue data. */
  courseFaq(_arg, ctx) {
    const { title } = ctx.course;
    const includes = courseIncludes(ctx.course);
    const placement = includes.find((i) => /placement/i.test(i));
    const items = [
      [`What are the fees for the ${title} course?`, 'Fees depend on the mode and batch you choose. Send an enquiry and we will reply with the current fee and the next batch dates, with a clear breakdown before you enrol.'],
      [`Can I learn ${title} online?`, `Yes. ${title} runs in both online and classroom modes, and batches and timings can be customised for students and working professionals.`],
    ];
    if (placement) {
      items.push([
        `Do you provide placement assistance after ${title}?`,
        `Yes, ${placement.toLowerCase()} for eligible learners: career advice, resume and interview preparation, and support with openings. We assist with placement; we do not sell job guarantees.`,
      ]);
    }
    if (includes.includes('Experience letter')) {
      items.push(['Will I get an experience letter?', 'Yes. Freshers who complete the live project receive an experience letter for their first job application.']);
    }
    if (includes.includes('Course certificate')) {
      items.push(['Will I get a certificate?', `Yes. You earn a Jarvees course certificate when you complete ${title}.`]);
    }
    return items.map(([q, a]) => faqItem(q, a)).join('\n');
  },

  /** Related course cards. */
  relatedCourses(_arg, ctx) {
    return relatedTo(ctx.course)
      .map((c) => courseCard(c, ctx))
      .join('\n');
  },

  /** Programme (add-on) cells for the academy and courses pages. */
  programmeCards() {
    return catalog.programmes
      .map(
        (p, i) => `<article class="cell">
  <div class="cell__head"><span class="cell__num">${String(i + 1).padStart(2, '0')}</span>${icon(p.icon, 'i cell__icon')}</div>
  <h3 class="h3">${escapeHtml(p.title)}</h3>
  <p>${escapeHtml(p.text)}</p>
</article>`
      )
      .join('\n');
  },

  /** Golden-spiral drawing. "hero": draws itself with four numbered tags; "draw": draws itself; default: static. */
  spiral(arg) {
    if (arg === 'hero') return spiralSvg({ className: 'spiral spiral--draw', tags: 4 });
    return spiralSvg({ className: arg === 'draw' ? 'spiral spiral--draw' : 'spiral' });
  },

  /** schema.org structured data: the organisation, plus course and catalogue nodes where relevant. */
  jsonLd(_arg, ctx) {
    const address = {
      '@type': 'PostalAddress',
      streetAddress: `${site.address.line1}, ${site.address.line2}`,
      addressLocality: site.address.city,
      addressRegion: site.address.region,
      postalCode: site.address.postal,
      addressCountry: site.address.country,
    };
    const academy = {
      '@type': 'EducationalOrganization',
      '@id': `${site.url}/#academy`,
      name: site.academy,
      url: `${site.url}/academy.html`,
      address,
      telephone: site.phones[0].e164,
    };
    const graph = [
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
        subOrganization: academy,
      },
    ];

    if (ctx.slug === 'courses') {
      graph.push({
        '@type': 'ItemList',
        name: `${site.academy} courses`,
        itemListElement: catalog.courses.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site.url}/${coursePath(c.id)}` })),
      });
    }

    if (ctx.course) {
      const { course } = ctx;
      graph.push(
        {
          '@type': 'Course',
          '@id': `${ctx.canonical}#course`,
          name: course.subtitle ? `${course.title}: ${course.subtitle}` : course.title,
          description: course.short,
          url: ctx.canonical,
          provider: { '@id': academy['@id'], '@type': academy['@type'], name: academy.name, url: academy.url },
          teaches: course.topics,
          audience: { '@type': 'Audience', audienceType: course.audience },
          hasCourseInstance: [
            { '@type': 'CourseInstance', courseMode: 'Online' },
            { '@type': 'CourseInstance', courseMode: 'Onsite', location: { '@type': 'Place', name: site.academy, address } },
          ],
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            ['Home', `${site.url}/`],
            ['Courses', `${site.url}/courses.html`],
            [course.title, ctx.canonical],
          ].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
        }
      );
    }

    // Escape "<" so no data value can close the script element early.
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
    return `<script type="application/ld+json">${json}</script>`;
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

/** Conservative CSS minifier: comments, whitespace runs, spaces around { } ; */
const minifyCss = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();

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

/**
 * Render one page body inside the layout and write it to dist/<outFile>.
 * `meta` holds the front-matter fields; `base` (in meta) prefixes shared links
 * for pages outside the site root.
 */
async function renderPage(body, meta, { slug, outFile }) {
  const ctx = {
    site,
    year: new Date().getFullYear(),
    base: '',
    bodyClass: '',
    scripts: [],
    htmlAttrs: '',
    nav: '',
    navCurrent: 'page',
    robots: 'index, follow',
    ...meta,
    cta: { ...DEFAULT_CTA, ...meta.cta },
    slug,
    canonical: `${site.url}/${outFile === 'index.html' ? '' : outFile}`,
  };

  ctx.content = await render(body, ctx);
  let html = await render(partials.layout, ctx);

  // Mark the active navigation item in every menu ("true" for pages below a section).
  if (ctx.nav) html = html.replaceAll(`data-nav="${ctx.nav}"`, `data-nav="${ctx.nav}" aria-current="${ctx.navCurrent}"`);

  const target = path.join(OUT, outFile);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html);
  return ctx;
}

/** Front matter for a generated course page. */
function courseMeta(course) {
  const cat = categoryById[course.cat];
  const title = escapeHtml(course.title);
  return {
    title: `${course.title} Course in Pune | ${site.academy}`,
    description: `${course.short} Online and classroom ${course.title} training in Pune.`,
    nav: 'courses',
    navCurrent: 'true',
    bodyClass: 'page-course',
    base: '../',
    course: {
      ...course,
      subtitle: course.subtitle || cat.name,
      catId: cat.id,
      catName: cat.name,
      topicCount: course.topics.length,
      whatsappHref: `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(`Hi Jarvees, I'd like details about the ${course.title} course (fees and next batch).`)}`,
    },
    cta: {
      kicker: 'Next batch',
      title: `Start ${title} <em>with Jarvees.</em>`,
      text: 'Ask for the current fee, the next batch dates and the mode that suits you. We reply every day between 9 AM and 9 PM.',
      primaryLabel: 'Enquire about this course',
      primaryHref: `contact.html?interest=${course.id}`,
      secondaryLabel: 'All courses',
      secondaryHref: 'courses.html',
    },
  };
}

async function build() {
  const started = Date.now();
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  await cp(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true });
  await cp(path.join(SRC, 'static'), OUT, { recursive: true });
  const cssOut = path.join(OUT, 'assets', 'css', 'main.css');
  await writeFile(cssOut, minifyCss(await readFile(cssOut, 'utf8')));

  const pageFiles = (await readDir(path.join(SRC, 'pages'))).filter((f) => f.endsWith('.html')).sort();
  const sitemap = [];

  for (const file of pageFiles) {
    const raw = await readFile(path.join(SRC, 'pages', file), 'utf8');
    const metaMatch = raw.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
    if (!metaMatch) throw new Error(`${file}: missing <!--meta {...} --> front matter`);
    const meta = JSON.parse(metaMatch[1]);
    const slug = file.replace(/\.html$/, '');
    const ctx = await renderPage(raw.slice(metaMatch[0].length), meta, { slug, outFile: file });
    if (meta.sitemap !== false) sitemap.push({ loc: ctx.canonical, priority: slug === 'index' ? '1.0' : '0.8' });
  }

  if (!templates.course) throw new Error('Missing src/templates/course.html');
  const courseBody = templates.course.replace(/^<!--[\s\S]*?-->\s*/, ''); // drop the template's doc comment
  for (const course of catalog.courses) {
    const ctx = await renderPage(courseBody, courseMeta(course), { slug: `course-${course.id}`, outFile: coursePath(course.id) });
    sitemap.push({ loc: ctx.canonical, priority: '0.7' });
  }

  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
      .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`)
      .join('\n')}\n</urlset>\n`
  );
  await writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);

  console.log(`Built ${pageFiles.length} pages and ${catalog.courses.length} course pages → dist/ in ${Date.now() - started} ms`);
}

build().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
