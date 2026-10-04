/**
 * Playwright is optional tooling, not a project dependency: load it from the
 * project if installed (npm i -D playwright), otherwise from a global install.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules');
    try {
      return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
    } catch {
      throw new Error('Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium');
    }
  }
}

/** Launch options; CHROMIUM_PATH points at a specific browser binary when needed. */
export const launchOptions = () => (process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
