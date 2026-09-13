/**
 * work-bubbles.js — Selected Work, as bubbles sitting on the logo.
 *
 * Each item in `assets/data/work.json` becomes one bubble pinned to a point of
 * the splatter's mark. The splatter publishes those points' screen positions on
 * the anchor bus every frame; this module moves the bubbles to match.
 *
 * The bubbles are real <a> elements, not WebGL. That is deliberate: a canvas
 * gives no keyboard focus, no screen-reader text and no middle-click, and a
 * portfolio that only works for mouse users is not finished. Projecting DOM on
 * top of the cloud keeps all of that for free, and at this scale the depth
 * interleaving you lose is invisible — the mark renders as a near-flat plane.
 *
 * Pointer and touch are handled differently on purpose:
 *   - fine pointer: hover a bubble to zoom it, click to open;
 *   - touch: drag *horizontally* to move focus between bubbles, tap to open,
 *     while vertical drags fall through to the page scroller untouched.
 */

import { anchorBus } from './anchor-bus.js';
import { requestAnchors } from './venue-splatter.js';
import { hasFinePointer, prefersReducedMotion, runFrameLoop } from './motion.js';

const MANIFEST_URL = 'assets/data/work.json';

/** Below this assembled-ness the bubbles are hidden — the mark is scattered. */
const FORM_THRESHOLD = 0.35;
/** How close the cursor must get, in px, before a bubble starts to swell. */
const PROXIMITY_REACH = 260;

/** Touch: how far a horizontal drag must go before it counts as scrubbing. */
const SCRUB_SLOP = 8;

/**
 * @returns {{destroy: () => void}}
 */
export function initWorkBubbles() {
  const layer = document.querySelector('[data-work-bubbles]');
  if (!layer) return { destroy: () => {} };

  let stopFrames = null;
  let bubbles = [];
  let teardown = [];

  const run = async () => {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) throw new Error(`${MANIFEST_URL} -> ${response.status}`);
    const { items } = await response.json();
    if (!Array.isArray(items) || items.length === 0) return;

    bubbles = items.map((item, i) => buildBubble(item, i));
    layer.replaceChildren(...bubbles.map((b) => b.el));
    requestAnchors(items.length);

    // The tile grid is retired for anyone who actually gets bubbles — it was
    // appearing during the approach to Selected Work, before the mark had
    // re-formed, which read as the old design flashing up. Reduced-motion
    // visitors never see bubbles at all, so they keep the grid.
    if (!prefersReducedMotion()) {
      document.documentElement.classList.add('has-bubble-work');
    }

    if (hasFinePointer()) {
      teardown.push(...bubbles.map((b) => bindHover(b)));
    } else {
      teardown.push(bindTouchScrub(layer, bubbles));
    }

    stopFrames = runFrameLoop(() => positionBubbles(layer, bubbles));
  };

  run().catch((error) => {
    // No bubbles is a plainer Selected Work, never a broken page — the
    // fallback grid in the markup stays visible if this never mounts.
    console.warn('work-bubbles: skipped —', error.message);
    layer.hidden = true;
  });

  return {
    destroy: () => {
      stopFrames?.();
      teardown.forEach((fn) => fn());
      teardown = [];
      layer.replaceChildren();
    },
  };
}

/**
 * @param {{id: string, title: string, event: string, caption: string, poster: string, href: string}} item
 * @param {number} index
 */
function buildBubble(item, index) {
  const el = document.createElement('a');
  el.className = 'work-bubble';
  el.href = item.href;
  el.target = '_blank';
  el.rel = 'noopener noreferrer';
  el.dataset.index = String(index);
  // The caption carries the real description, so it is the accessible name —
  // "Adidas Philippines" alone would not tell a screen-reader user what this is.
  el.setAttribute('aria-label', `${item.title} — ${item.caption} (opens Instagram)`);

  const media = document.createElement('span');
  media.className = 'work-bubble__media';
  const img = document.createElement('img');
  img.src = item.poster;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  media.append(img);

  const label = document.createElement('span');
  label.className = 'work-bubble__label';
  label.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.className = 'work-bubble__title';
  title.textContent = item.title;
  const meta = document.createElement('span');
  meta.className = 'work-bubble__meta';
  meta.textContent = item.event;
  label.append(title, meta);

  el.append(media, label);
  return { el, item };
}

/** Last known cursor position, for the proximity swell. */
const pointer = { x: -9999, y: -9999, seen: false };
addEventListener('pointermove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.seen = true;
}, { passive: true });

/**
 * Move every bubble onto its anchor. Runs each frame.
 * @param {HTMLElement} layer
 * @param {{el: HTMLElement}[]} bubbles
 */
function positionBubbles(layer, bubbles) {
  const visible = anchorBus.live && anchorBus.inWindow && anchorBus.form > FORM_THRESHOLD;
  layer.classList.toggle('is-visible', visible);
  if (!visible) {
    // `visibility` is an inherited property, so the inline `visible` written
    // on each bubble below beats the layer's `hidden` and they keep showing
    // long after the window closes. Clear the inline values rather than
    // relying on the parent to mask them.
    if (layer.style.opacity !== '0') {
      layer.style.opacity = '0';
      bubbles.forEach((b) => { b.el.style.visibility = ''; });
    }
    return;
  }

  // Fade in over the top of the threshold rather than popping on, so the
  // bubbles arrive with the mark instead of ahead of it.
  const reveal = Math.min(1, (anchorBus.form - FORM_THRESHOLD) / (1 - FORM_THRESHOLD));
  layer.style.opacity = String(reveal);

  for (let i = 0; i < bubbles.length; i += 1) {
    const anchor = anchorBus.anchors[i];
    const el = bubbles[i].el;
    if (!anchor || !anchor.onScreen) {
      el.style.visibility = 'hidden';
      continue;
    }
    el.style.visibility = 'visible';
    // translate3d + scale only: never left/top, which would lay out every frame.
    el.style.transform =
      `translate3d(${anchor.x.toFixed(1)}px, ${anchor.y.toFixed(1)}px, 0) ` +
      `translate(-50%, -50%) scale(${anchor.scale.toFixed(3)})`;

    // At rest a work bubble is the same size as every other particle in the
    // mark. Swelling as the cursor approaches is what makes it findable
    // without making it look like a button glued onto the logo.
    const near = pointer.seen
      ? Math.max(0, 1 - Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y) / PROXIMITY_REACH)
      : 0;
    el.style.setProperty('--near', near.toFixed(3));
  }
}

/** @param {{el: HTMLElement}} bubble */
function bindHover(bubble) {
  const enter = () => bubble.el.classList.add('is-focused');
  const leave = () => bubble.el.classList.remove('is-focused');
  bubble.el.addEventListener('pointerenter', enter);
  bubble.el.addEventListener('pointerleave', leave);
  bubble.el.addEventListener('focus', enter);
  bubble.el.addEventListener('blur', leave);
  return () => {
    bubble.el.removeEventListener('pointerenter', enter);
    bubble.el.removeEventListener('pointerleave', leave);
    bubble.el.removeEventListener('focus', enter);
    bubble.el.removeEventListener('blur', leave);
  };
}

/**
 * Touch: horizontal drag scrubs focus between bubbles, vertical drag scrolls.
 *
 * The split is enforced by `touch-action: pan-y` in CSS — the browser keeps
 * vertical panning for the scroller and only hands us horizontal movement, so
 * this never fights the page the way a blanket preventDefault would.
 *
 * @param {HTMLElement} layer
 * @param {{el: HTMLElement}[]} bubbles
 */
function bindTouchScrub(layer, bubbles) {
  let startX = 0;
  let scrubbing = false;
  let focused = -1;

  const setFocus = (index) => {
    if (index === focused) return;
    focused = index;
    bubbles.forEach((b, i) => b.el.classList.toggle('is-focused', i === index));
  };

  const nearest = (x, y) => {
    let best = -1;
    let bestDistance = Infinity;
    anchorBus.anchors.forEach((a, i) => {
      if (!a?.onScreen) return;
      const d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return best;
  };

  const onStart = (event) => {
    startX = event.clientX;
    scrubbing = false;
  };

  const onMove = (event) => {
    if (!scrubbing && Math.abs(event.clientX - startX) < SCRUB_SLOP) return;
    scrubbing = true;
    setFocus(nearest(event.clientX, event.clientY));
  };

  // A scrub should not also follow the link it happens to end on; only a tap
  // that never became a scrub counts as a choice.
  const onClick = (event) => {
    if (scrubbing) {
      event.preventDefault();
      scrubbing = false;
    }
  };

  layer.addEventListener('pointerdown', onStart, { passive: true });
  layer.addEventListener('pointermove', onMove, { passive: true });
  layer.addEventListener('click', onClick);

  return () => {
    layer.removeEventListener('pointerdown', onStart);
    layer.removeEventListener('pointermove', onMove);
    layer.removeEventListener('click', onClick);
  };
}
