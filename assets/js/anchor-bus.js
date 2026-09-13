/**
 * anchor-bus.js — the one channel between the 3D splatter and the DOM bubbles.
 *
 * The work bubbles are real DOM buttons (so they stay keyboard- and
 * screen-reader-accessible) but they have to sit on points of a cloud that
 * only the WebGL layer knows about. Rather than thread a camera reference
 * through venue.js -> venue-scene.js -> the bubbles, the splatter writes each
 * frame's projected screen positions here and the bubbles read them.
 *
 * A shared mutable object, not a pub/sub: the reader runs its own frame loop,
 * so at worst it renders one frame behind the cloud — imperceptible, and far
 * less machinery than an event system.
 */

export const anchorBus = {
  /** Projected anchor positions in CSS pixels: { x, y, scale, onScreen }. */
  anchors: [],
  /** 0..1 — how assembled the mark currently is. Bubbles fade with it. */
  form: 0,
  /** True once the splatter has mounted and is publishing real positions. */
  live: false,
  /**
   * True only while scroll is inside Selected Work.
   *
   * `form` alone is not enough to gate the bubbles: the mark is equally
   * assembled at the hero and again on the LED wall, and work thumbnails have
   * no business in either place. This is the chapter window itself.
   */
  inWindow: false,
};
