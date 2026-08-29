/** math.js — the three easing/clamping helpers the motion modules share. */

export const lerp = (a, b, t) => a + (b - a) * t;

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Normalise `v` into 0..1 across the [a, b] window. */
export const range = (v, a, b) => clamp01((v - a) / (b - a));

/** Smoothstep — used everywhere a depth transition needs to ease in and out. */
export const smoothstep = (t) => t * t * (3 - 2 * t);
