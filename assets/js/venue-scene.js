/**
 * venue-scene.js — the schematic venue, built in linework.
 *
 * A floor grid, three truss goalposts, a stage with an LED wall and line
 * arrays, six moving heads, and a crowd that arrives late. Scroll progress
 * (0..1) is the only real input: it dollies the camera from the door to front
 * of house and assembles the room on the way in — ingress at the top of the
 * scroll, egress (lights down, haze settling, the room emptying) at the very
 * bottom. The mouse steers the head and banks the camera through its turn.
 *
 * The truss and stage don't just slide into position — each one's vertices
 * double as a point cloud that scatters around its true position and
 * coalesces into solid linework as its build window completes.
 *
 * Ported from the `applod-venue` component in the Claude Design project.
 */

import { lerp, clamp01, range, smoothstep } from './math.js';
import { resolvePhase } from './venue-palette.js';
import { mountSplatter } from './venue-splatter.js';

const PALETTE = {
  white: 0xe1e6de,
  cream: 0xf5f4d1,
  charcoal: 0x292931,
  rust: 0xc15513,
  pine: 0x0b6151,
  slate: 0x4b7694,
  indigo: 0x393568,
  navy: 0x283558,
};

/**
 * The late-arriving crowd is the little field of jumping rectangles. Giving
 * every instance a fixed swatch makes it read as a crowd of individual energy
 * rather than one anonymous grey mass — and keeps the movement legible while
 * the house colours change around it.
 */
const CROWD_COLORS = [
  PALETTE.rust,
  PALETTE.pine,
  PALETTE.slate,
  PALETTE.indigo,
  PALETTE.navy,
  PALETTE.white,
];

const FLOOR = { halfWidth: 90, front: 60, back: -260, step: 5 };
const TRUSS_Z = [-40, -85, -130];
const STAGE = { halfWidth: 30, halfDepth: 12, height: 2.4, z: -170 };
const LED = { halfWidth: 20, height: 20, step: 2.5 };
const ARRAY_X = [-26, 26];
const CROWD_COUNT = 900;
/**
 * Beam strength. This was 0.085 with NormalBlending, which was right when the
 * room was Applod White — on the near-black ground the phase ramp now falls to,
 * normal-blended haze reads as flat grey smear. Additive blending plus a much
 * higher base is what makes them read as light rather than as paint.
 */
const BEAM_BASE_OPACITY = 0.34;

const HEADS = [
  [-30, 25, -40],
  [30, 25, -40],
  [-28, 23, -85],
  [28, 23, -85],
  [-14, 21, -130],
  [14, 21, -130],
];

const BEAM_COLORS = [
  PALETTE.rust, PALETTE.pine, PALETTE.slate,
  PALETTE.indigo, PALETTE.rust, PALETTE.slate,
];

/** Progress windows for each beat of the build. */
const CUE = {
  stage: [0.22, 0.48],
  lightsOn: [0.42, 0.62],
  doors: [0.55, 0.78],
  show: [0.68, 0.95],
  // Egress: the last stretch of scroll reads as the room emptying out again,
  // not just "the show at full brightness forever."
  egress: [0.92, 1.0],
};

/** How far a coalescing point drifts from its true position while unformed. */
const SCATTER_RADIUS = 5;
/** Particle size for the coalescing clouds, in world units (sizeAttenuation on). */
const PARTICLE_SIZE = 0.5;
/** Camera bank into a turn — subtle, cinematic, not a rollercoaster. */
const CAMERA_BANK = 0.05;

/**
 * @param {object} T the THREE namespace
 * @returns {{scene: object, camera: object, update: (p: number, t: number, mouse: {x:number,y:number}) => void}}
 */
export function buildVenue(T) {
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const lineMaterial = (opacity) =>
    new T.LineBasicMaterial({ color: PALETTE.charcoal, transparent: true, opacity });
  const segments = (points, material) =>
    new T.LineSegments(new T.BufferGeometry().setFromPoints(points), material);

  const scene = new T.Scene();
  // The scene's own background drives what the renderer clears to, so the
  // phase ramp can repaint the page's whole backdrop without venue.js having
  // to reach back into the renderer's clear colour every frame.
  scene.background = new T.Color(PALETTE.white);
  scene.fog = new T.Fog(PALETTE.white, 30, 300);
  const camera = new T.PerspectiveCamera(58, 1, 0.1, 600);

  const floorMaterial = lineMaterial(0.2);
  scene.add(segments(floorPoints(V), floorMaterial));

  const trussGroup = buildTruss(T, V);
  scene.add(trussGroup);

  const stage = buildStage(T, V);
  scene.add(stage);

  const beams = buildBeams(T, scene);
  const { crowds, crowdMaterials, seeds } = buildCrowd(T, scene);
  const haze = buildHaze(T, scene);
  // Async: adds itself once the mark's alpha has been sampled, no-ops until then.
  const splatter = mountSplatter(T, scene);
  const dummy = new T.Object3D();

  // Reusable colour scratch — resolvePhase writes into these each frame.
  const ground = new T.Color(PALETTE.white);
  const ink = new T.Color(PALETTE.charcoal);
  // The crowd owns its own per-instance Applod colours. Every other piece of
  // linework follows the phase ink, but recolouring the crowd every frame
  // would erase the palette field just as it comes alive.
  const inkTargets = [floorMaterial];

  const update = (p, t, mouse, intensity = 1) => {
    // Walk the palette: ground repaints the backdrop and the fog, ink repaints
    // every piece of linework, so each phase of the build reads as its own
    // state rather than as more of the same pale room.
    resolvePhase(T, p, intensity, ground, ink);
    scene.background.copy(ground);
    scene.fog.color.copy(ground);
    haze.material.color.copy(ground);
    inkTargets.forEach((material) => material.color.copy(ink));
    trussGroup.children.forEach((goalpost) => goalpost.userData.setInk(ink));
    stage.userData.setInk(ink);

    // Camera dolly: arrival -> front of house, banking gently into the turn
    // the mouse steers — the "angle" the room is seen from, not just a shift.
    const z = lerp(46, -142, Math.pow(p, 0.94));
    const y = lerp(9.5, 3.4, range(p, 0, 0.85));
    camera.position.set(mouse.x * 16, y - mouse.y * 2.2, z);
    camera.lookAt(mouse.x * 9, y - 1.5 - mouse.y * 3.5, z - 60);
    camera.rotateZ(-mouse.x * CAMERA_BANK);
    scene.fog.near = lerp(26, 14, p);
    scene.fog.far = lerp(230, 150, p);

    // The truss goes up first — and coalesces from drifting points into
    // solid linework as each goalpost finishes rising.
    trussGroup.children.forEach((goalpost, i) => {
      const risen = range(p, 0.05 + i * 0.05, 0.3 + i * 0.05);
      goalpost.position.y = lerp(-goalpost.userData.height - 4, 0, risen);
      goalpost.userData.setBuildFraction(smoothstep(risen));
    });

    const stageBuild = range(p, ...CUE.stage);
    stage.position.y = lerp(-30, 0, stageBuild);
    stage.userData.setBuildFraction(smoothstep(stageBuild));

    const on = range(p, ...CUE.lightsOn);
    const show = range(p, ...CUE.show);
    const egress = range(p, ...CUE.egress);
    const showLevel = show * (1 - egress); // the show fully fades by p = 1

    beams.forEach((cone, i) => {
      const swing = Math.sin(t * (0.3 + i * 0.06) + i * 1.7);
      cone.rotation.z = swing * (0.28 + showLevel * 0.45) + mouse.x * 0.35;
      cone.rotation.x = Math.cos(t * 0.23 + i) * (0.12 + showLevel * 0.3);
      const pulse = 1 + Math.sin(t * (1.1 + showLevel * 3.2) + i * 2.1) * (0.18 + showLevel * 0.42);
      cone.material.uniforms.uOpacity.value =
        BEAM_BASE_OPACITY * (on * 0.8 + showLevel * 1.5) * pulse * intensity;
      cone.material.uniforms.uMouseX.value = mouse.x;
    });

    // Doors open, then close again: the crowd arrives across CUE.doors and
    // thins across CUE.egress, using the same per-seed depth stagger both ways.
    const doors = range(p, ...CUE.doors);
    const crowdLevel = clamp01(doors - egress * 1.1);
    crowdMaterials.forEach((material) => { material.opacity = crowdLevel * 0.9; });
    if (crowdLevel > 0.001 || doors > 0.001) {
      for (let i = 0; i < CROWD_COUNT; i += 1) {
        const seed = seeds[i];
        const arrived = clamp01((doors - seed.depth * 0.55) * 3);
        const left = clamp01((egress - (1 - seed.depth) * 0.4) * 3);
        const alive = clamp01(arrived - left);
        const bob = Math.sin(t * (1.6 + showLevel * 2.4) + seed.phase) * (0.12 + showLevel * 0.55);
        dummy.position.set(seed.x, bob * (0.4 + showLevel), seed.z);
        dummy.scale.setScalar(seed.scale * alive);
        dummy.rotation.y = mouse.x * 0.2;
        dummy.updateMatrix();
        crowds[seed.colorIndex].setMatrixAt(seed.slot, dummy.matrix);
      }
      crowds.forEach((crowd) => { crowd.instanceMatrix.needsUpdate = true; });
    }

    // Egress thickens the haze one last time — the room settling after
    // load-out — then lets fog swallow it rather than snapping to black.
    haze.material.opacity = 0.22 + showLevel * 0.18 + egress * 0.25;
    haze.position.z = camera.position.z - 90;

    splatter.update(p, t, mouse, intensity, camera);
  };

  return { scene, camera, update };
}

/** The brochure grid, laid flat. */
function floorPoints(V) {
  const points = [];
  const { halfWidth, front, back, step } = FLOOR;
  for (let x = -halfWidth; x <= halfWidth; x += step) points.push(V(x, 0, front), V(x, 0, back));
  for (let z = front; z >= back; z -= step) points.push(V(-halfWidth, 0, z), V(halfWidth, 0, z));
  return points;
}

/**
 * A paired LineSegments + Points built from the same vertex list: the line is
 * the "assembled" state, the points are the "still forming" state. Its
 * userData.setBuildFraction(k) drives both — k=0 is a fully scattered,
 * invisible-line cloud; k=1 is solid linework with the cloud faded out. The
 * conversion is additive to the geometry each structure already had to
 * compute for its LineSegments — no new point layout, just a second read of it.
 * @param {object} T
 * @param {import('three').Vector3[]} points
 * @param {number} baseOpacity
 * @returns {import('three').Group}
 */
function buildCoalescing(T, points, baseOpacity) {
  const group = new T.Group();

  const lineMat = new T.LineBasicMaterial({ color: PALETTE.charcoal, transparent: true, opacity: 0 });
  group.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(points), lineMat));

  const cloudGeo = new T.BufferGeometry().setFromPoints(points);
  const positionAttr = cloudGeo.getAttribute('position');
  const basePositions = positionAttr.array.slice();
  const scatter = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i += 1) {
    const dir = new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const mag = SCATTER_RADIUS * (0.4 + Math.random() * 0.6);
    scatter.set([dir.x * mag, dir.y * mag, dir.z * mag], i * 3);
  }
  const cloudMat = new T.PointsMaterial({
    color: PALETTE.charcoal, size: PARTICLE_SIZE, transparent: true, opacity: 0, sizeAttenuation: true,
  });
  group.add(new T.Points(cloudGeo, cloudMat));

  group.userData.setInk = (color) => {
    lineMat.color.copy(color);
    cloudMat.color.copy(color);
  };

  group.userData.setBuildFraction = (k) => {
    lineMat.opacity = baseOpacity * k;
    cloudMat.opacity = (1 - k) * baseOpacity * 1.8;
    const unformed = 1 - k;
    for (let i = 0; i < points.length; i += 1) {
      const ix = i * 3;
      positionAttr.array[ix] = basePositions[ix] + scatter[ix] * unformed;
      positionAttr.array[ix + 1] = basePositions[ix + 1] + scatter[ix + 1] * unformed;
      positionAttr.array[ix + 2] = basePositions[ix + 2] + scatter[ix + 2] * unformed;
    }
    positionAttr.needsUpdate = true;
  };

  return group;
}

function buildTruss(T, V) {
  const group = new T.Group();

  TRUSS_Z.forEach((z, i) => {
    const halfSpan = 34 - i * 2;
    const height = 26 - i * 2;
    const points = [];
    const face = z - 1;

    const leg = (x) => {
      for (let y = 0; y <= height; y += 2) points.push(V(x - 1, y, face), V(x + 1, y, face));
      points.push(V(x - 1, 0, face), V(x - 1, height, face));
      points.push(V(x + 1, 0, face), V(x + 1, height, face));
      for (let y = 0; y < height; y += 2) points.push(V(x - 1, y, face), V(x + 1, y + 2, face));
    };

    leg(-halfSpan);
    leg(halfSpan);

    for (let x = -halfSpan; x <= halfSpan; x += 2) {
      points.push(V(x, height - 1, face), V(x, height + 1, face));
    }
    points.push(V(-halfSpan, height - 1, face), V(halfSpan, height - 1, face));
    points.push(V(-halfSpan, height + 1, face), V(halfSpan, height + 1, face));
    for (let x = -halfSpan; x < halfSpan; x += 2) {
      points.push(V(x, height - 1, face), V(x + 2, height + 1, face));
    }

    const goalpost = buildCoalescing(T, points, 0.58);
    goalpost.userData.height = height;
    group.add(goalpost);
  });

  return group;
}

function buildStage(T, V) {
  const points = [];
  const { halfWidth: w, halfDepth: d, height: h, z } = STAGE;

  [0, h].forEach((y) => {
    points.push(
      V(-w, y, z - d), V(w, y, z - d),
      V(w, y, z - d), V(w, y, z + d),
      V(w, y, z + d), V(-w, y, z + d),
      V(-w, y, z + d), V(-w, y, z - d),
    );
  });

  [[-w, z - d], [w, z - d], [w, z + d], [-w, z + d]].forEach(([x, cz]) => {
    points.push(V(x, 0, cz), V(x, h, cz));
  });
  for (let x = -w; x <= w; x += 3) points.push(V(x, h, z - d), V(x, h, z + d));

  // LED wall
  for (let x = -LED.halfWidth; x <= LED.halfWidth; x += LED.step) {
    points.push(V(x, h, z - d), V(x, h + LED.height, z - d));
  }
  for (let y = h; y <= h + LED.height; y += LED.step) {
    points.push(V(-LED.halfWidth, y, z - d), V(LED.halfWidth, y, z - d));
  }

  // Line arrays
  ARRAY_X.forEach((x) => {
    for (let y = 8; y <= 24; y += 2) {
      points.push(
        V(x - 2, y, z + 6), V(x + 2, y, z + 6),
        V(x - 2, y, z + 6), V(x - 2, y + 2, z + 6),
        V(x + 2, y, z + 6), V(x + 2, y + 2, z + 6),
      );
    }
  });

  return buildCoalescing(T, points, 0.7);
}

/** Vertex shader is a plain pass-through — all the beam's shading happens
 *  per-fragment, driven by uMouseX (see buildBeams below). */
const BEAM_VERTEX = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Beams on the side the mouse leans toward warm from their assigned color
 *  toward the rust accent — a genuine shader response to uMouseX, not just a
 *  JS-computed transform. */
const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uOpacity;
  uniform float uMouseX;
  uniform float uConeX;

  void main() {
    float side = sign(uConeX);
    float align = clamp(uMouseX * side * 2.0, 0.0, 1.0);
    vec3 color = mix(uColor, uAccent, align * 0.6);
    gl_FragColor = vec4(color, uOpacity);
  }
`;

function buildBeams(T, scene) {
  const accent = new T.Color(PALETTE.rust);

  return HEADS.map(([x, y, z], i) => {
    const geometry = new T.ConeGeometry(3.2, 78, 24, 1, true);
    geometry.translate(0, -39, 0);
    const material = new T.ShaderMaterial({
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      uniforms: {
        uColor: { value: new T.Color(BEAM_COLORS[i]) },
        uAccent: { value: accent },
        uOpacity: { value: 0 },
        uMouseX: { value: 0 },
        // Fall back to the beam's own index when it sits on the centerline
        // (x === 0) so sign() still picks a side instead of returning 0.
        uConeX: { value: x || (i % 2 === 0 ? -1 : 1) },
      },
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
    });
    const cone = new T.Mesh(geometry, material);
    cone.position.set(x, y, z);
    scene.add(cone);
    return cone;
  });
}

function buildCrowd(T, scene) {
  const person = new T.PlaneGeometry(1.1, 3.2);
  person.translate(0, 1.6, 0);

  const slots = Array(CROWD_COLORS.length).fill(0);
  const seeds = Array.from({ length: CROWD_COUNT }, (_, i) => {
    const z = -150 + Math.random() * 145;
    const spread = 14 + (z + 150) * 0.3;
    // Split the crowd into real material groups, not just vertex tint. The
    // scene can therefore never wash the small people back to white when its
    // own palette flips at showtime.
    const colorIndex = i % CROWD_COLORS.length;
    return {
      x: (Math.random() - 0.5) * 2 * spread,
      z,
      scale: 0.75 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      depth: range(-z, 5, 150),
      colorIndex,
      slot: slots[colorIndex]++,
    };
  });

  const crowdMaterials = CROWD_COLORS.map((color) => new T.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    // These are the coloured people, not receding architectural linework.
    // Letting scene fog wash over them was what could turn the entire field
    // back to the ground colour near the egress. Their colours stay direct.
    fog: false,
  }));
  const crowds = crowdMaterials.map((material, index) => {
    const crowd = new T.InstancedMesh(person, material, slots[index]);
    scene.add(crowd);
    return crowd;
  });

  return { crowds, crowdMaterials, seeds };
}

/** A haze plane riding ahead of the camera, so distance reads as distance. */
function buildHaze(T, scene) {
  const haze = new T.Mesh(
    new T.PlaneGeometry(400, 120),
    new T.MeshBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  haze.position.set(0, 30, -120);
  scene.add(haze);
  return haze;
}

export { PALETTE, CROWD_COUNT };
