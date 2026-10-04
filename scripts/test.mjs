#!/usr/bin/env node
/**
 * Browser tests for the built site: Playwright drives Chromium against dist/,
 * served on a free local port.
 *
 *   npm test                  build, run scripts/check.mjs, then these tests
 *   node scripts/test.mjs     run only these tests (expects a fresh dist/)
 *   node scripts/test.mjs nav run only tests whose name contains "nav"
 *
 * Playwright is optional tooling (see scripts/lib/playwright.mjs).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchOptions, loadPlaywright } from './lib/playwright.mjs';
import { createStaticServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'courses.json'), 'utf8'));
const site = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'site.json'), 'utf8'));

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 360, height: 780 };
const PAGES = ['index.html', 'about.html', 'services.html', 'academy.html', 'courses.html', 'contact.html', 'privacy.html', '404.html'];
const SAMPLE_COURSES = ['course/sap-fico.html', 'course/data-science.html', 'course/computerised-accounting.html'];

/* ------------------------------------------------------------------ */
/* Tiny runner                                                         */
/* ------------------------------------------------------------------ */

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const server = createStaticServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch(launchOptions());

let contexts = [];

/**
 * Open a page in a fresh context. Collects same-origin request failures and
 * console errors (third-party embeds such as the map are not our concern).
 * Reduced motion is the default so entrances finish instantly.
 */
async function open(urlPath, { viewport = DESKTOP, reducedMotion = 'reduce', javaScriptEnabled = true, initScript } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, javaScriptEnabled });
  contexts.push(context);
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(String(e)));
  page.on('requestfailed', (r) => r.url().startsWith(BASE) && problems.push(`request failed: ${r.url()}`));
  const response = await page.goto(BASE + urlPath, { waitUntil: 'load' });
  return { page, problems, response };
}

const visibleCards = (page) => page.$$eval('[data-course]', (cards) => cards.filter((c) => !c.hidden).map((c) => c.id));

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

test('every page loads without console errors or failed requests', async () => {
  for (const p of [...PAGES, ...SAMPLE_COURSES]) {
    const { page, problems, response } = await open(p);
    equal(response.status(), 200, `${p} status`);
    await page.waitForTimeout(150);
    assert(problems.length === 0, `${p}: ${problems.join(' | ')}`);
  }
});

test('no page scrolls sideways on a 360px phone', async () => {
  for (const p of [...PAGES, ...SAMPLE_COURSES]) {
    const { page } = await open(p, { viewport: PHONE });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 0, `${p} overflows by ${overflow}px`);
  }
});

test('unknown URLs get the 404 page, whose links work from any depth', async () => {
  const { page, response } = await open('course/missing/page.html');
  equal(response.status(), 404, 'status');
  assert((await page.textContent('h1')).includes('out of orbit'), '404 heading');
  await Promise.all([page.waitForURL(/\/index\.html$/), page.click('.nf__links a[href="/index.html"]')]);
});

test('home page content renders without JavaScript', async () => {
  const { page } = await open('index.html', { javaScriptEnabled: false });
  assert(await page.evaluate(() => document.documentElement.classList.contains('no-js')), 'html.no-js');
  const opacity = await page.$eval('.hero .lead', (el) => getComputedStyle(el).opacity);
  equal(opacity, '1', 'hero lead opacity');
});

test('reduced motion shows every entrance immediately', async () => {
  const { page } = await open('index.html');
  const pending = await page.$$eval('.reveal', (els) => els.filter((el) => !el.classList.contains('is-in')).length);
  equal(pending, 0, 'reveal elements without .is-in');
});

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

test('nav marks the current page, and the section on course pages', async () => {
  const about = await open('about.html');
  equal((await about.page.textContent('.nav__link[aria-current="page"]')).trim(), 'About', 'about page');
  const course = await open('course/sap-fico.html');
  equal((await course.page.textContent('.nav__link[aria-current="true"]')).trim(), 'Courses', 'course page');
  equal(await course.page.$('.nav__link[aria-current="page"]'), null, 'no nav link claims to be the course page');
});

test('mobile menu opens, moves focus inside and closes on Escape', async () => {
  const { page } = await open('index.html', { viewport: PHONE });
  const toggle = page.locator('[data-menu-toggle]');
  await toggle.click();
  equal(await toggle.getAttribute('aria-expanded'), 'true', 'expanded');
  await page.waitForFunction(() => document.activeElement?.closest('[data-mobile-nav]'));
  await page.keyboard.press('Escape');
  equal(await toggle.getAttribute('aria-expanded'), 'false', 'collapsed');
  assert(await page.evaluate(() => document.activeElement?.matches('[data-menu-toggle]')), 'focus returns to the toggle');
});

test('footer course links point at generated course pages', async () => {
  const { page } = await open('index.html');
  const hrefs = await page.$$eval('.footer__col[aria-label="Popular courses"] a', (as) => as.map((a) => a.getAttribute('href')));
  equal(hrefs.length, catalog.featured.length, 'featured course count');
  for (const href of hrefs) assert(/^course\/[\w-]+\.html$/.test(href), `unexpected footer href ${href}`);
});

/* ------------------------------------------------------------------ */
/* Course catalogue                                                    */
/* ------------------------------------------------------------------ */

test('catalogue filters by track and keeps the URL in sync', async () => {
  const { page } = await open('courses.html');
  await page.click('[data-filter="sap-technical"]');
  const expected = catalog.courses.filter((c) => c.cat === 'sap-technical').length;
  equal((await visibleCards(page)).length, expected, 'visible cards');
  equal(await page.textContent('[data-course-count]'), String(expected), 'count label');
  equal(await page.getAttribute('[data-filter="sap-technical"]', 'aria-pressed'), 'true', 'chip pressed');
  assert(page.url().includes('cat=sap-technical'), 'URL has ?cat');
});

test('catalogue filtering also works with animations on', async () => {
  const { page } = await open('courses.html', { reducedMotion: 'no-preference' });
  await page.click('[data-filter="sap-functional"]');
  await page.waitForTimeout(700);
  equal((await visibleCards(page)).length, catalog.courses.filter((c) => c.cat === 'sap-functional').length, 'visible cards');
});

test('catalogue search narrows results, shows the empty state and resets', async () => {
  const { page } = await open('courses.html');
  await page.fill('[data-course-search]', 'abap');
  await page.waitForFunction(() => document.querySelectorAll('[data-course]:not([hidden])').length < 26);
  const ids = await visibleCards(page);
  assert(ids.includes('sap-abap'), 'ABAP is listed');
  await page.fill('[data-course-search]', 'zzzz');
  await page.waitForSelector('[data-course-empty]:not([hidden])');
  await page.click('[data-course-reset]');
  equal((await visibleCards(page)).length, catalog.courses.length, 'all courses after reset');
});

test('catalogue restores track and search from the URL', async () => {
  const { page } = await open('courses.html?cat=data&q=python');
  equal(await page.inputValue('[data-course-search]'), 'python', 'search box');
  const expected = catalog.courses.filter((c) => c.cat === 'data' && JSON.stringify(c).toLowerCase().includes('python')).map((c) => c.id);
  equal(JSON.stringify(await visibleCards(page)), JSON.stringify(expected), 'visible cards');
});

test('quick view opens from a card, deep-links and closes with Escape', async () => {
  const { page } = await open('courses.html');
  const link = page.locator('[data-open-course="sap-fico"]');
  await link.click();
  assert(await page.$eval('[data-course-dialog]', (d) => d.open), 'dialog open');
  equal((await page.textContent('[data-dialog-title]')).trim(), 'SAP FICO', 'dialog title');
  equal(new URL(page.url()).hash, '#sap-fico', 'hash');
  equal(await page.getAttribute('.course-dialog .dialog__more a', 'href'), 'course/sap-fico.html', 'full page link');
  assert((await page.getAttribute('[data-dialog-enquire]', 'href')).endsWith('interest=sap-fico'), 'enquire link');
  await page.keyboard.press('Escape');
  assert(!(await page.$eval('[data-course-dialog]', (d) => d.open)), 'dialog closed');
  equal(new URL(page.url()).hash, '', 'hash cleared');
  assert(await page.evaluate(() => document.activeElement?.dataset.openCourse === 'sap-fico'), 'focus returns to the card');
});

test('a course deep link opens its quick view', async () => {
  const { page } = await open('courses.html#sap-mm');
  await page.waitForFunction(() => document.querySelector('[data-course-dialog]').open);
  equal((await page.textContent('[data-dialog-title]')).trim(), 'SAP MM', 'dialog title');
});

test('modified clicks on a card open the full course page instead', async () => {
  const { page } = await open('courses.html');
  const [popup] = await Promise.all([page.context().waitForEvent('page'), page.click('[data-open-course="sap-sd"]', { modifiers: ['Control'] })]);
  await popup.waitForURL(/\/course\/sap-sd\.html$/);
  assert(!(await page.$eval('[data-course-dialog]', (d) => d.open)), 'dialog stays closed');
});

/* ------------------------------------------------------------------ */
/* Course pages                                                        */
/* ------------------------------------------------------------------ */

test('every course page shows its syllabus, enquiry links and structured data', async () => {
  const context = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'reduce' });
  contexts.push(context);
  const page = await context.newPage();
  for (const course of catalog.courses) {
    const url = `course/${course.id}.html`;
    const response = await page.goto(BASE + url);
    equal(response.status(), 200, `${url} status`);
    const data = await page.evaluate(() => ({
      h1: document.querySelector('h1').getAttribute('aria-label'),
      topics: document.querySelectorAll('.syllabus__item').length,
      enquire: document.querySelector('.hero__ctas a').getAttribute('href'),
      faqs: document.querySelectorAll('.faq__item').length,
      related: [...document.querySelectorAll('#related .course__open')].map((a) => a.getAttribute('href')),
      ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'].map((n) => n['@type']),
      canonical: document.querySelector('link[rel="canonical"]').href,
    }));
    equal(data.h1, `${course.title} course in Pune.`, `${url} heading`);
    equal(data.topics, course.topics.length, `${url} syllabus items`);
    equal(data.enquire, `../contact.html?interest=${course.id}`, `${url} enquiry link`);
    assert(data.faqs >= 2, `${url} has FAQs`);
    equal(data.related.length, 3, `${url} related courses`);
    assert(!data.related.includes(`../course/${course.id}.html`), `${url} does not suggest itself`);
    assert(data.ld.includes('Course') && data.ld.includes('BreadcrumbList'), `${url} JSON-LD types ${data.ld}`);
    equal(data.canonical, `${site.url}/${url}`, `${url} canonical`);
  }
});

test('related course cards navigate to their pages', async () => {
  const { page } = await open('course/sap-fico.html');
  const href = await page.getAttribute('#related .course__open', 'href');
  await Promise.all([page.waitForURL(new URL(href, page.url()).href), page.click('#related .course__open')]);
  equal(await page.$$eval('h1', (h) => h.length), 1, 'landed on a page with one h1');
});

test('course pages render fully without JavaScript', async () => {
  const { page } = await open('course/sap-abap.html', { javaScriptEnabled: false });
  const hidden = await page.$$eval('.reveal, .syllabus__item', (els) => els.filter((el) => getComputedStyle(el).opacity !== '1').length);
  equal(hidden, 0, 'elements hidden without JS');
});

/* ------------------------------------------------------------------ */
/* Enquiry form                                                        */
/* ------------------------------------------------------------------ */

const stubOpen = () => {
  window.open = (url) => {
    window.__opened = url;
    return {};
  };
};

test('enquiry form flags missing fields and focuses the first one', async () => {
  const { page } = await open('contact.html');
  await page.click('button[value="whatsapp"]');
  equal(await page.getAttribute('#f-name', 'aria-invalid'), 'true', 'name invalid');
  assert((await page.textContent('#f-name-error')).length > 0, 'name error text');
  assert(await page.evaluate(() => document.activeElement?.id === 'f-name'), 'name focused');
});

test('enquiry form rejects a short phone number', async () => {
  const { page } = await open('contact.html');
  await page.fill('#f-name', 'Asha');
  await page.fill('#f-phone', '12345');
  await page.selectOption('#f-interest', 'sap-mm');
  await page.click('button[value="whatsapp"]');
  equal(await page.getAttribute('#f-phone', 'aria-invalid'), 'true', 'phone invalid');
});

test('enquiry form pre-selects the topic from ?interest=', async () => {
  const { page } = await open('contact.html?interest=sap-fico');
  equal(await page.inputValue('#f-interest'), 'sap-fico', 'selected topic');
});

test('WhatsApp hand-off carries the whole enquiry', async () => {
  const { page } = await open('contact.html?interest=data-science', { initScript: stubOpen });
  await page.fill('#f-name', 'Asha Patil');
  await page.fill('#f-phone', '+91 98765 43210');
  await page.check('input[name="mode"][value="Classroom"]', { force: true });
  await page.fill('#f-message', 'Weekend batch please.');
  await page.click('button[value="whatsapp"]');
  const opened = await page.evaluate(() => window.__opened);
  assert(opened?.startsWith(`https://wa.me/${site.whatsapp}?text=`), `opened ${opened}`);
  const text = decodeURIComponent(opened.split('?text=')[1]);
  for (const part of ["I'm Asha Patil.", 'Interested in: Data Science', 'Preferred mode: Classroom', 'Phone: +91 98765 43210', 'Weekend batch please.']) {
    assert(text.includes(part), `message is missing "${part}"`);
  }
  assert(await page.isVisible('[data-form-status]'), 'status message shown');
});

test('email hand-off builds a mailto link to the team', async () => {
  const { page } = await open('contact.html?interest=sap-sd');
  await page.fill('#f-name', 'Ravi');
  await page.fill('#f-phone', '9876543210');
  await page.click('button[value="email"]');
  await page.waitForSelector('[data-form-status].is-visible');
  const href = await page.getAttribute('[data-status-link]', 'href');
  assert(href.startsWith(`mailto:${site.email}?subject=`), `status link ${href}`);
  assert(decodeURIComponent(href).includes('Interested in: SAP SD'), 'body names the course');
});

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

test('FAQ items expand', async () => {
  const { page } = await open('academy.html');
  await page.click('.faq__item >> nth=0 >> summary');
  assert(await page.$eval('.faq__item', (d) => d.open), 'first FAQ open');
});

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

const filter = process.argv[2]?.toLowerCase();
const selected = filter ? tests.filter((t) => t.name.toLowerCase().includes(filter)) : tests;
let failed = 0;
const started = Date.now();
for (const t of selected) {
  const t0 = Date.now();
  try {
    await t.fn();
    console.log(`  ✓ ${t.name} (${Date.now() - t0} ms)`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${t.name}\n      ${err.message.split('\n')[0]}`);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    contexts = [];
  }
}
await browser.close();
server.close();
console.log(`\n${selected.length - failed} passed, ${failed} failed (${((Date.now() - started) / 1000).toFixed(1)} s)`);
process.exitCode = failed ? 1 : 0;
