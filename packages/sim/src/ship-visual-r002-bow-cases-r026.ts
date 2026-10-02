/** Private R26 broad roof casings. All geometry is above the intact original
 * roof and outside the complete source-frame/glass guards. See the wiki's
 * Ship Reference Fidelity and Character Seals finite four-body contract. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  canonicalShipPrefabJson,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { insidePolygon } from "@sidereal/content/construction-grammar";
import type {
  ShipVisualLayer,
  ShipVisualProfileId,
  ShipVisualView,
} from "@sidereal/content/ship-visual";
import {
  polygonBoundaryDistance,
  sampleShipVisualLayers,
  visualCellKey,
  type VisualCell,
} from "./ship-visual-sampler";

export const REFERENCE_BOW_CASE_BODIES_R026 = [
  { id: "brow-south", bounds: [144, 8, 40, 158, 28, 46] },
  { id: "brow-north", bounds: [144, 80, 40, 158, 104, 46] },
  { id: "nose-south", bounds: [180, 34, 24, 190, 52, 30] },
  { id: "nose-north", bounds: [180, 56, 24, 190, 78, 30] },
] as const;

type OpticalGuards = {
  unknownVariant: boolean;
  bounds: readonly {
    piece: string;
    kind: "source" | "retained";
    bounds: ShipVisualLayer["bounds"];
  }[];
};
const digest = (s: string) => bytesToHex(sha256(new TextEncoder().encode(s)));
const originalDocument =
  "ecdb038c1b9333780c719aa3e19a8c677852c99cf4dab86421a2934aa60937e5";
const originalOpticalGuards =
  "206b309ff9532483dd5f7a74686d7cd5c30514b4cce382f08782c4fb6a0d3c25";
const opaque = (c: VisualCell) =>
  !c.facet && !["glass", "emit_a", "emit_b"].includes(c.slot);

function owns(l: ShipVisualLayer, c: VisualCell): boolean {
  if ([c.x, c.y, c.z].some((v, i) => v < l.bounds[i] || v >= l.bounds[i + 3]))
    return false;
  if (!l.polygon) return true;
  const p: [number, number] = [c.x + 0.5, c.y + 0.5];
  return (
    insidePolygon(l.polygon, ...p) &&
    !l.holes?.some((h) => insidePolygon(h, ...p)) &&
    (l.band === undefined || polygonBoundaryDistance(p, l.polygon) <= l.band)
  );
}

/** Atomic source admission. Pigment overlays run after this geometry duty.
 * A changed document, roof owner/backing or optical source retains the prior
 * candidate; no partial strip or guessed body substitutes for a rejected case. */
export function referenceBowCasesR026(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  profile: ShipVisualProfileId,
  finalLayers: readonly ShipVisualLayer[],
  guards: OpticalGuards,
): ShipVisualLayer[] {
  if (
    view !== "flight" ||
    profile !== "federation" ||
    doc.id !== "fed.s.wren" ||
    digest(canonicalShipPrefabJson(doc)) !== originalDocument ||
    guards.unknownVariant ||
    digest(JSON.stringify(guards)) !== originalOpticalGuards
  )
    return [];
  const cells = sampleShipVisualLayers(finalLayers);
  const reverseLayers = [...finalLayers].reverse();
  const tops = new Map<string, VisualCell>();
  for (const c of cells.values()) {
    if (
      !REFERENCE_BOW_CASE_BODIES_R026.some(
        ({ bounds: b }) =>
          c.x >= b[0] && c.x < b[3] && c.y >= b[1] && c.y < b[4],
      )
    )
      continue;
    const k = `${c.x},${c.y}`;
    if (!tops.has(k) || tops.get(k)!.z < c.z) tops.set(k, c);
  }
  const admitted: {
    id: string;
    bounds: readonly number[];
    tops: VisualCell[];
  }[] = [];
  for (const body of REFERENCE_BOW_CASE_BODIES_R026) {
    const b = body.bounds,
      columns: VisualCell[] = [];
    for (let y = b[1]; y < b[4]; y++)
      for (let x = b[0]; x < b[3]; x++) {
        const c = tops.get(`${x},${y}`);
        if (
          !c ||
          c.role !== "plate" ||
          c.slot !== "primary" ||
          c.family !== "volume:hull" ||
          c.surfaceRole !== "roof" ||
          !opaque(c) ||
          c.normalChart !==
            (body.id.startsWith("brow")
              ? "volume:hull:roof-plane:-0.268750:0.000000:81.700000"
              : "volume:hull:roof-plane:-0.376250:0.000000:94.600000") ||
          c.z + 1 < b[2] ||
          b[5] - c.z - 1 < 3 ||
          b[5] - c.z - 1 > 6
        )
          return [];
        const owner = reverseLayers.find((l) => owns(l, c));
        if (
          owner?.id !== "volume:hull:sloped-roof-plate" ||
          owner.role !== c.role ||
          owner.slot !== c.slot ||
          owner.support !== c.family ||
          owner.normalChart !== c.normalChart
        )
          return [];
        for (const dz of [1, 2]) {
          const backing = cells.get(visualCellKey(x, y, c.z - dz));
          if (
            !backing ||
            !opaque(backing) ||
            backing.family !== c.family ||
            (dz === 1
              ? backing.role !== "core"
              : !["core", "roof"].includes(backing.role))
          )
            return [];
        }
        if (
          guards.bounds.some(
            ({ bounds: g }) =>
              x < g[3] &&
              x + 1 > g[0] &&
              y < g[4] &&
              y + 1 > g[1] &&
              c.z + 1 < g[5] &&
              b[5] > g[2],
          )
        )
          return [];
        for (let z = c.z + 1; z < b[5]; z++)
          if (cells.has(visualCellKey(x, y, z))) return [];
        columns.push(c);
      }
    admitted.push({ id: body.id, bounds: b, tops: columns });
  }
  const layers: ShipVisualLayer[] = [];
  for (const { id, bounds: b, tops: columns } of admitted) {
    const prefix = `volume:hull:r026-broad-bow:${id}`;
    const add = (
      name: string,
      role: ShipVisualLayer["role"],
      slot: ShipVisualLayer["slot"],
      bounds: ShipVisualLayer["bounds"],
    ) =>
      layers.push({
        id: `${prefix}:${name}`,
        role,
        slot,
        bounds,
        support: "volume:hull",
        surfaceRole: "roof",
      });
    // Merge only consecutive equal-bottom columns within a single actual row.
    // No cross-void compaction or inherited sloped normals on manufactured caps.
    for (let i = 0; i < columns.length;) {
      const c = columns[i];
      let j = i + 1;
      while (
        j < columns.length &&
        columns[j].y === c.y &&
        columns[j].x === columns[j - 1].x + 1 &&
        columns[j].z === c.z
      )
        j++;
      add(`case:${c.x}:${c.y}`, "plate", "secondary", [
        c.x,
        c.y,
        c.z + 1,
        columns[j - 1].x + 1,
        c.y + 1,
        b[5],
      ]);
      i = j;
    }
    add("well-backing", "plate", "dark", [
      b[0] + 2,
      b[1] + 3,
      b[5] - 3,
      b[3] - 2,
      b[4] - 3,
      b[5] - 2,
    ]);
    add("well", "void", "dark", [
      b[0] + 2,
      b[1] + 3,
      b[5] - 2,
      b[3] - 2,
      b[4] - 3,
      b[5],
    ]);
    for (const [index, x] of [b[0] + 3, b[3] - 5].entries())
      add(`equipment:${index}`, "service", "metal", [
        x,
        b[1] + 5 + index * 2,
        b[5] - 3,
        x + 2,
        b[4] - 5,
        b[5] - 1,
      ]);
    add("faceplate", "plate", "primary", [
      b[0] + 2,
      b[1] + 1,
      b[5] - 1,
      b[3] - 2,
      b[1] + 2,
      b[5],
    ]);
    add("identification", "plate", "accent", [
      b[0] + 2,
      b[4] - 2,
      b[5] - 1,
      b[0] + 5,
      b[4] - 1,
      b[5],
    ]);
  }
  return layers;
}
