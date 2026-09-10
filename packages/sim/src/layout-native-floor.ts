import floorKitJson from "@sidereal/content/construction-floor-interfaces.json";
import type { ConstructionFloor } from "@sidereal/content/construction";
import type { FloorTile } from "@sidereal/content/ship-layout";
import type { FloorStyle } from "@sidereal/content/layout-structure";
import type { TilesetInterface } from "@sidereal/content/tileset-interfaces";
import { canonicalPolygon, stableStringify } from "./layout-geometry";
import { transformInterfacePoint } from "./tileset-fit";

// Same immutable authored interface JSON used by construction-transactions. This
// is a fixed source catalog, never a client-supplied geometry/collider definition.
const kit = floorKitJson as unknown as TilesetInterface;
export function floorModelOptions(tile: FloorTile, elevation: number) {
  if (
    !Number.isSafeInteger(elevation) ||
    tile.vertices.length < 3 ||
    tile.vertices.length > 8 ||
    tile.vertices.some(
      (p) =>
        p.length !== 2 ||
        p.some((n) => !Number.isSafeInteger(n) || Math.abs(n) > 8192),
    )
  )
    return [];
  const target = canonicalPolygon(tile.vertices);
  const result: {
    assetId: string;
    revision: string;
    sha256: string;
    nodePrefix?: string;
    partId: string;
    placement: ConstructionFloor;
  }[] = [];
  for (const part of kit.parts) {
    if (
      part.role !== "floor" ||
      part.bottom !== kit.datums.floorBottom ||
      part.top !== kit.datums.floorTop
    )
      continue;
    for (const quarterTurns of part.quarterTurns) {
      const turned = part.footprint.map((p) =>
        transformInterfacePoint(p, {
          origin: [0, 0, 0],
          quarterTurns,
          reflected: false,
        }),
      );
      const dx =
          Math.min(...target.map((p) => p[0])) -
          Math.min(...turned.map((p) => p[0])),
        dy =
          Math.min(...target.map((p) => p[1])) -
          Math.min(...turned.map((p) => p[1]));
      if (
        stableStringify(
          canonicalPolygon(turned.map(([x, y]) => [x + dx, y + dy])),
        ) !== stableStringify(target)
      )
        continue;
      result.push({
        assetId: part.native.assetId,
        revision: part.native.revision,
        sha256: part.native.sha256,
        nodePrefix: part.native.nodePrefix,
        partId: part.id,
        placement: {
          id: tile.id,
          deckId: tile.deckId,
          partId: part.id,
          origin: [dx, dy, elevation],
          quarterTurns,
          reflected: false,
        },
      });
      break; // Same legacy first approved rotation; no reflection inferred from symmetry.
    }
  }
  return result;
}
/** An explicit override never falls back to a different model or revision. */
export function matchNativeFloorTile(
  tile: FloorTile,
  elevation: number,
  model?: FloorStyle["model"],
): ConstructionFloor | null {
  const options = floorModelOptions(tile, elevation);
  return (
    (model
      ? options.find(
          (p) => p.assetId === model.assetId && p.revision === model.revision,
        )
      : options[0]
    )?.placement ?? null
  );
}
