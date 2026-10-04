#!/usr/bin/env node
/**
 * Minimal static server for previewing dist/ (zero dependencies).
 * Usage: node scripts/serve.mjs [port]   →   http://localhost:5173
 * Also imported by scripts/test.mjs, which starts it on a free port.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let file = path.normalize(path.join(ROOT, clean));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null; // path traversal guard
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = path.join(file, 'index.html');
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

/** Static file server for dist/; unknown paths get the 404 page with a 404 status. */
export function createStaticServer() {
  return createServer(async (req, res) => {
    const file = await resolveFile(req.url || '/');
    const target = file || path.join(ROOT, '404.html');
    res.writeHead(file ? 200 : 404, {
      'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    createReadStream(target).pipe(res);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || process.env.PORT || 5173);
  createStaticServer().listen(port, () => console.log(`Serving dist/ at http://localhost:${port}`));
}
