/**
 * venue.js — <applod-venue>, the fixed 3D backdrop.
 *
 * Owns the renderer, the input smoothing and the frame loop; the scene graph
 * itself lives in venue-scene.js. Three failure modes are handled explicitly,
 * because all three are ordinary on the open web:
 *
 *   - three.js never arrives (CDN blocked)  -> flat Applod White, page intact
 *   - WebGL unavailable or context refused  -> same
 *   - visitor prefers reduced motion        -> one static frame, no loop
 */

import { clamp01 } from './math.js';
import { CONFIG, VENUE_INTENSITY } from './config.js';
import { buildVenue } from './venue-scene.js';
import { isDarkAt } from './venue-palette.js';
import { prefersReducedMotion, runFrameLoop } from './motion.js';

const CLEAR_COLOR = 0xe1e6de;
const MAX_PIXEL_RATIO = 1.75;
const SCROLL_EASE = 0.075;
const POINTER_EASE = 0.05;

/** Where the static frame is posed for reduced-motion visitors: lights up,
 *  stage built, room filling — the most representative moment of the show. */
const STILL_PROGRESS = 0.72;

/** How far the palette ramp travels, per the design's motion-level prop. */
const INTENSITY = VENUE_INTENSITY[CONFIG.motionLevel] ?? VENUE_INTENSITY.confident;

/**
 * Mirror the scene's light level onto <html> as a binary switch, so page chrome
 * only ever sits in one of two contrast-checked states. `isDarkAt` carries the
 * hysteresis; this just avoids touching the DOM when nothing changed.
 *
 * @param {number} p scroll progress, 0..1
 */
function syncChrome(p) {
  const root = document.documentElement;
  const wasDark = root.classList.contains('is-dark');
  const isDark = isDarkAt(p, wasDark);
  if (isDark !== wasDark) root.classList.toggle('is-dark', isDark);
}

/** How long to wait for a deferred three.js before giving up. */
const THREE_POLL_MS = 60;
const THREE_TIMEOUT_MS = 6000;

class ApplodVenue extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    this.waitForThree()
      .then((T) => this.init(T))
      .catch((error) => {
        // A missing backdrop is a downgrade, never a broken page.
        console.warn('applod-venue: backdrop unavailable —', error.message);
        this.setAttribute('data-fallback', '');
      });
  }

  disconnectedCallback() {
    this.teardown?.();
  }

  /** @returns {Promise<object>} the THREE namespace */
  waitForThree() {
    if (window.THREE) return Promise.resolve(window.THREE);

    return new Promise((resolve, reject) => {
      const deadline = Date.now() + THREE_TIMEOUT_MS;
      const poll = () => {
        if (window.THREE) return resolve(window.THREE);
        if (Date.now() > deadline) return reject(new Error('three.js did not load'));
        setTimeout(poll, THREE_POLL_MS);
      };
      poll();
    });
  }

  /** @param {object} T the THREE namespace */
  init(T) {
    const renderer = this.createRenderer(T);
    const { scene, camera, update } = buildVenue(T);

    const resize = () => {
      const width = Math.max(this.clientWidth, innerWidth);
      const height = Math.max(this.clientHeight, innerHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(this);

    if (prefersReducedMotion()) {
      this.renderStill({ renderer, scene, camera, update });
      this.teardown = () => {
        observer.disconnect();
        renderer.dispose();
      };
      return;
    }

    const stopLoop = this.startLoop(T, { renderer, scene, camera, update });
    this.teardown = () => {
      stopLoop();
      observer.disconnect();
      renderer.dispose();
    };
  }

  /** @param {object} T */
  createRenderer(T) {
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setClearColor(CLEAR_COLOR, 1);
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
    this.append(renderer.domElement);
    return renderer;
  }

  /** One pose, one draw, no rAF — the reduced-motion path. */
  renderStill({ renderer, scene, camera, update }) {
    syncChrome(STILL_PROGRESS);
    update(STILL_PROGRESS, 0, { x: 0, y: 0 }, INTENSITY);
    renderer.render(scene, camera);
  }

  /**
   * @returns {() => void} stop
   */
  startLoop(T, { renderer, scene, camera, update }) {
    const pointer = { x: 0, y: 0, active: false };
    // `x` / `y` are eased for the camera's cinematic steering; rawX / rawY
    // are intentionally not eased, so the splatter reacts exactly where the
    // cursor is rather than trailing behind it.
    const easedPointer = { x: 0, y: 0, rawX: 0, rawY: 0, active: false };
    let progress = 0;
    let easedProgress = 0;

    const onPointerMove = (event) => {
      pointer.x = event.clientX / innerWidth - 0.5;
      pointer.y = event.clientY / innerHeight - 0.5;
      pointer.active = true;
    };

    const readScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      progress = clamp01(scrollY / max);
    };

    addEventListener('pointermove', onPointerMove, { passive: true });
    addEventListener('scroll', readScroll, { passive: true });
    readScroll();

    const clock = new T.Clock();

    // Snap the camera to the current scroll instead of easing up from zero,
    // so a reload part-way down the page opens on the right part of the room.
    easedProgress = progress;

    const draw = () => {
      easedProgress += (progress - easedProgress) * SCROLL_EASE;
      easedPointer.x += (pointer.x - easedPointer.x) * POINTER_EASE;
      easedPointer.y += (pointer.y - easedPointer.y) * POINTER_EASE;
      easedPointer.rawX = pointer.x;
      easedPointer.rawY = pointer.y;
      easedPointer.active = pointer.active;

      syncChrome(easedProgress);
      update(easedProgress, clock.getElapsedTime(), easedPointer, INTENSITY);
      renderer.render(scene, camera);
    };

    draw();
    const stopFrames = runFrameLoop(draw);

    return () => {
      stopFrames();
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('scroll', readScroll);
    };
  }
}

if (!customElements.get('applod-venue')) {
  customElements.define('applod-venue', ApplodVenue);
}
