/**
 * motion.js — one place to ask what kind of motion this visitor wants, and to
 * be told when the answer changes.
 */

import { DEPTH_BREAKPOINT } from './config.js';

const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const flatQuery = matchMedia(DEPTH_BREAKPOINT);
const finePointerQuery = matchMedia('(hover: hover) and (pointer: fine)');

export const prefersReducedMotion = () => reducedQuery.matches;

/** True when the page runs as plain stacked sections (narrow viewports). */
export const isFlatLayout = () => flatQuery.matches;

/** True when a precise pointer is present, so a custom cursor makes sense. */
export const hasFinePointer = () => finePointerQuery.matches;

/**
 * Subscribe to any change in the three queries above.
 * @param {() => void} onChange
 * @returns {() => void} unsubscribe
 */
export function watchMotionPreferences(onChange) {
  const queries = [reducedQuery, flatQuery, finePointerQuery];
  queries.forEach((q) => q.addEventListener('change', onChange));
  return () => queries.forEach((q) => q.removeEventListener('change', onChange));
}

/**
 * Run a callback on every animation frame, but only while the tab is visible.
 * @param {(now: number) => void} step
 * @returns {() => void} stop
 */
export function runFrameLoop(step) {
  let handle = 0;
  let running = false;

  const frame = (now) => {
    step(now);
    handle = requestAnimationFrame(frame);
  };

  const start = () => {
    if (running) return;
    running = true;
    handle = requestAnimationFrame(frame);
  };

  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(handle);
  };

  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);
  // A page opened in a background tab gets no frames until it is looked at.
  if (!document.hidden) start();

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
