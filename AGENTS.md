# Applod Landing v2 — agent notes

## Purpose

This is Applod Live Production's static marketing site. It presents the event-production journey as six scroll-driven chapters, from Arrival through Showtime and Egress. The visual centerpiece is a three.js venue that assembles as the visitor moves through the page, plus an Applod starburst particle cloud that forms, disperses, and responds to the pointer.

## Run locally

There is no install or build step. From the project root, run:

```bash
python3 scripts/dev-server.py 4832
```

Then open `http://127.0.0.1:4832/`. Do not open `index.html` as a `file://` URL: ES modules and media behavior require an HTTP server.

## Architecture

- `index.html` contains all page content, metadata, and script/style entry points.
- `assets/css/base.css`, `chrome.css`, `stage.css`, `components.css`, `sections.css`, `bubbles.css`, and `modal.css` make up the presentation layer.
- `assets/css/tokens/` contains the imported Applod design-system tokens.
- `assets/js/main.js` initializes independent subsystems.
- `assets/js/venue.js` owns the renderer, input, and frame loop.
- `assets/js/venue-scene.js` builds and animates the stage, truss, sound, lights, beams, and crowd.
- `assets/js/venue-palette.js` controls the pale-arrival to dark-showtime to pale-egress color journey and the page's contrast-safe dark-mode window.
- `assets/js/venue-splatter.js` samples the real Applod starburst and drives the large scene particle cloud.
- `assets/js/anchor-bus.js` carries projected splatter positions from WebGL to the DOM.
- `assets/js/work-bubbles.js` builds accessible Selected Work links from `assets/data/work.json` and pins them to those positions.
- `assets/js/device-tilt.js` maps phone orientation to the desktop camera-input range and owns iOS motion permission UI.
- `assets/js/hero-particles.js` handles the hero lockup's one-shot particle assembly.
- `assets/js/warp.js` applies the fine-pointer hover distortion to work imagery.
- `assets/js/video-modal.js` owns the shared reel/work video dialog.

## Assets

- Hero lockup: `assets/img/wordmark.png` (official Artboard 7 artwork).
- Masthead logo: `assets/img/logo-header.png` (official Artboard 9 artwork).
- Particle source: `assets/img/mark.png`.
- Favicon/social art: `assets/img/mark-icon.png` and `assets/img/og-card.jpg`.
- Posters: `assets/img/*-poster.jpg`.
- Selected Work manifest: `assets/data/work.json`.
- Reel and three case-study videos: `assets/video/*.mp4`.

Keep the videos in ordinary Git storage. The largest is below GitHub's 100 MB per-file limit; Git LFS is not currently needed.

## Motion, mobile, and fallbacks

- Honor `prefers-reduced-motion`. The venue renders a stable frame, depth transforms flatten, looping decoration stops, the logo resolves immediately, and Selected Work uses the complete video grid instead of projected bubbles.
- At widths up to 820px, chapter stages become normal stacked content and scroll depth transforms are disabled.
- Hover warp and cursor effects are for fine pointers only.
- On compatible phones, device orientation steers scene depth and lighting. iOS must request permission from the visible tilt control; never request it automatically or make the site depend on approval.
- If three.js or WebGL fails, content must remain usable against the CSS background.
- Never make critical navigation or video access depend on WebGL, pointer hover, or animation completion.

## Browser-preview limitations

Embedded or background browser previews may report a zero-sized canvas or pause `requestAnimationFrame`; that can make WebGL appear blank even when the page is correct. Confirm visual behavior in a visible browser before diagnosing the renderer. The provided local server disables caching but does not support HTTP Range requests, so video seeking must be verified on Vercel.

## Deployment

The site is deployed as a static Vercel project with no build command and the project root as its output. The public GitHub repository is `Applod/applod-landing-v2`.

- Pushes to `main` create production deployments.
- Other branches and pull requests create preview deployments.
- `.vercel/` contains machine-specific project linkage and must never be committed.
- Do not add `applod.live` until the current Vercel deployment has visual approval.
- Before pushing, check for missing assets, JavaScript syntax errors, accidental credentials, and machine-specific files.
