/**
 * hero-particles.js — the Applod lockup assembling out of a split point cloud.
 *
 * The logo starts torn in half: everything left of centre pushed further left,
 * everything right pushed right, both halves lifted into noise. As progress
 * runs the halves slide back together and the particles settle onto their true
 * pixels. A per-particle delay keyed to x makes the logo resolve as a wipe
 * across the lockup rather than snapping into place all at once.
 *
 * The real <img> stays in the DOM and visible the entire time; this only ever
 * layers a <canvas> over it, and hands back to the image at the end. If
 * sampling or drawing fails for any reason, the catch in main.js's boot()
 * leaves the plain logo showing — the same as running with JS disabled.
 */

import { clamp01 } from './math.js';
import { prefersReducedMotion } from './motion.js';

/**
 * Sample every Nth pixel. Measured against the shipped 1024×276 lockup: a
 * stride of 3 yields ~18k points (well past what's drawable in a frame budget
 * shared with the 3D venue), 5 lands at ~6.5k — dense enough to read as solid
 * type at the hero's rendered size, cheap enough to stay at 60fps.
 */
const POINT_STRIDE = 5;
const ALPHA_THRESHOLD = 40;
/** Hard ceiling — if a bigger source is ever swapped in, thin rather than crawl. */
const MAX_POINTS = 9000;

// The opening lockup is the first breath before the venue starts moving. Give
// the split particles time to be noticed instead of resolving like a refresh
// artifact: this now takes a measured 3.2 seconds from scatter to lockup.
const DURATION_MS = 3200;
/** Fraction of the run any single particle takes to travel, leaving the rest
 *  of the budget for the stagger to play out across the lockup's width. */
const PARTICLE_TRAVEL = 0.62;

/** How far the two halves are torn apart, as a fraction of lockup width. */
const SPLIT_FRACTION = 0.42;
/** Vertical scatter, as a fraction of lockup height. */
const LIFT_FRACTION = 0.7;

const SETTLE_HOLD_MS = 420;
const FADE_MS = 560;

/** Read once at module load — the lockup always renders in --charcoal. */
const INK_COLOR =
  getComputedStyle(document.documentElement).getPropertyValue('--charcoal').trim() || '#292931';

/**
 * @returns {{destroy: () => void}}
 */
export function initHeroParticles() {
  const img = document.querySelector('[data-hero-lockup]');
  if (!img || prefersReducedMotion()) return { destroy: () => {} };

  let cancelled = false;
  let canvas = null;

  // A tab backgrounded before or during the animation gets no rAF frames —
  // finish immediately to the static image rather than leaving it stuck
  // invisible under a canvas that will never draw.
  const bail = () => {
    cancelled = true;
    img.style.opacity = '1';
    canvas?.remove();
    canvas = null;
  };
  const onVisibilityChange = () => {
    if (document.hidden) bail();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const run = async () => {
    await ensureLoaded(img);
    if (document.hidden) return bail();

    const points = samplePoints(img);
    if (cancelled || points.length === 0) return;

    canvas = buildCanvas(img);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(devicePixelRatio, 2);
    const cssW = img.clientWidth;
    const cssH = img.clientHeight;
    if (cssW === 0 || cssH === 0) return bail();

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.scale(dpr, dpr);

    const seeded = seedParticles(points, img, cssW, cssH);

    // Everything is ready — hide the static image only now, right before the
    // first drawn frame, so there is never a gap where neither is visible.
    img.style.opacity = '0';
    canvas.style.opacity = '1';

    animate(ctx, seeded, cssW, cssH, () => cancelled);

    await wait(DURATION_MS + SETTLE_HOLD_MS);
    if (cancelled) return;

    canvas.style.transition = `opacity ${FADE_MS}ms ease`;
    canvas.style.opacity = '0';
    img.style.transition = `opacity ${FADE_MS}ms ease`;
    img.style.opacity = '1';
    await wait(FADE_MS);
    canvas?.remove();
    canvas = null;
  };

  run()
    .catch((error) => {
      console.warn('hero-particles: assembly skipped —', error);
      img.style.opacity = '1';
      canvas?.remove();
    })
    .finally(() => document.removeEventListener('visibilitychange', onVisibilityChange));

  return {
    destroy: () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      bail();
    },
  };
}

/** @param {HTMLImageElement} img */
function ensureLoaded(img) {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => reject(new Error('lockup image failed to load')), { once: true });
  });
}

/**
 * Draw the lockup to an offscreen canvas and read back a sparse set of opaque
 * pixel coordinates — the target positions for the assembling particles.
 * @param {HTMLImageElement} img
 * @returns {[number, number][]}
 */
function samplePoints(img) {
  const { naturalWidth: w, naturalHeight: h } = img;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0);

  const { data } = ctx.getImageData(0, 0, w, h);
  const points = [];
  for (let y = 0; y < h; y += POINT_STRIDE) {
    for (let x = 0; x < w; x += POINT_STRIDE) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) points.push([x, y]);
    }
  }

  if (points.length <= MAX_POINTS) return points;
  const keepEvery = Math.ceil(points.length / MAX_POINTS);
  return points.filter((_, i) => i % keepEvery === 0);
}

/**
 * Turn sampled pixel coordinates into particles: scale into CSS space, tear
 * the two halves apart, and assign each one a stagger slot.
 *
 * @param {[number, number][]} points
 * @param {HTMLImageElement} img
 * @param {number} cssW
 * @param {number} cssH
 */
function seedParticles(points, img, cssW, cssH) {
  const scaleX = cssW / img.naturalWidth;
  const scaleY = cssH / img.naturalHeight;
  const split = cssW * SPLIT_FRACTION;
  const lift = cssH * LIFT_FRACTION;
  const staggerBudget = 1 - PARTICLE_TRAVEL;

  return points.map(([px, py]) => {
    const tx = px * scaleX;
    const ty = py * scaleY;
    // Which half of the lockup this pixel belongs to decides which way it flies.
    const side = tx < cssW / 2 ? -1 : 1;
    const jitter = Math.random();

    return {
      tx,
      ty,
      sx: tx + side * split * (0.45 + jitter * 0.55),
      sy: ty + (Math.random() - 0.5) * lift,
      // Left edge resolves first, right edge last — a wipe, not a pop.
      delay: (tx / cssW) * staggerBudget,
    };
  });
}

/**
 * @param {HTMLImageElement} img
 * @returns {HTMLCanvasElement}
 */
function buildCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero__lockup-canvas';
  canvas.style.opacity = '0';
  img.insertAdjacentElement('afterend', canvas);
  return canvas;
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{sx:number, sy:number, tx:number, ty:number, delay:number}[]} particles
 * @param {number} width
 * @param {number} height
 * @param {() => boolean} isCancelled
 */
function animate(ctx, particles, width, height, isCancelled) {
  const start = performance.now();

  const frame = (now) => {
    if (isCancelled()) return;
    const elapsed = clamp01((now - start) / DURATION_MS);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = INK_COLOR;

    // fillRect rather than arc(): at this particle count the path cost of
    // thousands of arcs dominates the frame, and at ~1px the shapes are
    // indistinguishable anyway.
    for (const p of particles) {
      const local = clamp01((elapsed - p.delay) / PARTICLE_TRAVEL);
      const k = easeOutCubic(local);
      const x = p.sx + (p.tx - p.sx) * k;
      const y = p.sy + (p.ty - p.sy) * k;
      ctx.globalAlpha = k * k;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;

    if (elapsed < 1) requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

/** @param {number} ms */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
