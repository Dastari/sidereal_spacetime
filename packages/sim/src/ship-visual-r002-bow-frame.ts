/** Proposal-only replacement of the two admitted Wren side-window cross-sections.
 * The old mating guard remains correct for the old source. This new manufactured
 * cross-section clips ONLY its existing supported boundary cubes; no spanning
 * sheet, new pressure authority, socket movement or global smoothing is added.
 */
import type {
  ShipPrefabDocumentV1,
  PrefabComponentCatalog,
} from "@sidereal/content/ship-prefab";
import type {
  ShipVisualLayer,
  ShipVisualProfileId,
  ShipVisualView,
} from "@sidereal/content/ship-visual";
import { referenceCockpitApertureSourceAdmittedR002 } from "@sidereal/content/ship-visual-r002";
import { dressShip } from "./ship-dresser";
import {
  sampleShipVisualLayers,
  visualCellKey,
  type VisualCell,
} from "./ship-visual-sampler";

const sections = [
  {
    id: "south",
    piece: "bow.slope1.deck.s2.a1.edge1",
    frame: [10, 1, 0, 270],
    normal: [1, -1, 0],
    plane: 159,
    y0: 2,
    y1: 14,
  },
  {
    id: "north",
    piece: "bow.slope1.deck.s2.a0.edge1",
    frame: [10, 6, 0, 0],
    normal: [1, 1, 0],
    plane: 271,
    y0: 98,
    y1: 110,
  },
] as const;

function layer(
  c: VisualCell,
  id: string,
  facet?: ShipVisualLayer["facet"],
): ShipVisualLayer {
  return {
    id,
    role: c.role,
    slot: c.slot,
    support: c.family,
    bounds: [c.x, c.y, c.z, c.x + 1, c.y + 1, c.z + 1],
    ...(c.surfaceRole ? { surfaceRole: c.surfaceRole } : {}),
    ...(c.normalHint ? { normalHint: [...c.normalHint] } : {}),
    ...(c.normalChart ? { normalChart: c.normalChart } : {}),
    ...(c.normalSide ? { normalSide: c.normalSide } : {}),
    ...(facet ? { facet } : c.facet ? { facet: c.facet } : {}),
  };
}

/** Empty means no replacement, so the complete prior candidate remains intact.
 * Call AFTER the accepted raw aperture and all finish duties. Source grouping
 * must never move these new duties before a late raw mating-guard overwrite.
 */
export function referenceBowFrameR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profile: ShipVisualProfileId,
  finalLayers: readonly ShipVisualLayer[],
  opticalContext?: { unknownVariant: boolean },
): ShipVisualLayer[] {
  if (
    opticalContext?.unknownVariant !== false ||
    doc.id !== "fed.s.wren" ||
    profile !== "federation" ||
    !referenceCockpitApertureSourceAdmittedR002(profile)
  )
    return [];
  const kit = dressShip(doc, { catalog }).kit;
  for (const s of sections) {
    const matches = kit.filter((k) => k.piece === s.piece);
    if (
      matches.length !== 1 ||
      matches[0].view !== "both" ||
      (matches[0].mirror ?? false) ||
      [matches[0].x, matches[0].y, matches[0].z, matches[0].rotDeg].some(
        (v, i) => v !== s.frame[i],
      )
    )
      return [];
  }
  const cells = sampleShipVisualLayers(finalLayers);
  const result: ShipVisualLayer[] = [];
  for (const s of sections) {
    const a: [number, number, number] = [...s.normal];
    const facet = { id: `volume:hull:joined-bow-frame:${s.id}`, a, d: s.plane };
    for (const c of cells.values()) {
      if (
        c.family !== "volume:hull" ||
        c.y < s.y0 ||
        c.y >= s.y1 ||
        c.z < 10 ||
        c.z >= 32
      )
        continue;
      const q = a[0] * (c.x + 0.5) + a[1] * (c.y + 0.5);
      // The plane goes through lattice corners and cell centres. Its pressure
      // backing is the two uncut inward courses; only this OUTER row is clipped.
      if (
        q !== s.plane ||
        !["core", "frame", "plate"].includes(c.role) ||
        ["glass", "emit_a", "emit_b"].includes(c.slot)
      )
        continue;
      const inward = [
        cells.get(visualCellKey(c.x - a[0], c.y, c.z)),
        cells.get(visualCellKey(c.x - a[0], c.y - a[1], c.z)),
      ];
      if (
        inward.some(
          (n) =>
            !n ||
            n.family !== c.family ||
            !["core", "frame"].includes(n.role) ||
            n.slot === "glass",
        )
      )
        continue;
      // The supported opaque casing alone is replaced. Raw glass keeps its
      // validated original two-course optical ownership and positive overlap.
      let conflicting = false;
      for (let Z = -1; Z <= 1; Z++)
        for (let Y = -1; Y <= 1; Y++)
          for (let X = -1; X <= 1; X++) {
            const n = cells.get(visualCellKey(c.x + X, c.y + Y, c.z + Z));
            if (
              n?.facet &&
              (n.facet.id !== facet.id ||
                n.facet.d !== facet.d ||
                n.facet.a.join(",") !== facet.a.join(","))
            )
              conflicting = true;
          }
      if (conflicting) continue;
      result.push(layer(c, `${facet.id}:${view}:${c.x}:${c.y}:${c.z}`, facet));
    }
  }
  return result;
}
