// Procedural 3D anatomy for the patient profile: a glossy dental arch (32 teeth on FDI
// positions, gums, clickable) and a holographic full-body figure. Everything is built from
// primitives at runtime, so there are no model files to ship or license.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { humanMesh, type MeshData } from "./human";

export type AnatomyView = "body" | "arches" | "upper" | "lower";

export interface SceneCallbacks {
  onHover: (fdi: number | null, x: number, y: number) => void;
  onSelect: (fdi: number | null) => void;
  onHotspot: (view: AnatomyView) => void;
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

function toothGeometry(type: ToothType) {
  const profile = [
    [0.02, -0.95],
    [0.1, -0.88],
    [0.2, -0.6],
    [0.28, -0.25],
    [0.34, 0.0],
    [0.43, 0.24],
    [0.48, 0.5],
    [0.45, 0.72],
    [0.36, 0.87],
    [0.18, 0.93],
    [0.0, 0.95],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(profile, 40);
  const [w, h, d] = DIMS[type];
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const t = smooth(0.25, 0.95, y);
    const r = Math.hypot(x, z);
    const theta = Math.atan2(z, x);
    if (type === "central" || type === "lateral") {
      z *= 1 - 0.68 * t; // chisel-shaped incisal edge
      x *= 1 + 0.18 * t;
    } else if (type === "canine") {
      x *= 1 - 0.22 * t;
      z *= 1 - 0.25 * t;
      y += 0.08 * smooth(0.8, 0.95, y);
    } else {
      const cusps = type === "molar" ? 4 : 2;
      const bump = (type === "molar" ? 0.07 : 0.06) * Math.cos(cusps * theta + (type === "molar" ? Math.PI / 4 : 0));
      y += bump * smooth(0.7, 0.95, y) * Math.min(1, r / 0.18);
      y -= 0.06 * smooth(0.75, 0.95, y) * (1 - Math.min(1, r / 0.16)); // central fissure
    }
    p.setXYZ(i, x * w, y * h, z * d);
  }
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

/* ------------------------------------------------------------------ */
/* Hologram body                                                       */
/* ------------------------------------------------------------------ */

// Meshed once per session, off the main thread; falls back to inline if workers fail.
let human: Promise<MeshData> | null = null;
function loadHuman() {
  human ??= new Promise<MeshData>((resolve, reject) => {
    const worker = new Worker(new URL("./human.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<MeshData>) => (resolve(e.data), worker.terminate());
    worker.onerror = (e) => (reject(e), worker.terminate());
    worker.postMessage(null);
  }).catch(() => humanMesh());
  return human;
}

const holoVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vY;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * world;
    vNormal = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    vY = world.y;
    gl_Position = projectionMatrix * mv;
  }
`;
const holoFragment = /* glsl */ `
  uniform vec3 uRim;
  uniform vec3 uFill;
  uniform float uScan;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vY;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    float lines = smoothstep(0.96, 1.0, sin(vY * 30.0 - uTime * 2.0)) * 0.06;
    float scan = smoothstep(0.22, 0.0, abs(vY - uScan));
    float rise = smoothstep(0.0, 7.0, vY);
    vec3 col = mix(uFill, uRim, f) * mix(1.15, 0.85, rise) + vec3(0.82, 1.0, 0.45) * (scan * 0.9 + lines);
    float a = clamp(0.1 + f * 0.95 + scan * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`;

function glowTexture(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color + "aa");
  g.addColorStop(1, color + "00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  userData: { fdi: number; arch: "upper" | "lower"; base: THREE.Vector3; up: THREE.Vector3 };
}

// Camera direction, look-at point and the half-width/half-height that must stay in frame.
const CAMERAS: Record<AnatomyView, { dir: THREE.Vector3; target: THREE.Vector3; half: [number, number] }> = {
  body: { dir: new THREE.Vector3(0, 0.08, 1).normalize(), target: new THREE.Vector3(0, 3.6, 0), half: [2.3, 4.25] },
  arches: { dir: new THREE.Vector3(0, 0.32, 1).normalize(), target: new THREE.Vector3(0, -0.1, 0.2), half: [4.4, 3.1] },
  upper: { dir: new THREE.Vector3(0, 0, 1), target: new THREE.Vector3(0, 0.1, 0), half: [4.2, 3.9] },
  lower: { dir: new THREE.Vector3(0, 0, 1), target: new THREE.Vector3(0, -0.1, 0), half: [4.2, 3.9] },
};
// Occlusal views turn the jaw so its biting surface faces the camera; incisors at the top
// for the upper arch and at the bottom for the lower, patient's right on the viewer's left.
const JAW_TILT: Record<AnatomyView, number> = { body: 0.15, arches: 0.12, upper: -Math.PI / 2, lower: Math.PI / 2 };

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
  private body = new THREE.Group();
  private teeth: ToothMesh[] = [];
  private holoMaterial: THREE.ShaderMaterial;
  private hotspot: THREE.Sprite;
  private rings: THREE.Mesh[] = [];
  private particles: THREE.Points;
  private labels = new Map<number, HTMLElement>();
  private hotspotLabel: HTMLElement;
  private hotspotText: string | null = "Teeth";

  private toothMaterial: THREE.MeshPhysicalMaterial;
  private markedMaterial: THREE.MeshPhysicalMaterial;
  private selectedMaterial: THREE.MeshPhysicalMaterial;
  private marked = new Set<number>();
  private selected: number | null = null;
  private hovered: number | null = null;

  private view: AnatomyView = "arches";
  private camGoal = new THREE.Vector3(0, 3, 14);
  private targetGoal = CAMERAS.arches.target.clone();
  private moving = true;
  private shift = 0;
  private usable = 1;
  private insetRight = 0;
  private heart!: THREE.Sprite;
  private scanRing!: THREE.Mesh;
  private disposed = false;
  private reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    private container: HTMLElement,
    private overlay: HTMLElement,
    private cb: SceneCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe6da, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 8, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbdf2d6, 1.1);
    rim.position.set(-6, 2, -5);
    this.scene.add(rim);

    this.camera.position.set(0, 3, 14);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 34;
    this.controls.autoRotateSpeed = 0.9;
    this.controls.target.copy(CAMERAS.arches.target);
    this.controls.addEventListener("start", () => (this.moving = false));

    this.toothMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf6f1e6,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xfff6e8),
    });
    this.markedMaterial = this.toothMaterial.clone();
    this.markedMaterial.color.set(0xffcbc0);
    this.markedMaterial.emissive.set(0xef5544);
    this.selectedMaterial = this.toothMaterial.clone();
    this.selectedMaterial.color.set(0xe3f7ec);
    this.selectedMaterial.emissive.set(0x1ea468);
    this.selectedMaterial.emissiveIntensity = 0.45;

    this.buildJaw();
    this.holoMaterial = new THREE.ShaderMaterial({
      vertexShader: holoVertex,
      fragmentShader: holoFragment,
      transparent: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uRim: { value: new THREE.Color(0x8dffc9) },
        uFill: { value: new THREE.Color(0x1f9a66) },
        uScan: { value: 0 },
        uTime: { value: 0 },
      },
    });
    this.buildBody();
    const pts = this.buildParticles();
    this.particles = pts;
    this.hotspot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("#ef5544"), depthTest: false, transparent: true }));
    this.hotspot.position.set(0, 6.47, 0.42);
    this.body.add(this.hotspot);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -3.1;
    this.jaw.add(shadow);

    this.scene.add(this.jaw, this.body);
    this.body.scale.setScalar(0.001);
    this.body.visible = false;

    // Overlay labels
    for (const t of this.teeth) {
      const el = document.createElement("span");
      el.className = "tooth-label";
      el.textContent = String(t.userData.fdi);
      overlay.appendChild(el);
      this.labels.set(t.userData.fdi, el);
    }
    this.hotspotLabel = document.createElement("button");
    this.hotspotLabel.className = "hotspot-label";
    this.hotspotLabel.textContent = "Teeth";
    this.hotspotLabel.addEventListener("click", () => this.cb.onHotspot("arches"));
    overlay.appendChild(this.hotspotLabel);

    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.onPointerLeave);
    this.renderer.domElement.addEventListener("click", this.onClick);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.setView("arches", true);
    this.loop();
  }

  /* ---------------- build ---------------- */

  private buildJaw() {
    const geoms = new Map<ToothType, THREE.BufferGeometry>();
    const geom = (t: ToothType) => geoms.get(t) ?? geoms.set(t, toothGeometry(t)).get(t)!;
    const gum = new THREE.MeshPhysicalMaterial({
      color: 0xe9878f,
      roughness: 0.42,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
      sheen: 1,
      sheenColor: new THREE.Color(0xffc2c8),
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
      const total = WIDTHS.slice(1).reduce((a, b) => a + b, 0) + 0.06 * 8;
      for (const [side, quadrant] of halves) {
        const curve = halfArch(side, scale);
        const len = curve.getLength();
        let acc = 0;
        for (let n = 1; n <= 8; n++) {
          const w = WIDTHS[n];
          const u = Math.min(0.999, (acc + w / 2 + 0.03) / total);
          acc += w + 0.06;
          const pos = curve.getPointAt(u);
          const tangent = curve.getTangentAt(u);
          let outward = new THREE.Vector3().crossVectors(up, tangent).normalize();
          if (outward.dot(new THREE.Vector3(pos.x, 0, pos.z + 0.5)) < 0) outward.negate();
          const xAxis = new THREE.Vector3().crossVectors(up, outward).normalize();
          const mesh = new THREE.Mesh(geom(TYPE_BY_INDEX[n]), this.toothMaterial) as unknown as ToothMesh;
          const m = new THREE.Matrix4().makeBasis(xAxis, up, outward);
          mesh.quaternion.setFromRotationMatrix(m);
          const s = (len / total) * scale;
          mesh.scale.set(s, scale, s);
          pos.y = baseY;
          mesh.position.copy(pos);
          mesh.userData = { fdi: quadrant * 10 + n, arch, base: pos.clone(), up: up.clone() };
          group.add(mesh);
          this.teeth.push(mesh);
        }
      }
      // Gum ridge along the whole arch, hiding the roots.
      const right = halfArch(-1, scale).getPoints(24);
      const left = halfArch(1, scale).getPoints(24);
      const full = new THREE.CatmullRomCurve3([...right.reverse(), ...left.slice(1)]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(full, 160, 0.56, 24, false), gum);
      tube.scale.y = 1.15;
      tube.position.y = baseY + (arch === "upper" ? 0.62 : -0.62);
      group.add(tube);
      for (const end of [full.getPoint(0), full.getPoint(1)]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.56, 24, 16), gum);
        cap.scale.y = 1.15;
        cap.position.set(end.x, tube.position.y, end.z);
        group.add(cap);
      }
    };
    build("upper", this.upperArch);
    build("lower", this.lowerArch);
    this.jaw.add(this.upperArch, this.lowerArch);
    this.jaw.position.z = 0.2;
  }

  private buildBody() {
    // The figure is meshed in a worker (see human.ts) and fades in when ready. It is drawn
    // twice: depth first, then the glow, so only the outer skin shows.
    const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
    loadHuman().then((data) => {
      if (this.disposed) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
      geo.setIndex(new THREE.BufferAttribute(data.index, 1));
      geo.computeVertexNormals();
      const shell = new THREE.Mesh(geo, depthOnly);
      shell.renderOrder = 1;
      const skin = new THREE.Mesh(geo, this.holoMaterial);
      skin.renderOrder = 2;
      this.body.add(shell, skin);
    });
    // Floor rings
    for (const [r, w, o] of [
      [1.7, 0.03, 0.55],
      [2.3, 0.02, 0.35],
      [2.9, 0.015, 0.2],
    ]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + w, 96, 1, 0, Math.PI * 1.6),
        new THREE.MeshBasicMaterial({
          color: 0x6dffb4,
          transparent: true,
          opacity: o,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      this.body.add(ring);
      this.rings.push(ring);
    }
    this.heart = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture("#ff6a55"), transparent: true, depthWrite: false, depthTest: false, opacity: 0.95 }),
    );
    this.heart.position.set(0.16, 5.25, 0.22);
    this.heart.renderOrder = 3;
    this.body.add(this.heart);
    const spine = new Float32Array(Array.from({ length: 22 }, (_, i) => [0, 3.4 + i * 0.12, -0.12]).flat());
    const spineGeo = new THREE.BufferGeometry();
    spineGeo.setAttribute("position", new THREE.BufferAttribute(spine, 3));
    const spinePts = new THREE.Points(
      spineGeo,
      new THREE.PointsMaterial({ size: 0.16, map: glowTexture("#d2ec5c"), transparent: true, depthWrite: false, depthTest: false, opacity: 0.85 }),
    );
    spinePts.renderOrder = 3;
    this.body.add(spinePts);
    this.scanRing = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.3, 96),
      new THREE.MeshBasicMaterial({
        color: 0xb6ff7a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.scanRing.rotation.x = -Math.PI / 2;
    this.body.add(this.scanRing);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 64),
      new THREE.MeshBasicMaterial({ map: glowTexture("#39bb80"), transparent: true, opacity: 0.55, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    this.body.add(disc);
  }

  private buildParticles() {
    const n = 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.4 + Math.random() * 1.8;
      pos.set([Math.cos(a) * r, Math.random() * 7.5, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, map: glowTexture("#39bb80"), transparent: true, depthWrite: false, opacity: 0.85 }));
    this.body.add(p);
    return p;
  }

  /* ---------------- public API ---------------- */

  setView(view: AnatomyView, instant = false) {
    this.view = view;
    this.fitGoal();
    this.moving = true;
    this.controls.autoRotate = !this.reduced && (view === "body" || view === "arches");
    this.controls.autoRotateSpeed = view === "body" ? 1.1 : 0.55;
    this.controls.enableRotate = view === "body" || view === "arches";
    if (instant) {
      this.camera.position.copy(this.camGoal);
      this.controls.target.copy(this.targetGoal);
      this.jaw.rotation.x = JAW_TILT[view];
    }
  }

  /** Body-view hotspot over the mouth that jumps to the teeth; null hides it. */
  /** Pixels on the right edge covered by an overlay; the model is fitted beside it. */
  setInsetRight(px: number) {
    if (px === this.insetRight) return;
    this.insetRight = px;
    this.resize();
  }

  setHotspot(text: string | null) {
    this.hotspotText = text;
    this.hotspot.visible = !!text;
    if (text) this.hotspotLabel.textContent = text;
  }

  setMarked(fdis: number[]) {
    this.marked = new Set(fdis);
    this.applyMaterials();
  }

  setSelected(fdi: number | null) {
    this.selected = fdi;
    this.applyMaterials();
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
      t.material = f === this.selected ? this.selectedMaterial : this.marked.has(f) ? this.markedMaterial : this.toothMaterial;
    }
  }

  /** Distance at which the view's bounding sphere just fits the canvas. */
  private fitGoal() {
    const c = CAMERAS[this.view];
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hfov = Math.atan(Math.tan(v) * this.camera.aspect * this.usable);
    const depth = this.view === "body" ? 1 : 3; // nearest surface sits this far in front of the target
    const dist = Math.max(c.half[1] / Math.tan(v), c.half[0] / Math.tan(hfov)) * 1.04 + depth;
    this.targetGoal.copy(c.target);
    this.camGoal.copy(c.target).addScaledVector(c.dir, dist);
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
    if (this.view === "body") return null;
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
    this.renderer.domElement.style.cursor = fdi ? "pointer" : this.view === "body" || this.view === "arches" ? "grab" : "default";
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
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const k = 1 - Math.pow(0.002, dt); // frame-rate independent easing

    if (this.moving) {
      this.camera.position.lerp(this.camGoal, k);
      this.controls.target.lerp(this.targetGoal, k);
      if (this.camera.position.distanceTo(this.camGoal) < 0.01) this.moving = false;
    }

    // Cross-fade between the jaw and the body
    const showBody = this.view === "body";
    const ease = (obj: THREE.Object3D, on: boolean) => {
      const s = THREE.MathUtils.lerp(obj.scale.x, on ? 1 : 0.001, k);
      obj.scale.setScalar(s);
      obj.visible = on ? s > 0.01 : s > 0.25;
    };
    ease(this.body, showBody);
    ease(this.jaw, !showBody);
    this.jaw.rotation.x = THREE.MathUtils.lerp(this.jaw.rotation.x, JAW_TILT[this.view], k);
    if (this.view === "upper" || this.view === "lower") this.jaw.rotation.y = THREE.MathUtils.lerp(this.jaw.rotation.y, 0, k);
    this.upperArch.visible = this.view !== "lower";
    this.lowerArch.visible = this.view !== "upper";
    // Open the bite a little when both arches show, so every crown is visible.
    const gap = this.view === "arches" ? 0.35 : 0;
    this.upperArch.position.y = THREE.MathUtils.lerp(this.upperArch.position.y, gap, k);
    this.lowerArch.position.y = THREE.MathUtils.lerp(this.lowerArch.position.y, -gap, k);

    // Selected tooth lifts out of the arch; marked teeth pulse.
    for (const tooth of this.teeth) {
      const lift = tooth.userData.fdi === this.selected ? 0.35 : tooth.userData.fdi === this.hovered ? 0.15 : 0;
      const goal = tooth.userData.base.clone().addScaledVector(tooth.userData.up, lift);
      tooth.position.lerp(goal, Math.min(1, k * 1.6));
    }
    this.markedMaterial.emissiveIntensity = this.reduced ? 0.5 : 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3));

    // Hologram
    this.holoMaterial.uniforms.uTime.value = t;
    const scanY = this.reduced ? -10 : ((t * 1.6) % 9) - 0.8;
    this.holoMaterial.uniforms.uScan.value = scanY;
    this.scanRing.position.y = scanY;
    this.scanRing.visible = scanY > 0 && scanY < 7.4;
    // lub-dub: two quick pulses per beat
    const beat = (t * 1.2) % 1;
    const pulse = Math.exp(-Math.pow((beat - 0.1) * 18, 2)) + 0.6 * Math.exp(-Math.pow((beat - 0.3) * 18, 2));
    this.heart.scale.setScalar(0.55 + (this.reduced ? 0 : 0.35 * pulse));
    this.rings.forEach((r, i) => (r.rotation.z = t * (0.25 + i * 0.12) * (i % 2 ? -1 : 1)));
    if (!this.reduced) {
      const p = this.particles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setY(i, (p.getY(i) + dt * (0.25 + (i % 5) * 0.08)) % 7.5);
      p.needsUpdate = true;
    }
    this.hotspot.scale.setScalar(0.45 + 0.2 * (0.5 + 0.5 * Math.sin(t * 4)));

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  };

  private updateLabels() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = new THREE.Vector3();
    for (const tooth of this.teeth) {
      const el = this.labels.get(tooth.userData.fdi)!;
      const occlusal = this.view === "upper" || this.view === "lower";
      const show =
        this.view !== "body" &&
        this.jaw.visible &&
        tooth.parent!.visible &&
        (occlusal || this.marked.has(tooth.userData.fdi) || this.selected === tooth.userData.fdi) &&
        (this.view !== "arches" || this.jaw.scale.x > 0.9);
      el.style.opacity = show ? "1" : "0";
      if (!show) continue;
      // Label sits just past the crown tip (occlusal) or outside the arch (front view).
      tooth.getWorldPosition(v);
      if (occlusal) {
        const out = new THREE.Vector3(tooth.userData.base.x, 0, tooth.userData.base.z + 0.4).normalize().multiplyScalar(0.95);
        v.add(out.applyEuler(this.jaw.rotation));
      } else {
        v.addScaledVector(tooth.userData.up, 1.35);
      }
      v.project(this.camera);
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      el.dataset.state = this.selected === tooth.userData.fdi ? "selected" : this.marked.has(tooth.userData.fdi) ? "marked" : "";
    }
    const showHot = !!this.hotspotText && this.view === "body" && this.body.scale.x > 0.9;
    this.hotspotLabel.style.opacity = showHot ? "1" : "0";
    this.hotspotLabel.style.pointerEvents = showHot ? "auto" : "none";
    if (showHot) {
      this.hotspot.getWorldPosition(v);
      v.project(this.camera);
      this.hotspotLabel.style.transform = `translate(calc(-100% - 16px), -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  }
}
