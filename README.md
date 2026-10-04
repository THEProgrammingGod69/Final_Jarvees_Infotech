# Jarvees Infotech: Website

A fast, animated, multi-page website for **Jarvees Infotech Pvt. Ltd.** (SAP consulting) and its training arm, **Jarvees Academy**, Pune.

- **8 pages:** Home, About, Services, Academy, Courses, Contact, Privacy and a custom 404
- **26-course catalogue** with track filters, live search, shareable URLs and an accessible quick-view dialog
- **A page per course** (`course/<id>.html`) generated from the catalogue data, with syllabus, FAQ, related courses and `Course` structured data
- **Enquiry form** that hands off to WhatsApp or email with the message pre-filled (no backend needed)
- **Design:** editorial and architectural. Warm paper, ink type and hairline rules, with the golden spiral from the Jarvees mark as the one signature visual: a construction drawing generated at build time (`scripts/lib/spiral.mjs`)
- **Type:** Newsreader (display, cut to its headline optical size) and Instrument Sans, both self-hosted
- **Motion, kept quiet on purpose:** the hero spiral draws itself once; sections fade up once as they arrive; hover states change colour or nudge an arrow. No loops, canvases, blur or pointer-driven effects
- **Built for speed:**
  - no framework: about 2 KB of gzipped core JavaScript and 9 KB of gzipped CSS
  - nothing runs while the page is idle, and scrolling stays at a steady 60 fps
  - only `transform`/`opacity` are animated, and only once per element
  - self-hosted fonts and no third-party requests (apart from the map embed on the contact page)
- **Accessible:**
  - semantic HTML, skip link, keyboard-friendly menus and dialog, visible focus states
  - full `prefers-reduced-motion` support
  - content renders without JavaScript (and appears anyway if the script fails to load)

## Quick start

Requires Node.js 18 or newer. There are no dependencies to install.

```bash
npm start          # build into dist/ and serve it at http://localhost:5173
npm run build      # build only
npm run check      # static checks on dist/: links, anchors, ids, ARIA references, JSON-LD
npm test           # build, check, then browser tests (needs Playwright)
```

Preview through a local server (`npm start`) rather than double-clicking the HTML files. Browsers block web fonts and some features on `file://` URLs.

## Project structure

```
src/
  pages/          Page bodies (one file per page, JSON front matter at the top)
  templates/      course.html, rendered once per course into dist/course/<id>.html
  partials/       Shared layout, header, footer, CTA band, icon sprite…
  data/
    site.json     Company details: address, phones, email, hours, rating
    courses.json  Course catalogue, tracks and programmes
    services.json Consulting services (also used by the enquiry form)
  assets/         CSS, JS, fonts, images
  static/         Copied to the site root (favicon, manifest, .htaccess)
scripts/
  build.mjs       Zero-dependency static site builder
  serve.mjs       Local preview server
  check.mjs       Static checks for dist/ (zero dependencies)
  test.mjs        Browser tests with Playwright
  render-images.mjs  Regenerates the social card and app icons (needs Playwright)
  lib/            Shared helpers: spiral drawing, Playwright loader
dist/             The built website. This is the folder you deploy.
```

### Editing content

| To change… | Edit |
| --- | --- |
| Phone numbers, email, address, hours, rating | `src/data/site.json` |
| Courses, topics, tracks, programmes | `src/data/courses.json` (the catalogue, course pages, filters, footer and enquiry form all update) |
| Services listed in the enquiry form | `src/data/services.json` |
| Page copy | `src/pages/*.html` |
| Header, footer, closing call-to-action | `src/partials/*.html` |
| Colours, typography, layout | `src/assets/css/main.css` (design tokens are at the top) |
| The spiral drawing | `scripts/lib/spiral.mjs`, inserted with `{{@spiral}}`, `{{@spiral draw}}` or `{{@spiral hero}}` |

Run `npm run build` after editing (or `npm test` to build and verify) and commit the updated `dist/`.

## Deployment

`dist/` is a plain static site, so any host works:

- **Netlify / Vercel:** connect the repository. `netlify.toml` and `vercel.json` already set the build command (`npm run build`) and the output folder (`dist`).
- **Hostinger / cPanel / any Apache host:** upload the contents of `dist/` to `public_html/`. The included `.htaccess` adds the 404 page, compression and caching.
- **Custom domain:** the site assumes `https://jarveesinfotech.com` for canonical URLs, the sitemap and the social preview. Change `url` in `src/data/site.json` if the domain is different.

## Contact form

The form validates the input in the browser, then opens **WhatsApp** (to +91 90225 84956) or the visitor's **email app** (to jarveesacademy.pune@gmail.com) with the enquiry pre-filled. The website stores nothing. Links such as `contact.html?interest=sap-fico` pre-select the course or service.

## Content decisions

- **Address:** only the registered office is shown: *Row House 6, Rilicon Fremount Hills CHS, Near Abhinav School, Ambegaon Bk., Pune 411046*. The PIN 411046 matches Ambegaon Budruk.
- **Left out on purpose:** GST number, CIN, bank details, paid-up capital and staff names.
- **Mission, vision and objectives:** taken from the company dossier drafts. The goal statement is the company's own.
- **Logo:** the gold six-blade swirl from the company dossier (only an 87×105 px bitmap was available) is redrawn as SVG: `#mark` in `src/partials/sprite.html`, `src/static/favicon.svg` and `scripts/render-images.mjs`. Swap in the original vector when the client sends it.

## Credits

- Fonts: [Newsreader](https://fonts.google.com/specimen/Newsreader) (instanced at its 72 pt optical size) and [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans), both under the SIL Open Font License
