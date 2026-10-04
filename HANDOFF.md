# Handoff: Jarvees Infotech website

Paste this file into a new chat to continue the work. It is self-contained.

## Project
- **Repo:** `THEProgrammingGod69/Final_Jarvees_Infotech`. No PR has been opened yet.
  - `claude/premium-redesign` (**current**): the premium editorial redesign. Same content, new design system, much faster.
  - `claude/festive-gates-u5ikcq`: the earlier dark "futuristic" design, plus course pages and the test suite (the redesign branch is built on top of it).
- **Why the redesign:** the client found the dark design glitchy, slow and generic. Keep this direction; do not reintroduce canvases, glows, looping animations or pointer effects.
- **What it is:** a static, multi-page, premium editorial website for **Jarvees Infotech Pvt. Ltd.** (SAP consulting, Pune) and its training arm, **Jarvees Academy**.
- **Stack:** plain HTML/CSS/JS with no dependencies. `scripts/build.mjs` builds `src/` into `dist/`, and `dist/` is committed.
- **Commands:** `npm start` (build and serve at http://localhost:5173), `npm run build`, `npm run images` (regenerates the OG image and icons; needs Playwright).

## Structure
- `src/pages/*.html`: index, about, services, academy, courses, contact, privacy, 404. Each file starts with JSON front matter in `<!--meta {...} -->` (title, description, nav, scripts, cta).
- `src/templates/course.html`: rendered once per course into `dist/course/<id>.html` (syllabus, details, enrolment, FAQ built from the data, related courses, Course + BreadcrumbList JSON-LD).
- `src/partials/`: layout, header, footer, cta, sprite (SVG icons and the spiral `#mark` logo), steps, stars, overlays (WhatsApp button).
- `src/data/site.json`: contact details, address, rating. `courses.json`: 8 tracks, 26 courses and the programmes. `services.json`: the consulting services.
- `src/assets/css/main.css`: design tokens at the top (paper, ink, rule, gold, red). Ledger-style section heads (`.sh`), hairline grids (`.cells`), ink bands (`.section--ink`), entrances (`.rv`).
- `src/assets/js/main.js` (~2 KB gzipped): header hairline, mobile menu, one-off entrances. `courses.js`: filters, search, quick-view dialog, deep links. `contact.js`: form validation and the WhatsApp/email hand-off.
- `scripts/lib/spiral.mjs`: the golden-spiral drawing (the signature visual), inserted with `{{@spiral}}`, `{{@spiral draw}}` or `{{@spiral hero}}`.
- **Build features:**
  - `{{> partial}}`, `{{@generator}}`, `{{var}}` template tags
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
- **Design:** editorial and architectural. Warm paper (#f4f0e8), ink (#15140f), hairline rules, gold and red accents taken from the logo. Newsreader display type (instanced at the 72 pt optical size) with Instrument Sans.
- **Performance (4× CPU throttle, before → after the redesign):**
  - idle main thread: home 20.3% → 1.6%, courses and contact about 15% → 0.1%
  - worst frame while scrolling: 83 ms → 17 ms, with no dropped frames
  - core JS 9.2 → 1.7 KB gzipped; CSS 15.4 → 9.1 KB; fonts 112 → 74 KB; social image 298 → 52 KB
- **Tests:** `npm test` builds, runs the static checker and 26 Playwright tests. One test fails if any page runs an infinite animation or contains a canvas.

## Open items and ideas
- Add real photos and the original vector logo when the client sends them. The spiral mark is currently redrawn as SVG.
- Check that the Google Maps embed loads on the live domain; it was blocked in the sandbox.
- Confirm the PIN code and that the WhatsApp number is active.
- Optionally open a PR and deploy to Vercel or Netlify, or upload `dist/` to Hostinger.

## Working conventions
- Edit files in `src/`, run `npm run build`, then commit both `src/` and `dist/`.
- Verify in the browser before pushing: Playwright and Chromium are available in the cloud environment.
- Animate only `transform` and `opacity`, once per element, and respect `prefers-reduced-motion`. No looping animations.
- Run `npm test` before pushing.
