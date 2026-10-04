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

/** Blade of the Jarvees six-blade swirl (redrawn from the company logo), centred on 0,0. */
const BLADE = 'M1.1 -3.81 L1.2 -4.48 L1.39 -5.15 L1.65 -5.81 L1.99 -6.46 L2.39 -7.08 L2.86 -7.69 L3.39 -8.26 L3.98 -8.8 L4.63 -9.31 L5.34 -9.77 L6.1 -10.19 L6.91 -10.55 L7.76 -10.87 L8.66 -11.13 L9.59 -11.33 L10.56 -11.46 L11.57 -11.54 L12.6 -11.54 L13.65 -11.48 L14.72 -11.35 L15.81 -11.14 L16.91 -10.86 L18.01 -10.5 L19.12 -10.07 L20.22 -9.55 L21.31 -8.96 L22.39 -8.3 L23.45 -7.55 L24.49 -6.73 L25.5 -5.83 L28.49 -6.05 L21.31 -11.49 L19.65 -19.83 L18.5 -17.96 L17.24 -18.15 L16 -18.27 L14.77 -18.33 L13.57 -18.32 L12.4 -18.24 L11.25 -18.1 L10.14 -17.9 L9.06 -17.64 L8.01 -17.32 L7.01 -16.95 L6.05 -16.53 L5.14 -16.06 L4.27 -15.55 L3.46 -14.99 L2.69 -14.4 L1.97 -13.77 L1.31 -13.11 L0.71 -12.43 L0.16 -11.71 L-0.34 -10.98 L-0.78 -10.22 L-1.16 -9.45 L-1.48 -8.67 L-1.74 -7.88 L-1.95 -7.08 L-2.11 -6.28 L-2.21 -5.48 L-2.26 -4.69 L-2.26 -3.89 L-2.22 -3.11Z';

const markSvg = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3dc9e"/><stop offset=".5" stop-color="#d0a65a"/><stop offset="1" stop-color="#9c7432"/></linearGradient></defs>
  <g transform="translate(32 32) scale(.8)" fill="url(#g)" stroke="url(#g)" stroke-width=".8" stroke-linejoin="round">
    ${[0, 60, 120, 180, 240, 300].map((a) => `<path d="${BLADE}" transform="rotate(${a})"/>`).join('')}
  </g>
</svg>`;

const fontFaces = `
@font-face{font-family:"Newsreader";src:url("${FONTS}/newsreader-display-400-normal.woff2") format("woff2")}
@font-face{font-family:"Newsreader";font-style:italic;src:url("${FONTS}/newsreader-display-400-italic.woff2") format("woff2")}
@font-face{font-family:"Instrument Sans";src:url("${FONTS}/instrument-sans-latin.woff2") format("woff2");font-weight:400 700}`;

const iconHtml = (size) => `<!doctype html><html><head><style>
html,body{margin:0;width:${size}px;height:${size}px;background:#15140f}
body{display:grid;place-items:center}
</style></head><body>${markSvg(Math.round(size * 0.86))}</body></html>`;

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
