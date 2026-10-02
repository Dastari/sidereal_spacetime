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
  /** Analytic intact plate chart. Sampling records its original exposed faces for cut-safe shading. */
  normalChart?: string;
  /** Candidate original polygon side plane, independently qualified from an upper chart.
   * Eligible XY bits are authored against the original segment; sampling intersects intact exposure. */
  normalSide?: { id: string; normal: [number, number, number]; faces: number };
  /** Candidate manufactured boundary, clipped inside each owned lattice cube.
   * Exactly two signed active axes; no arbitrary slope or multi-plane bevel. */
  facet?: { id: string; a: [number, number, number]; d: number };
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
  kind: "object" | "component" | "kit" | "kit-manifest" | "normal" | "albedo";
  id: string;
  node?: string;
}
/** Finite private proposal; ordinary/r001 visual envelopes keep their old cap. */
export const SHIP_VISUAL_BOW_CASE_ENVELOPE_R026 = {
  kind: "wren-four-broad-bow-cases-r026",
  prefab: "fed.s.wren",
  prefabSha256:
    "ecdb038c1b9333780c719aa3e19a8c677852c99cf4dab86421a2934aa60937e5",
  bodies: [
    [144, 8, 40, 158, 28, 46],
    [144, 80, 40, 158, 104, 46],
    [180, 34, 24, 190, 52, 30],
    [180, 56, 24, 190, 78, 30],
  ],
} as const;
/** Source-derived additive Crest geometry: bounds reject cells but never
 * authorize an AABB fill or enlarge the ordinary decoration envelope. */
export const SHIP_VISUAL_CANOPY_SOURCE_R026 = {
  kind: "crest-original-positive-canopy-source-r026",
  prefab: "fed.m.crest",
  prefabSha256:
    "6b0aa0b105174f7f2af341ac46c16ef6d5b8b7bd9a4de4e36f8abf290bdcebf9",
  tableSha256:
    "493f739ed76364a4e3ea9240215444bc5d45ca4d59a3de95ce1b5c133125604a",
  generatorSha256:
    "169628dc548801f14637fc37e672a31fcd4df6ea4e04fa6e56473390435f7c7d",
  tableCanonicalSha256:
    "4e1c028e02c8154ced67331238fc1899448315420ec08cc3bc4eed3c9438017f",
  originalSourceSha256:
    "b067ca505c3972b59f144a49760ed2675ec0756c6ad3d56db366a7c5ace0c725",
  grammarSha256:
    "33f5226a142fa4687ee552ef14ed9e977ad13ddd3e1eaaf78a58d6bdccf89ea0",
  opticalGuardSha256:
    "a06efd4ed9098e658537833276bbf693a02a6c680504aa1d175652a4e2a31a46",
  wholeCellBounds: [319, -18, 0, 410, 178, 43],
  sourceMemberCells: 83696,
  addedCells: 83056,
  omittedInwardEmptyCells: 42,
  placements: [
    ["canopy.slope1.deck", 20, 1, 0, 270],
    ["canopy.slope1.deck", 21, 2, 0, 270],
    ["canopy.slope1.deck", 22, 3, 0, 270],
    ["canopy.slope1.deck", 23, 4, 0, 270],
    ["canopy.slope1.deck", 23, 6, 0, 0],
    ["canopy.slope1.deck", 22, 7, 0, 0],
    ["canopy.slope1.deck", 21, 8, 0, 0],
    ["canopy.slope1.deck", 20, 9, 0, 0],
    ["canopy.corner45.deck", 24, 4, 0, 315],
    ["canopy.corner45.deck", 24, 6, 0, 0],
    ["canopy.straight.w1.deck", 24, 5, 0, 270],
    ["canopy.straight.w1.deck", 24, 6, 0, 270],
  ],
  navCompanions: [
    [24, 5, 0, 270],
    [24, 6, 0, 270],
  ],
  originalAssets: {
    "canopy.slope1.deck":
      "dff525b82261e1be04452d7c0703b841fe26d4a039e37b1bbed4cec8c3438c1a",
    "canopy.corner45.deck":
      "70e93b54c5e2da9884a47ba528bf910f06621cd9888bddffe09c57a466228502",
    "canopy.straight.w1.deck":
      "53c1a1f5e469e5703228547bcf00d9bea7093b2df5ff2113c686c2cfa0213c6b",
    "canopy.nav.deck":
      "71b613e304034ebf1b9a0091aa0dbf58b9e7b698c85c4d94287d0a9d4ea3bf7c",
  },
} as const;
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
  /** Exact additive original-source membership, independently bound to its helper. */
  canopySourceR026?: typeof SHIP_VISUAL_CANOPY_SOURCE_R026 & {
    sourceSha256: string;
  };
  /** Actual helper source pin and exact finite bodies; never a default envelope. */
  bowCaseEnvelopeR026?: {
    kind: typeof SHIP_VISUAL_BOW_CASE_ENVELOPE_R026.kind;
    prefab: typeof SHIP_VISUAL_BOW_CASE_ENVELOPE_R026.prefab;
    prefabSha256: string;
    sourceSha256: string;
    bodies: ShipVisualLayer["bounds"][];
  };
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
      ![
        "object",
        "component",
        "kit",
        "kit-manifest",
        "normal",
        "albedo",
      ].includes(a.kind) ||
      !a.id ||
      !sha.test(a.sha256) ||
      !Number.isSafeInteger(a.bytes) ||
      a.bytes < 1 ||
      !/^\/assets\/[a-z0-9./_-]+$/i.test(a.url) ||
      a.url.includes("..")
    )
      throw Error("Invalid visual asset");
    if (
      !["normal", "albedo", "kit-manifest"].includes(a.kind) &&
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
  const canopy = m.canopySourceR026;
  if (canopy !== undefined) {
    const expected = SHIP_VISUAL_CANOPY_SOURCE_R026;
    if (
      !canopy ||
      m.revision !== "r002" ||
      !sha.test(canopy.sourceSha256) ||
      m.prefabs[expected.prefab] !== expected.prefabSha256 ||
      Object.entries(expected).some(
        ([key, value]) =>
          JSON.stringify(
            (canopy as unknown as Record<string, unknown>)[key],
          ) !== JSON.stringify(value),
      ) ||
      Object.entries(expected.originalAssets).some(
        ([id, pin]) =>
          id !== "canopy.nav.deck" &&
          !m.assets.some(
            (a) => a.kind === "kit" && a.id === id && a.sha256 === pin,
          ),
      )
    )
      throw Error("Invalid finite R26 original canopy declaration");
  }
  const e = m.decorativeEnvelope;
  const bow = m.bowCaseEnvelopeR026;
  const expectedBow = SHIP_VISUAL_BOW_CASE_ENVELOPE_R026;
  if (
    bow !== undefined &&
    (!bow ||
      m.revision !== "r002" ||
      bow.kind !== expectedBow.kind ||
      bow.prefab !== expectedBow.prefab ||
      bow.prefabSha256 !== expectedBow.prefabSha256 ||
      m.prefabs[expectedBow.prefab] !== expectedBow.prefabSha256 ||
      !sha.test(bow.sourceSha256) ||
      JSON.stringify(bow.bodies) !== JSON.stringify(expectedBow.bodies) ||
      e?.outward !== 0.1875 ||
      e?.upward !== 0.375 ||
      e?.inward !== 0)
  )
    throw Error("Invalid finite R26 bow envelope declaration");
  if (
    !e ||
    ![e.outward, e.upward, e.inward].every(Number.isFinite) ||
    e.outward < 0 ||
    e.outward > 0.1875 ||
    e.upward < 0 ||
    e.upward > (bow === undefined ? 0.1875 : 0.375) ||
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
      l.normalChart !== undefined &&
      (typeof l.normalChart !== "string" ||
        !l.normalChart ||
        l.normalChart.length > 160 ||
        !l.normalHint ||
        l.normalHint[2] < 1 / 64)
    )
      throw Error("Invalid sampled normal chart");
    if (
      l.normalSide !== undefined &&
      (!l.normalSide ||
        typeof l.normalSide.id !== "string" ||
        !l.normalSide.id.trim() ||
        l.normalSide.id.length > 160 ||
        !Array.isArray(l.normalSide.normal) ||
        l.normalSide.normal.length !== 3 ||
        !Array.from(l.normalSide.normal).every(Number.isFinite) ||
        Math.abs(Math.hypot(...l.normalSide.normal) - 1) > 0.001 ||
        l.normalSide.normal[2] !== 0 ||
        !Number.isInteger(l.normalSide.faces) ||
        l.normalSide.faces < 1 ||
        l.normalSide.faces > 15 ||
        (l.normalSide.faces & ~15) !== 0)
    )
      throw Error("Invalid sampled side ownership");
    if (
      l.facet !== undefined &&
      (!l.facet ||
        typeof l.facet.id !== "string" ||
        !l.facet.id.trim() ||
        l.facet.id.length > 160 ||
        !Array.isArray(l.facet.a) ||
        l.facet.a.length !== 3 ||
        !l.facet.a.every((v) => [-1, 0, 1].includes(v)) ||
        l.facet.a.filter((v) => v !== 0).length !== 2 ||
        !Number.isSafeInteger(l.facet.d) ||
        Math.abs(l.facet.d) > 1000000 ||
        !["core", "frame", "plate", "roof"].includes(l.role) ||
        l.surfaceRole === "floor" ||
        ["glass", "emit_a", "emit_b"].includes(l.slot))
    )
      throw Error("Invalid sampled manufactured facet");
    if (
      l.surfaceRole !== undefined &&
      !["floor", "wall", "roof", "hull"].includes(l.surfaceRole)
    )
      throw Error("Invalid sampled surface ownership");
  }
}
