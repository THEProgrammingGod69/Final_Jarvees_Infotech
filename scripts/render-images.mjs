#!/usr/bin/env node
/**
 * Renders the raster brand assets (social preview + app icons) from HTML
 * templates with Playwright, into src/assets/img/.
 *
 *   npm i -D playwright && npx playwright install chromium   (one-time)
 *   node scripts/render-images.mjs
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'assets', 'img');
const FONTS = pathToFileURL(path.join(ROOT, 'src', 'assets', 'fonts')).href;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // Fall back to a globally installed copy.
    const globalRoot = path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules');
    return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
  }
}

const SPIRAL =
  'M40.14 25.67 A1.81 1.81 0 0 1 41.95 27.48 A1.81 1.81 0 0 1 40.14 29.29 A3.62 3.62 0 0 1 36.52 25.67 A5.43 5.43 0 0 1 41.95 20.24 A9.05 9.05 0 0 1 51 29.29 A14.48 14.48 0 0 1 36.52 43.76 A23.52 23.52 0 0 1 13 20.24';

const markSvg = (size, stroke = 3.4) => `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6ead0"/><stop offset=".5" stop-color="#c9a45c"/><stop offset="1" stop-color="#9a7533"/></linearGradient></defs>
  <path d="${SPIRAL}" fill="none" stroke="url(#g)" stroke-width="${stroke}" stroke-linecap="round"/>
  <circle cx="13" cy="20.24" r="2.6" fill="#e9d9b2"/>
  <circle cx="40.6" cy="27.2" r="2.4" fill="#e0393f"/>
</svg>`;

const fontFaces = `
@font-face{font-family:"Unbounded";src:url("${FONTS}/unbounded-latin.woff2") format("woff2");font-weight:400 700}
@font-face{font-family:"Instrument Sans";src:url("${FONTS}/instrument-sans-latin.woff2") format("woff2");font-weight:400 700}
@font-face{font-family:"JetBrains Mono";src:url("${FONTS}/jetbrains-mono-latin.woff2") format("woff2");font-weight:400 600}`;

const iconHtml = (size) => `<!doctype html><html><head><style>
html,body{margin:0;width:${size}px;height:${size}px;background:#06080f}
body{display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#151d33 0%,#06080f 70%)}
</style></head><body>${markSvg(Math.round(size * 0.78), 3.6)}</body></html>`;

/** Static dotted globe for the social card (same maths as the live canvas). */
function globeDots(cx, cy, r, n = 900) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const rotY = 0.9;
  const rotX = -0.42;
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const t = golden * i;
    const x = Math.cos(t) * rr;
    const z = Math.sin(t) * rr;
    const x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
    const z1 = -x * Math.sin(rotY) + z * Math.cos(rotY);
    const y1 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
    const z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);
    const depth = (z2 + 1) / 2;
    const front = z2 >= 0;
    const size = 0.8 + depth * 1.8;
    out.push(
      `<rect x="${(cx + x1 * r - size / 2).toFixed(1)}" y="${(cy + y1 * r - size / 2).toFixed(1)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="${front ? '#f4e4c2' : '#5b93ff'}" opacity="${(front ? 0.2 + depth * 0.8 : 0.06 + depth * 0.3).toFixed(2)}"/>`
    );
  }
  return out.join('');
}

const ogHtml = () => `<!doctype html><html><head><style>${fontFaces}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{position:relative;font-family:"Instrument Sans",sans-serif;color:#eef1f8;
  background:radial-gradient(60% 70% at 85% 30%,rgba(201,164,92,.22),transparent 60%),radial-gradient(50% 60% at 0% 100%,rgba(91,147,255,.18),transparent 60%),#05070e}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(148,163,214,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,214,.07) 1px,transparent 1px);background-size:60px 60px;-webkit-mask-image:radial-gradient(ellipse 80% 80% at 30% 40%,#000 30%,transparent 80%)}
.globe{position:absolute;right:-60px;top:15px}
.copy{position:absolute;left:80px;top:80px;width:690px}
.brand{display:flex;align-items:center;gap:18px}
.tile{width:76px;height:76px;border-radius:20px;background:#06080f;border:1px solid rgba(233,217,178,.35);display:grid;place-items:center;box-shadow:0 0 40px rgba(201,164,92,.35)}
.name{font-family:"Unbounded";font-weight:600;font-size:30px;letter-spacing:.08em;text-transform:uppercase;line-height:1}
.sub{font-family:"JetBrains Mono";font-size:14px;letter-spacing:.5em;text-transform:uppercase;color:#e9d9b2;margin-top:8px}
h1{font-family:"Unbounded";font-weight:500;font-size:60px;line-height:1.05;letter-spacing:-.04em;margin:54px 0 0}
h1 em{font-style:normal;background:linear-gradient(100deg,#f6ead0,#d8b46c 45%,#c9a45c);-webkit-background-clip:text;color:transparent}
p{font-size:24px;color:#b6bed2;margin:24px 0 0;line-height:1.4}
.chips{display:flex;gap:12px;margin-top:36px}
.chip{font-family:"JetBrains Mono";font-size:15px;letter-spacing:.12em;text-transform:uppercase;padding:10px 16px;border-radius:999px;border:1px solid rgba(201,164,92,.45);color:#f6ead0;background:rgba(201,164,92,.08)}
.bar{position:absolute;left:0;right:0;bottom:0;height:6px;background:linear-gradient(90deg,#5b93ff,#c9a45c,#e0393f)}
</style></head><body>
<div class="grid"></div>
<svg class="globe" width="560" height="600" viewBox="0 0 560 600">
  <defs><radialGradient id="h" cx="50%" cy="50%" r="50%"><stop offset=".6" stop-color="rgba(201,164,92,.16)"/><stop offset="1" stop-color="rgba(91,147,255,0)"/></radialGradient></defs>
  <circle cx="280" cy="300" r="290" fill="url(#h)"/>
  <circle cx="280" cy="300" r="215" fill="rgba(12,18,36,.75)"/>
  <ellipse cx="280" cy="300" rx="300" ry="74" fill="none" stroke="rgba(233,217,178,.3)" stroke-dasharray="4 8" transform="rotate(-19 280 300)"/>
  ${globeDots(280, 300, 215)}
  <circle cx="555" cy="208" r="6" fill="#e9d9b2"/>
</svg>
<div class="copy">
  <div class="brand"><div class="tile">${markSvg(58)}</div><div><div class="name">Jarvees</div><div class="sub">Infotech</div></div></div>
  <h1>SAP consulting &amp; <em>Jarvees Academy</em></h1>
  <p>Implementation, migration, support and consultant-led training in Pune.</p>
  <div class="chips"><span class="chip">ISO 9001</span><span class="chip">Since 2019</span><span class="chip">Pune</span></div>
</div>
<div class="bar"></div>
</body></html>`;

const jobs = [
  { file: 'og-image.png', html: ogHtml(), width: 1200, height: 630 },
  { file: 'icon-512.png', html: iconHtml(512), width: 512, height: 512 },
  { file: 'icon-192.png', html: iconHtml(192), width: 192, height: 192 },
  { file: 'apple-touch-icon.png', html: iconHtml(180), width: 180, height: 180 },
];

const { chromium } = await loadPlaywright();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
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
