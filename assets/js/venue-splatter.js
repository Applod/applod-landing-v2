/**
 * venue-splatter.js — the Applod starburst as a living point cloud.
 *
 * The brand mark is already a splat: an irregular, hand-cut burst. So rather
 * than importing some foreign organic form to scatter, the mark itself becomes
 * the organic form. `assets/img/mark.png`'s alpha channel is sampled into a
 * few thousand points, given a shallow random depth so it reads as a volume
 * rather than a decal, and handed to a ShaderMaterial that:
 *
 *   - drifts every point on cheap curl-ish noise, so the form breathes;
 *   - blends between formed and dispersed states as scroll drives `uForm`;
 *   - shoves points aside as the pointer passes through them.
 *
 * The mark changes material as the house lights go down, because one blend
 * mode cannot serve both grounds: additive light summed over the pale arrival
 * ground is simply white, and invisible. So on the light side it is *ink* —
 * normal-blended charcoal-to-indigo, splattered on the room — and on the dark
 * side it is *light*, additive rust-to-cream that overlaps into hot cores. The
 * switch rides the same threshold as the page's `.is-dark` chrome, so the mark
 * and the room change state together.
 *
 * The mark appears twice: as the hero form on arrival, and reprising against
 * the LED wall at showtime. It's one cloud, not two — it travels down the room
 * with the production, dispersing through the build and re-forming on stage.
 *
 * Sampling is async and failure is silent by design: until the image resolves
 * (and forever, if it 404s) `update()` is a no-op and the venue is exactly what
 * it was before.
 */

import { clamp01, lerp, range, smoothstep } from './math.js';
import { isDarkAt } from './venue-palette.js';
import { anchorBus } from './anchor-bus.js';

const MARK_SRC = 'assets/img/mark.png';

/** Sample every Nth pixel of the mark's alpha. */
const POINT_STRIDE = 4;
const ALPHA_THRESHOLD = 40;
/** Ceiling on point count — this shares a frame budget with the whole venue. */
const MAX_POINTS = 7000;

/** World-space width the mark is scaled to at each of its two placements. */
const ARRIVAL = { x: 0, y: 11, z: -12, width: 26 };
/** Selected Work: re-formed mid-room, close enough that the work bubbles
 *  pinned to it land at a usable size on screen. */
const WORK = { x: 0, y: 9, z: -78, width: 22 };
/**
 * Showtime: the mark playing on the LED wall itself, rather than floating near
 * it. The wall is built at z = STAGE.z - STAGE.halfDepth = -182, spanning
 * x -20..20 and y 2.4..22.4. This sits half a unit proud of that plane so the
 * points never z-fight with the wall's own linework, and the width is chosen
 * so the mark's 512:492 aspect leaves ~0.9 units of margin top and bottom.
 */
const SHOWTIME = { x: 0, y: 12.4, z: -181.5, width: 19 };

/**
 * How far the cloud's depth is squashed once it lands on the wall. An LED wall
 * shows a flat image, so the volume that reads as a splat in mid-air has to
 * collapse — that collapse is the moment the cloud becomes a screen.
 */
const LED_FLATTEN = 0.08;

/** How many bubble anchors to sample and publish. Set by work-bubbles.js. */
let anchorCount = 0;
/** Local-space anchor points, picked once the cloud exists. */
let anchorPoints = null;

/**
 * Ask the splatter to publish `n` well-spread anchor positions on the bus.
 * Called by work-bubbles.js once it knows how many items the manifest holds.
 * @param {number} n
 */
export function requestAnchors(n) {
  anchorCount = Math.max(0, n | 0);
  anchorPoints = null;
}

/** Shallow z-jitter, as a fraction of width — enough for volume, not a slab. */
const DEPTH_FRACTION = 0.14;
/** How far a dispersed point travels from its formed position, in world units. */
const DISPERSE_RADIUS = 34;

/**
 * Scroll windows for the whole journey. These are tuned against the chapter
 * boundaries produced by the track heights in stage.css — Selected Work spans
 * roughly 0.31..0.54 — so the mark is whole exactly while that chapter is on
 * screen, and blows apart only once it has passed.
 *
 * The windows never overlap, which is what lets `form` below be a simple sum
 * of signed steps rather than a state machine.
 */
const CUE = {
  disperse: [0.08, 0.24],
  reform: [0.27, 0.33],
  explode: [0.46, 0.56],
  gather: [0.72, 0.88],
  egress: [0.95, 1.0],
};

/**
 * Point radius in **world units**, not pixels. Screen size is derived in the
 * shader from the projection and the drawing-buffer height, so a point covers
 * the same amount of the *room* whether it's the arrival mark two metres away
 * or the showtime reprise across the hall.
 */
const POINT_SIZE = 0.32;
// The logo should finish as a logo. Keep the live disturbance tight enough to
// feel tactile at the cursor, rather than permanently tearing a hole through
// its middle.
const POINTER_REACH = 3.4;
const POINTER_PUSH = 1.35;

/**
 * Mount the splatter into an existing scene. Returns immediately; the cloud
 * fades in whenever sampling finishes.
 *
 * @param {object} T the THREE namespace
 * @param {import('three').Scene} scene
 * @returns {{update: (p: number, t: number, mouse: {x:number,y:number,rawX:number,rawY:number,active:boolean}, intensity: number, camera: object) => void}}
 */
export function mountSplatter(T, scene) {
  let points = null;
  let material = null;
  const raycaster = new T.Raycaster();
  const cursor = new T.Vector2();
  const plane = new T.Plane(new T.Vector3(0, 0, 1), 0);
  const hit = new T.Vector3();

  loadMark()
    .then((image) => {
      const sampled = samplePoints(image);
      if (sampled.length === 0) return;
      ({ points, material } = buildCloud(T, sampled, image));
      scene.add(points);
    })
    .catch((error) => {
      // A missing splatter is a quieter room, never a broken one.
      console.warn('venue-splatter: skipped —', error.message);
    });

  const update = (p, t, mouse, intensity = 1, camera) => {
    if (!points || !material) return;

    // Whole -> apart -> whole -> apart -> whole -> gone. Because the windows
    // don't overlap, each one contributes its own signed step and the sum is
    // the form: 1 at arrival, 0 by the end of disperse, 1 again through
    // Selected Work, 0 after the explosion, 1 on the wall, 0 on egress.
    const form = clamp01(
      1
        - smoothstep(range(p, ...CUE.disperse))
        + smoothstep(range(p, ...CUE.reform))
        - smoothstep(range(p, ...CUE.explode))
        + smoothstep(range(p, ...CUE.gather))
        - smoothstep(range(p, ...CUE.egress)),
    );

    // Two legs of travel, each one hidden inside a scatter so the mark is
    // never seen sliding: door -> mid-room for Selected Work, then mid-room ->
    // LED wall for the show.
    const legWork = smoothstep(range(p, CUE.disperse[0], CUE.reform[1]));
    const legWall = smoothstep(range(p, CUE.explode[0], CUE.gather[1]));
    points.position.set(
      lerp(lerp(ARRIVAL.x, WORK.x, legWork), SHOWTIME.x, legWall),
      lerp(lerp(ARRIVAL.y, WORK.y, legWork), SHOWTIME.y, legWall),
      lerp(lerp(ARRIVAL.z, WORK.z, legWork), SHOWTIME.z, legWall),
    );

    const width = lerp(lerp(ARRIVAL.width, WORK.width, legWork), SHOWTIME.width, legWall);
    const scale = width / ARRIVAL.width;
    // Squash depth as it lands: a cloud in the air, a flat image on the wall.
    const flat = lerp(1, LED_FLATTEN, smoothstep(range(p, ...CUE.gather)));
    points.scale.set(scale, scale, scale * flat);

    const u = material.uniforms;
    u.uTime.value = t;
    u.uForm.value = form;
    // Dispersed points are dimmer as well as further apart, so the disperse
    // reads as the form thinning out rather than as a solid cloud inflating.
    u.uOpacity.value = clamp01(0.25 + form * 0.75) * intensity;
    // Translate the *real* cursor through the current camera onto the
    // splatter's plane. The former x/y multiplier only worked while the camera
    // was centred; once its scroll dolly or mouse bank moved, the circular
    // force visibly lagged and missed the cursor.
    cursor.set((mouse.rawX ?? mouse.x) * 2, -(mouse.rawY ?? mouse.y) * 2);
    plane.constant = -points.position.z;
    raycaster.setFromCamera(cursor, camera);
    const hasHit = mouse.active && raycaster.ray.intersectPlane(plane, hit);
    if (hasHit) {
      points.worldToLocal(hit);
      u.uMouse.value.set(hit.x, hit.y);
    }
    // Until a real pointer event arrives, the resting (0, 0) value is merely
    // a coordinate — not an interaction. Without this guard it was treated as
    // a cursor parked in the centre of the mark and kept the logo incomplete.
    u.uPointerActive.value = hasHit ? 1 : 0;
    u.uPointerScale.value = 1 / Math.max(scale, 0.001);
    // innerHeight reports 0 whenever the tab is hidden, which would collapse
    // every point to zero pixels; hold the last good value instead.
    const viewportHeight = innerHeight * Math.min(devicePixelRatio, 1.75);
    if (viewportHeight > 0) u.uViewportHeight.value = viewportHeight;

    // Ink on the light ground, light on the dark one. Blending is renderer
    // state rather than shader source, so flipping it is cheap — but it still
    // only happens on the two frames that actually cross the threshold.
    const dark = isDarkAt(p, material.uniforms.uDark.value > 0.5);
    u.uDark.value = dark ? 1 : 0;
    const wanted = dark ? T.AdditiveBlending : T.NormalBlending;
    if (material.blending !== wanted) {
      material.blending = wanted;
      material.needsUpdate = true;
    }

    publishAnchors(T, points, camera, form, p);
  };

  return { update };
}

/**
 * Pick `count` well-spread points from the mark, in the cloud's local space.
 *
 * Farthest-point sampling rather than random picks: the burst is far denser at
 * its centre, so random sampling stacks every bubble in the middle of the logo
 * instead of spreading them across its arms.
 *
 * @param {object} T
 * @param {import('three').Points} points
 * @param {number} count
 */
function pickAnchors(T, points, count) {
  const attr = points.geometry.getAttribute('position');
  const total = attr.count;
  if (total === 0 || count <= 0) return [];

  const chosen = [0];
  const nearest = new Float64Array(total).fill(Infinity);

  while (chosen.length < count && chosen.length < total) {
    const last = chosen[chosen.length - 1];
    const lx = attr.getX(last);
    const ly = attr.getY(last);
    let best = 0;
    let bestDistance = -1;
    for (let i = 0; i < total; i += 1) {
      const dx = attr.getX(i) - lx;
      const dy = attr.getY(i) - ly;
      const d = dx * dx + dy * dy;
      if (d < nearest[i]) nearest[i] = d;
      if (nearest[i] > bestDistance) {
        bestDistance = nearest[i];
        best = i;
      }
    }
    chosen.push(best);
  }

  // z = 0 keeps every bubble on the mark's own plane rather than scattered
  // through its thickness, so they stay co-planar as the cloud flattens.
  return chosen.map((i) => new T.Vector3(attr.getX(i), attr.getY(i), 0));
}

const projected = /* @__PURE__ */ (() => ({ v: null }))();

/**
 * Project the anchors to CSS pixels and publish them for the DOM bubbles.
 * @param {object} T
 * @param {import('three').Points} points
 * @param {import('three').Camera} camera
 * @param {number} form
 * @param {number} p scroll progress
 */
function publishAnchors(T, points, camera, form, p) {
  if (anchorCount === 0 || !camera) {
    anchorBus.live = false;
    return;
  }
  if (!anchorPoints || anchorPoints.length !== anchorCount) {
    anchorPoints = pickAnchors(T, points, anchorCount);
    anchorBus.anchors = anchorPoints.map(() => ({ x: 0, y: 0, scale: 1, onScreen: false }));
  }
  if (!projected.v) projected.v = new T.Vector3();

  const halfW = innerWidth / 2;
  const halfH = innerHeight / 2;
  // Bail while the tab is hidden: innerWidth reports 0 and every bubble would
  // be flung to the top-left corner.
  if (halfW === 0 || halfH === 0) return;

  points.updateMatrixWorld();
  for (let i = 0; i < anchorPoints.length; i += 1) {
    const out = anchorBus.anchors[i];
    projected.v.copy(anchorPoints[i]).applyMatrix4(points.matrixWorld);
    const depth = -projected.v.clone().applyMatrix4(camera.matrixWorldInverse).z;
    projected.v.project(camera);
    out.x = (projected.v.x + 1) * halfW;
    out.y = (1 - projected.v.y) * halfH;
    // Perspective size falloff, clamped so a bubble never collapses or blows up.
    out.scale = Math.max(0.35, Math.min(1.6, 46 / Math.max(depth, 1)));
    out.onScreen =
      projected.v.z < 1 && out.x > -200 && out.x < innerWidth + 200 &&
      out.y > -200 && out.y < innerHeight + 200;
  }
  anchorBus.form = form;
  // Bounded by the same cues that re-form and then blow apart the mark, so the
  // bubbles can never outlive the shape they are pinned to.
  anchorBus.inWindow = p >= CUE.reform[0] && p <= CUE.explode[1];
  anchorBus.live = true;
}

/** @returns {Promise<HTMLImageElement>} */
function loadMark() {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`${MARK_SRC} failed to load`));
    image.src = MARK_SRC;
  });
}

/**
 * Read the mark's alpha channel into a sparse set of opaque pixel coordinates.
 * Same technique as hero-particles.js, but the result feeds a GPU buffer here
 * rather than a 2D canvas, so it stays in image space and is normalised later.
 *
 * @param {HTMLImageElement} image
 * @returns {[number, number][]}
 */
function samplePoints(image) {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(image, 0, 0);

  const { data } = ctx.getImageData(0, 0, w, h);
  const found = [];
  for (let y = 0; y < h; y += POINT_STRIDE) {
    for (let x = 0; x < w; x += POINT_STRIDE) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) found.push([x, y]);
    }
  }

  if (found.length <= MAX_POINTS) return found;
  const keepEvery = Math.ceil(found.length / MAX_POINTS);
  return found.filter((_, i) => i % keepEvery === 0);
}

/**
 * @param {object} T
 * @param {[number, number][]} sampled
 * @param {HTMLImageElement} image
 */
function buildCloud(T, sampled, image) {
  const count = sampled.length;
  const scale = ARRIVAL.width / image.naturalWidth;
  const depth = ARRIVAL.width * DEPTH_FRACTION;

  const position = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const tint = new Float32Array(count);

  const halfW = image.naturalWidth / 2;
  const halfH = image.naturalHeight / 2;

  for (let i = 0; i < count; i += 1) {
    const [px, py] = sampled[i];
    // Image space is y-down; world space is y-up.
    position.set(
      [(px - halfW) * scale, (halfH - py) * scale, (Math.random() - 0.5) * depth],
      i * 3,
    );

    const dir = new T.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize();
    const mag = DISPERSE_RADIUS * (0.3 + Math.random() * 0.7);
    scatter.set([dir.x * mag, dir.y * mag, dir.z * mag], i * 3);

    seed[i] = Math.random() * Math.PI * 2;
    tint[i] = Math.random();
  }

  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(position, 3));
  geometry.setAttribute('aScatter', new T.BufferAttribute(scatter, 3));
  geometry.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
  geometry.setAttribute('aTint', new T.BufferAttribute(tint, 1));

  const material = new T.ShaderMaterial({
    vertexShader: SPLATTER_VERTEX,
    fragmentShader: SPLATTER_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uForm: { value: 1 },
      uOpacity: { value: 0 },
      uSize: { value: POINT_SIZE },
      uViewportHeight: { value: 900 },
      uMouse: { value: new T.Vector2(0, 0) },
      uPointerActive: { value: 0 },
      uPointerScale: { value: 1 },
      uWarm: { value: new T.Color(0xc15513) },
      uCool: { value: new T.Color(0xf5f4d1) },
      uInkWarm: { value: new T.Color(0x292931) },
      uInkCool: { value: new T.Color(0x393568) },
      uDark: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: T.NormalBlending,
  });

  return { points: new T.Points(geometry, material), material };
}

/**
 * Curl-ish drift without a noise texture: three offset sines read as a
 * divergence-free-looking swirl at this density, and cost a fraction of real
 * simplex curl noise. The cloud only has to *breathe*, not simulate fluid.
 */
const SPLATTER_VERTEX = /* glsl */ `
  attribute vec3 aScatter;
  attribute float aSeed;
  attribute float aTint;

  uniform float uTime;
  uniform float uForm;
  uniform float uSize;
  uniform float uViewportHeight;
  uniform vec2 uMouse;
  uniform float uPointerActive;
  uniform float uPointerScale;

  varying float vTint;
  varying float vFade;

  vec3 drift(vec3 p, float seed, float t) {
    return vec3(
      sin(p.y * 0.22 + t * 0.55 + seed),
      cos(p.z * 0.24 - t * 0.47 + seed * 1.7),
      sin(p.x * 0.21 + t * 0.39 + seed * 2.3)
    );
  }

  void main() {
    // Dispersed points wander much further and much faster than formed ones,
    // so 'formed' still reads as a crisp mark rather than a jittering blob.
    float amplitude = mix(3.2, 0.55, uForm);
    vec3 pos = mix(position + aScatter, position, uForm);
    pos += drift(position, aSeed, uTime) * amplitude;

    // Pointer shove, in the cloud's own local space so it survives the scale
    // change between the arrival and showtime placements.
    vec2 pointer = uMouse;
    vec2 away = pos.xy - pointer;
    float reach = ${POINTER_REACH.toFixed(1)} * uPointerScale;
    float push = smoothstep(reach, 0.0, length(away));
    pos.xy += normalize(away + 0.0001) * push * ${POINTER_PUSH.toFixed(2)} * uPointerScale * uForm * uPointerActive;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    // projectionMatrix[1][1] is 1/tan(fov/2), so this is the standard
    // world-radius -> screen-pixels conversion, with the point kept at least
    // a pixel across so distant ones thin out rather than vanish outright.
    float pixels = uSize * projectionMatrix[1][1] * (uViewportHeight * 0.5) / max(-mv.z, 0.1);
    gl_PointSize = max(pixels, 1.0);

    vTint = aTint;
    // Points that have drifted far from the mark fade out, so the disperse
    // dissolves at its edges instead of ending on a hard shell.
    vFade = mix(0.35, 1.0, uForm);
  }
`;

const SPLATTER_FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform vec3 uInkWarm;
  uniform vec3 uInkCool;
  uniform float uDark;
  uniform float uOpacity;

  varying float vTint;
  varying float vFade;

  void main() {
    // Round, soft-edged sprite. Square points read as pixels; these read as light.
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.06, d);
    if (alpha <= 0.001) discard;

    vec3 ink = mix(uInkWarm, uInkCool, vTint);
    vec3 light = mix(uWarm, uCool, vTint * vTint);
    vec3 color = mix(ink, light, uDark);

    // Ink is opaque paint and needs less coverage to read than additive light
    // does, so the two sides are balanced here rather than by eye per-frame.
    float weight = mix(0.55, 1.0, uDark);
    gl_FragColor = vec4(color, alpha * uOpacity * vFade * weight);
  }
`;
