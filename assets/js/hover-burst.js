/**
 * hover-burst.js — a small particle burst on pointerenter, for the elements
 * that already carry a hover state (pillars, chips, work tiles, buttons).
 *
 * Independent of the 3D venue on purpose: this is 2D canvas, one shared
 * full-viewport layer, cheap enough to leave running everywhere. A burst
 * fires from the pointer's entry point and its own gravity/drag settle it
 * out within under a second, so overlapping hovers never pile up visibly.
 */

import { prefersReducedMotion, runFrameLoop } from './motion.js';

const TARGET_SELECTOR = '[data-pillar], .chip, .btn, .work__caption, .video-trigger';
const PARTICLES_PER_BURST = 14;
const SPEED_MIN = 0.6;
const SPEED_MAX = 2.4;
const GRAVITY = 0.045;
const DRAG = 0.965;
const LIFE_MS = 620;
const RADIUS_MIN = 1.2;
const RADIUS_MAX = 2.6;

/**
 * @returns {{destroy: () => void}}
 */
export function initHoverBurst() {
  if (prefersReducedMotion()) return { destroy: () => {} };

  const canvas = document.createElement('canvas');
  canvas.className = 'hover-burst-layer';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return { destroy: () => {} };
  }

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-rust').trim() || '#C15513';
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--charcoal').trim() || '#292931';
  const colors = [accent, ink];

  let particles = [];
  let dpr = Math.min(devicePixelRatio, 2);

  const resize = () => {
    dpr = Math.min(devicePixelRatio, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);

  const spawn = (x, y) => {
    const now = performance.now();
    for (let i = 0; i < PARTICLES_PER_BURST; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: RADIUS_MIN + Math.random() * (RADIUS_MAX - RADIUS_MIN),
        color: colors[i % colors.length],
        born: now,
      });
    }
  };

  const onPointerEnter = (event) => {
    // In capture phase, pointerenter can target the document itself (e.g.
    // the pointer entering over a scrollbar) — Document has no .closest().
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest(TARGET_SELECTOR);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = event.clientX ?? rect.left + rect.width / 2;
    const y = event.clientY ?? rect.top + rect.height / 2;
    spawn(x, y);
  };

  // pointerenter doesn't bubble, but capture-phase listening on the document
  // catches it for every matching descendant without per-element binding.
  document.addEventListener('pointerenter', onPointerEnter, true);

  const stopFrames = runFrameLoop(() => {
    if (particles.length === 0) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      return;
    }

    const now = performance.now();
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    particles = particles.filter((p) => now - p.born < LIFE_MS);
    for (const p of particles) {
      p.vx *= DRAG;
      p.vy = p.vy * DRAG + GRAVITY;
      p.x += p.vx;
      p.y += p.vy;

      const life = 1 - (now - p.born) / LIFE_MS;
      ctx.globalAlpha = Math.max(0, life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });

  return {
    destroy: () => {
      stopFrames();
      removeEventListener('resize', resize);
      document.removeEventListener('pointerenter', onPointerEnter, true);
      canvas.remove();
    },
  };
}
