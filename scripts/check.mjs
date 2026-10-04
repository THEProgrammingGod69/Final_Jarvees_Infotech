#!/usr/bin/env node
/**
 * Static checks for the built site (zero dependencies). Run after a build:
 *
 *   node scripts/check.mjs        (or: npm run check)
 *
 * Errors (exit code 1): broken internal links and anchors, missing assets,
 * unrendered template tags, duplicate ids, broken ARIA/label references,
 * missing icons, pages without exactly one <h1>, title or description, invalid
 * JSON-LD, enquiry links to unknown topics, and courses without a page.
 * Warnings: titles and descriptions longer than search results usually show.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const TITLE_MAX = 70;
const DESCRIPTION_MAX = 160;

const errors = [];
const warnings = [];
const fail = (page, msg) => errors.push(`${page}: ${msg}`);
const warn = (page, msg) => warnings.push(`${page}: ${msg}`);

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'assets') out.push(...(await htmlFiles(full)));
    } else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attrValues = (html, attr) => [...html.matchAll(new RegExp(`\\s${attr}="([^"]*)"`, 'g'))].map((m) => decode(m[1]));
/** Markup outside <script> and HTML comments (JSON-LD and speculation rules are checked separately). */
const markupOnly = (html) => html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');

if (!(await exists(path.join(DIST, 'index.html')))) {
  console.error('dist/ is empty: run `npm run build` first.');
  process.exit(1);
}

const files = await htmlFiles(DIST);
const pages = new Map(); // dist-relative path → { html, ids }
for (const file of files) {
  const html = await readFile(file, 'utf8');
  const markup = markupOnly(html);
  pages.set(path.relative(DIST, file).split(path.sep).join('/'), { html, markup, ids: attrValues(markup, 'id') });
}

// Valid ?interest= values are the options of the enquiry form.
const contact = pages.get('contact.html');
const interestOptions = new Set(contact ? attrValues(contact.markup.match(/<select[^>]*name="interest"[\s\S]*?<\/select>/)?.[0] || '', 'value') : []);

for (const [rel, { html, markup, ids }] of pages) {
  const idSet = new Set(ids);

  // Template tags that survived the build.
  const leftover = markup.match(/\{\{[>@{]?\s*[\w.-]+[^}]*\}\}/);
  if (leftover) fail(rel, `unrendered template tag ${leftover[0]}`);

  // Head essentials.
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim() || '');
  const description = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1].trim() || '');
  if (!title) fail(rel, 'missing <title>');
  else if (title.length > TITLE_MAX) warn(rel, `title is ${title.length} characters (over ${TITLE_MAX})`);
  if (!description) fail(rel, 'missing meta description');
  else if (description.length > DESCRIPTION_MAX) warn(rel, `description is ${description.length} characters (over ${DESCRIPTION_MAX})`);

  const h1s = (markup.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) fail(rel, `expected one <h1>, found ${h1s}`);

  // Duplicate ids.
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(rel, `duplicate id "${id}"`);
    seen.add(id);
  }

  // References that must point at an element on the same page.
  for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for']) {
    for (const value of attrValues(markup, attr)) {
      for (const ref of value.split(/\s+/).filter(Boolean)) if (!idSet.has(ref)) fail(rel, `${attr}="${ref}" has no matching id`);
    }
  }
  for (const ref of [...markup.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1])) {
    if (!idSet.has(ref)) fail(rel, `icon #${ref} is not in the sprite`);
  }

  // JSON-LD must parse.
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch (err) {
      fail(rel, `invalid JSON-LD (${err.message})`);
    }
  }

  // Internal links and assets.
  const refs = [...attrValues(markup, 'href'), ...attrValues(markup, 'src')];
  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(ref) || ref === '') continue;
    const [beforeHash, hash] = ref.split('#');
    const [urlPath, query] = beforeHash.split('?');

    let target = rel;
    if (urlPath) {
      const resolved = urlPath.startsWith('/') ? urlPath.slice(1) : path.posix.join(path.posix.dirname(rel), urlPath);
      target = resolved === '' || resolved.endsWith('/') ? `${resolved}index.html` : resolved;
      if (!(await exists(path.join(DIST, target)))) {
        fail(rel, `broken link ${ref}`);
        continue;
      }
    }
    if (hash && target.endsWith('.html')) {
      const page = pages.get(target);
      if (page && !page.ids.includes(decodeURIComponent(hash))) fail(rel, `missing anchor ${ref}`);
    }
    if (target === 'contact.html' && query) {
      const interest = new URLSearchParams(query).get('interest');
      if (interest && !interestOptions.has(interest)) fail(rel, `?interest=${interest} is not an option in the enquiry form`);
    }
  }
}

// Every course has a page, listed in the sitemap.
const catalog = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'courses.json'), 'utf8'));
const sitemap = await readFile(path.join(DIST, 'sitemap.xml'), 'utf8');
for (const course of catalog.courses) {
  const rel = `course/${course.id}.html`;
  if (!pages.has(rel)) fail(rel, 'course page was not generated');
  else if (!sitemap.includes(`/${rel}</loc>`)) fail(rel, 'missing from sitemap.xml');
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`\nChecked ${pages.size} pages: ${errors.length} error(s), ${warnings.length} warning(s).`);
process.exitCode = errors.length ? 1 : 0;
