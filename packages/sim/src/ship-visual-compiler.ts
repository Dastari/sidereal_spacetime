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
export const visualProfilesSha256 = (): string =>
  visualSha256(JSON.stringify(SHIP_VISUAL_PROFILES));
export function visualVolumeSha256(cells: VisualVolume): string {
  return visualSha256(
    [...cells.values()]
      .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
      .map(
        (c) =>
          `${c.x},${c.y},${c.z}:${c.role}:${c.slot}:${c.family}:${c.normalHint?.join(",") ?? ""}`,
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
) {
  const layers = shipVisualLayers(doc, view, catalog, profile);
  const intact = sampleShipVisualLayers(layers);
  const cells = removed?.size ? removeShipVisualCells(intact, removed) : intact;
  return { layers, cells, profile, view };
}
