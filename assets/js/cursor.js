/**
 * cursor.js — the ring-and-dot cursor.
 *
 * The dot tracks the pointer exactly; the ring lags behind on an ease, which is
 * what gives it weight. Only ever enabled on a fine pointer with motion allowed
 * — hiding the system cursor on a trackpad user who asked for reduced motion,
 * or on a touch device that has no cursor at all, is a regression, not a flourish.
 */

import { hasFinePointer, prefersReducedMotion, runFrameLoop } from './motion.js';

const RING_EASE = 0.18;
const RING_SIZE = 34;
const RING_SIZE_HOVER = 58;
const HOVER_SELECTOR = 'a, button, [data-pillar], figure';

/**
 * @param {{enabled: boolean}} options
 * @returns {{destroy: () => void, refresh: () => void}}
 */
export function initCursor({ enabled }) {
  const ring = document.querySelector('[data-cursor-ring]');
  const dot = document.querySelector('[data-cursor-dot]');
  if (!ring || !dot) return { destroy: () => {}, refresh: () => {} };

  let stopFrames = null;
  let bound = [];

  const isActive = () => enabled && hasFinePointer() && !prefersReducedMotion();

  const setRingSize = (size) => {
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
  };

  const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  const eased = { ...pointer };

  const onPointerMove = (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    dot.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;
  };

  const start = () => {
    if (stopFrames) return;
    document.documentElement.classList.add('has-cursor');
    addEventListener('pointermove', onPointerMove, { passive: true });

    stopFrames = runFrameLoop(() => {
      eased.x += (pointer.x - eased.x) * RING_EASE;
      eased.y += (pointer.y - eased.y) * RING_EASE;
      ring.style.transform = `translate(${eased.x}px, ${eased.y}px)`;
    });

    bound = Array.from(document.querySelectorAll(HOVER_SELECTOR)).map((el) => {
      const enter = () => setRingSize(RING_SIZE_HOVER);
      const leave = () => setRingSize(RING_SIZE);
      el.addEventListener('pointerenter', enter);
      el.addEventListener('pointerleave', leave);
      return () => {
        el.removeEventListener('pointerenter', enter);
        el.removeEventListener('pointerleave', leave);
      };
    });
  };

  const stop = () => {
    if (!stopFrames) return;
    stopFrames();
    stopFrames = null;
    removeEventListener('pointermove', onPointerMove);
    bound.forEach((unbind) => unbind());
    bound = [];
    document.documentElement.classList.remove('has-cursor');
    setRingSize(RING_SIZE);
  };

  const refresh = () => (isActive() ? start() : stop());
  refresh();

  return { destroy: stop, refresh };
}
