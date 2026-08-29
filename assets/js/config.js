/**
 * config.js — the knobs the Claude Design canvas exposed as editor props,
 * carried over as a single frozen config object so they stay tweakable
 * without hunting through the modules.
 */

/**
 * How far the venue's colour ramp travels from the neutral Applod White
 * scheme, per motion level. This used to be a CSS opacity on the backdrop,
 * but the venue now paints the page's whole background — fading it out just
 * washed the palette toward flat white. Dialling the ramp itself keeps every
 * level fully opaque and correctly coloured.
 */
export const VENUE_INTENSITY = Object.freeze({
  calm: 0.45,
  confident: 1,
  maximal: 1.15,
});

export const CONFIG = Object.freeze({
  /** 'calm' | 'confident' | 'maximal' — how loud the 3D backdrop reads. */
  motionLevel: 'confident',
  /** Replace the system cursor with the ring-and-dot pair on fine pointers. */
  customCursor: true,
  /** Show the bottom-left chapter/depth readout. */
  showDepthMeter: true,
  /** Accent colour; overrides the --accent-rust token at runtime. */
  accentColor: '#C15513',
});

/** Below this width the depth conceit is dropped for ordinary scrolling. */
export const DEPTH_BREAKPOINT = '(max-width: 820px)';

/** Total "distance walked" reported by the depth meter, in metres. */
export const DEPTH_METERS = 190;
