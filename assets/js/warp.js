/**
 * warp.js — liquid displacement on hover.
 *
 * Each warp target gets its own SVG turbulence + displacement filter. On
 * pointerenter the displacement scale tweens up and the turbulence seed drifts,
 * so the image ripples rather than just scaling; on leave it tweens back to
 * zero and the filter is detached entirely.
 *
 * The filter is only attached while a target is actually warping. An
 * always-on `filter: url(...)` forces every one of these images onto its own
 * composited, filtered layer for the life of the page — measurable idle cost
 * for something visible only on hover.
 */

import { clamp01 } from './math.js';
import { prefersReducedMotion, hasFinePointer } from './motion.js';

const TARGET_SELECTOR = '[data-warp]';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Peak displacement, in px. Enough to ripple; not enough to smear the image. */
const MAX_SCALE = 22;
const ENTER_MS = 460;
const LEAVE_MS = 340;
/** How fast the noise field drifts while hovered, in Hz-ish units. */
const DRIFT_SPEED = 0.00022;
const BASE_FREQUENCY = 0.012;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * @returns {{destroy: () => void}}
 */
export function initWarp() {
  const targets = Array.from(document.querySelectorAll(TARGET_SELECTOR));
  if (targets.length === 0) return { destroy: () => {} };

  // Touch devices have no hover state to speak of, and a visitor who asked for
  // reduced motion should not get a rippling image.
  if (prefersReducedMotion() || !hasFinePointer()) return { destroy: () => {} };

  const defs = document.querySelector('[data-warp-defs]');
  if (!defs) return { destroy: () => {} };

  const bound = targets.map((el, i) => bindTarget(el, defs, i));

  return {
    destroy: () => bound.forEach((unbind) => unbind()),
  };
}

/**
 * @param {Element} el
 * @param {Element} defs
 * @param {number} index
 * @returns {() => void} unbind
 */
function bindTarget(el, defs, index) {
  const id = `applod-warp-${index}`;
  const { filter, turbulence, displacement } = createFilter(defs, id);

  let raf = 0;
  let phase = 0; // 0 = flat, 1 = fully warped
  let direction = 0; // +1 entering, -1 leaving
  let lastNow = 0;

  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const detach = () => {
    el.style.filter = '';
  };

  const tick = (now) => {
    const dt = lastNow ? now - lastNow : 16;
    lastNow = now;

    const span = direction > 0 ? ENTER_MS : LEAVE_MS;
    phase = clamp01(phase + (direction * dt) / span);

    const eased = easeOutCubic(phase);
    displacement.setAttribute('scale', String(eased * MAX_SCALE));
    // Drifting the noise field is what makes it read as liquid rather than
    // as one frozen distortion that merely fades in.
    turbulence.setAttribute(
      'baseFrequency',
      `${BASE_FREQUENCY + Math.sin(now * DRIFT_SPEED) * 0.004} ${
        BASE_FREQUENCY + Math.cos(now * DRIFT_SPEED * 1.3) * 0.004
      }`,
    );

    const settled = (direction > 0 && phase === 1) || (direction < 0 && phase === 0);
    // Hold the loop open at full warp so the noise keeps drifting under the
    // pointer; only stop once it has fully relaxed.
    if (settled && direction < 0) {
      stop();
      detach();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  /** Snap straight to rest, no tween — used when no frames are coming. */
  const rest = () => {
    stop();
    phase = 0;
    direction = 0;
    displacement.setAttribute('scale', '0');
    detach();
  };

  const start = (dir) => {
    // A hidden tab gets no animation frames, so a tween started here would
    // never advance — and a leave would leave the filter attached forever.
    // Settle immediately instead.
    if (document.hidden) {
      if (dir < 0) rest();
      return;
    }
    direction = dir;
    lastNow = 0;
    if (dir > 0) el.style.filter = `url(#${id}) saturate(1.12) contrast(1.06)`;
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const onEnter = () => start(1);
  const onLeave = () => start(-1);
  // Hiding the tab mid-warp would otherwise freeze it mid-ripple until the
  // pointer happens to return.
  const onVisibility = () => {
    if (document.hidden) rest();
  };
  document.addEventListener('visibilitychange', onVisibility);

  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointerleave', onLeave);
  // Keyboard users get the same treatment via the focusable button wrapping it.
  const focusHost = el.closest('button, a') ?? el;
  focusHost.addEventListener('focus', onEnter);
  focusHost.addEventListener('blur', onLeave);

  return () => {
    rest();
    el.removeEventListener('pointerenter', onEnter);
    el.removeEventListener('pointerleave', onLeave);
    focusHost.removeEventListener('focus', onEnter);
    focusHost.removeEventListener('blur', onLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    filter.remove();
  };
}

/**
 * @param {Element} defs
 * @param {string} id
 */
function createFilter(defs, id) {
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  // Room for the displacement to push pixels beyond the source box without
  // clipping the ripple at the edges.
  filter.setAttribute('x', '-15%');
  filter.setAttribute('y', '-15%');
  filter.setAttribute('width', '130%');
  filter.setAttribute('height', '130%');
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const turbulence = document.createElementNS(SVG_NS, 'feTurbulence');
  turbulence.setAttribute('type', 'fractalNoise');
  turbulence.setAttribute('baseFrequency', `${BASE_FREQUENCY} ${BASE_FREQUENCY}`);
  turbulence.setAttribute('numOctaves', '2');
  turbulence.setAttribute('result', 'noise');

  const displacement = document.createElementNS(SVG_NS, 'feDisplacementMap');
  displacement.setAttribute('in', 'SourceGraphic');
  displacement.setAttribute('in2', 'noise');
  displacement.setAttribute('scale', '0');
  displacement.setAttribute('xChannelSelector', 'R');
  displacement.setAttribute('yChannelSelector', 'G');

  filter.append(turbulence, displacement);
  defs.append(filter);

  return { filter, turbulence, displacement };
}
