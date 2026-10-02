/** Private additive original-source Crest casing. The old obstructing backing
 * remains intact: this is not a clear/pressure-window or collision certificate. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  canonicalShipPrefabJson,
  type ShipPrefabDocumentV1,
  type PrefabComponentCatalog,
} from "@sidereal/content/ship-prefab";
import type {
  ShipVisualLayer,
  ShipVisualProfileId,
  ShipVisualView,
} from "@sidereal/content/ship-visual";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import {
  REFERENCE_EXTERIOR_CATALOG_SHA256_R026,
  REFERENCE_CANOPY_SOURCE_R026 as table,
} from "@sidereal/content/ship-visual-r002";
import { dressShip } from "./ship-dresser";
import {
  sampleShipVisualLayers,
  visualCellKey,
  VISUAL_NEIGHBOURS,
} from "./ship-visual-sampler";

export const ORIGINAL_CANOPY_CONTEXT_R026 = {
  prefab: "fed.m.crest",
  canonicalDocumentSha256:
    "6b0aa0b105174f7f2af341ac46c16ef6d5b8b7bd9a4de4e36f8abf290bdcebf9",
  tableCanonicalSha256:
    "4e1c028e02c8154ced67331238fc1899448315420ec08cc3bc4eed3c9438017f",
  guardSha256:
    "a06efd4ed9098e658537833276bbf693a02a6c680504aa1d175652a4e2a31a46",
  wholeCellBounds: [319, -18, 0, 410, 178, 43],
  sourceMemberCells: 83696,
  addedCells: 83056,
  omittedInwardEmptyCells: 42,
} as const;

export const ORIGINAL_CANOPY_OCCURRENCES_R026 = [
  { piece: "canopy.slope1.deck", frame: [20, 1, 0, 270] },
  { piece: "canopy.slope1.deck", frame: [21, 2, 0, 270] },
  { piece: "canopy.slope1.deck", frame: [22, 3, 0, 270] },
  { piece: "canopy.slope1.deck", frame: [23, 4, 0, 270] },
  { piece: "canopy.slope1.deck", frame: [23, 6, 0, 0] },
  { piece: "canopy.slope1.deck", frame: [22, 7, 0, 0] },
  { piece: "canopy.slope1.deck", frame: [21, 8, 0, 0] },
  { piece: "canopy.slope1.deck", frame: [20, 9, 0, 0] },
  { piece: "canopy.corner45.deck", frame: [24, 4, 0, 315] },
  { piece: "canopy.corner45.deck", frame: [24, 6, 0, 0] },
  { piece: "canopy.straight.w1.deck", frame: [24, 5, 0, 270] },
  { piece: "canopy.straight.w1.deck", frame: [24, 6, 0, 270] },
] as const;
const navFrames = [
  [24, 5, 0, 270],
  [24, 6, 0, 270],
] as const;
const digest = (s: string) => bytesToHex(sha256(new TextEncoder().encode(s)));
const zero = (n: number) => (Math.abs(n) < 1e-12 ? 0 : n);

export interface OriginalCanopyCellR026 {
  x: number;
  y: number;
  z: number;
  role: "core" | "frame" | "plate";
  slot: ShipKitSlot;
  occurrence: number;
  primitive: string;
}

/** Exact positive halfspaces from repository-authored loft rings; bounds only
 * limit iteration. Source precedence is occurrence then original primitive. */
export function originalCanopySourceCellsR026(): Map<
  string,
  OriginalCanopyCellR026
> {
  if (
    digest(JSON.stringify(table)) !==
    ORIGINAL_CANOPY_CONTEXT_R026.tableCanonicalSha256
  )
    throw Error("Finite original canopy primitive table changed");
  const result = new Map<string, OriginalCanopyCellR026>();
  let visits = 0;
  for (const [
    occurrence,
    { piece, frame },
  ] of ORIGINAL_CANOPY_OCCURRENCES_R026.entries()) {
    const [tx, ty, tz, degrees] = frame;
    const a = (degrees * Math.PI) / 180,
      c = zero(Math.cos(a)),
      s = zero(Math.sin(a));
    for (const primitive of table.pieces[piece]) {
      const b = primitive.bounds;
      const corners = [b[0], b[3]].flatMap((x) =>
        [b[1], b[4]].map((y) => [
          tx * 16 + c * x - s * y,
          ty * 16 + s * x + c * y,
        ]),
      );
      const lo = [
        Math.floor(Math.min(...corners.map((p) => p[0]))),
        Math.floor(Math.min(...corners.map((p) => p[1]))),
        Math.floor(tz * 16 + b[2]),
      ];
      const hi = [
        Math.ceil(Math.max(...corners.map((p) => p[0]))),
        Math.ceil(Math.max(...corners.map((p) => p[1]))),
        Math.ceil(tz * 16 + b[5]),
      ];
      for (let z = lo[2]; z < hi[2]; z++)
        for (let y = lo[1]; y < hi[1]; y++)
          for (let x = lo[0]; x < hi[0]; x++) {
            if (++visits > 500000)
              throw Error("Finite canopy source sampling exceeds budget");
            const dx = x + 0.5 - tx * 16,
              dy = y + 0.5 - ty * 16;
            const q = [c * dx + s * dy, -s * dx + c * dy, z + 0.5 - tz * 16];
            if (
              !primitive.planes.every(
                (p) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2] <= p[3] + 1e-9,
              )
            )
              continue;
            if (
              !(["core", "frame", "plate"] as string[]).includes(primitive.role)
            )
              throw Error("Unknown original casing duty");
            result.set(visualCellKey(x, y, z), {
              x,
              y,
              z,
              role: primitive.role as OriginalCanopyCellR026["role"],
              slot: primitive.slot as ShipKitSlot,
              occurrence,
              primitive: primitive.id,
            });
          }
    }
  }
  if (result.size !== ORIGINAL_CANOPY_CONTEXT_R026.sourceMemberCells)
    throw Error("Original canopy source membership changed");
  return result;
}

type OpticalGuards = {
  unknownVariant: boolean;
  bounds: readonly {
    piece: string;
    kind: "source" | "retained";
    bounds: ShipVisualLayer["bounds"];
  }[];
};

export function referenceOriginalCanopySourceR026(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profile: ShipVisualProfileId,
  finalLayers: readonly ShipVisualLayer[],
  guards: OpticalGuards,
): ShipVisualLayer[] {
  if (
    doc.id !== ORIGINAL_CANOPY_CONTEXT_R026.prefab ||
    view !== "flight" ||
    profile !== "federation" ||
    digest(canonicalShipPrefabJson(doc)) !==
      ORIGINAL_CANOPY_CONTEXT_R026.canonicalDocumentSha256 ||
    digest(JSON.stringify(catalog.list())) !==
      REFERENCE_EXTERIOR_CATALOG_SHA256_R026 ||
    doc.mounts.some(
      (m) =>
        JSON.stringify(catalog.get(m.component)) !==
        JSON.stringify(catalog.list().find((c) => c.id === m.component)),
    ) ||
    guards.unknownVariant ||
    digest(JSON.stringify(guards)) !== ORIGINAL_CANOPY_CONTEXT_R026.guardSha256
  )
    return [];
  const expected = [
    ...ORIGINAL_CANOPY_OCCURRENCES_R026,
    ...navFrames.map((frame) => ({ piece: "canopy.nav.deck", frame })),
  ];
  const pieces = new Set(expected.map((o) => o.piece));
  const actual = dressShip(doc, { catalog }).kit.filter((k) =>
    pieces.has(k.piece),
  );
  if (
    actual.length !== expected.length ||
    expected.some(
      (e) =>
        actual.filter(
          (k) =>
            k.piece === e.piece &&
            k.view === "flight" &&
            !(k.mirror ?? false) &&
            [k.x, k.y, k.z, k.rotDeg].every((v, i) => v === e.frame[i]),
        ).length !== 1,
    )
  )
    return [];
  const old = sampleShipVisualLayers(finalLayers),
    source = originalCanopySourceCellsR026();
  const added = new Map<string, OriginalCanopyCellR026>();
  let omitted = 0;
  for (const [key, cell] of source) {
    if (old.has(key)) continue;
    const { x, y, z, occurrence } = cell;
    const delta =
      occurrence < 4
        ? x - y - 320
        : occurrence < 8
          ? x + y + 1 - 480
          : x + 0.5 - 384;
    if (delta < -1e-9) {
      omitted++;
      continue;
    }
    if (
      [x, y, z].some(
        (v, i) =>
          v < ORIGINAL_CANOPY_CONTEXT_R026.wholeCellBounds[i] ||
          v + 1 > ORIGINAL_CANOPY_CONTEXT_R026.wholeCellBounds[i + 3],
      )
    )
      return [];
    // Exact pinned original matching frame/glass bands and TWO original NAV
    // companions alone have a finite source-mating exception. The complete
    // guard digest and dresser cohort prohibit any identity-wide permission.
    for (const guard of guards.bounds) {
      if (
        [0, 1, 2].some(
          (i) =>
            [x, y, z][i] + 1 <= guard.bounds[i] ||
            [x, y, z][i] >= guard.bounds[i + 3],
        )
      )
        continue;
      const matching =
        ORIGINAL_CANOPY_OCCURRENCES_R026.some((o) => o.piece === guard.piece) ||
        (guard.piece === "canopy.nav.deck" && guard.kind === "source");
      if (!matching) return [];
    }
    added.set(key, cell);
  }
  if (
    added.size !== ORIGINAL_CANOPY_CONTEXT_R026.addedCells ||
    omitted !== ORIGINAL_CANOPY_CONTEXT_R026.omittedInwardEmptyCells
  )
    return [];
  // Every added cube must reach an existing real opaque hull CORE, not merely
  // share a family name. Old cells are never re-emitted or overwritten.
  const reached = new Set<string>(),
    queue: OriginalCanopyCellR026[] = [];
  for (const [key, cell] of added)
    if (
      VISUAL_NEIGHBOURS.some(([dx, dy, dz]) => {
        const n = old.get(visualCellKey(cell.x + dx, cell.y + dy, cell.z + dz));
        return (
          n?.role === "core" &&
          n.family === "volume:hull" &&
          !n.facet &&
          !["glass", "emit_a", "emit_b"].includes(n.slot)
        );
      })
    ) {
      reached.add(key);
      queue.push(cell);
    }
  if (!queue.length) return [];
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dy, dz] of VISUAL_NEIGHBOURS) {
      const c = queue[i],
        key = visualCellKey(c.x + dx, c.y + dy, c.z + dz),
        n = added.get(key);
      if (n && !reached.has(key)) {
        reached.add(key);
        queue.push(n);
      }
    }
  if (reached.size !== added.size) return [];
  return compactOriginalCanopyCellsR026(added);
}

/** Coalesce only exact adjacent boxes of the same original source owner.
 * These writes never overlap one another or any old occupied cell. */
export function compactOriginalCanopyCellsR026(
  added: ReadonlyMap<string, OriginalCanopyCellR026>,
): ShipVisualLayer[] {
  const rows = [...added.values()].sort(
      (a, b) => a.z - b.z || a.y - b.y || a.x - b.x,
    ),
    result: ShipVisualLayer[] = [];
  for (let i = 0; i < rows.length;) {
    const c = rows[i];
    let j = i + 1;
    while (
      j < rows.length &&
      rows[j].z === c.z &&
      rows[j].y === c.y &&
      rows[j].x === rows[j - 1].x + 1 &&
      rows[j].primitive === c.primitive &&
      rows[j].occurrence === c.occurrence &&
      rows[j].role === c.role &&
      rows[j].slot === c.slot
    )
      j++;
    result.push({
      id: `volume:hull:r026-original-canopy:${c.occurrence}:${c.primitive}:${c.x},${c.y},${c.z}`,
      role: c.role,
      slot: c.slot,
      support: "volume:hull",
      surfaceRole: "hull",
      bounds: [c.x, c.y, c.z, rows[j - 1].x + 1, c.y + 1, c.z + 1],
    });
    i = j;
  }
  // The X runs above have equal Y/Z size. Merge matching complete faces along
  // Y, then Z. Every union remains exactly two disjoint adjoining boxes;
  // a concavity, source boundary, hole or difference in width prevents a merge.
  const owner = (l: ShipVisualLayer) => l.id.split(":").slice(0, -1).join(":");
  const merge = (input: ShipVisualLayer[], axis: 1 | 2): ShipVisualLayer[] => {
    const groups = new Map<string, ShipVisualLayer[]>();
    for (const l of input) {
      const signature = JSON.stringify([
        owner(l),
        l.role,
        l.slot,
        ...l.bounds.filter((_, i) => i !== axis && i !== axis + 3),
      ]);
      const group = groups.get(signature) ?? [];
      group.push(l);
      groups.set(signature, group);
    }
    const merged: ShipVisualLayer[] = [];
    for (const group of groups.values()) {
      group.sort((a, b) => a.bounds[axis] - b.bounds[axis]);
      let run: ShipVisualLayer | undefined;
      for (const l of group) {
        if (run && run.bounds[axis + 3] === l.bounds[axis])
          run.bounds[axis + 3] = l.bounds[axis + 3];
        else {
          run = { ...l, bounds: [...l.bounds] };
          merged.push(run);
        }
      }
    }
    return merged;
  };
  return merge(merge(result, 1), 2);
}
