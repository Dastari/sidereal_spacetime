/**
 * Procedural stand-ins for ship components whose GLBs are not published yet. Pure: returns
 * boxes and cylinders in the component's SOCKET frame (+X starboard/along the face, +Y forward,
 * +Z up; face/edge mounts extend outward along -Y; top/interior sit on z = 0), sized from the
 * catalog spec (`cells`, `heightTexels`). Slots are theme slot names.
 */
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import type { PrefabComponentSpec } from "@sidereal/content/ship-prefab";
import { KIT_CHAMFER_M, emitBox, newBuilder, pushPoly, type GeometryBuilder } from "./box-mesher";
import { transformDirection, transformPoint, type Mat4 } from "./frames";

export interface StandinBox {
  kind: "box";
  /** Centre and full size (metres) in the socket frame. */
  centre: [number, number, number];
  size: [number, number, number];
  slot: ShipKitSlot;
}

export interface StandinCylinder {
  kind: "cylinder";
  /** Centre, axis ("x" | "y" | "z"), length and diameters (metres). */
  centre: [number, number, number];
  axis: "x" | "y" | "z";
  length: number;
  diameterTop: number;
  diameterBottom: number;
  slot: ShipKitSlot;
  tessellation?: number;
}

export type StandinPart = StandinBox | StandinCylinder;

export interface Standin {
  parts: StandinPart[];
  /** Engine nozzle exit (socket frame) and radius, when the stand-in has one. */
  nozzle?: { at: [number, number, number]; radius: number };
}

const box = (centre: [number, number, number], size: [number, number, number], slot: ShipKitSlot): StandinBox => ({ kind: "box", centre, size, slot });
const cyl = (centre: [number, number, number], axis: "x" | "y" | "z", length: number, d0: number, d1: number, slot: ShipKitSlot, tessellation = 16): StandinCylinder => ({
  kind: "cylinder",
  centre,
  axis,
  length,
  diameterTop: d0,
  diameterBottom: d1,
  slot,
  tessellation,
});

export type StandinSocket = "top" | "face" | "edge" | "interior";

/** Build a stand-in for a spec on a socket class. */
export function componentStandin(spec: PrefabComponentSpec | undefined, socket: StandinSocket): Standin {
  const w = Math.max(1, spec?.cells[0] ?? 1);
  const d = Math.max(1, spec?.cells[1] ?? 1);
  const h = Math.max(0.25, (spec?.heightTexels ?? 16) / 16);
  const cat = spec?.category ?? "";
  if (socket === "face" || socket === "edge") {
    if (cat === "propulsion") return engine(w * 0.92, h * 0.92, d, !!spec?.thrustN);
    if (cat === "weapon") return sideGun(w, h, d);
    if (socket === "edge" || cat === "cargo-door") return hatch(w, h);
    return facePod(w, h, d);
  }
  if (socket === "top") {
    if (cat === "weapon" || cat === "defense") return turret(w, d, h);
    if (cat === "sensor") return dish(w, h);
    if (cat === "thermal") return radiator(w, d, h);
    return roofBox(w, d, h);
  }
  if (cat.startsWith("console")) return console_(w, d, h);
  return interiorModule(w, d, h, cat);
}

/** Rear/face engine: mounting collar on the face, body, flared nozzle; exits along -Y. */
function engine(w: number, h: number, d: number, main: boolean): Standin {
  const r = Math.min(w, h) / 2;
  const len = main ? Math.max(d * 1.6, 1.2) : Math.max(d * 0.5, 0.35);
  const collar = Math.min(0.25, len * 0.15);
  const parts: StandinPart[] = [
    box([0, -collar / 2, 0], [w, collar, h], "secondary"),
    box([0, -collar - (len * 0.55) / 2, 0], [w * 0.86, len * 0.55, h * 0.86], "primary"),
    box([0, -collar - len * 0.22, h * 0.43 + 0.04], [w * 0.6, len * 0.3, 0.08], "accent"),
    box([0, -collar - len * 0.4, 0], [w * 0.92, 0.12, h * 0.92], "trim"),
    cyl([0, -collar - len * 0.55 - (len * 0.45) / 2, 0], "y", len * 0.45, r * 1.5, r * 1.9, "metal", 20),
    cyl([0, -collar - len + 0.03, 0], "y", 0.06, r * 1.45, r * 1.45, "emit_a", 20),
  ];
  return { parts, nozzle: { at: [0, -collar - len, 0], radius: r * 0.8 } };
}

function sideGun(w: number, h: number, d: number): Standin {
  const len = Math.max(1, d * 1.8);
  return {
    parts: [
      box([0, -0.2, 0], [w * 0.9, 0.4, h * 0.8], "secondary"),
      box([0, -0.55, 0], [w * 0.7, 0.4, h * 0.6], "primary"),
      cyl([0, -0.75 - len / 2, 0], "y", len, w * 0.22, w * 0.22, "metal", 12),
      box([0, -0.4, h * 0.3 + 0.04], [w * 0.5, 0.25, 0.08], "emit_b"),
    ],
  };
}

function hatch(w: number, h: number): Standin {
  return {
    parts: [
      box([0, -0.06, 0], [w, 0.12, h], "trim"),
      box([0, -0.1, 0], [w * 0.8, 0.08, h * 0.85], "secondary"),
      box([0, -0.15, -h * 0.35], [w * 0.8, 0.04, 0.12], "accent"),
      box([w * 0.46, -0.14, h * 0.2], [0.06, 0.05, 0.3], "emit_a"),
    ],
  };
}

function facePod(w: number, h: number, d: number): Standin {
  return {
    parts: [
      box([0, -d * 0.25, 0], [w * 0.9, d * 0.5, h * 0.8], "secondary"),
      box([0, -d * 0.5, 0], [w * 0.6, 0.1, h * 0.5], "emit_a"),
    ],
  };
}

function turret(w: number, d: number, h: number): Standin {
  const s = Math.min(w, d);
  const barrel = Math.max(0.8, s * 1.1);
  return {
    parts: [
      cyl([0, 0, h * 0.12], "z", h * 0.24, s * 0.9, s * 0.95, "secondary", 16),
      box([0, 0, h * 0.24 + h * 0.2], [s * 0.7, s * 0.8, h * 0.4], "primary"),
      box([0, s * 0.15, h * 0.24 + h * 0.4 + 0.03], [s * 0.4, s * 0.3, 0.06], "accent"),
      cyl([-s * 0.13, s * 0.4 + barrel / 2, h * 0.44], "y", barrel, s * 0.12, s * 0.12, "metal", 10),
      cyl([s * 0.13, s * 0.4 + barrel / 2, h * 0.44], "y", barrel, s * 0.12, s * 0.12, "metal", 10),
      box([0, -s * 0.3, h * 0.3], [s * 0.5, 0.05, 0.08], "emit_b"),
    ],
  };
}

function dish(w: number, h: number): Standin {
  return {
    parts: [
      cyl([0, 0, h * 0.25], "z", h * 0.5, w * 0.18, w * 0.25, "metal", 10),
      cyl([0, 0, h * 0.62], "z", h * 0.12, w * 0.95, w * 0.5, "primary", 20),
      cyl([0, 0, h * 0.8], "z", h * 0.3, 0.05, 0.08, "trim", 8),
      box([0, 0, h * 0.97], [0.1, 0.1, 0.1], "emit_a"),
    ],
  };
}

function radiator(w: number, d: number, h: number): Standin {
  const parts: StandinPart[] = [box([0, 0, 0.08], [w * 0.95, d * 0.95, 0.16], "secondary")];
  const fins = Math.max(3, Math.round(w * 4));
  for (let i = 0; i < fins; i++) {
    const x = -w * 0.42 + (i * (w * 0.84)) / (fins - 1);
    parts.push(box([x, 0, 0.16 + h * 0.4], [0.06, d * 0.85, h * 0.8], i % 2 ? "metal" : "trim"));
  }
  parts.push(box([0, d * 0.46, 0.2], [w * 0.8, 0.05, 0.06], "emit_b"));
  return { parts };
}

function roofBox(w: number, d: number, h: number): Standin {
  return {
    parts: [
      box([0, 0, h * 0.4], [w * 0.9, d * 0.9, h * 0.8], "secondary"),
      box([0, 0, h * 0.85], [w * 0.6, d * 0.6, h * 0.1], "emit_a"),
    ],
  };
}

function console_(w: number, d: number, h: number): Standin {
  const top = Math.min(1.0, h);
  return {
    parts: [
      box([0, -d * 0.1, top * 0.4], [w * 0.85, d * 0.5, top * 0.8], "secondary"),
      box([0, d * 0.05, top * 0.82], [w * 0.9, d * 0.55, 0.06], "trim"),
      box([0, -d * 0.25, top * 0.82 + 0.3], [w * 0.8, 0.06, 0.5], "dark"),
      box([0, -d * 0.21, top * 0.82 + 0.3], [w * 0.7, 0.02, 0.4], "emit_a"),
    ],
  };
}

// ------------------------------------------------------------------ geometry

/** Cylinder along an axis with outward-facing sides (flat facets) and caps. */
export function emitCylinder(out: GeometryBuilder, c: StandinCylinder) {
  const n = c.tessellation ?? 16;
  const ax = c.axis === "x" ? 0 : c.axis === "y" ? 1 : 2;
  const u = (ax + 1) % 3;
  const v = (ax + 2) % 3;
  const r0 = c.diameterBottom / 2;
  const r1 = c.diameterTop / 2;
  const at = (t: number, ang: number, r: number): [number, number, number] => {
    const p: [number, number, number] = [c.centre[0], c.centre[1], c.centre[2]];
    p[ax] += t;
    p[u] += Math.cos(ang) * r;
    p[v] += Math.sin(ang) * r;
    return p;
  };
  const h = c.length / 2;
  const slope = (r0 - r1) / Math.max(c.length, 1e-6);
  const L = Math.hypot(1, slope);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const nrm: [number, number, number] = [0, 0, 0];
    nrm[u] = Math.cos(am) / L;
    nrm[v] = Math.sin(am) / L;
    nrm[ax] = slope / L;
    const quad = [at(-h, a0, r0), at(-h, a1, r0), at(h, a1, r1), at(h, a0, r1)];
    pushPoly(out, r1 > 0 ? quad : quad.slice(0, 3), nrm);
  }
  for (const [t, r, s] of [[-h, r0, -1], [h, r1, 1]] as const) {
    if (r <= 0) continue;
    const ring: [number, number, number][] = [];
    for (let i = 0; i < n; i++) ring.push(at(t, (i / n) * Math.PI * 2, r));
    const nrm: [number, number, number] = [0, 0, 0];
    nrm[ax] = s;
    pushPoly(out, ring, nrm);
  }
}

/** Append a stand-in, transformed by `m` (socket frame -> target frame), into per-slot builders. */
export function appendStandin(standin: Standin, m: Mat4, builders: Map<ShipKitSlot, GeometryBuilder>) {
  for (const part of standin.parts) {
    const local = newBuilder();
    if (part.kind === "box") {
      const lo = part.centre.map((c, k) => c - part.size[k] / 2);
      const hi = part.centre.map((c, k) => c + part.size[k] / 2);
      emitBox(local, lo, hi, Math.min(KIT_CHAMFER_M * 2, 0.3 * Math.min(...part.size)), () => false);
    } else emitCylinder(local, part);
    let out = builders.get(part.slot);
    if (!out) builders.set(part.slot, (out = newBuilder()));
    appendTransformed(out, local, m);
  }
}

/**
 * Presentation-only engine plume in the socket frame: a cone from the nozzle exit along -Y,
 * vertex colours fading from `core` (white-hot) to transparent. Colours are RGBA per vertex.
 */
export function emitPlume(out: GeometryBuilder, colours: number[], at: readonly [number, number, number], radius: number, length: number, rings = 5, sides = 14) {
  const base = out.positions.length / 3;
  for (let k = 0; k <= rings; k++) {
    const t = k / rings;
    const r = radius * (1 - 0.85 * t) * (k === 0 ? 0.95 : 1);
    const fade = Math.pow(1 - t, 1.6);
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      out.positions.push(at[0] + Math.cos(a) * r, at[1] - t * length, at[2] + Math.sin(a) * r);
      out.normals.push(Math.cos(a), 0, Math.sin(a));
      colours.push(fade, fade, fade, fade);
    }
  }
  const row = sides + 1;
  for (let k = 0; k < rings; k++)
    for (let i = 0; i < sides; i++) {
      const a = base + k * row + i;
      out.indices.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
    }
  out.boxes += 1;
}

/** Append `src` transformed by a proper rotation + translation (normals rotate, winding kept). */
export function appendTransformed(out: GeometryBuilder, src: GeometryBuilder, m: Mat4) {
  const base = out.positions.length / 3;
  for (let i = 0; i < src.positions.length; i += 3) {
    const p = transformPoint(m, [src.positions[i], src.positions[i + 1], src.positions[i + 2]]);
    const q = transformDirection(m, [src.normals[i], src.normals[i + 1], src.normals[i + 2]]);
    out.positions.push(p[0], p[1], p[2]);
    out.normals.push(q[0], q[1], q[2]);
  }
  for (const idx of src.indices) out.indices.push(base + idx);
  out.boxes += 1;
}

function interiorModule(w: number, d: number, h: number, cat: string): Standin {
  const accent: ShipKitSlot = cat === "power" ? "emit_b" : "emit_a";
  return {
    parts: [
      box([0, 0, h * 0.45], [w * 0.88, d * 0.88, h * 0.9], "primary"),
      box([0, 0, h * 0.93], [w * 0.92, d * 0.92, h * 0.06], "trim"),
      box([0, d * 0.44 + 0.02, h * 0.5], [w * 0.5, 0.04, h * 0.3], accent),
      box([0, 0, 0.06], [w * 0.92, d * 0.92, 0.12], "dark"),
    ],
  };
}
