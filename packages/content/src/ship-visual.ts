/** Opt-in presentation artifacts. These never define collision, pressure or fitting authority. */
import { SHIP_KIT_SLOTS, type ShipKitSlot } from "./ship-kit";

export const SHIP_VISUAL_SCHEMA = "sidereal.ship-visual.v1";
export const SHIP_VISUAL_FRAME = "ship-local metres: +X fore, +Y port, +Z up";
export type ShipVisualProfileId = "federation" | "riftjack" | "aurelian";
export type ShipVisualRole =
  | "core"
  | "frame"
  | "plate"
  | "service"
  | "floor"
  | "roof"
  | "doorframe"
  | "void";
export type ShipVisualView = "deck" | "flight";
export interface ShipVisualProfile {
  id: ShipVisualProfileId;
  revision: string;
  course: number;
  rib: number;
  relief: number;
  offsetCourses: boolean;
  nestedRibs: boolean;
}
export const SHIP_VISUAL_PROFILES: Record<
  ShipVisualProfileId,
  ShipVisualProfile
> = {
  federation: {
    id: "federation",
    revision: "r001",
    course: 32,
    rib: 32,
    relief: 2,
    offsetCourses: false,
    nestedRibs: false,
  },
  riftjack: {
    id: "riftjack",
    revision: "r001",
    course: 24,
    rib: 24,
    relief: 3,
    offsetCourses: true,
    nestedRibs: false,
  },
  aurelian: {
    id: "aurelian",
    revision: "r001",
    course: 40,
    rib: 20,
    relief: 2,
    offsetCourses: true,
    nestedRibs: true,
  },
};
export interface ShipVisualLayer {
  id: string;
  role: ShipVisualRole;
  slot: ShipKitSlot;
  /** Integer global ship lattice bounds, exclusive maximum. */
  bounds: [number, number, number, number, number, number];
  /** Boxes use bounds directly; polygon prisms optionally retain only a boundary band. */
  polygon?: [number, number][];
  holes?: [number, number][][];
  band?: number;
  /** Optional supporting core family; decorative cells are pruned after synthetic removal. */
  support?: string;
  /** Presentation shading on sampled sloped shell faces; silhouette/cell occupancy stays unchanged. */
  normalHint?: [number, number, number];
  /** Optional candidate finish ownership; independent of support/layer roles and authority. */
  surfaceRole?: "floor" | "wall" | "roof" | "hull";
}
export interface ShipVisualAsset {
  /** Authored part frame and measured glTF bounds; retained independently of gameplay envelopes. */
  frame?: "face" | "top" | "interior" | "edge";
  bounds?: [number, number, number, number, number, number];

  url: string;
  sha256: string;
  bytes: number;
  kind: "object" | "component" | "kit" | "kit-manifest" | "normal";
  id: string;
  node?: string;
}
export interface ShipVisualManifest {
  schema: typeof SHIP_VISUAL_SCHEMA;
  revision: string;
  status: "proposal";
  frame: typeof SHIP_VISUAL_FRAME;
  lattice: 16;
  compilerSha256: string;
  profilesSha256: string;
  slots: ShipKitSlot[];
  /** Hash of the canonical prefab document, not its authority construction output. */
  prefabs: Record<string, string>;
  assets: ShipVisualAsset[];
  /** Decoration stays inside these additional outer/vertical metres; never changes gameplay bounds. */
  decorativeEnvelope: { outward: number; upward: number; inward: number };
}

const sha = /^[a-f0-9]{64}$/;
export function readShipVisualManifest(value: unknown): ShipVisualManifest {
  if (!value || typeof value !== "object")
    throw Error("Visual manifest must be an object");
  const m = value as ShipVisualManifest;
  if (
    m.schema !== SHIP_VISUAL_SCHEMA ||
    m.status !== "proposal" ||
    m.frame !== SHIP_VISUAL_FRAME ||
    m.lattice !== 16 ||
    !/^r\d{3}$/.test(m.revision)
  )
    throw Error("Incompatible visual revision/frame/lattice");
  if (!sha.test(m.compilerSha256) || !sha.test(m.profilesSha256))
    throw Error("Missing visual source hashes");
  if (!Array.isArray(m.slots) || m.slots.join(",") !== SHIP_KIT_SLOTS.join(","))
    throw Error("Incompatible visual material slots");
  if (
    !m.prefabs ||
    !Object.keys(m.prefabs).length ||
    Object.values(m.prefabs).some((h) => !sha.test(h))
  )
    throw Error("Invalid visual prefab pins");
  if (!Array.isArray(m.assets) || !m.assets.length)
    throw Error("Missing required visual assets");
  const ids = new Set<string>();
  for (const a of m.assets) {
    if (
      !a ||
      !["object", "component", "kit", "kit-manifest", "normal"].includes(
        a.kind,
      ) ||
      !a.id ||
      !sha.test(a.sha256) ||
      !Number.isSafeInteger(a.bytes) ||
      a.bytes < 1 ||
      !/^\/assets\/[a-z0-9./_-]+$/i.test(a.url) ||
      a.url.includes("..")
    )
      throw Error("Invalid visual asset");
    if (
      !["normal", "kit-manifest"].includes(a.kind) &&
      (!["face", "top", "interior", "edge"].includes(a.frame ?? "") ||
        !a.bounds ||
        a.bounds.length !== 6 ||
        !a.bounds.every(Number.isFinite) ||
        a.bounds.some((n, i) => i < 3 && n >= a.bounds![i + 3]))
    )
      throw Error("Invalid visual asset frame/bounds");
    const key = `${a.kind}:${a.id}`;
    if (ids.has(key)) throw Error("Duplicate visual asset");
    ids.add(key);
  }
  const e = m.decorativeEnvelope;
  if (
    !e ||
    ![e.outward, e.upward, e.inward].every(Number.isFinite) ||
    e.outward < 0 ||
    e.outward > 0.1875 ||
    e.upward < 0 ||
    e.upward > 0.1875 ||
    e.inward !== 0
  )
    throw Error("Invalid visual decorative bounds");
  return m;
}

export function validateShipVisualLayers(
  layers: readonly ShipVisualLayer[],
): void {
  if (layers.length > 100000) throw Error("Visual layer count exceeds limit");
  for (const l of layers) {
    if (
      !l.id ||
      ![
        "core",
        "frame",
        "plate",
        "service",
        "floor",
        "roof",
        "doorframe",
        "void",
      ].includes(l.role) ||
      !SHIP_KIT_SLOTS.includes(l.slot) ||
      l.bounds.length !== 6 ||
      !l.bounds.every((x) => Number.isSafeInteger(x) && Math.abs(x) <= 8192) ||
      l.bounds.some((x, i) => i < 3 && x >= l.bounds[i + 3])
    )
      throw Error("Invalid visual role layer");
    if (
      l.polygon &&
      (l.polygon.length < 3 ||
        !l.polygon.every((p) => p.length === 2 && p.every(Number.isFinite)))
    )
      throw Error("Invalid visual polygon");
    if (
      l.band !== undefined &&
      (!Number.isInteger(l.band) || l.band < 1 || l.band > 64)
    )
      throw Error("Invalid visual boundary band");
    if (
      l.normalHint &&
      (l.normalHint.length !== 3 ||
        !l.normalHint.every(Number.isFinite) ||
        Math.abs(Math.hypot(...l.normalHint) - 1) > 0.001)
    )
      throw Error("Invalid sampled presentation normal");
    if (
      l.surfaceRole !== undefined &&
      !["floor", "wall", "roof", "hull"].includes(l.surfaceRole)
    )
      throw Error("Invalid sampled surface ownership");
  }
}
