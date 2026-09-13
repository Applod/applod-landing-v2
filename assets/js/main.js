/**
 * main.js — wiring.
 *
 * Applies the design's theme props, registers the venue custom element, and
 * starts every interactive subsystem. Preference changes (reduced motion, a
 * resize across the depth breakpoint, plugging in a mouse) re-run the same
 * decision rather than being latched at load.
 */

import { CONFIG } from './config.js';
import { watchMotionPreferences } from './motion.js';
import { initCursor } from './cursor.js';
import { initDepth } from './depth.js';
import { initHeroParticles } from './hero-particles.js';
import { initHoverBurst } from './hover-burst.js';
import { initVideoModal } from './video-modal.js';
import { initWarp } from './warp.js';
import { initWorkBubbles } from './work-bubbles.js';
import { initDeviceTilt } from './device-tilt.js';

import './venue.js';

function applyTheme() {
  document.documentElement.style.setProperty('--accent-rust', CONFIG.accentColor);
}

/**
 * Each subsystem is started in isolation: a failure in the cursor must not
 * take the depth system (and with it every stage's visibility) down with it.
 * @param {string} name
 * @param {() => T} run
 * @returns {T | null}
 * @template T
 */
function boot(name, run) {
  try {
    return run();
  } catch (error) {
    console.warn(`applod: ${name} failed to start —`, error);
    return null;
  }
}

function start() {
  boot('theme', applyTheme);

  const cursor = boot('cursor', () => initCursor({ enabled: CONFIG.customCursor }));
  const tilt = boot('device-tilt', initDeviceTilt);
  boot('depth', () => initDepth({ showMeter: CONFIG.showDepthMeter }));
  boot('hero-particles', initHeroParticles);
  boot('hover-burst', initHoverBurst);
  boot('video-modal', initVideoModal);
  boot('warp', initWarp);
  boot('work-bubbles', initWorkBubbles);

  if (cursor || tilt) {
    watchMotionPreferences(() => {
      cursor?.refresh();
      tilt?.refresh();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
