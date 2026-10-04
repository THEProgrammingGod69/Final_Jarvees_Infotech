#!/usr/bin/env node
/**
 * Renders the raster brand assets (social preview + app icons) from HTML
 * templates with Playwright, into src/assets/img/.
 *
 *   npm i -D playwright && npx playwright install chromium   (one-time)
 *   node scripts/render-images.mjs
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchOptions, loadPlaywright } from './lib/playwright.mjs';
import { spiralSvg } from './lib/spiral.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'assets', 'img');
const FONTS = pathToFileURL(path.join(ROOT, 'src', 'assets', 'fonts')).href;

const SPIRAL =
  'M40.14 25.67 A1.81 1.81 0 0 1 41.95 27.48 A1.81 1.81 0 0 1 40.14 29.29 A3.62 3.62 0 0 1 36.52 25.67 A5.43 5.43 0 0 1 41.95 20.24 A9.05 9.05 0 0 1 51 29.29 A14.48 14.48 0 0 1 36.52 43.76 A23.52 23.52 0 0 1 13 20.24';

const markSvg = (size, stroke = 3.4) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ecd29a"/><stop offset=".55" stop-color="#c9a45c"/><stop offset="1" stop-color="#a8823f"/></linearGradient></defs>
  <path d="${SPIRAL}" fill="none" stroke="url(#g)" stroke-width="${stroke}" stroke-linecap="round"/>
  <circle cx="13" cy="20.24" r="2.6" fill="#ecd29a"/>
  <circle cx="40.6" cy="27.2" r="2.4" fill="#d6423e"/>
</svg>`;

const fontFaces = `
@font-face{font-family:"Newsreader";src:url("${FONTS}/newsreader-display-400-normal.woff2") format("woff2")}
@font-face{font-family:"Newsreader";font-style:italic;src:url("${FONTS}/newsreader-display-400-italic.woff2") format("woff2")}
@font-face{font-family:"Instrument Sans";src:url("${FONTS}/instrument-sans-latin.woff2") format("woff2");font-weight:400 700}`;

const iconHtml = (size) => `<!doctype html><html><head><style>
html,body{margin:0;width:${size}px;height:${size}px;background:#15140f}
body{display:grid;place-items:center}
</style></head><body>${markSvg(Math.round(size * 0.8), 3.6)}</body></html>`;

/** Social card: paper, ink type and the golden-spiral drawing from the site. */
const ogHtml = () => `<!doctype html><html><head><style>${fontFaces}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{position:relative;background:#f4f0e8;color:#15140f;font-family:"Instrument Sans",sans-serif}
.frame{position:absolute;inset:48px 64px;border-top:2px solid #15140f}
.brand{position:absolute;left:64px;top:76px;display:flex;align-items:center;gap:16px}
.tile{width:56px;height:56px;border-radius:12px;background:#15140f;display:grid;place-items:center}
.name{font-family:"Newsreader";font-size:40px;letter-spacing:-.02em;line-height:1}
.sub{font-size:13px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:#6b6659;margin-left:6px}
h1{position:absolute;left:64px;top:190px;width:640px;margin:0;font-family:"Newsreader";font-weight:400;font-size:74px;line-height:1;letter-spacing:-.035em}
h1 em{color:#b3302d}
.meta{position:absolute;left:64px;bottom:64px;display:flex;gap:28px;font-size:16px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#4f4b43}
.meta span:first-child::before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;background:#b3302d;margin-right:12px;vertical-align:1px}
.spiral{position:absolute;right:64px;top:150px;width:420px}
.spiral__sq{fill:none;stroke:#b9ae99;stroke-width:1.3}
.spiral__arc{fill:none;stroke:#a8823f;stroke-width:2.6;stroke-linecap:round}
.spiral__eye{fill:#b3302d}
</style></head><body>
<div class="frame"></div>
<div class="brand"><div class="tile">${markSvg(44)}</div><span class="name">Jarvees</span><span class="sub">Infotech</span></div>
<h1>SAP consulting &amp; <em>Jarvees Academy</em></h1>
${spiralSvg({ height: 400 })}
<div class="meta"><span>ISO 9001 certified</span><span>Since 2019</span><span>Pune</span></div>
</body></html>`;

const jobs = [
  { file: 'og-image.png', html: ogHtml(), width: 1200, height: 630 },
  { file: 'icon-512.png', html: iconHtml(512), width: 512, height: 512 },
  { file: 'icon-192.png', html: iconHtml(192), width: 192, height: 192 },
  { file: 'apple-touch-icon.png', html: iconHtml(180), width: 180, height: 180 },
];

const { chromium } = await loadPlaywright();
const browser = await chromium.launch(launchOptions());
const tmp = await mkdtemp(path.join(os.tmpdir(), 'jarvees-img-'));
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1 });
    const file = path.join(tmp, `${job.file}.html`);
    await writeFile(file, job.html);
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, job.file), type: 'png' });
    await page.close();
    const size = (await readFile(path.join(OUT, job.file))).length;
    console.log(`✓ ${job.file} (${job.width}×${job.height}, ${(size / 1024).toFixed(1)} KB)`);
  }
} finally {
  await browser.close();
  await rm(tmp, { recursive: true, force: true });
}
