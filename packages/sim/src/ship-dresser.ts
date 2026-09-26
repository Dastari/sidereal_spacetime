/**
 * Prefab ship dresser: the ONE implementation that turns grammar data (a prefab document)
 * into kit-piece placements, generated brick geometry, decals and object sockets
 * (docs/shipyard_player_builder_design.md §3.7, §4.3, §12). Ported from the r008
 * `dress()` / `skin_piece()` / `raster_poly()` / `build_deck()` prototype in
 * scripts/art_library/ship_kit_prototype.py; the Python version is now evidence only.
 *
 * Pure and deterministic: identical documents give identical output. Seeds come from
 * document ids and lattice coordinates, never RNG state. Presentation only: authority
 * never reads dresser output.
 *
 * Output frame: prefab ship frame (+X fore, +Y port, +Z up). Placements are metres with a
 * rotation in degrees about +Z; generated boxes are texels (1/16 m).
 */
import {
  G,
  TEXEL,
  ccw,
  fullCells,
  hash01,
  insideOutline,
  insidePolygon,
  volumeTiers,
  type Outline,
  type Pt,
} from "@sidereal/content/construction-grammar";
import {
  deckVolume,
  deriveInterior,
  placeMount,
  volumeGeometry,
  type DerivedSocket,
  type MountPlacement,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
  type VolumeGeometry,
} from "@sidereal/content/ship-prefab";
import { SHIP_KIT_SLOTS, faceKinds, facePieceId, kitId, type ShipKitSlot } from "@sidereal/content/ship-kit";

export type DressView = "both" | "flight" | "deck";

export interface KitPlacement {
  piece: string;
  /** Metres, prefab ship frame. */
  x: number;
  y: number;
  z: number;
  /** Degrees counter-clockwise about +Z. */
  rotDeg: number;
  view: DressView;
}

/** [x0, y0, z0, x1, y1, z1, slot index] in texels. */
export type DressBox = [number, number, number, number, number, number, number];

export interface GeneratedGeometry {
  id: string;
  kind: "hull-body" | "skin" | "floor-slab" | "slope-wall" | "shell-band";
  boxes: DressBox[];
  view: DressView;
}

export interface DecalPlacement {
  kind: "name" | "number" | "emblem";
  /** Quad corners (m) in the prefab frame, counter-clockwise when seen from the outside. */
  corners: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
  /** Outward unit normal. */
  normal: [number, number, number];
  view: DressView;
}

export interface ComponentPlacement {
  mount: string;
  component: string;
  placement: MountPlacement;
  view: DressView;
}

export interface DressedShip {
  id: string;
  theme: ShipPrefabDocumentV1["theme"];
  markings: ShipPrefabDocumentV1["markings"];
  kit: KitPlacement[];
  generated: GeneratedGeometry[];
  decals: DecalPlacement[];
  components: ComponentPlacement[];
  objects: (DerivedSocket & { view: DressView })[];
  lights: { at: [number, number, number]; colour: [number, number, number]; intensity: number; view: DressView }[];
  labels: { text: string; at: [number, number, number]; view: DressView }[];
  /** Plan bounds (m) of the structure, [x0, y0, x1, y1]. */
  bounds: [number, number, number, number];
  stats: { cassettes: number; roof: number; skins: number; floors: number; walls: number; partitions: number; doors: number; posts: number; sockets: number };
}

const SLOT = Object.fromEntries(SHIP_KIT_SLOTS.map((s, i) => [s, i])) as Record<ShipKitSlot, number>;
const ROW = 4; // plan raster row height in texels (0.25 m)

/** Python round(): half to even. Keeps the raster identical to the prototype. */
function pyRound(v: number): number {
  const f = Math.floor(v);
  const r = v - f;
  if (Math.abs(r - 0.5) < 1e-12) return f % 2 === 0 ? f : f + 1;
  return Math.round(v);
}

function spansMulti(rings: readonly (readonly Pt[])[], yc: number): [number, number][] {
  const xs: number[] = [];
  for (const poly of rings)
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % poly.length];
      if ((y0 <= yc && yc < y1) || (y1 <= yc && yc < y0)) xs.push(x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0));
    }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], xs[k + 1]]);
  return out;
}

/** Even-odd scanline raster of a plan outline into per-1 m-cell stepped boxes (texels). */
export function rasterOutline(
  outline: Outline,
  bands: readonly number[],
  colour: (cx: number, cy: number, band: number) => ShipKitSlot,
  /** Panel cell size in texels (16 = 1 m bricks; larger merges spans into bigger panels). */
  cell = 16,
): DressBox[] {
  const rings = [outline.outer, ...outline.holes];
  const ys = outline.outer.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys) * 4) * 4;
  const y1 = Math.ceil(Math.max(...ys) * 4) * 4;
  const cells = new Map<string, Map<number, [number, number][]>>();
  for (let yt = y0; yt < y1; yt += ROW) {
    const yc = (yt + ROW / 2) * TEXEL;
    for (const [a, b] of spansMulti(rings, yc)) {
      const xa = pyRound(a * 8) * 2;
      const xb = pyRound(b * 8) * 2;
      if (xb <= xa) continue;
      for (let cx = Math.floor(xa / cell); cx <= Math.floor((xb - 1) / cell); cx++) {
        const sa = Math.max(xa, cx * cell);
        const sb = Math.min(xb, cx * cell + cell);
        if (sb <= sa) continue;
        const k = `${cx},${Math.floor(yt / cell)}`;
        if (!cells.has(k)) cells.set(k, new Map());
        const rows = cells.get(k)!;
        if (!rows.has(yt)) rows.set(yt, []);
        rows.get(yt)!.push([sa, sb]);
      }
    }
  }
  const boxes: DressBox[] = [];
  const keys = [...cells.keys()].sort((m, n) => {
    const [a, b] = m.split(",").map(Number);
    const [c, d] = n.split(",").map(Number);
    return a - c || b - d;
  });
  for (const k of keys) {
    const [cx, cy] = k.split(",").map(Number);
    const rows = cells.get(k)!;
    const open = new Map<string, number>();
    const emit = (seg: string, ya: number, yb: number) => {
      const [sa, sb] = seg.split(":").map(Number);
      for (let bi = 0; bi + 1 < bands.length; bi++) boxes.push([sa, ya, bands[bi], sb, yb, bands[bi + 1], SLOT[colour(cx, cy, bi)]]);
    };
    for (let yt = cy * cell; yt < cy * cell + cell; yt += ROW) {
      const segs = new Set((rows.get(yt) ?? []).map(([a, b]) => `${a}:${b}`));
      for (const [seg, ya] of [...open.entries()]) if (!segs.has(seg)) {
        emit(seg, ya, yt);
        open.delete(seg);
      }
      for (const seg of [...segs].sort()) if (!open.has(seg)) open.set(seg, yt);
    }
    for (const [seg, ya] of [...open.entries()].sort()) emit(seg, ya, cy * cell + cell);
  }
  return boxes;
}

function tierInfo(z: [number, number]) {
  return volumeTiers(z[0], z[1]);
}

/** Stepped panel skin following a chain of non-axis edges (slopes/arcs); port of skin_piece. */
export function skinBoxes(chain: readonly [Pt, Pt][], z: [number, number], outer: readonly Pt[], seed: number): DressBox[] {
  const { tiers, rim } = tierInfo(z);
  const segs: { p: Pt; dh: Pt; n: Pt; L: number; a0: number }[] = [];
  let acc = 0;
  for (const [p, q] of chain) {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const L = Math.hypot(dx, dy);
    segs.push({ p, dh: [dx / L, dy / L], n: [dy / L, -dx / L], L, a0: acc });
    acc += L;
  }
  const breaks: number[] = [];
  for (let s = 0; s < acc + 2; ) {
    breaks.push(s);
    s += [0.75, 1.0, 1.0, 1.25, 1.5][Math.floor(hash01(seed, Math.trunc(s * 8)) * 5)];
  }
  const D = 5;
  const xs = chain.flatMap(([p, q]) => [p[0], q[0]]);
  const ys = chain.flatMap(([p, q]) => [p[1], q[1]]);
  const xa0 = Math.floor((Math.min(...xs) - 0.5) * 8) * 2;
  const xb0 = Math.ceil((Math.max(...xs) + 0.5) * 8) * 2;
  const ya0 = Math.floor((Math.min(...ys) - 0.5) * 4) * 4;
  const yb0 = Math.ceil((Math.max(...ys) + 0.5) * 4) * 4;
  const cols = new Map<number, [number, number, number][]>();
  for (let yt = ya0; yt < yb0; yt += ROW)
    for (let xt = xa0; xt < xb0; xt += 2) {
      const cx = (xt + 1) * TEXEL;
      const cy = (yt + ROW / 2) * TEXEL;
      let best: [number, number] | null = null;
      for (const sg of segs) {
        const rx = cx - sg.p[0];
        const ry = cy - sg.p[1];
        const t = rx * sg.dh[0] + ry * sg.dh[1];
        if (t < -0.01 || t > sg.L + 0.01) continue;
        const dist = rx * sg.n[0] + ry * sg.n[1];
        if (dist * 16 >= 0 && dist * 16 < D && (!best || dist < best[1])) best = [sg.a0 + t, dist];
      }
      if (!best || insidePolygon(outer, cx, cy)) continue;
      let panel = 0;
      for (let i = 0; i < breaks.length; i++) if (breaks[i] <= best[0]) panel = i;
      if (!cols.has(yt)) cols.set(yt, []);
      cols.get(yt)!.push([xt, panel, best[1] * 16]);
    }
  const plans = new Map<number, [number, number, ShipKitSlot, number][]>();
  const plan = (panel: number) => {
    const out: [number, number, ShipKitSlot, number][] = [];
    tiers.forEach(([t0, t1], ti) => {
      const h = hash01(seed, panel, ti, 3);
      const dep = 2 + Math.floor(hash01(seed, panel, ti, 4) * 3);
      if (h < 0.16 && t1 - t0 >= 10) {
        for (let zz = t0 + 1; zz < t1 - 1; zz++) out.push([zz, zz + 1, zz % 2 ? "metal" : "dark", dep - (zz % 2 ? 0 : 1)]);
        out.push([t0, t0 + 1, "trim", dep]);
        out.push([t1 - 1, t1, "trim", dep]);
      } else {
        let slot = (["primary", "primary", "secondary", "accent", "primary"] as ShipKitSlot[])[Math.floor(hash01(seed, panel, ti, 5) * 5)];
        if (ti === 0 && tiers.length > 1 && slot === "primary") slot = "secondary";
        out.push([t0 + 1, t1 - 1, slot, dep]);
        if (hash01(seed, panel, ti, 6) < 0.3 && t1 - t0 >= 10) out.push([t1 - 5, t1 - 4, hash01(seed, panel, 7) < 0.5 ? "emit_a" : "emit_b", dep + 1]);
        if (hash01(seed, panel, ti, 8) < 0.35) out.push([t0 + 2, t0 + 4, "metal", dep + 1]);
      }
    });
    if (rim) out.push([rim[0], rim[1], "secondary", 3]);
    return out;
  };
  const boxes: DressBox[] = [];
  const runs = new Map<string, number>();
  const emit = (key: string, ya: number, yb: number) => {
    const [panel, li, xa, xb] = key.split(":").map(Number);
    const [z0, z1, slot] = plans.get(panel)![li];
    if (z1 > z0) boxes.push([xa, ya, z0, xb, yb, z1, SLOT[slot]]);
  };
  for (let yt = ya0; yt < yb0 + ROW; yt += ROW) {
    const cur = new Set<string>();
    const row = [...(cols.get(yt) ?? [])].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const panels = [...new Set(row.map((c) => c[1]))].sort((a, b) => a - b);
    for (const panel of panels) {
      if (!plans.has(panel)) plans.set(panel, plan(panel));
      plans.get(panel)!.forEach(([, , , dep], li) => {
        const xsIn = row.filter((c) => c[1] === panel && c[2] < dep).map((c) => c[0]);
        if (!xsIn.length) return;
        let start = xsIn[0];
        let prev = xsIn[0];
        for (const xt of [...xsIn.slice(1), null]) {
          if (xt !== null && xt === prev + 2) {
            prev = xt;
            continue;
          }
          cur.add(`${panel}:${li}:${start}:${prev + 2}`);
          if (xt !== null) start = prev = xt;
        }
      });
    }
    for (const [key, ya] of [...runs.entries()]) if (!cur.has(key)) {
      emit(key, ya, yt);
      runs.delete(key);
    }
    for (const key of [...cur].sort()) if (!runs.has(key)) runs.set(key, yt);
  }
  return boxes;
}

/** Split a CCW outline loop into axis edges and chains of consecutive non-axis edges. */
export function faceChains(poly: readonly Pt[]): { axis: [Pt, Pt][]; chains: [Pt, Pt][][] } {
  const n = poly.length;
  const axis: [Pt, Pt][] = [];
  const chains: [Pt, Pt][][] = [];
  let chain: [Pt, Pt][] = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    if (Math.abs(p[0] - q[0]) < 1e-6 || Math.abs(p[1] - q[1]) < 1e-6) {
      if (chain.length) chains.push(chain), (chain = []);
      axis.push([p, q]);
    } else chain.push([p, q]);
  }
  if (chain.length) {
    const first = chains[0]?.[0]?.[0];
    const last = chain[chain.length - 1][1];
    if (first && Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) chains[0] = [...chain, ...chains[0]];
    else chains.push(chain);
  }
  return { axis, chains };
}

function subtract(a: number, b: number, holes: readonly [number, number][]): [number, number][] {
  let segs: [number, number][] = [[a, b]];
  for (const [h0, h1] of holes) {
    const next: [number, number][] = [];
    for (const [s0, s1] of segs) {
      if (h1 <= s0 || h0 >= s1) next.push([s0, s1]);
      else {
        if (s0 < h0) next.push([s0, h0]);
        if (h1 < s1) next.push([h1, s1]);
      }
    }
    segs = next;
  }
  return segs;
}

function pack(interval: [number, number], seed: number): [number, number][] {
  const [a, b] = interval;
  const out: [number, number][] = [];
  for (let u = a; u < b; ) {
    const wm = Math.min(b - u, G.cassettes.packWidths[Math.floor(hash01(u, seed) * 4)]);
    out.push([u, wm]);
    u += wm;
  }
  return out;
}

const sumCodes = (s: string) => Array.from(s).reduce((t, c) => t + c.charCodeAt(0), 0);

function pickFace(seed: (string | number)[], width: number, upper: boolean, windows: boolean): string {
  const h = hash01(...seed, 1);
  if (windows && upper) return width >= 2 ? "full" : "port";
  const list = faceKinds(width >= 3 ? 3 : width, upper, false);
  return list[Math.floor(h * list.length)];
}

export interface DressOptions {
  catalog: PrefabComponentCatalog;
}

/** Dress a prefab. Both views are produced at once; the renderer toggles by `view`. */
export function dressShip(doc: ShipPrefabDocumentV1, options: DressOptions): DressedShip {
  const geoms = doc.volumes.map(volumeGeometry).filter((g) => g.outline);
  const deck = deckVolume(doc, 0);
  const deckId = deck && doc.rooms.length ? deck.volume.id : null;
  const kit: KitPlacement[] = [];
  const generated: GeneratedGeometry[] = [];
  const decals: DecalPlacement[] = [];
  const stats = { cassettes: 0, roof: 0, skins: 0, floors: 0, walls: 0, partitions: 0, doors: 0, posts: 0, sockets: 0 };
  const place = (piece: string, x: number, y: number, z: number, rotDeg: number, view: DressView) => kit.push({ piece, x, y, z, rotDeg: ((rotDeg % 360) + 360) % 360, view });
  const decoKind = G.decorators[doc.theme] ?? "antenna";

  const mounts = doc.mounts.map((m) => placeMount(m, options.catalog.get(m.component), geoms));
  const topTaken = new Set<string>();
  for (const mp of mounts)
    if (mp.mount.attach === "top") {
      const [x0, y0, x1, y1] = mp.rect;
      for (let cx = Math.floor(x0); cx < Math.ceil(x1); cx++) for (let cy = Math.floor(y0); cy < Math.ceil(y1); cy++) topTaken.add(`${cx},${cy}`);
    }
  for (const s of doc.skylights)
    for (let cx = s.at[0]; cx < s.at[0] + s.size[0]; cx++) for (let cy = s.at[1]; cy < s.at[1] + s.size[1]; cy++) topTaken.add(`${cx},${cy}`);

  const otherCovers = (v: VolumeGeometry, x: number, y: number, z0: number, z1: number) =>
    geoms.some((w) => w !== v && w.z[0] < z1 && z0 < w.z[1] && insideOutline(w.outline!, x, y));

  const interior = deckId ? deriveInterior(doc, 0, options.catalog) : null;
  const exteriorDoors = interior?.doors.filter((d) => d.exterior) ?? [];

  geoms.forEach((g, vi) => {
    const v = g.volume;
    const outline: Outline = { outer: ccw(g.outline!.outer), holes: g.outline!.holes };
    const isDeck = v.id === deckId;
    const { tiers, rim } = tierInfo(g.z);
    const [z0, z1] = g.z;
    // Hull body (solid, roofed). Deck volumes swap it for floors + walls in deck view.
    let bands: number[];
    let colour: (cx: number, cy: number, bi: number) => ShipKitSlot;
    if (v.kind === "hull") {
      bands = [...new Set([Math.max(0, z0 - G.tierRule.skirtTexels), z0, ...tiers.map((t) => t[1]), ...(rim ? [rim[1]] : [])])].sort((a, b) => a - b);
      const nb = bands.length;
      colour = (_cx, _cy, bi) => (bi === 0 ? "trim" : bi === 1 && nb > 3 ? "secondary" : "primary");
    } else {
      bands = [z0, z1];
      colour = (cx, cy) => {
        const h = hash01(cx, cy, vi, 44);
        return h < 0.62 ? "primary" : h < 0.84 ? "secondary" : "accent";
      };
    }
    // 3 m panels: larger plates read as the reference's panelled hull instead of a 1 m grid.
    generated.push({ id: `gen.${doc.id}.${v.id}.body`, kind: "hull-body", boxes: rasterOutline(outline, bands, colour, 48), view: isDeck ? "flight" : "both" });

    // Slope and arc skins.
    const { axis, chains } = faceChains(outline.outer);
    chains.forEach((ch, ci) => {
      const boxes = skinBoxes(ch, g.z, outline.outer, hash01(doc.id, vi, ci) * 1e5);
      if (!boxes.length) return;
      stats.skins++;
      if (!isDeck) generated.push({ id: `gen.${doc.id}.${v.id}.skin${ci}`, kind: "skin", boxes, view: "both" });
      else {
        generated.push({ id: `gen.${doc.id}.${v.id}.skin${ci}`, kind: "skin", boxes, view: "flight" });
        const cut = G.deck.shellCutTexels;
        const clipped = boxes.filter((b) => b[2] < cut).map((b) => [b[0], b[1], b[2], b[3], b[4], Math.min(b[5], cut), b[6]] as DressBox);
        generated.push({ id: `gen.${doc.id}.${v.id}.skin${ci}.cut`, kind: "skin", boxes: clipped, view: "deck" });
      }
    });

    // Straight faces: cassettes in tiers plus a rim band.
    const byLength = [...axis].sort((m, n) => Math.hypot(n[1][0] - n[0][0], n[1][1] - n[0][1]) - Math.hypot(m[1][0] - m[0][0], m[1][1] - m[0][1]));
    const longAxis = byLength.slice(0, 2);
    for (const edge of axis) {
      const [p, q] = edge;
      const L = Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]));
      if (L < 1 || Math.abs(p[0] - Math.round(p[0])) > 1e-6 || Math.abs(p[1] - Math.round(p[1])) > 1e-6) continue;
      const d: Pt = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
      const nrm: Pt = [d[1], -d[0]];
      const rot = (Math.atan2(d[1], d[0]) * 180) / Math.PI + 180;
      const logo = v.kind === "hull" && tiers.length === 2 && longAxis.includes(edge) && L >= 6 && (v.logo ?? true);
      tiers.forEach(([t0, t1], ti) => {
        const h = t1 - t0;
        if (h < G.tierRule.cassetteMinTexels) return;
        const upper = ti === tiers.length - 1 && tiers.length > 1;
        const tierView: DressView = isDeck && t0 >= G.deck.shellCutTexels - 12 ? "flight" : "both";
        const holes: [number, number][] = [];
        for (let u = 0; u < L; u++) {
          const px = p[0] + d[0] * (u + 0.5) + nrm[0] * 0.3;
          const py = p[1] + d[1] * (u + 0.5) + nrm[1] * 0.3;
          if (otherCovers(g, px, py, t0, t1)) holes.push([u, u + 1]);
        }
        for (const mp of mounts) {
          if (mp.mount.attach !== "face") continue;
          const n = mp.mount.normal!;
          const nv = { fore: [1, 0], aft: [-1, 0], port: [0, 1], starboard: [0, -1] }[n];
          if (Math.abs(nv[0] - nrm[0]) > 1e-3 || Math.abs(nv[1] - nrm[1]) > 1e-3) continue;
          if (Math.abs((mp.anchor[0] - p[0]) * nrm[0] + (mp.anchor[1] - p[1]) * nrm[1]) > 0.05) continue;
          if (!(mp.z[0] < t1 && t0 < mp.z[1])) continue;
          const w = mp.spec ? mp.spec.cells[0] : 1;
          const ua = (mp.anchor[0] - p[0]) * d[0] + (mp.anchor[1] - p[1]) * d[1] - w / 2;
          holes.push([Math.floor(ua + 1e-6), Math.ceil(ua + w - 1e-6)]);
        }
        for (const door of exteriorDoors) {
          if (!(8 < t1 && t0 < 48)) continue;
          const ua = (door.a[0] - p[0]) * d[0] + (door.a[1] - p[1]) * d[1];
          const ub = (door.b[0] - p[0]) * d[0] + (door.b[1] - p[1]) * d[1];
          const off = (door.a[0] - p[0]) * nrm[0] + (door.a[1] - p[1]) * nrm[1];
          if (Math.abs(off) > 1e-6) continue;
          if (Math.max(ua, ub) <= 0 || Math.min(ua, ub) >= L) continue;
          holes.push([Math.floor(Math.min(ua, ub)), Math.ceil(Math.max(ua, ub))]);
        }
        const items: [number, number, string | null][] = [];
        if (logo && ti === 1) {
          const cands = [...Array(Math.max(0, L - 2)).keys()].sort((a, b) => Math.abs(a + 1.5 - L / 2) - Math.abs(b + 1.5 - L / 2) || a - b);
          for (const lu of cands)
            if (!holes.some(([a, b]) => a < lu + 3 && lu < b)) {
              items.push([lu, 3, "logo"]);
              holes.push([lu, lu + 3]);
              break;
            }
        }
        for (const seg of subtract(0, L, holes))
          for (const [u, wm] of pack(seg, sumCodes(doc.id) + vi * 7 + ti * 13 + Math.trunc(p[0] * 3 + p[1] * 5))) items.push([u, wm, null]);
        for (const [u, wm, fixed] of items) {
          const ox = p[0] + d[0] * (u + wm);
          const oy = p[1] + d[1] * (u + wm);
          const seed: (string | number)[] = [doc.id, vi, Math.trunc(p[0]), Math.trunc(p[1]), ti, u];
          if (!fixed && wm <= 2 && h >= G.tierRule.smallSplitMinTexels && hash01(...seed, 91) < G.cassettes.smallSplitChance) {
            const h1 = Math.floor(h / 2);
            ([[t0, h1], [t0 + h1, h - h1]] as [number, number][]).forEach(([za, hh], k) => {
              const kind = G.cassettes.pickSmall[Math.floor(hash01(...seed, k, 2) * G.cassettes.pickSmall.length)];
              const view: DressView = isDeck && za >= G.deck.shellCutTexels - 12 ? "flight" : tierView;
              place(facePieceId(kind, wm, hh), ox, oy, za * TEXEL, rot, view);
              stats.cassettes++;
            });
            continue;
          }
          const kind = fixed ?? pickFace(seed, wm, upper, v.faceStyle === "windows");
          place(facePieceId(kind, wm, h), ox, oy, t0 * TEXEL, rot, tierView);
          stats.cassettes++;
          if (kind === "logo") {
            // Name decal on the logo cassette face (socket rect 3..w-3 x 3..h-3 texels, y = 3).
            const a0 = 3 * TEXEL;
            const a1 = (wm * 16 - 3) * TEXEL;
            const zb = t0 * TEXEL + 3 * TEXEL;
            const zt = t1 * TEXEL - 3 * TEXEL;
            const out = 3 * TEXEL + 0.004;
            const at = (s: number, zz: number): [number, number, number] => [ox - d[0] * s + nrm[0] * out, oy - d[1] * s + nrm[1] * out, zz];
            decals.push({ kind: "name", corners: [at(a1, zb), at(a0, zb), at(a0, zt), at(a1, zt)], normal: [nrm[0], nrm[1], 0], view: tierView });
          }
        }
      });
      if (rim) {
        for (let u = 0; u < L; u++) {
          const px = p[0] + d[0] * (u + 0.5) + nrm[0] * 0.3;
          const py = p[1] + d[1] * (u + 0.5) + nrm[1] * 0.3;
          if (otherCovers(g, px, py, rim[0], rim[1])) continue;
          const lit = hash01(doc.id, vi, u, Math.trunc(p[0] + p[1]), 5) < 0.3;
          place(kitId.rim(rim[1] - rim[0], lit), p[0] + d[0] * (u + 1), p[1] + d[1] * (u + 1), rim[0] * TEXEL, rot, isDeck ? "flight" : "both");
        }
      }
    }

    // Deck view shell: skirt and a capped band at the 2.5 m cut, along every outline edge.
    if (isDeck) {
      const band: DressBox[] = [];
      const cut = G.deck.shellCutTexels;
      const lower = tiers[0][1];
      for (const loop of [outline.outer]) {
        const ringOuter = offsetLoop(loop, 2 * TEXEL);
        const ringInner = offsetLoop(loop, -G.deck.exteriorWallTexels * TEXEL);
        const ring: Outline = { outer: ringOuter, holes: [[...ringInner].reverse()] };
        band.push(...rasterOutline(ring, [lower, cut - 2, cut], (_cx, _cy, bi) => (bi === 0 ? "primary" : "dark")));
        band.push(...rasterOutline(ring, [0, z0], () => "trim"));
      }
      generated.push({ id: `gen.${doc.id}.${v.id}.shell`, kind: "shell-band", boxes: band, view: "deck" });
    }

    // Roof.
    const zt = z1 * TEXEL;
    const roofView: DressView = isDeck ? "flight" : "both";
    if (v.kind === "hull") {
      const cells = new Set<string>();
      for (const [cx, cy] of fullCells(outline))
        if (!otherCovers(g, cx + 0.5, cy + 0.5, z1, z1 + 20)) cells.add(`${cx},${cy}`);
      const free = new Set([...cells].filter((c) => !topTaken.has(c)));
      const rimc = new Set(
        [...free].filter((c) => {
          const [x, y] = c.split(",").map(Number);
          for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) if (!cells.has(`${x + a},${y + b}`)) return true;
          return false;
        }),
      );
      const interiorCells = new Set([...free].filter((c) => !rimc.has(c)));
      const has = (x: number, y: number) => interiorCells.has(`${x},${y}`);
      const take = (x: number, y: number) => interiorCells.delete(`${x},${y}`);
      if (v.spine && interiorCells.size) {
        const cyv = [...interiorCells].map((c) => Number(c.split(",")[1]));
        const mid = pyRound((Math.min(...cyv) + Math.max(...cyv) + 1) / 2) - 1;
        const xsSp = [...new Set([...interiorCells].map((c) => c.split(",").map(Number)).filter(([, y]) => y === mid || y === mid + 1).map(([x]) => x))].sort((a, b) => a - b);
        const logoX = xsSp.length >= 8 ? xsSp[Math.floor(xsSp.length / 2) - 2] : null;
        let x = xsSp.length ? xsSp[0] : 0;
        while (xsSp.length && x <= xsSp[xsSp.length - 1]) {
          if (logoX !== null && x === logoX && [0, 1, 2, 3].every((a) => has(x + a, mid) && has(x + a, mid + 1))) {
            place(kitId.roof("logo", 4, 2), x, mid, zt, 0, roofView);
            if (doc.markings.emblem !== "none") {
              const e = 3 * TEXEL;
              const zz = zt + 3 * TEXEL + 0.004;
              decals.push({ kind: "emblem", corners: [[x + e, mid + e, zz], [x + 4 - e, mid + e, zz], [x + 4 - e, mid + 2 - e, zz], [x + e, mid + 2 - e, zz]], normal: [0, 0, 1], view: roofView });
            }
            for (const a of [0, 1, 2, 3]) take(x + a, mid), take(x + a, mid + 1);
            x += 4;
            continue;
          }
          if ([0, 1].every((a) => has(x + a, mid) && has(x + a, mid + 1))) {
            place(kitId.roof("spine", 2, 2), x, mid, zt, 0, roofView);
            for (const a of [0, 1]) take(x + a, mid), take(x + a, mid + 1);
            x += 2;
          } else x += 1;
        }
      }
      const sorted = [...interiorCells].map((c) => c.split(",").map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [cx, cy] of sorted) {
        if (!has(cx, cy)) continue;
        let order = [...G.roof.moduleSizes];
        const k0 = Math.floor(hash01(doc.id, vi, cx, cy, 17) * order.length);
        order = [...order.slice(k0), ...order.slice(0, k0), [1, 1]];
        let w = 1;
        let dd = 1;
        for (const [ow, od] of order) {
          let ok = true;
          for (let a = 0; a < ow && ok; a++) for (let b = 0; b < od; b++) if (!has(cx + a, cy + b)) ok = false;
          if (ok) {
            w = ow;
            dd = od;
            break;
          }
        }
        for (let a = 0; a < w; a++) for (let b = 0; b < dd; b++) take(cx + a, cy + b);
        if (w === 1 && dd === 1) {
          const kind = G.roof.smallKinds[Math.floor(hash01(doc.id, cx, cy, 19) * G.roof.smallKinds.length)];
          place(kitId.roofSmall(kind), cx, cy, zt, 0, roofView);
        } else {
          const pool = Math.min(w, dd) >= 2 ? G.roof.bigKinds : G.roof.thinKinds;
          const kind = pool[Math.floor(hash01(doc.id, cx, cy, 23) * pool.length)];
          place(kitId.roof(kind, w, dd), cx, cy, zt, 0, roofView);
          if (kind === "greeble") place(kitId.decorator(decoKind), cx + 0.4, cy + 0.4, zt + 2 * TEXEL, 0, roofView);
        }
        stats.roof++;
      }
      // Roof rim: merged dark trim runs (not 1 m tiles), a lit edge line and sparse running
      // lights, as the reference's charcoal-navy hull edging.
      const rimCells = [...rimc].map((c) => c.split(",").map(Number) as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const rimBoxes: DressBox[] = [];
      for (let i = 0; i < rimCells.length; ) {
        const [x0, y] = rimCells[i];
        let x1 = x0 + 1;
        while (i + 1 < rimCells.length && rimCells[i + 1][1] === y && rimCells[i + 1][0] === x1) i++, x1++;
        i++;
        rimBoxes.push([x0 * 16, y * 16, z1, x1 * 16, y * 16 + 16, z1 + 2, SLOT.secondary]);
        rimBoxes.push([x0 * 16 + 1, y * 16 + 1, z1 + 2, x1 * 16 - 1, y * 16 + 15, z1 + 3, SLOT.trim]);
        for (let x = x0; x < x1; x++) {
          const h = hash01(doc.id, x, y, 3);
          if (h < 0.28) rimBoxes.push([x * 16 + 6, y * 16 + 6, z1 + 3, x * 16 + 10, y * 16 + 10, z1 + 4, h < 0.14 ? SLOT.emit_a : SLOT.emit_b]);
          else if (h < 0.5) rimBoxes.push([x * 16 + 3, y * 16 + 3, z1 + 3, x * 16 + 13, y * 16 + 13, z1 + 5, SLOT.metal]);
        }
      }
      generated.push({ id: `gen.${doc.id}.${v.id}.roof-rim`, kind: "hull-body", boxes: rimBoxes, view: roofView });
      rimCells.forEach(([cx, cy], k) => {
        if (doc.theme === "riftjack" && k % 3 === 0) place(kitId.decorator("spike"), cx + 0.3, cy + 0.3, zt + 3 * TEXEL, 0, roofView);
      });
    } else if (doc.theme === "aurelian" || doc.theme === "crystalline") {
      const poly = outline.outer;
      const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
      const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
      for (let k = 0; k < poly.length; k += Math.max(1, Math.floor(poly.length / 3))) {
        const [x, y] = poly[k];
        place(kitId.decorator("crystal"), x + (cx - x) * 0.25, y + (cy - y) * 0.25, zt, 0, "both");
      }
    }
  });

  // Skylights.
  for (const s of doc.skylights) {
    const host = geoms.filter((g) => insideOutline(g.outline!, s.at[0] + 0.5, s.at[1] + 0.5)).sort((a, b) => b.z[1] - a.z[1])[0];
    if (!host) continue;
    place(kitId.skylight(s.size[0], s.size[1]), s.at[0], s.at[1], host.z[1] * TEXEL, 0, host.volume.id === deckId ? "flight" : "both");
  }

  // Components on hardpoints.
  const components: ComponentPlacement[] = mounts.map((mp) => ({
    mount: mp.mount.id,
    component: mp.mount.component,
    placement: mp,
    view: mp.mount.attach === "interior" ? "deck" : mp.mount.attach === "top" && mp.host === deckId ? "flight" : "both",
  }));

  // Plate decals (number strip on the first plate, emblem on the second).
  const plates = geoms.filter((g) => g.volume.kind === "plate");
  plates.slice(0, 2).forEach((w, k) => {
    const xs = w.outline!.outer.map((p) => p[0]);
    const ys = w.outline!.outer.map((p) => p[1]);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const spanX = (Math.max(...xs) - Math.min(...xs)) * 0.45;
    const spanY = (Math.max(...ys) - Math.min(...ys)) * 0.35;
    const hw = k === 0 ? Math.min(spanX, spanY * 3.5) : Math.min(spanX, spanY);
    const hh = k === 0 ? hw / 3.5 : hw;
    if (hw <= 0.3) return;
    if (k === 0 && !doc.markings.number) return;
    if (k === 1 && doc.markings.emblem === "none") return;
    const z = w.z[1] * TEXEL + 0.004;
    decals.push({ kind: k === 0 ? "number" : "emblem", corners: [[cx - hw, cy - hh, z], [cx + hw, cy - hh, z], [cx + hw, cy + hh, z], [cx - hw, cy + hh, z]], normal: [0, 0, 1], view: "both" });
  });

  // Interior (deck view).
  const objects: DressedShip["objects"] = [];
  const lights: DressedShip["lights"] = [];
  const labels: DressedShip["labels"] = [];
  if (interior && deck?.outline) {
    const ft = G.deck.floorTopTexels * TEXEL;
    const cutT = G.deck.interiorCutTexels;
    const full = new Set(interior.floors.filter((f) => !f.partial).map((f) => `${f.cell[0]},${f.cell[1]}`));
    for (const f of interior.floors) {
      if (f.partial) continue;
      place(kitId.floor(f.kind), f.cell[0], f.cell[1], 0, 0, "deck");
      stats.floors++;
    }
    const slab = rasterOutline(deck.outline, [0, G.deck.floorTopTexels], () => "trim").filter((b) => !full.has(`${Math.floor(b[0] / 16)},${Math.floor(b[1] / 16)}`));
    generated.push({ id: `gen.${doc.id}.floor-slab`, kind: "floor-slab", boxes: slab, view: "deck" });
    const edgePlace = (piece: string, a: Pt, b: Pt, thickness: number, centred: boolean) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const left: Pt = [-d[1], d[0]];
      const off = centred ? (-thickness * TEXEL) / 2 : 0;
      place(piece, a[0] + left[0] * off, a[1] + left[1] * off, ft, (Math.atan2(d[1], d[0]) * 180) / Math.PI, "deck");
    };
    for (const w of interior.exteriorWalls) {
      edgePlace(kitId.edge(w.variant, true), w.a, w.b, 4, false);
      stats.walls++;
    }
    const slopeBoxes: DressBox[] = [];
    for (const s of interior.exteriorSlopes) {
      const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const left: Pt = [-(s.b[1] - s.a[1]) / L, (s.b[0] - s.a[0]) / L];
      const t = G.deck.exteriorWallTexels * TEXEL;
      const band: Pt[] = [s.a, s.b, [s.b[0] + left[0] * t, s.b[1] + left[1] * t], [s.a[0] + left[0] * t, s.a[1] + left[1] * t]];
      const ft3 = G.deck.floorTopTexels;
      slopeBoxes.push(...rasterOutline({ outer: ccw(band), holes: [] }, [ft3, ft3 + 3, ft3 + 14, ft3 + cutT - 2, ft3 + cutT], (_cx, _cy, bi) => (["dark", "secondary", "primary", "dark"] as ShipKitSlot[])[bi]));
    }
    if (slopeBoxes.length) generated.push({ id: `gen.${doc.id}.slope-walls`, kind: "slope-wall", boxes: slopeBoxes, view: "deck" });
    for (const w of interior.partitions) {
      const variant = w.type === "wall.glazed" || w.type === "window" ? "glazed" : w.type === "wall.half" ? "half" : w.variant;
      edgePlace(kitId.edge(variant, true), w.a, w.b, variant === "reinforced" ? 6 : 4, true);
      stats.partitions++;
    }
    for (const dr of interior.doors) {
      const kind = dr.type.split(".")[1];
      edgePlace(kitId.door(kind, true), dr.a, dr.b, 6, !dr.exterior);
      stats.doors++;
      const edgeSpec = options.catalog.get(doc.mounts.find((m) => m.id === dr.id)?.component ?? "");
      if (dr.exterior && !edgeSpec?.visual) {
        // Exterior airlock hatch on the hull face, outward of the door span.
        const L = Math.hypot(dr.b[0] - dr.a[0], dr.b[1] - dr.a[1]);
        const d: Pt = [(dr.b[0] - dr.a[0]) / L, (dr.b[1] - dr.a[1]) / L];
        const rot = (Math.atan2(d[1], d[0]) * 180) / Math.PI + 180;
        place(kitId.exterior("airlock"), dr.b[0], dr.b[1], 8 * TEXEL, rot, "both");
      }
    }
    for (const p of interior.posts) {
      place(kitId.post(true), p[0] - 3 * TEXEL, p[1] - 3 * TEXEL, ft, 0, "deck");
      stats.posts++;
    }
    const interiorRects = mounts.filter((m) => m.mount.attach === "interior").map((m) => m.rect);
    for (const s of interior.sockets) {
      const r = [s.at[0], s.at[1], s.at[0] + s.size[0], s.at[1] + s.size[1]];
      if (interiorRects.some((q) => r[0] < q[2] && q[0] < r[2] && r[1] < q[3] && q[1] < r[3])) continue;
      objects.push({ ...s, view: "deck" });
      stats.sockets++;
    }
    for (const l of interior.lights) lights.push({ at: [l.at[0], l.at[1], 2.3], colour: l.colour, intensity: Math.min(1.5, 0.25 + l.area * 0.04), view: "deck" });
    for (const l of interior.labels) labels.push({ text: l.text, at: [l.at[0], l.at[1], 2.6], view: "deck" });
  }

  const allB = geoms.map((g) => g.bounds);
  const bounds: [number, number, number, number] = allB.length
    ? [Math.min(...allB.map((b) => b[0])), Math.min(...allB.map((b) => b[1])), Math.max(...allB.map((b) => b[2])), Math.max(...allB.map((b) => b[3]))]
    : [0, 0, 0, 0];
  return { id: doc.id, theme: doc.theme, markings: doc.markings, kit, generated, decals, components, objects, lights, labels, bounds, stats };
}

/**
 * Offset a CCW loop outward (positive) or inward (negative) by `d` metres using mitred
 * corners. Used only for thin presentation bands.
 */
export function offsetLoop(loop: readonly Pt[], d: number): Pt[] {
  const n = loop.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n];
    const b = loop[i];
    const c = loop[(i + 1) % n];
    const n1 = unitNormal(a, b);
    const n2 = unitNormal(b, c);
    const bis: Pt = [n1[0] + n2[0], n1[1] + n2[1]];
    const bl = Math.hypot(bis[0], bis[1]) || 1;
    const cosHalf = Math.max(0.35, (n1[0] * bis[0] + n1[1] * bis[1]) / bl);
    const k = d / cosHalf;
    out.push([b[0] + (bis[0] / bl) * k, b[1] + (bis[1] / bl) * k]);
  }
  return out;
}

function unitNormal(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  return [dy / L, -dx / L];
}

/** Stable content hash of a dressing (for determinism tests and caching). */
export function dressFingerprint(ship: DressedShip): string {
  let h = 2166136261;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  };
  for (const k of ship.kit) feed(`${k.piece}|${k.x.toFixed(4)}|${k.y.toFixed(4)}|${k.z.toFixed(4)}|${k.rotDeg.toFixed(2)}|${k.view};`);
  for (const g of ship.generated) {
    feed(`${g.id}|${g.view}|${g.boxes.length};`);
    for (const b of g.boxes) feed(b.join(","));
  }
  return h.toString(16).padStart(8, "0");
}

export const SHIP_DRESSER_VERSION = "ship-dresser-1";
