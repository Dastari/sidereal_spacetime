/** Exact authored support subsets, independent of the generic immutable kit. */
import type {
  ConstructionDocument,
  ConstructionFloor,
} from "@sidereal/content/construction";
import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import type { TilesetInterface } from "@sidereal/content/tileset-interfaces";
import {
  isWayfarerAccessProfile,
  WAYFARER_ACCESS_SOURCE,
  WAYFARER_ACCESS_NATIVE_FLOOR_STRIPS,
} from "@sidereal/content/wayfarer-access-profile";
import { WAYFARER_NATIVE_FLOOR_BACKINGS } from "@sidereal/content/wayfarer-authored-gameplay";
import { canonicalPolygon, inside, stableStringify } from "./layout-geometry";
import { fitTileset, transformInterfacePoint } from "./tileset-fit";

const profile = "wayfarer-authored-r001@2" as const;
const clippedPartId = "quarter-1m-wayfarer-r2-native-support";
const specs = WAYFARER_ACCESS_NATIVE_FLOOR_STRIPS.map(({ x, sourceObject }) => {
  const backing = WAYFARER_NATIVE_FLOOR_BACKINGS.find(
    (row) => row.object === sourceObject,
  );
  if (
    !backing ||
    backing.cell[0] !== x ||
    backing.cell[1] !== -5.5 ||
    !backing.unitPlacement
  )
    throw Error("Native Wayfarer floor backing changed");
  return {
    id: `floor-${x}--5.5`,
    sourceObject,
    origin: [144, x * 32, 0] as [number, number, number],
    polygon: canonicalPolygon([
      [160, x * 32],
      [176, x * 32],
      [176, (x + 1) * 32],
      [160, (x + 1) * 32],
    ]),
  };
});

/** Bind only source-derived fragments; normal layouts still use the generic kit. */
export function wayfarerNativeSupportBindings(
  prefab: ShipPrefabDocumentV1,
  layout: LayoutDocument,
): ConstructionFloor[] {
  if (!isWayfarerAccessProfile(prefab)) return [];
  if (stableStringify(prefab) !== stableStringify(WAYFARER_ACCESS_SOURCE))
    throw Error(
      "Native support clips require the exact registered profile2 source",
    );
  return specs.map((spec) => {
    const tile = layout.tiles.find((tile) => tile.id === spec.id);
    if (
      !tile ||
      tile.deckId !== "deck-0" ||
      stableStringify(canonicalPolygon(tile.vertices)) !==
        stableStringify(spec.polygon)
    )
      throw Error("Native support fragment differs from its source");
    return {
      id: spec.id,
      deckId: "deck-0",
      partId: "quarter-1m",
      origin: [...spec.origin],
      quarterTurns: 0,
      reflected: false,
      nativeSupportClip: { profile, sourceObject: spec.sourceObject },
    };
  });
}

/** Clip nominal support only after exact prefab and backing reconstruction.
 * The native Wayfarer meshes already contain these strips; no new visual floor,
 * stretched asset, global-kit change or pressure-rated cut edge is introduced. */
function nativeSupportFitInputs(
  document: ConstructionDocument,
  kit: TilesetInterface,
) {
  const clips = document.floors.filter(
    (floor) => floor.nativeSupportClip !== undefined,
  );
  if (!clips.length) return { kit, floors: document.floors };
  const binding = (
    document as ConstructionDocument & {
      prefab?: {
        document: ShipPrefabDocumentV1;
        identities?: Readonly<Record<string, string>>;
      };
    }
  ).prefab;
  if (
    !binding ||
    stableStringify(binding.document) !==
      stableStringify(WAYFARER_ACCESS_SOURCE)
  )
    throw Error(
      "Native support clips require the exact registered profile2 source",
    );
  const identities = binding.identities;
  const sourceId = (id: string) =>
    identities
      ? Object.entries(identities).find(([, target]) => target === id)?.[0]
      : id;
  const backing = kit.parts.find((part) => part.id === "quarter-1m");
  if (!backing) throw Error("Native support clip backing is absent");
  const footprint: Point[] = [
    [16, 0],
    [32, 0],
    [32, 32],
    [16, 32],
  ];
  if (!footprint.every((point) => inside(point, backing.footprint)))
    throw Error("Native support clip exceeds its frozen backing");
  const seen = new Set<string>();
  for (const floor of clips) {
    const spec = specs.find((spec) => spec.id === sourceId(floor.id));
    const clip = floor.nativeSupportClip!;
    const tile = document.layout.tiles.find((tile) => tile.id === floor.id);
    if (
      !spec ||
      seen.has(spec.id) ||
      sourceId(floor.deckId) !== "deck-0" ||
      clip.profile !== profile ||
      clip.sourceObject !== spec.sourceObject ||
      Object.keys(clip).sort().join(",") !== "profile,sourceObject" ||
      floor.partId !== backing.id ||
      floor.quarterTurns !== 0 ||
      floor.reflected ||
      stableStringify(floor.origin) !== stableStringify(spec.origin) ||
      !tile ||
      tile.deckId !== floor.deckId ||
      stableStringify(canonicalPolygon(tile.vertices)) !==
        stableStringify(spec.polygon)
    )
      throw Error(
        "Native support clip differs from its source-derived backing/polygon",
      );
    const nativePolygon = backing.footprint.map((point) =>
      transformInterfacePoint(point, floor),
    );
    if (!tile.vertices.every((point) => inside(point, nativePolygon)))
      throw Error("Native support polygon lies outside its backing");
    seen.add(spec.id);
  }
  if (seen.size !== specs.length)
    throw Error(
      "Native support clips require all six source-derived fragments",
    );
  const part = {
    ...backing,
    id: clippedPartId,
    footprint: footprint.map(([x, y]) => [x - 16, y] as Point),
    edges: footprint.map(([x, y], i) => ({
      id: `support-${i}`,
      a: [x - 16, y] as Point,
      b: [
        footprint[(i + 1) % footprint.length][0] - 16,
        footprint[(i + 1) % footprint.length][1],
      ] as Point,
      bottom: backing.bottom,
      top: backing.top,
      profile: backing.edges[0].profile,
      seals: [],
    })),
  };
  // Fit every supported solid normally, including new clipped boundaries.
  return {
    kit: { ...kit, parts: [...kit.parts, part] },
    floors: document.floors.map((floor) =>
      floor.nativeSupportClip
        ? {
            ...floor,
            partId: clippedPartId,
            origin: [
              floor.origin[0] + 16,
              floor.origin[1],
              floor.origin[2],
            ] as [number, number, number],
          }
        : floor,
    ),
  };
}

export function validateConstructionNativeSupportClips(
  document: ConstructionDocument,
  kit: TilesetInterface,
): void {
  nativeSupportFitInputs(document, kit);
}

export function fitConstructionNativeFloors(
  document: ConstructionDocument,
  kit: TilesetInterface,
) {
  const input = nativeSupportFitInputs(document, kit);
  return fitTileset(input.kit, input.floors);
}
