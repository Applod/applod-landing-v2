# Applod Landing v2

Production implementation of **`Applod Landing v2.dc.html`**, imported from the
Claude Design project [Applod Landing Page Design][project].

[project]: https://claude.ai/design/p/ce3bff1a-b075-4a47-afc5-2bc0c9bec68b

Static site — no build step, no dependencies to install. Open `index.html`
through any web server.

```bash
python3 scripts/dev-server.py 4832
```

## What this is

Six chapters on one page. Scroll is a camera dolly, not a scrollbar: a
schematic venue is drawn in linework behind the content and assembles itself as
you descend — truss, stage, LED wall, line arrays, moving heads, and a crowd
that arrives late, then thins and the lights come down again in the final
stretch. The truss and stage don't just slide into place — each one's own
vertices double as a point cloud that scatters and coalesces into solid
linework as it finishes building. The mouse steers the camera's angle and
banks it into the turn; the six moving-head beams run on a small GLSL shader
that warms toward the rust accent on whichever side the mouse leans. Hovering
a pillar, chip, button, or work tile fires a small particle burst from the
pointer. The hero mark assembles from a scattered point cloud on load, sampled
from the real logo's own alpha channel.

Each chapter's stage rushes toward the viewer and passes through.

| # | Chapter | Fragment | Content |
|---|---------|----------|---------|
| 01 | Arrival | `#top` | Hero, logo mark, "Watch the Reel" |
| 02 | Load-in | `#loadin` | The four service pillars |
| 03 | Build | `#build` | Four projects revealed as bubbles within the particle mark |
| 04 | Soundcheck | `#soundcheck` | About, stats, assurances |
| 05 | Doors | `#doors` | Artist marquee and client roster |
| 06 | Showtime | `#showtime` | Contact, team, colophon |

## Layout

```
index.html
assets/
  css/
    tokens/          design-system tokens, imported verbatim from the project
    base.css         reset, semantic aliases, focus, motion preferences
    bubbles.css      projected Selected Work bubbles and touch/focus states
    chrome.css       venue layer, masthead, depth HUD, custom cursor, hover-burst layer
    stage.css        chapter tracks and sticky stages
    components.css   buttons, chips, hairline grid, marquee, video-trigger tiles
    sections.css     per-chapter layout, hero mark
    modal.css         the shared video-screening dialog
  js/
    main.js            entry point and wiring
    config.js          the canvas editor props, as runtime config
    motion.js          motion-preference queries and the visibility-aware loop
    math.js            lerp / clamp / range / smoothstep
    cursor.js          ring-and-dot cursor
    depth.js           chapter depth transforms and the HUD
    venue.js           <applod-venue> element: renderer, input, frame loop
    venue-scene.js      the venue scene graph — coalescing truss/stage, beam shader, egress
    venue-palette.js    the phase colour ramp the venue walks through
    venue-splatter.js   logo-sampled scene cloud: form, disperse, reform, pointer response
    anchor-bus.js       screen-space bridge from the WebGL mark to accessible DOM
    work-bubbles.js     manifest-driven work links pinned to particle anchors
    device-tilt.js      phone gyro mapping and iOS motion-permission control
    hero-particles.js  the hero lockup's one-shot split-particle assembly
    hover-burst.js     the shared pointer-burst canvas layer
    warp.js             turbulence-displacement hover warp
    video-modal.js      the shared video-screening <dialog>
  img/                logo mark, wordmark, OG card, video posters
  data/work.json      Selected Work content and links
  video/              the four client videos (see "Video" below)
scripts/dev-server.py local no-cache preview server
```

## Logo

Extracted directly from the client's own artwork via its real alpha channel —
not redrawn.

`wordmark.png` (Artboard 7) is the full horizontal lockup and is what the hero
shows: the Applod logotype is drawn lettering, so setting the word in
Metrophobic was never going to match it. It's placed as artwork, with the
accessible name carried by its `alt`. `logo-header.png` (Artboard 9) is the
official compact lockup in the masthead. `mark.png` is the isolated starburst
sampled by the particle systems; `mark-icon.png` is a smaller copy for the
favicon and apple-touch-icon. `og-card.jpg` is composed from the wordmark.

## Colour

The page is a lighting process, not a sequence of pale color cards. It opens in
a cool, empty hall, builds through restrained Applod navy and indigo, then the
house lights fall quickly into a near-black auditorium. Showtime leaves the
beams and particle splatter as the strongest light before Egress brings the
room back up. Scroll progress interpolates these scene colors
(`venue-palette.js`):

| Progress | Phase | Ground | Ink |
|---|---|---|---|
| 0.00 | Arrival | `#E1E6DE` | `#292931` |
| 0.25 | Load-in | `#D2D8D0` | `#283558` |
| 0.45 | Build | `#C3CBC4` | `#393568` |
| 0.62 | Crossing | `#4A534E` | `#8D8C88` |
| 0.72 | Doors | `#181D1F` | `#E1E6DE` |
| 0.88 | Showtime | `#121618` | `#E1E6DE` |
| 1.00 | Egress | `#E1E6DE` | `#292931` |

The scene's own `background` drives what the renderer clears to, and the fog
tracks it so geometry fades into the ground rather than into a mismatched
haze. Page chrome does not interpolate through illegible mid-greys: a binary
`.is-dark` state, with hysteresis at both edges, switches text and controls
between contrast-checked light and dark schemes as the house lights change.

The design's `motionLevel` prop dials how far this ramp travels
(`VENUE_INTENSITY`) instead of fading the backdrop toward flat white.

## Particle splatter and hover

The large atmospheric cloud is built from roughly 3,300 samples of the real
Applod starburst in `mark.png`. It begins overlaid with the hero, loosens into
an Oxigen-inspired splatter as the venue process develops, reforms around the
Selected Work chapter, then gathers onto the LED wall for Showtime. Four
accessible DOM bubbles are projected onto chosen points in the re-formed mark;
hover, focus, or horizontal touch scrubbing reveals each project. The cloud
repels around pointer movement and changes blend mode with the room so it stays
graphic against both the pale hall and dark auditorium.

Fine-pointer hover adds local distortion to work imagery through SVG turbulence
and displacement, plus small pointer bursts on interactive elements. Reduced-
motion and coarse-pointer visitors receive stable, fully usable alternatives.
On compatible phones, tilting the device steers the same camera angle and light
parallax as desktop pointer movement. Android enables the sensor directly;
iOS exposes an explicit permission control because Safari requires a user tap.

## Video

Four clips pulled from the client's Drive and transcoded with ffmpeg
(H.264 + AAC, `+faststart`, native aspect preserved — nothing was cropped,
since all four are finished, edited social pieces with their own title cards,
graphics and HUD-styled overlays, not raw B-roll):

| File | Source | Used as |
|---|---|---|
| `reel.mp4` | `Applod_Company Reel.mp4` | Hero "Watch the Reel" |
| `work-adidas.mp4` | Adidas Philippines — Fun Run & Office Opening 2026 | Reduced-motion work grid and modal |
| `work-jamba.mp4` | Jamba — Cavite Branch Opening | Reduced-motion work grid and modal |
| `work-sofa.mp4` | SoFA BLANC — Graduation Showcase | Reduced-motion work grid and modal |

Each plays on demand in the shared `<dialog>` (`video-modal.js`) — nothing
autoplays or preloads on page load. A genuine representative poster frame sits
in its place until clicked.

## What changed from the `.dc.html`

The artboard runs on Claude Design's canvas runtime (`support.js` — `<x-dc>`,
`DCLogic`, `<x-import>`, `style-hover`, `ref="{{ }}"`, the props panel). None of
that ships. Everything visual is unchanged from the source design; every
computed value was checked against it.

- **Runtime removed.** `support.js`, `<x-dc>` and the `DCLogic` class are gone.
  The component's `startCursor` / `startDepth` / `startHovers` methods became
  `cursor.js` and `depth.js`.
- **Inline styles became a stylesheet.** `style-hover` attributes (a canvas-only
  feature) are real `:hover` rules. Pillar and chip hover states moved from JS
  listeners to CSS, which deletes a whole subsystem.
- **Semantic markup.** `<header>` / `<nav>` / `<main>` / `<section>` / `<footer>`,
  a heading hierarchy with no skipped levels, a skip link, visible focus rings,
  labelled landmarks, and `aria-hidden` on the decorative venue, cursor and HUD.
- **`<image-slot>` retired.** The work grid now shows real video, not
  placeholders — `video-trigger` buttons (poster + play glyph) replaced it
  everywhere it appeared, so the component and its editor-only drag-to-fill
  scaffold were deleted rather than carried forward unused.
- **Editor props became `config.js`** — `motionLevel`, `customCursor`,
  `showDepthMeter`, `accentColor`, with the same defaults.
- **`prefers-reduced-motion` honoured.** The marquee and the blinking arrow
  stop; stages cross-fade without scale or blur; the venue renders one static
  frame instead of running a loop; the hero mark skips straight to its
  assembled state.
- **Flat mode under 820px.** Sticky stages become ordinary stacked sections and
  the depth script stops writing transforms, so nothing is left mid-animation.
- **Robustness.** Frame loops pause when the tab is hidden and pose the page
  once eagerly so a background tab is correct on arrival — the one exception
  is the hero's one-shot particle assembly, which can't be "eagerly posed" to
  a mid-tween frame without defeating the point, so it instead skips straight
  to the finished mark if the tab is hidden when it would start, or if it's
  backgrounded mid-animation. Chapter tracks use `min-height`, so a stage that
  outgrows its track is never clipped out of reach. Subsystems boot
  independently — a failure in one cannot take the others down. `venue.js`
  degrades to flat Applod White if three.js or WebGL is unavailable. The video
  modal's cleanup (pausing, clearing `src`, restoring focus) runs from every
  close path directly rather than relying solely on `<dialog>`'s native
  `close` event, which at least one embedded-browser environment this shipped
  in never dispatched for a programmatic `.close()` at all — the event
  listener stays only as the fallback for Escape.
- **Hover warp.** Work-grid posters ripple through an SVG turbulence +
  displacement filter on hover, with a saturation/contrast lift so the image
  pops against the ground. The filter is attached only while a tile is
  actually warping — an always-on `filter: url(...)` would force every one of
  these images onto its own filtered composited layer for the life of the
  page. Skipped entirely for coarse pointers and reduced-motion visitors.
- **Particle-anchored work.** `venue-splatter.js` publishes projected anchor
  positions through `anchor-bus.js`; `work-bubbles.js` places real links from
  `assets/data/work.json` at those positions. Reduced-motion visitors retain
  the complete video grid, and loading failure leaves that grid in place.
- **SEO.** Title, description, canonical, Open Graph (with a real `og-card.jpg`
  and dimensions), Twitter card, favicon, and `Organization` JSON-LD.
- **A production CSP.** `default-src 'self'` plus the two things actually
  needed cross-origin: `unpkg.com` for three.js and Google Fonts.

## Hosting notes

1. **Canonical URL.** `https://applod.live/` remains the intended canonical URL
   in `index.html`. The first public release uses a Vercel-generated address;
   the custom domain should remain unchanged until visual approval.
2. **Use `scripts/dev-server.py` locally.** It sends no-cache headers so saved
   module changes appear on reload. Like Python's base static server, it does
   not support HTTP Range requests, so verify video seeking on Vercel.
3. **three.js is loaded from unpkg** (pinned to `0.150.1`, the version the
   design used). Vendoring it locally removes a third-party dependency from
   first paint; the r150 classic build also logs a deprecation warning, so
   moving to the ES-module build is the longer-term fix.
4. **The four videos are the client's real, already-edited social deliverables**
   (title cards, graphics and all) — not neutral B-roll. If raw footage becomes
   available later, cropped ambient background loops become a reasonable option
   for the work-grid tiles; until then, playing each one intact in the modal
   is the respectful default.
