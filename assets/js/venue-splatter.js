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

const MARK_SRC = 'assets/img/mark.png';

/** Sample every Nth pixel of the mark's alpha. */
const POINT_STRIDE = 4;
const ALPHA_THRESHOLD = 40;
/** Ceiling on point count — this shares a frame budget with the whole venue. */
const MAX_POINTS = 7000;

/** World-space width the mark is scaled to at each of its two placements. */
const ARRIVAL = { x: 0, y: 11, z: -12, width: 26 };
const SHOWTIME = { x: 0, y: 13, z: -166, width: 34 };

/** Shallow z-jitter, as a fraction of width — enough for volume, not a slab. */
const DEPTH_FRACTION = 0.14;
/** How far a dispersed point travels from its formed position, in world units. */
const DISPERSE_RADIUS = 34;

/** Scroll windows: formed on arrival, gone through the build, back for the show. */
const CUE = {
  leave: [0.08, 0.34],
  arrive: [0.62, 0.84],
  egress: [0.93, 1.0],
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

    // Form -> disperse -> re-form. `leave` scatters the arrival mark as the
    // build takes over the room; `arrive` pulls it back together on the stage.
    const left = smoothstep(range(p, ...CUE.leave));
    const back = smoothstep(range(p, ...CUE.arrive));
    const egress = smoothstep(range(p, ...CUE.egress));
    const form = clamp01(Math.max(1 - left, back) * (1 - egress));

    // The travel down the room happens while the cloud is scattered, so the
    // mark is never seen sliding — it dissolves at the door and condenses
    // again at the stage.
    const travel = smoothstep(range(p, CUE.leave[0], CUE.arrive[1]));
    points.position.set(
      lerp(ARRIVAL.x, SHOWTIME.x, travel),
      lerp(ARRIVAL.y, SHOWTIME.y, travel),
      lerp(ARRIVAL.z, SHOWTIME.z, travel),
    );
    const scale = lerp(1, SHOWTIME.width / ARRIVAL.width, travel);
    points.scale.setScalar(scale);

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
  };

  return { update };
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
