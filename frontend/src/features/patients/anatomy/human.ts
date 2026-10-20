// A smooth, anatomically proportioned human built as a signed-distance field (ellipsoids and
// tapered capsules blended with a smooth union) and meshed with surface nets. ~8 heads tall,
// feet at y=0, facing +z, arms relaxed at the sides; a sturdy, neutral build. No model file, no licence to track.
type V3 = [number, number, number];

const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

/** iq's ellipsoid approximation. */
function ellipsoid(px: number, py: number, pz: number, c: V3, r: V3) {
  const x = px - c[0];
  const y = py - c[1];
  const z = pz - c[2];
  const k0 = len3(x / r[0], y / r[1], z / r[2]);
  const k1 = len3(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]));
  return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
}

/** iq's round cone: capsule from a (radius r1) to b (radius r2). */
function roundCone(px: number, py: number, pz: number, a: V3, b: V3, r1: number, r2: number) {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const qx = px - a[0];
  const qy = py - a[1];
  const qz = pz - a[2];
  const y = qx * bx + qy * by + qz * bz;
  const z = y - l2;
  const cx = qx * l2 - bx * y;
  const cy = qy * l2 - by * y;
  const cz = qz * l2 - bz * y;
  const x2 = cx * cx + cy * cy + cz * cz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

type Prim = { d: (x: number, y: number, z: number) => number; k: number; box: [V3, V3] };
const E = (c: V3, r: V3, k = 0.08): Prim => ({
  d: (x, y, z) => ellipsoid(x, y, z, c, r),
  k,
  box: [
    [c[0] - r[0], c[1] - r[1], c[2] - r[2]],
    [c[0] + r[0], c[1] + r[1], c[2] + r[2]],
  ],
});
const C = (a: V3, b: V3, r1: number, r2: number, k = 0.08): Prim => {
  const r = Math.max(r1, r2);
  return {
    d: (x, y, z) => roundCone(x, y, z, a, b, r1, r2),
    k,
    box: [
      [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r],
      [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r],
    ],
  };
};

// Midline parts (evaluated at the real x) and paired parts (defined for +x, mirrored by |x|).
const MID: Prim[] = [
  // head
  E([0, 6.8, 0.0], [0.33, 0.43, 0.39], 0.1),
  E([0, 6.9, -0.07], [0.35, 0.35, 0.38], 0.1),
  C([0, 6.6, 0.05], [0, 6.36, 0.16], 0.3, 0.17, 0.12), // jaw (squarer)
  E([0, 6.66, 0.38], [0.055, 0.11, 0.08], 0.05), // nose
  E([0, 6.86, 0.29], [0.28, 0.06, 0.08], 0.06), // brow
  // neck (thick, sloping into the trapezius)
  C([0, 6.45, -0.04], [0, 5.92, -0.03], 0.2, 0.25, 0.14),
  // torso: broad chest, little waist taper, narrow hips
  E([0, 5.3, -0.02], [0.68, 0.72, 0.36], 0.22), // ribcage
  E([0, 4.62, 0.0], [0.56, 0.6, 0.31], 0.26), // abdomen
  E([0, 4.04, -0.02], [0.53, 0.38, 0.32], 0.22), // pelvis
];
const PAIR: Prim[] = [
  E([0.35, 6.74, -0.03], [0.05, 0.12, 0.08], 0.05), // ear
  C([0.14, 6.1, -0.08], [0.72, 5.84, -0.06], 0.16, 0.13, 0.18), // trapezius
  E([0.88, 5.64, 0.0], [0.25, 0.28, 0.24], 0.16), // deltoid
  E([0.34, 5.47, 0.17], [0.33, 0.17, 0.1], 0.18), // pectoral (flat)
  E([0.46, 5.25, -0.1], [0.27, 0.45, 0.22], 0.18), // lat
  E([0.21, 3.84, -0.18], [0.23, 0.26, 0.19], 0.14), // glute
  // arm (relaxed, hanging close to the body)
  C([0.94, 5.56, -0.01], [1.09, 4.48, -0.03], 0.2, 0.145, 0.1),
  E([1.01, 5.0, 0.06], [0.17, 0.33, 0.16], 0.09), // biceps
  E([1.0, 5.05, -0.1], [0.14, 0.3, 0.13], 0.09), // triceps
  C([1.09, 4.48, -0.03], [1.21, 3.52, 0.05], 0.145, 0.1, 0.08),
  E([1.12, 4.2, 0.0], [0.16, 0.29, 0.15], 0.09), // forearm
  E([1.25, 3.3, 0.06], [0.08, 0.19, 0.13], 0.06), // palm
  C([1.26, 3.16, 0.07], [1.29, 2.93, 0.08], 0.058, 0.042, 0.05), // fingers
  C([1.2, 3.36, 0.17], [1.19, 3.17, 0.23], 0.04, 0.032, 0.05), // thumb
  // leg (sturdy)
  C([0.3, 3.9, 0.02], [0.29, 2.1, 0.03], 0.34, 0.2, 0.14),
  E([0.31, 3.05, 0.1], [0.25, 0.6, 0.22], 0.1), // quadriceps
  E([0.29, 2.03, 0.08], [0.14, 0.16, 0.12], 0.08), // knee
  C([0.29, 2.0, 0.0], [0.29, 0.36, -0.02], 0.19, 0.105, 0.08),
  E([0.3, 1.55, -0.09], [0.18, 0.44, 0.17], 0.1), // calf
  C([0.29, 0.3, -0.02], [0.29, 0.11, -0.1], 0.1, 0.1, 0.08), // ankle/heel
  C([0.29, 0.1, -0.1], [0.34, 0.07, 0.42], 0.1, 0.07, 0.08), // foot
];

function field(x: number, y: number, z: number) {
  let d = 1e9;
  const ax = Math.abs(x);
  for (const list of [MID, PAIR]) {
    const px = list === MID ? x : ax;
    for (const p of list) {
      const [lo, hi] = p.box;
      // Cheap reject: far outside this part's box can't affect the smooth union.
      const m = p.k + 0.15;
      if (px < lo[0] - m || px > hi[0] + m || y < lo[1] - m || y > hi[1] + m || z < lo[2] - m || z > hi[2] + m) continue;
      d = d === 1e9 ? p.d(px, y, z) : smin(d, p.d(px, y, z), p.k);
    }
  }
  return d === 1e9 ? 1 : d;
}

export interface MeshData {
  positions: Float32Array;
  index: Uint32Array;
}

/** Naive surface nets over the SDF grid. Pure arrays so it can run in a worker. */
export function humanMesh(step = 0.035): MeshData {
  const min: V3 = [-1.45, -0.08, -0.62];
  const max: V3 = [1.45, 7.38, 0.6];
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const f = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) f[at(i, j, k)] = field(min[0] + i * step, min[1] + j * step, min[2] + k * step);

  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const CORNERS = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [c & 1, (c >> 1) & 1, (c >> 2) & 1]);
  const EDGES = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = f[at(i + CORNERS[c][0], j + CORNERS[c][1], k + CORNERS[c][2])];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0,
          sy = 0,
          sz = 0,
          n = 0;
        for (const [a, b] of EDGES) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += CORNERS[a][0] + t * (CORNERS[b][0] - CORNERS[a][0]);
          sy += CORNERS[a][1] + t * (CORNERS[b][1] - CORNERS[a][1]);
          sz += CORNERS[a][2] + t * (CORNERS[b][2] - CORNERS[a][2]);
          n++;
        }
        cell[at(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + sx / n) * step, min[1] + (j + sy / n) * step, min[2] + (k + sz / n) * step);
      }

  const idx: number[] = [];
  const dims = [nx, ny, nz];
  const p = [0, 0, 0];
  for (p[2] = 0; p[2] < nz; p[2]++)
    for (p[1] = 0; p[1] < ny; p[1]++)
      for (p[0] = 0; p[0] < nx; p[0]++) {
        const inside = f[at(p[0], p[1], p[2])] < 0;
        for (let d = 0; d < 3; d++) {
          const u = (d + 1) % 3;
          const w = (d + 2) % 3;
          if (p[d] >= dims[d] - 1 || p[u] < 1 || p[w] < 1) continue;
          const q = [...p];
          q[d]++;
          if (inside === f[at(q[0], q[1], q[2])] < 0) continue;
          const c = (du: number, dw: number) => {
            const r = [...p];
            r[u] -= du;
            r[w] -= dw;
            return cell[at(r[0], r[1], r[2])];
          };
          const a = c(0, 0),
            b = c(1, 0),
            e = c(1, 1),
            g = c(0, 1);
          if (a < 0 || b < 0 || e < 0 || g < 0) continue;
          if (inside) idx.push(a, b, e, a, e, g);
          else idx.push(a, e, b, a, g, e);
        }
      }

  return { positions: new Float32Array(pos), index: new Uint32Array(idx) };
}
