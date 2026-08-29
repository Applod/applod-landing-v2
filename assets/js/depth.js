/**
 * depth.js — chapters rush toward the viewer and pass through.
 *
 * Each chapter's scroll track is read every frame and mapped to three states:
 * approaching from behind (scaled down, blurred, fading up), held at rest, and
 * passing through the viewer (scaled past 1, blurred, fading out). The same
 * pass drives the bottom-left depth meter.
 *
 * Ported from the `startDepth` method of the Claude Design canvas component.
 */

import { clamp01, smoothstep } from './math.js';
import { DEPTH_METERS } from './config.js';
import { isFlatLayout, prefersReducedMotion, runFrameLoop } from './motion.js';

/** Scale a chapter starts at while still approaching from depth. */
const APPROACH_SCALE = 0.8;
const APPROACH_BLUR_PX = 5;

/** Fraction of the track after which the chapter starts passing the viewer. */
const EXIT_START = 0.8;
const EXIT_SCALE_GAIN = 0.55;
const EXIT_BLUR_PX = 6;

/** Below this opacity a stage stops accepting pointer events. */
const INTERACTIVE_OPACITY = 0.6;

const BLUR_EPSILON = 0.05;

/**
 * @param {{showMeter: boolean}} options
 * @returns {{destroy: () => void}}
 */
export function initDepth({ showMeter }) {
  const chapters = Array.from(document.querySelectorAll('[data-chapter]'));
  if (chapters.length === 0) return { destroy: () => {} };

  const hud = document.querySelector('[data-hud]');
  const bar = hud?.querySelector('[data-hud-bar]');
  const label = hud?.querySelector('[data-hud-label]');
  const index = hud?.querySelector('[data-hud-index]');
  const depth = hud?.querySelector('[data-hud-depth]');

  if (hud) hud.hidden = !showMeter;

  const resetStage = (stage) => {
    stage.style.transform = '';
    stage.style.opacity = '';
    stage.style.filter = '';
    stage.style.pointerEvents = '';
    stage.style.willChange = '';
  };

  const paint = () => {
    const viewportHeight = innerHeight;
    const flat = isFlatLayout();
    const reduced = prefersReducedMotion();

    chapters.forEach((chapter) => {
      const stage = chapter.querySelector('[data-stage]');
      if (!stage) return;
      if (flat) return resetStage(stage);

      const rect = chapter.getBoundingClientRect();
      const span = Math.max(1, rect.height - viewportHeight);
      const travelled = clamp01(-rect.top / span); // 0 held -> 1 leaving

      let scale = 1;
      let opacity = 1;
      let blur = 0;

      if (rect.top > 0) {
        // Still approaching from depth.
        const k = smoothstep(clamp01(1 - rect.top / viewportHeight));
        scale = APPROACH_SCALE + k * (1 - APPROACH_SCALE);
        opacity = k;
        blur = (1 - k) * APPROACH_BLUR_PX;
      } else if (travelled > EXIT_START) {
        // Passing the viewer.
        const k = smoothstep((travelled - EXIT_START) / (1 - EXIT_START));
        scale = 1 + k * EXIT_SCALE_GAIN;
        opacity = 1 - k;
        blur = k * EXIT_BLUR_PX;
      }

      // Reduced motion keeps the cross-fade and drops the travel: an opacity
      // change is not the vestibular problem, scale and blur are.
      stage.style.transform = reduced ? '' : `scale(${scale.toFixed(4)})`;
      stage.style.opacity = opacity.toFixed(3);
      stage.style.filter = !reduced && blur > BLUR_EPSILON ? `blur(${blur.toFixed(2)}px)` : 'none';
      stage.style.pointerEvents = opacity > INTERACTIVE_OPACITY ? 'auto' : 'none';
      stage.style.willChange = reduced ? 'opacity' : 'transform, opacity';
    });

    if (!showMeter) return;

    const scrollable = Math.max(1, document.documentElement.scrollHeight - viewportHeight);
    const progress = clamp01(scrollY / scrollable);
    if (bar) bar.style.width = `${(progress * 100).toFixed(1)}%`;
    if (depth) depth.textContent = `${Math.round(progress * DEPTH_METERS)} m`;

    const active = chapters.reduce((current, chapter, i) => {
      const rect = chapter.getBoundingClientRect();
      const midpoint = viewportHeight * 0.5;
      return rect.top <= midpoint && rect.bottom > midpoint ? i : current;
    }, 0);

    if (label) label.textContent = chapters[active].dataset.label ?? '';
    if (index) index.textContent = String(active + 1).padStart(2, '0');
  };

  // Pose everything before the loop starts: in a background tab rAF never
  // fires, and the visitor would otherwise meet an unposed page on arrival.
  paint();
  const stopFrames = runFrameLoop(paint);

  return {
    destroy: () => {
      stopFrames();
      chapters.forEach((chapter) => {
        const stage = chapter.querySelector('[data-stage]');
        if (stage) resetStage(stage);
      });
    },
  };
}
