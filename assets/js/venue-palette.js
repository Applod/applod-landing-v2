/**
 * venue-palette.js — the production's colour journey.
 *
 * House lights down. The room starts as a pale empty hall, cools through navy
 * and indigo structure, then *falls* — fast, between 0.45 and 0.72 — into a
 * near-black auditorium where the beams and the splatter are the only light.
 * Egress brings the house lights back up just as quickly.
 *
 * Two concerns are deliberately kept apart:
 *
 *   - this file drives the **3D scene** ground and ink, as a continuous ramp;
 *   - page chrome (body copy, panels, rules) is switched by a **binary**
 *     `.is-dark` class on <html>, see `isDarkAt` below.
 *
 * That split is the whole point. A continuous ramp applied to text would pass
 * through mid-greys where neither charcoal nor white is readable, so the page
 * only ever sits in one of two contrast-checked states and crossfades between
 * them.
 */

import { clamp01 } from './math.js';

/**
 * Ordered by `at` (scroll progress 0..1). `ground` doubles as the scene
 * background and the fog colour, so geometry fades into the ground rather
 * than into a mismatched haze.
 *
 * The 0.45 -> 0.72 segment is intentionally steep: the room must not linger
 * in mid-grey, which is where contrast dies in both directions.
 */
export const PHASES = Object.freeze([
  { at: 0.00, ground: 0xe1e6de, ink: 0x292931, label: 'arrival' },
  { at: 0.22, ground: 0xd2d8d0, ink: 0x283558, label: 'load-in' },
  { at: 0.45, ground: 0xc3cbc4, ink: 0x393568, label: 'build' },
  { at: 0.52, ground: 0xb7bfb8, ink: 0x393568, label: 'dimming' },
  { at: 0.59, ground: 0x2a3134, ink: 0xe1e6de, label: 'crossing' },
  { at: 0.66, ground: 0x181d1f, ink: 0xe1e6de, label: 'doors' },
  { at: 0.90, ground: 0x121618, ink: 0xe1e6de, label: 'showtime' },
  { at: 0.945, ground: 0x121618, ink: 0xe1e6de, label: 'last-look' },
  { at: 0.985, ground: 0xe1e6de, ink: 0x292931, label: 'egress' },
  { at: 1.00, ground: 0xe1e6de, ink: 0x292931, label: 'out' },
]);

/**
 * Thresholds for the page-chrome switch.
 *
 * Dark is a *window*, not a one-way trip: the room goes black at the doors and
 * the house lights come back up on egress, and chrome has to follow both
 * edges. Missing the trailing edge leaves white body copy on the pale egress
 * ground for the last tenth of the page.
 *
 * Both edges carry hysteresis so a scroll jitter sitting exactly on a boundary
 * can't strobe the whole page.
 *
 * These sit at the *midpoint of the ground's own fall*, not at a chapter
 * boundary. Measured: charcoal body copy needs a ground above ~0.28 relative
 * luminance to clear AA, Applod White needs one below ~0.13. Between those
 * lies a band where neither works — so the ramp is built to cross it fast and
 * the chrome flips in the middle of that crossing. Moving these without
 * re-measuring the ramp will put text back in the dead zone. The trailing pair straddles p ~= 0.94, which is
 * where the scene ground actually crosses back through mid-luminance.
 */
const DARK_ON = 0.56;
const DARK_OFF = 0.53;
const LIGHT_AGAIN = 0.968;
const DARK_AGAIN = 0.950;

/**
 * @param {number} p scroll progress, 0..1
 * @param {boolean} wasDark the current state — hysteresis needs the previous answer
 * @returns {boolean} whether page chrome should be in its dark state
 */
export function isDarkAt(p, wasDark) {
  const t = clamp01(p);
  if (t <= DARK_OFF) return false;
  if (t >= LIGHT_AGAIN) return false;
  if (t >= DARK_ON && t <= DARK_AGAIN) return true;
  // Inside either hysteresis band — hold whatever state we were already in.
  return wasDark;
}

/** The colour every phase is pulled back toward as intensity drops to 0. */
const NEUTRAL_GROUND = 0xe1e6de;
const NEUTRAL_INK = 0x292931;

/**
 * Resolve the ground and ink colours for a given scroll progress, writing into
 * caller-owned Color instances so the hot path allocates nothing per frame.
 *
 * @param {object} T the THREE namespace
 * @param {number} p scroll progress, 0..1
 * @param {number} intensity 0 = stay on the neutral scheme, 1 = full palette
 * @param {import('three').Color} outGround mutated in place
 * @param {import('three').Color} outInk mutated in place
 */
export function resolvePhase(T, p, intensity, outGround, outInk) {
  const t = clamp01(p);

  let lower = PHASES[0];
  let upper = PHASES[PHASES.length - 1];
  for (let i = 0; i < PHASES.length - 1; i += 1) {
    if (t >= PHASES[i].at && t <= PHASES[i + 1].at) {
      lower = PHASES[i];
      upper = PHASES[i + 1];
      break;
    }
  }

  const span = upper.at - lower.at;
  const k = span > 0 ? clamp01((t - lower.at) / span) : 0;

  outGround.setHex(lower.ground).lerp(scratch(T).setHex(upper.ground), k);
  outInk.setHex(lower.ink).lerp(scratch(T).setHex(upper.ink), k);

  // Intensity dials the whole ramp back toward the original neutral scheme,
  // so 'calm' keeps the restrained look the design shipped with.
  if (intensity < 1) {
    outGround.lerp(scratch(T).setHex(NEUTRAL_GROUND), 1 - intensity);
    outInk.lerp(scratch(T).setHex(NEUTRAL_INK), 1 - intensity);
  }
}

/** Single reusable scratch Color — resolvePhase is called once per frame. */
let scratchColor = null;
function scratch(T) {
  if (!scratchColor) scratchColor = new T.Color();
  return scratchColor;
}
