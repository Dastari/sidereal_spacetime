/**
 * Angled hull panels for prefab ships: slope and arc faces as mitred prisms that follow the true
 * outline, instead of texel-rasterised box columns. A chain of non-axis outline edges becomes a
 * continuous dark backing band plus 0.75–1.5 m cassettes in two or three relief layers, seams,
 * trims and light strips, so an angled face reads as one panelled hull surface; the voxel step
 * remains only on the silhouette of the hull body. Presentation only (authority never reads it).
 *
 * Units: plan metres (+X fore, +Y port) for quads; heights in texels (1/16 m) like DressBox.
 */
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import { SHIP_KIT_SLOTS } from "@sidereal/content/ship-kit";
import { volumeTiers } from "@sidereal/content/construction-grammar";

type Pt = readonly [number, number];

/** A vertical prism: plan quad (metres, any winding) extruded from z0 to z1 (texels). */
export interface DressPrism {
  quad: [Pt, Pt, Pt, Pt];
  z0: number;
  z1: number;
  slot: number;
}

const TEXEL = 1 / 16;
const SLOT = Object.fromEntries(SHIP_KIT_SLOTS.map((s, i) => [s, i])) as Record<ShipKitSlot, number>;

function hash01(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const norm = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

/**
 * A polyline with mitred offsets. `side` = +1 offsets to the right of travel (outward for a CCW
 * outer ring), -1 to the left. `before`/`after` are the directions of the neighbouring edges so
 * the chain ends mitre into the adjoining straight faces instead of leaving wedge gaps.
 */
export class MitredChain {
  readonly pts: Pt[];
  readonly acc: number[];
  private readonly miter: Pt[];

  constructor(segs: readonly (readonly [Pt, Pt])[], side: 1 | -1, before?: Pt, after?: Pt) {
    this.pts = [segs[0][0], ...segs.map((s) => s[1])];
    const dirs = segs.map(([p, q]) => norm([q[0] - p[0], q[1] - p[1]]));
    const nrm = (d: Pt): Pt => (side > 0 ? [d[1], -d[0]] : [-d[1], d[0]]);
    const ns = dirs.map(nrm);
    const nb = before ? nrm(norm(before)) : ns[0];
    const na = after ? nrm(norm(after)) : ns[ns.length - 1];
    const all = [nb, ...ns, na];
    this.miter = this.pts.map((_, j) => {
      const a = all[j];
      const b = all[j + 1];
      const k = 1 + a[0] * b[0] + a[1] * b[1];
      // Clamp very sharp corners (k -> 0) so offsets stay bounded.
      return k < 0.3 ? b : [(a[0] + b[0]) / k, (a[1] + b[1]) / k];
    });
    this.acc = [0];
    for (let i = 0; i < segs.length; i++) this.acc.push(this.acc[i] + Math.hypot(this.pts[i + 1][0] - this.pts[i][0], this.pts[i + 1][1] - this.pts[i][1]));
  }

  get length() {
    return this.acc[this.acc.length - 1];
  }

  /** Point at arc length s, offset by d metres along the mitred normal. */
  at(s: number, d: number): Pt {
    let i = 0;
    while (i < this.pts.length - 2 && s > this.acc[i + 1]) i++;
    const L = this.acc[i + 1] - this.acc[i] || 1;
    const t = Math.max(0, Math.min(1, (s - this.acc[i]) / L));
    const a = this.pts[i];
    const b = this.pts[i + 1];
    const ma = this.miter[i];
    const mb = this.miter[i + 1];
    return [a[0] + ma[0] * d + t * (b[0] + mb[0] * d - a[0] - ma[0] * d), a[1] + ma[1] * d + t * (b[1] + mb[1] * d - a[1] - ma[1] * d)];
  }

  /** Prisms covering [s0, s1] x [d0, d1] (metres), split at chain vertices so mitres stay exact. */
  band(s0: number, s1: number, d0: number, d1: number, z0: number, z1: number, slot: ShipKitSlot): DressPrism[] {
    if (s1 - s0 < 1e-4 || z1 <= z0 || Math.abs(d1 - d0) < 1e-5) return [];
    const cuts = [s0, ...this.acc.filter((a) => a > s0 + 1e-6 && a < s1 - 1e-6), s1];
    const out: DressPrism[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      out.push({ quad: [this.at(a, d0), this.at(b, d0), this.at(b, d1), this.at(a, d1)], z0, z1, slot: SLOT[slot] });
    }
    return out;
  }
}

/**
 * Exterior skin for one chain of angled outline edges of a volume spanning z (texels):
 * dark backing, per-tier cassettes with 1-texel seams, an inset relief plate, occasional vent
 * stacks, metal kick strips and emissive light strips, and a secondary rim band.
 */
export function chainSkinPrisms(chain: MitredChain, z: [number, number], seed: number, zCap = Infinity): DressPrism[] {
  const { tiers, rim } = volumeTiers(z[0], z[1]);
  const T = TEXEL;
  const L = chain.length;
  const out: DressPrism[] = [];
  const clipZ = (z0: number, z1: number): [number, number] => [z0, Math.min(z1, zCap)];
  const push = (s0: number, s1: number, d0: number, d1: number, zz0: number, zz1: number, slot: ShipKitSlot) => {
    const [a, b] = clipZ(zz0, zz1);
    if (b > a) out.push(...chain.band(s0, s1, d0 * T, d1 * T, a, b, slot));
  };
  // Continuous backing (seams read dark, never see-through).
  push(0, L, 0, 1.5, z[0], z[1], "dark");
  // Panel breaks along the chain: 0.75-1.5 m cassettes, ends snapped to the chain ends.
  const breaks = [0];
  for (let s = 0; s < L; ) {
    s += [0.75, 1.0, 1.0, 1.25, 1.5][Math.floor(hash01(seed, "b", breaks.length) * 5)];
    breaks.push(Math.min(s, L));
  }
  if (breaks.length > 2 && L - breaks[breaks.length - 2] < 0.4) breaks.splice(breaks.length - 2, 1);
  const seam = 0.5 * T;
  for (let pi = 0; pi + 1 < breaks.length; pi++) {
    const s0 = breaks[pi] + seam;
    const s1 = breaks[pi + 1] - seam;
    const w = s1 - s0;
    if (w < 0.1) continue;
    tiers.forEach(([t0, t1], ti) => {
      const h = hash01(seed, pi, ti, "k");
      const dep = 2.5 + Math.floor(hash01(seed, pi, ti, "d") * 2);
      if (h < 0.14 && t1 - t0 >= 10) {
        // Vent stack: louvres between trim caps.
        push(s0, s1, 1.5, dep - 0.5, t0 + 1, t1 - 1, "dark");
        for (let zz = t0 + 2; zz < t1 - 2; zz += 2) push(s0 + 0.06, s1 - 0.06, 1.5, dep, zz, zz + 1, "metal");
        push(s0, s1, 1.5, dep + 0.5, t0, t0 + 1, "trim");
        push(s0, s1, 1.5, dep + 0.5, t1 - 1, t1, "trim");
        return;
      }
      let slot = (["primary", "primary", "secondary", "accent", "primary"] as ShipKitSlot[])[Math.floor(hash01(seed, pi, ti, "s") * 5)];
      if (ti === 0 && tiers.length > 1 && slot === "primary") slot = "secondary";
      push(s0, s1, 1.5, dep, t0 + 0.5, t1 - 0.5, slot);
      // Relief: inset plate one layer proud, leaving a frame of the base cassette around it.
      if (w > 0.45 && t1 - t0 >= 8 && hash01(seed, pi, ti, "r") < 0.7) {
        const inset = Math.min(0.14, w * 0.18);
        const reliefSlot: ShipKitSlot = slot === "accent" ? "accent" : slot === "primary" ? "primary" : "secondary";
        push(s0 + inset, s1 - inset, dep, dep + 0.75, t0 + 2.5, t1 - 2.5, reliefSlot);
      }
      if (hash01(seed, pi, ti, "l") < 0.4 && t1 - t0 >= 10) {
        const a = s0 + w * 0.25;
        push(a, a + Math.max(0.25, w * 0.5), dep, dep + 1.25, t1 - 5, t1 - 4, hash01(seed, pi, "e") < 0.5 ? "emit_a" : "emit_b");
      }
      if (hash01(seed, pi, ti, "m") < 0.35) push(s0 + 0.05, s1 - 0.05, dep, dep + 1, t0 + 2, t0 + 3.5, "metal");
    });
  }
  if (rim) {
    push(0, L, 1.5, 3.5, rim[0], rim[1], "secondary");
    push(0, L, 3.5, 4, rim[1] - 1, rim[1], "trim");
  }
  return out;
}

/**
 * Deck-view interior wall along angled exterior edges: a thick band inward of the outline with
 * a dark footing, light-grey panelled cassettes on the inner face, a light strip and a dark cap.
 * `chain` runs along the wall with side = -1 (inward); d is measured inward in texels.
 */
export function slopeWallPrisms(chain: MitredChain, floorTop: number, cut: number, thickness: number, seed: number): DressPrism[] {
  const T = TEXEL;
  const L = chain.length;
  const out: DressPrism[] = [];
  const push = (s0: number, s1: number, d0: number, d1: number, z0: number, z1: number, slot: ShipKitSlot) => out.push(...chain.band(s0, s1, d0 * T, d1 * T, z0, z1, slot));
  push(0, L, 0, thickness, floorTop, cut - 2, "secondary");
  push(0, L, -0.5, thickness + 0.5, cut - 2, cut, "dark"); // cap
  push(0, L, thickness, thickness + 1, floorTop, floorTop + 3, "dark"); // footing
  // Inner cassettes 0.75-1.0 m wide with seams.
  let s = 0;
  let i = 0;
  while (s < L - 0.2) {
    const w = Math.min(L - s, hash01(seed, i, "w") < 0.5 ? 0.75 : 1.0);
    const a = s + 0.03;
    const b = s + w - 0.03;
    push(a, b, thickness, thickness + 1, floorTop + 4, cut - 4, "primary");
    if (hash01(seed, i, "l") < 0.5) push(a + (b - a) * 0.2, b - (b - a) * 0.2, thickness + 1, thickness + 1.5, cut - 7, cut - 6, "emit_a");
    else push(a + 0.08, b - 0.08, thickness + 1, thickness + 1.5, floorTop + 8, cut - 9, "secondary");
    s += w;
    i++;
  }
  return out;
}
