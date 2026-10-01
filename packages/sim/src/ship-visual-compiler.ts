/** Presentation compiler only; synthetic fracture has no gameplay or reducer connection. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  canonicalShipPrefabJson,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  SHIP_VISUAL_PROFILES,
  type ShipVisualProfileId,
  type ShipVisualView,
} from "@sidereal/content/ship-visual";
import { shipVisualLayers } from "./ship-visual-layers";
import { shipVisualLayersR002 } from "./ship-visual-layers-r002";
import {
  SHIP_VISUAL_PROFILES_R002,
  SHIP_VISUAL_MACRO_PROFILES_R002,
} from "@sidereal/content/ship-visual-r002";
import {
  removeShipVisualCells,
  sampleShipVisualLayers,
  type VisualVolume,
} from "./ship-visual-sampler";
export { shipVisualLayers } from "./ship-visual-layers";
export {
  sampleShipVisualLayers,
  removeShipVisualCells,
  visualCellKey,
  type VisualVolume,
  type VisualCell,
} from "./ship-visual-sampler";
export const visualSha256 = (text: string): string =>
  bytesToHex(sha256(new TextEncoder().encode(text)));
export const visualPrefabSha256 = (doc: ShipPrefabDocumentV1): string =>
  visualSha256(canonicalShipPrefabJson(doc));
export const visualProfilesSha256 = (revision = "r001"): string => {
  if (revision !== "r001" && revision !== "r002")
    throw Error("Unknown visual recipe revision");
  return visualSha256(
    JSON.stringify(
      revision === "r002"
        ? {
            style: SHIP_VISUAL_PROFILES_R002,
            manufacturing: SHIP_VISUAL_MACRO_PROFILES_R002,
          }
        : SHIP_VISUAL_PROFILES,
    ),
  );
};
export function visualVolumeSha256(cells: VisualVolume): string {
  return visualSha256(
    [...cells.values()]
      .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
      .map(
        (c) =>
          `${c.x},${c.y},${c.z}:${c.role}:${c.slot}:${c.family}:${c.normalHint?.join(",") ?? ""}${c.surfaceRole ? `:surface:${c.surfaceRole}` : ""}${c.normalChart ? `:chart:${c.normalChart}:${c.normalFaces ?? 0}` : ""}${c.normalSide ? `:side:${c.normalSide.id}:${c.normalSide.normal.join(",")}:${c.normalSide.faces}:${c.normalSideFaces ?? 0}` : ""}${c.facet ? `:facet:${c.facet.id}:${c.facet.a.join(",")}:${c.facet.d}:${c.facetFaces ?? 0}` : ""}${c.facetNeighbourFaces !== undefined ? `:facet-neighbour:${c.facetNeighbourFaces}` : ""}`,
      )
      .join("\n"),
  );
}
export function compileShipVisual(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  view: ShipVisualView,
  profile: ShipVisualProfileId,
  removed?: ReadonlySet<string>,
  revision = "r001",
) {
  if (revision !== "r001" && revision !== "r002")
    throw Error("Unknown visual recipe revision");
  const layers = (
    revision === "r002" ? shipVisualLayersR002 : shipVisualLayers
  )(doc, view, catalog, profile);
  const intact = sampleShipVisualLayers(layers);
  const cells = removed?.size ? removeShipVisualCells(intact, removed) : intact;
  return { layers, cells, profile, view };
}
