# Handoff: Jarvees Infotech website

Paste this file into a new chat to continue the work. It is self-contained.

## Project
- **Repo:** `THEProgrammingGod69/Final_Jarvees_Infotech`, branch `ccr-18e0c8be-6c1qtu` (latest commit `b2e3fd9`). No PR has been opened yet.
- **What it is:** a static, multi-page, dark/futuristic website for **Jarvees Infotech Pvt. Ltd.** (SAP consulting, Pune) and its training arm, **Jarvees Academy**.
- **Stack:** plain HTML/CSS/JS with no dependencies. `scripts/build.mjs` builds `src/` into `dist/`, and `dist/` is committed.
- **Commands:** `npm start` (build and serve at http://localhost:5173), `npm run build`, `npm run images` (regenerates the OG image and icons; needs Playwright).

## Structure
- `src/pages/*.html`: index, about, services, academy, courses, contact, privacy, 404. Each file starts with JSON front matter in `<!--meta {...} -->` (title, description, nav, scripts, cta).
- `src/partials/`: layout, header, footer, cta, sprite (SVG icons and the spiral `#mark` logo), steps, stars, marquee items.
- `src/data/site.json`: contact details, address, rating. `courses.json`: 8 tracks, 26 courses and the programmes. `services.json`: the consulting services.
- `src/assets/css/main.css`: design tokens at the top. The "Motion layer v2" section holds the newer animations.
- `src/assets/js/main.js`: core interactions and the globe/network canvases. `courses.js`: filters, search, dialog, deep links. `contact.js`: form validation and the WhatsApp/email hand-off.
- **Build features:**
  - `{{> partial}}`, `{{@generator}}`, `{{var}}` template tags
  - `.split` headings pre-split into words at build time
  - CSS minified, and asset URLs get `?v=hash`
  - sitemap and robots files generated
- **Deploy configs:** `netlify.toml`, `vercel.json`, `src/static/.htaccess` (Hostinger/cPanel).

## Content rules from the client (keep these)
- **Address:** show only *Row House 6, Rilicon Fremount Hills CHS, Near Abhinav School, Ambegaon Bk., Pune 411046*. The PIN 411046 is an assumption. Don't show the Narhe or Tilak Road addresses.
- **Never publish:** GST number, CIN, bank or account details, paid-up capital, staff names.
- **Contact:** phones +91 90225 84956 and +91 93075 90139 (the first is assumed to be on WhatsApp). Email jarveesacademy.pune@gmail.com. Facebook `Jarveesacademypune`. Hours 9 AM – 9 PM daily.
- **No invented content:** no fees, durations or fake testimonials. Use the Justdial rating, 4.5/5 from 59 reviews.
- **Placement wording:** "100% placement *assistance*", never a job guarantee.
- The client's sites (jarveesinfotech.com, jarveesacademy.com) can't be reached from the cloud sandbox, and jarveesacademy.com doesn't resolve. Don't link to it.

## Current state
- **Performance pass done:**
  - Lenis removed, native scrolling
  - hero entrances are pure CSS
  - canvases batched, DPR-capped, paused off screen and while scrolling, 30 fps on low-power devices
  - blur kept on the scrolled header only
  - looping animations pause when their section is off screen
- **Measured result (4× CPU throttle):** home LCP 2224 → 272 ms, idle main-thread load 18.6% → 4.4%.
- **Tests:** 27 Playwright interaction checks pass, there are 0 broken internal links, and no page logs a console error.

## Open items and ideas
- Add real photos and the original vector logo when the client sends them. The spiral mark is currently redrawn as SVG.
- Check that the Google Maps embed loads on the live domain; it was blocked in the sandbox.
- Confirm the PIN code and that the WhatsApp number is active.
- Optionally open a PR and deploy to Vercel or Netlify, or upload `dist/` to Hostinger.

## Working conventions
- Edit files in `src/`, run `npm run build`, then commit both `src/` and `dist/`.
- Verify in the browser before pushing: Playwright and Chromium are available in the cloud environment.
- Animate only `transform` and `opacity`, and respect `prefers-reduced-motion`.
