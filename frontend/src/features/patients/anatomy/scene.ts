// Procedural 3D mouth for the patient profile: 32 glossy teeth with gums, clickable, numbered
// in FDI notation (18–11 | 21–28 upper, 48–41 | 31–38 lower; patient's right on the viewer's
// left). It can close into a bite on typodont bases (like a dental study model), open into
// the two arches, or turn to show each arch's biting surface. Everything is built from
// primitives at runtime, so there are no model files to ship or license.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ToothStatus } from "@/lib/teeth";

export type AnatomyView = "bite" | "arches" | "upper" | "lower";

export interface SceneCallbacks {
  onHover: (fdi: number | null, x: number, y: number) => void;
  onSelect: (fdi: number | null) => void;
}

/* ------------------------------------------------------------------ */
/* Teeth                                                               */
/* ------------------------------------------------------------------ */

type ToothType = "central" | "lateral" | "canine" | "premolar" | "molar";
const TYPE_BY_INDEX: ToothType[] = ["central", "central", "lateral", "canine", "premolar", "premolar", "molar", "molar", "molar"];
// [mesio-distal width, height, bucco-lingual depth]
const DIMS: Record<ToothType, [number, number, number]> = {
  central: [0.92, 1.08, 0.72],
  lateral: [0.76, 0.98, 0.68],
  canine: [0.82, 1.18, 0.86],
  premolar: [0.74, 0.92, 0.96],
  molar: [1.06, 0.86, 1.06],
};
const WIDTHS = [0, 0.9, 0.75, 0.8, 0.72, 0.72, 1.04, 0.98, 0.92];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Half-silhouettes (radius, height) from root apex (-0.95) to crown; the crown starts at 0.
const PROFILES: Record<"incisor" | "canine" | "premolar" | "molar", [number, number][]> = {
  // narrow neck flaring to a wide, straight incisal edge (the "shovel" seen from the front)
  incisor: [[0.02, -0.95], [0.1, -0.85], [0.2, -0.55], [0.27, -0.2], [0.31, 0], [0.37, 0.2], [0.45, 0.45], [0.5, 0.68], [0.5, 0.84], [0.45, 0.93], [0.25, 0.975], [0, 0.98]],
  canine: [[0.02, -0.95], [0.1, -0.85], [0.2, -0.55], [0.28, -0.2], [0.33, 0], [0.42, 0.25], [0.48, 0.5], [0.45, 0.7], [0.34, 0.86], [0.16, 0.96], [0, 1.0]],
  // bulging crown with a dished biting surface (cusps are added on top)
  premolar: [[0.02, -0.95], [0.1, -0.85], [0.21, -0.55], [0.28, -0.2], [0.33, 0], [0.42, 0.25], [0.48, 0.5], [0.49, 0.7], [0.43, 0.84], [0.3, 0.9], [0.12, 0.88], [0, 0.86]],
  molar: [[0.02, -0.95], [0.12, -0.85], [0.22, -0.55], [0.29, -0.2], [0.34, 0], [0.44, 0.25], [0.5, 0.52], [0.5, 0.72], [0.44, 0.85], [0.3, 0.9], [0.12, 0.87], [0, 0.85]],
};
// Enamel shades (sRGB): warmer at the neck, brighter toward the edge, a cool translucent rim on incisors.
const ROOT = new THREE.Color(0xe4d3b0);
const NECK = new THREE.Color(0xede2ca);
const BODY = new THREE.Color(0xf6f2e8);
const EDGE = new THREE.Color(0xf8f6f0);
const TRANSLUCENT = new THREE.Color(0xd9dee2);

function toothGeometry(type: ToothType) {
  const kind = type === "central" || type === "lateral" ? "incisor" : type;
  const profile = new THREE.SplineCurve(PROFILES[kind].map(([r, y]) => new THREE.Vector2(r, y)))
    .getPoints(56)
    .map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));
  const g = new THREE.LatheGeometry(profile, 56);
  const [w, h, d] = DIMS[type];
  // Back teeth are boxier in cross-section than the round lathe.
  const square = kind === "molar" ? 2.9 : kind === "premolar" ? 2.4 : 2;
  const p = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const t = smooth(0.15, 0.98, y);
    const r = Math.hypot(x, z);
    const theta = Math.atan2(z, x);
    const cos = Math.abs(Math.cos(theta));
    const sin = Math.abs(Math.sin(theta));
    const box = Math.pow(1 / Math.pow(Math.pow(cos, square) + Math.pow(sin, square), 1 / square), smooth(-0.1, 0.4, y));
    x *= box;
    z *= box;
    if (kind === "incisor") {
      z *= 1 - 0.7 * t; // thin incisal edge
      x *= 1 + 0.1 * t;
    } else if (kind === "canine") {
      x *= 1 - 0.12 * t;
      z *= 1 - 0.15 * t;
      y += 0.06 * smooth(0.8, 0.98, y);
    } else {
      // two cusps (cheek and tongue side) on premolars, four on molars, around a central fossa
      const cusps = kind === "molar" ? -Math.cos(4 * theta) * 0.08 : -Math.cos(2 * theta) * 0.07;
      y += cusps * smooth(0.72, 0.9, y) * Math.min(1, r / 0.15);
      y -= 0.06 * smooth(0.75, 0.9, y) * (1 - Math.min(1, r / 0.14));
    }
    p.setXYZ(i, x * w, y * h, z * d);

    // Colour, with occlusion baked in: darker at the gum line, between teeth and in the fissures.
    if (y < 0) c.copy(ROOT);
    else if (y < 0.45) c.lerpColors(NECK, BODY, smooth(0, 0.45, y));
    else c.lerpColors(BODY, EDGE, smooth(0.45, 0.9, y));
    if (kind === "incisor") c.lerp(TRANSLUCENT, 0.4 * smooth(0.84, 0.98, y));
    let ao = 0.8 + 0.2 * smooth(-0.05, 0.35, y);
    ao *= 1 - 0.12 * Math.pow(cos, 6) * smooth(0, 0.3, y);
    if (kind === "premolar" || kind === "molar") ao *= 1 - 0.28 * smooth(0.75, 0.9, y) * (1 - Math.min(1, r / 0.16));
    colors.set([c.r * ao, c.g * ao, c.b * ao], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Right half of an arch, from the midline back (patient's right is -x; front is +z). */
function halfArch(side: 1 | -1, scale: number) {
  const pts = [
    [0, 3.0],
    [1.5, 2.62],
    [2.6, 1.62],
    [3.2, 0.2],
    [3.5, -1.4],
    [3.6, -2.7],
  ].map(([x, z]) => new THREE.Vector3(x * side * scale, 0, z * scale));
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}

/** Horizontal direction pointing out of the arch at this point on it. */
function archOutward(curve: THREE.Curve<THREE.Vector3>, u: number) {
  const pos = curve.getPointAt(u);
  const out = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(u)).normalize();
  return out.dot(new THREE.Vector3(pos.x, 0, pos.z + 0.5)) < 0 ? out.negate() : out;
}

interface GumTooth {
  center: THREE.Vector3;
  half: number;
  /** How far the cheek-side surface of the crown sits from the arch line at the gum. */
  depth: number;
}

/**
 * Gum ridge swept along the whole arch. Its cross-section hugs each crown's neck, and between
 * teeth the margin reaches down toward the bite to fill the gap (the interdental papilla), which
 * gives the scalloped gum line of a real mouth. `s` is +1 when the gum rises in +y (upper).
 */
function gumGeometry(scale: number, teeth: GumTooth[], baseY: number, s: number) {
  const right = halfArch(-1, scale).getPoints(24).reverse();
  const left = halfArch(1, scale).getPoints(24).slice(1);
  const pts = [...right, ...left];
  // Run a little past the last molars so the ridge can round off behind them.
  const extend = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(a.clone().sub(b).setLength(0.55));
  const curve = new THREE.CatmullRomCurve3([extend(pts[0], pts[1]), ...pts, extend(pts[pts.length - 1], pts[pts.length - 2])], false, "centripetal");

  const N = 360;
  const M = 30;
  const positions = new Float32Array(N * M * 3);
  const Y = new THREE.Vector3(0, 1, 0);
  let labial = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const c = curve.getPointAt(u);
    const out = new THREE.Vector3().crossVectors(Y, curve.getTangentAt(u)).normalize();
    if (out.dot(new THREE.Vector3(c.x, 0, c.z + 0.5)) < 0) out.negate();
    if (i === N >> 1) labial = out.clone();
    let near = teeth[0];
    let d = Infinity;
    for (const t of teeth) {
      const k = Math.hypot(c.x - t.center.x, c.z - t.center.z) / t.half;
      if (k < d) [d, near] = [k, t];
    }
    // Rounded arch over each crown, peaking softly between neighbours.
    const papilla = smooth(0.35, 1.1, d);
    const hm = -(0.06 + 0.22 * papilla);
    const hl = -(0.03 + 0.16 * papilla);
    const om = near.depth + 0.03;
    const ol = -om;
    const section = new THREE.SplineCurve(
      [
        [om, hm],
        [om + 0.07, hm + 0.14],
        [om + 0.16, 0.26],
        [om + 0.22, 0.52],
        [om + 0.25, 0.82],
        [0.25, 1.02],
        [-0.45, 0.98],
        [ol - 0.24, 0.55],
        [ol - 0.08, hl + 0.14],
        [ol, hl],
      ].map(([o, hh]) => new THREE.Vector2(o, hh)),
    ).getPoints(M - 1);
    const taper = smooth(0, 0.04, Math.min(u, 1 - u));
    section.forEach((v, j) => {
      const o = v.x * taper;
      const hh = 0.5 + (v.y - 0.5) * taper;
      positions.set([c.x + out.x * o, baseY + s * hh, c.z + out.z * o], (i * M + j) * 3);
    });
  }
  const index: number[] = [];
  for (let i = 0; i < N - 1; i++)
    for (let j = 0; j < M - 1; j++) {
      const a = i * M + j;
      const b = (i + 1) * M + j;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  // Wind the triangles so the faces point out of the gum (the mirror image for the lower arch flips it).
  const at = (k: number) => new THREE.Vector3().fromArray(positions, k * 3);
  const probe = (N >> 1) * M + 3;
  const n = new THREE.Vector3().crossVectors(at(probe + M).sub(at(probe)), at(probe + 1).sub(at(probe)));
  if (n.dot(labial) < 0) for (let k = 0; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

const BASE_HEIGHT = 1.35;
const TOOTH_GAP = 0.02;
// Forward tilt of each crown (radians, by position from the midline), as in a natural arch.
const INCLINE = [0, 0.28, 0.24, 0.14, 0.06, 0.04, 0, -0.04, -0.06];

/** Faceted block a study model's arch sits in: the arch outline pushed outwards, extruded upwards from y = 0. */
function baseGeometry(scale: number) {
  const outline: THREE.Vector2[] = [];
  for (const side of [-1, 1] as const) {
    const curve = halfArch(side, scale);
    const us = [0, 0.2, 0.42, 0.68, 1];
    const pts = us.map((u) => curve.getPointAt(u).addScaledVector(archOutward(curve, u), 0.85));
    pts[pts.length - 1].z -= 0.4; // square off the back
    if (side === -1) pts.reverse(); // trace right back → front → left back
    // Shape space is (x, -z): rotating the extrusion upright maps it back onto the arch.
    for (const p of pts) outline.push(new THREE.Vector2(p.x, -p.z));
  }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(outline), {
    depth: BASE_HEIGHT,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 3,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(18,38,30,0.28)");
  g.addColorStop(1, "rgba(18,38,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

interface ToothMesh extends THREE.Mesh {
  userData: {
    fdi: number;
    arch: "upper" | "lower";
    /** Seat in the arch, its long axis (root → crown) and the way the cheek side faces. */
    base: THREE.Vector3;
    up: THREE.Vector3;
    outward: THREE.Vector3;
  };
}

// Camera direction, look-at point, the half-width/half-height that must stay in frame, and how
// far the nearest surface sits in front of the target.
const CAMERAS: Record<AnatomyView, { dir: THREE.Vector3; target: THREE.Vector3; half: [number, number]; depth: number }> = {
  bite: { dir: new THREE.Vector3(0, 0.14, 1).normalize(), target: new THREE.Vector3(0, 0, 0.3), half: [3.9, 3.5], depth: 3.5 },
  arches: { dir: new THREE.Vector3(0, 0.32, 1).normalize(), target: new THREE.Vector3(0, -0.1, 0.2), half: [4.4, 3.1], depth: 3 },
  upper: { dir: new THREE.Vector3(0, 0, 1), target: new THREE.Vector3(0, 0.1, 0), half: [4.2, 3.9], depth: 3 },
  lower: { dir: new THREE.Vector3(0, 0, 1), target: new THREE.Vector3(0, -0.1, 0), half: [4.2, 3.9], depth: 3 },
};
// Occlusal views turn the jaw so its biting surface faces the camera; incisors at the top
// for the upper arch and at the bottom for the lower, patient's right on the viewer's left.
const JAW_TILT: Record<AnatomyView, number> = { bite: 0, arches: 0.12, upper: -Math.PI / 2, lower: Math.PI / 2 };
// Where each arch sits per view. In the bite the molars meet, which (with the longer front
// teeth) gives the upper incisors a natural overbite; the lower jaw sits a little back so
// the upper incisors close in front of the lower ones.
const ARCH_OFFSET: Record<AnatomyView, { upper: number; lower: number; lowerBack: number }> = {
  bite: { upper: -0.24, lower: 0.24, lowerBack: 0.3 },
  arches: { upper: 0.35, lower: -0.35, lowerBack: 0 },
  upper: { upper: 0, lower: 0, lowerBack: 0 },
  lower: { upper: 0, lower: 0, lowerBack: 0 },
};

export class AnatomyScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private jaw = new THREE.Group();
  private upperArch = new THREE.Group();
  private lowerArch = new THREE.Group();
  private teeth: ToothMesh[] = [];
  private labels = new Map<number, HTMLElement>();

  private toothMaterial: THREE.MeshPhysicalMaterial;
  private statusMaterials: Record<ToothStatus, THREE.MeshPhysicalMaterial>;
  private selectedMaterial: THREE.MeshPhysicalMaterial;
  private selectedGhostMaterial: THREE.MeshPhysicalMaterial;
  private baseMaterial!: THREE.MeshPhysicalMaterial;
  private statuses = new Map<number, ToothStatus>();
  private selected: number | null = null;
  private hovered: number | null = null;

  private view: AnatomyView = "bite";
  private camGoal = new THREE.Vector3(0, 3, 14);
  private targetGoal = CAMERAS.bite.target.clone();
  private moving = true;
  private shift = 0;
  private usable = 1;
  private insetRight = 0;
  /** How far the study-model bases have faded in (bite view only). */
  private baseT = 0;
  private floorShadow!: THREE.Mesh;
  private disposed = false;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    private container: HTMLElement,
    private overlay: HTMLElement,
    private cb: SceneCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Neutral keeps the pinks saturated where ACES would wash lit gum toward white.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe6da, 0.9));
    // Key light from the front and above casts the soft contact shadows between teeth and gums.
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(3, 6, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.camera.left = key.shadow.camera.bottom = -6;
    key.shadow.camera.right = key.shadow.camera.top = 6;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.001;
    key.shadow.normalBias = 0.06;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xfff4ec, 0.45);
    fill.position.set(-2, -1, 8);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xbdf2d6, 1.1);
    rim.position.set(-6, 2, -5);
    this.scene.add(rim);

    this.camera.position.set(0, 3, 14);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 40;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.target.copy(CAMERAS.bite.target);
    this.controls.addEventListener("start", () => (this.moving = false));

    // Enamel: shade comes from the vertex colours; glossy, with a faint warm sheen.
    this.toothMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      ior: 1.6,
      sheen: 0.3,
      sheenColor: new THREE.Color(0xfff6e8),
    });
    // Charting colours, tinting the enamel (the vertex shading still shows through).
    const tint = (color: number, emissive: number, intensity: number, extra: Partial<THREE.MeshPhysicalMaterial> = {}) => {
      const m = this.toothMaterial.clone();
      m.color.set(color);
      m.emissive.set(emissive);
      m.emissiveIntensity = intensity;
      return Object.assign(m, extra);
    };
    this.statusMaterials = {
      noted: tint(0xffd9d2, 0xef5544, 0.18),
      caries: tint(0xf3c08a, 0xd9480f, 0.3),
      filled: tint(0xbcdcf7, 0x1c7ed6, 0.25),
      rct: tint(0xd8c6f7, 0x7048e8, 0.3),
      crown: tint(0xf5d77a, 0xb08900, 0.2, { metalness: 0.55, roughness: 0.25 }),
      implant: tint(0xb4bcc6, 0x000000, 0, { metalness: 0.9, roughness: 0.28, vertexColors: false }),
      // An extracted tooth stays as a faint ghost so its place in the arch can still be picked.
      missing: tint(0xdfe4ea, 0x000000, 0, { transparent: true, opacity: 0.16, depthWrite: false, vertexColors: false }),
    };
    this.selectedMaterial = this.toothMaterial.clone();
    this.selectedMaterial.color.set(0xe3f7ec);
    this.selectedMaterial.emissive.set(0x1ea468);
    this.selectedMaterial.emissiveIntensity = 0.45;
    // A selected extracted tooth stays a ghost, just tinted with the selection colour.
    this.selectedGhostMaterial = Object.assign(this.selectedMaterial.clone(), { transparent: true, opacity: 0.35, depthWrite: false, vertexColors: false });

    this.buildJaw();

    const shadow = (this.floorShadow = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -3.7;
    this.jaw.add(shadow);
    this.scene.add(this.jaw);

    // Overlay labels
    for (const t of this.teeth) {
      const el = document.createElement("span");
      el.className = "tooth-label";
      el.textContent = String(t.userData.fdi);
      overlay.appendChild(el);
      this.labels.set(t.userData.fdi, el);
    }

    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.onPointerLeave);
    this.renderer.domElement.addEventListener("click", this.onClick);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.setView("bite", true);
    this.loop();
  }

  /* ---------------- build ---------------- */

  private buildJaw() {
    const geoms = new Map<ToothType, THREE.BufferGeometry>();
    const geom = (t: ToothType) => geoms.get(t) ?? geoms.set(t, toothGeometry(t)).get(t)!;
    const gum = new THREE.MeshPhysicalMaterial({
      color: 0xc24c5a,
      roughness: 0.5,
      envMapIntensity: 0.6,
      clearcoat: 0.3,
      clearcoatRoughness: 0.3,
      sheen: 0.2,
      sheenColor: new THREE.Color(0xff9aa4),
    });
    // The study model's resin base: a deeper, satin pink than the wet-looking gums.
    this.baseMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc04b57,
      transparent: true,
      roughness: 0.4,
      envMapIntensity: 0.7,
      clearcoat: 0.55,
      clearcoatRoughness: 0.28,
      sheen: 0.15,
      sheenColor: new THREE.Color(0xff9aa5),
    });

    const build = (arch: "upper" | "lower", group: THREE.Group) => {
      const scale = arch === "upper" ? 1.05 : 1;
      const up = new THREE.Vector3(0, arch === "upper" ? -1 : 1, 0);
      const baseY = arch === "upper" ? 1.12 : -1.12;
      const halves: [1 | -1, number][] =
        arch === "upper"
          ? [
              [-1, 1],
              [1, 2],
            ]
          : [
              [1, 3],
              [-1, 4],
            ];
      const total = WIDTHS.slice(1).reduce((a, b) => a + b, 0) + TOOTH_GAP * 8;
      const gumTeeth: GumTooth[] = [];
      for (const [side, quadrant] of halves) {
        const curve = halfArch(side, scale);
        const len = curve.getLength();
        let acc = 0;
        for (let n = 1; n <= 8; n++) {
          const w = WIDTHS[n];
          const u = Math.min(0.999, (acc + w / 2 + TOOTH_GAP / 2) / total);
          acc += w + TOOTH_GAP;
          const pos = curve.getPointAt(u);
          const outward = archOutward(curve, u);
          const xAxis = new THREE.Vector3().crossVectors(up, outward).normalize();
          const type = TYPE_BY_INDEX[n];
          const mesh = new THREE.Mesh(geom(type), this.toothMaterial) as unknown as ToothMesh;
          const m = new THREE.Matrix4().makeBasis(xAxis, up, outward);
          mesh.quaternion.setFromRotationMatrix(m);
          // Tilting about the arch tangent leans the crown outwards (front teeth flare forward).
          const incline = INCLINE[n] * (arch === "lower" ? 0.8 : 1);
          mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(xAxis, incline));
          const s = (len / total) * scale;
          mesh.scale.set(s * 1.03, scale, s);
          mesh.castShadow = true; // receiving would speckle the small curved crowns with shadow acne
          gumTeeth.push({ center: pos.clone(), half: (w / 2) * s, depth: 0.42 * DIMS[type][2] * s });
          pos.y = baseY;
          mesh.position.copy(pos);
          // FDI: quadrant (1 upper right, 2 upper left, 3 lower left, 4 lower right) then
          // position from the midline (1 central incisor … 8 third molar).
          mesh.userData = { fdi: quadrant * 10 + n, arch, base: pos.clone(), up: up.clone(), outward };
          group.add(mesh);
          this.teeth.push(mesh);
        }
      }
      // Scalloped gum along the whole arch, hiding the roots.
      const gumMesh = new THREE.Mesh(gumGeometry(scale, gumTeeth, baseY, -up.y), gum);
      gumMesh.castShadow = gumMesh.receiveShadow = true;
      group.add(gumMesh);
      // Study-model base, overlapping the top (upper) or bottom (lower) of the gum ridge.
      const block = new THREE.Mesh(baseGeometry(scale), this.baseMaterial);
      const reach = Math.abs(baseY) + 0.68;
      block.position.y = arch === "upper" ? reach : -reach - BASE_HEIGHT;
      block.castShadow = block.receiveShadow = true;
      group.add(block);
    };
    build("upper", this.upperArch);
    build("lower", this.lowerArch);
    this.jaw.add(this.upperArch, this.lowerArch);
    this.jaw.position.z = 0.2;
  }

  /* ---------------- public API ---------------- */

  setView(view: AnatomyView, instant = false) {
    this.view = view;
    this.fitGoal();
    this.moving = true;
    this.controls.autoRotate = !this.reduced && view === "arches";
    this.controls.enableRotate = view === "bite" || view === "arches";
    if (instant) {
      this.camera.position.copy(this.camGoal);
      this.controls.target.copy(this.targetGoal);
      this.jaw.rotation.x = JAW_TILT[view];
      this.baseT = view === "bite" ? 1 : 0;
    }
  }

  /** Pixels on the right edge covered by an overlay; the model is fitted beside it. */
  setInsetRight(px: number) {
    if (px === this.insetRight) return;
    this.insetRight = px;
    this.resize();
  }

  /** Charting status per FDI tooth (from the notes); teeth not listed are drawn plain. */
  setStatuses(statuses: [number, ToothStatus][]) {
    this.statuses = new Map(statuses);
    this.applyMaterials();
  }

  setSelected(fdi: number | null) {
    this.selected = fdi;
    this.applyMaterials();
    if (this.view === "bite") this.fitGoal();
  }

  zoom(factor: number) {
    const dir = this.camera.position.clone().sub(this.controls.target);
    const d = THREE.MathUtils.clamp(dir.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camGoal.copy(this.controls.target).add(dir.setLength(d));
    this.targetGoal.copy(this.controls.target);
    this.moving = true;
  }

  reset() {
    this.setView(this.view);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.onPointerLeave);
    this.renderer.domElement.removeEventListener("click", this.onClick);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.replaceChildren();
  }

  /* ---------------- internals ---------------- */

  private applyMaterials() {
    for (const t of this.teeth) {
      const f = t.userData.fdi;
      const status = this.statuses.get(f);
      const selected = status === "missing" ? this.selectedGhostMaterial : this.selectedMaterial;
      t.material = f === this.selected ? selected : status ? this.statusMaterials[status] : this.toothMaterial;
      t.castShadow = status !== "missing";
    }
  }

  /** Distance at which the view's bounding box just fits the canvas. */
  private fitGoal() {
    const c = CAMERAS[this.view];
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hfov = Math.atan(Math.tan(v) * this.camera.aspect * this.usable);
    const dist = Math.max(c.half[1] / Math.tan(v), c.half[0] / Math.tan(hfov)) * 1.04 + c.depth;
    // In the closed bite, turn toward the selected tooth so a back tooth isn't hidden.
    // A turned model is deeper side to side, so back off a little to keep it in frame.
    const dir = c.dir.clone();
    const tooth = this.view === "bite" ? this.teeth.find((t) => t.userData.fdi === this.selected) : undefined;
    const yaw = tooth ? THREE.MathUtils.clamp(Math.atan2(tooth.userData.outward.x, tooth.userData.outward.z), -0.8, 0.8) : 0;
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.targetGoal.copy(c.target);
    this.camGoal.copy(c.target).addScaledVector(dir, dist * (1 + 0.35 * Math.abs(yaw)));
    this.moving = true;
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    // Fit the model between the zoom buttons (left) and whatever the stage reserves on the
    // right for its callout card, rendering it off-centre so nothing covers it.
    const left = 64;
    const right = w - this.insetRight;
    this.usable = (right - left) / w;
    this.shift = 0.5 - (left + right) / 2 / w;
    if (this.shift) this.camera.setViewOffset(w, h, w * this.shift, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.fitGoal();
  }

  private pick(e: PointerEvent | MouseEvent): ToothMesh | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const visible = this.teeth.filter((t) => t.parent?.visible);
    return (this.raycaster.intersectObjects(visible, false)[0]?.object as ToothMesh) ?? null;
  }

  private onPointerMove = (e: PointerEvent) => {
    const hit = this.pick(e);
    const fdi = hit?.userData.fdi ?? null;
    this.hovered = fdi;
    this.renderer.domElement.style.cursor = fdi ? "pointer" : this.controls.enableRotate ? "grab" : "default";
    const r = this.container.getBoundingClientRect();
    this.cb.onHover(fdi, e.clientX - r.left, e.clientY - r.top);
  };

  private onPointerLeave = () => {
    this.hovered = null;
    this.cb.onHover(null, 0, 0);
  };

  private onClick = (e: MouseEvent) => {
    const hit = this.pick(e);
    if (hit) this.cb.onSelect(hit.userData.fdi);
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const k = 1 - Math.pow(0.002, dt); // frame-rate independent easing
    const ease = (from: number, to: number) => (Math.abs(from - to) < 0.001 ? to : THREE.MathUtils.lerp(from, to, k));

    if (this.moving) {
      this.camera.position.lerp(this.camGoal, k);
      this.controls.target.lerp(this.targetGoal, k);
      if (this.camera.position.distanceTo(this.camGoal) < 0.01) this.moving = false;
    }

    this.jaw.rotation.x = THREE.MathUtils.lerp(this.jaw.rotation.x, JAW_TILT[this.view], k);
    this.upperArch.visible = this.view !== "lower";
    this.lowerArch.visible = this.view !== "upper";
    // The floor shadow would turn to face the camera with the jaw in the occlusal views.
    this.floorShadow.visible = this.view === "bite" || this.view === "arches";
    const off = ARCH_OFFSET[this.view];
    this.upperArch.position.y = ease(this.upperArch.position.y, off.upper);
    this.lowerArch.position.y = ease(this.lowerArch.position.y, off.lower);
    this.lowerArch.position.z = ease(this.lowerArch.position.z, -off.lowerBack);

    // The study-model bases only belong to the closed bite.
    this.baseT = ease(this.baseT, this.view === "bite" ? 1 : 0);
    this.baseMaterial.opacity = this.baseT;
    this.baseMaterial.visible = this.baseT > 0.02;

    // Selected tooth lifts out of the open arch (in the closed bite it stays seated and the
    // highlight marks it).
    for (const tooth of this.teeth) {
      const { base, up } = tooth.userData;
      const seated = this.view === "bite";
      const lift = seated ? 0 : tooth.userData.fdi === this.selected ? 0.35 : tooth.userData.fdi === this.hovered ? 0.15 : 0;
      tooth.position.lerp(base.clone().addScaledVector(up, lift), Math.min(1, k * 1.6));
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  };

  private updateLabels() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = new THREE.Vector3();
    const out = new THREE.Vector3();
    const occlusal = this.view === "upper" || this.view === "lower";
    // Front views (bite and open arches) label the same way: every tooth whose cheek side faces
    // the camera, on the root side of its own arch, so upper numbers always sit above the upper
    // teeth and lower numbers below the lower ones. Turn the model to see the rest.
    const front = (this.view === "bite" && this.baseT > 0.95) || this.view === "arches";
    for (const tooth of this.teeth) {
      const { fdi, base, up, outward } = tooth.userData;
      const el = this.labels.get(fdi)!;
      tooth.parent!.localToWorld(v.copy(base)); // the seat, so a lifted tooth's number stays put
      out.copy(outward).applyEuler(this.jaw.rotation);
      const facing = out.dot(this.camera.position.clone().sub(v).normalize()) > 0.4;
      const show = tooth.parent!.visible && (occlusal || (front && facing));
      el.style.opacity = show ? "1" : "0";
      if (!show) continue;
      if (occlusal) {
        // just past the crown, outside the arch
        const o = new THREE.Vector3(base.x, 0, base.z + 0.4).normalize().multiplyScalar(0.95);
        v.add(o.applyEuler(this.jaw.rotation));
      } else if (this.view === "bite") {
        v.addScaledVector(up, -1.75).addScaledVector(out, 0.95); // on the base, like a printed model
      } else {
        v.addScaledVector(up, -1.25).addScaledVector(out, 0.7); // just past the gum ridge
      }
      v.project(this.camera);
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      el.dataset.state = this.selected === fdi ? "selected" : (this.statuses.get(fdi) ?? "");
      el.dataset.size = front ? "sm" : "";
    }
  }
}
