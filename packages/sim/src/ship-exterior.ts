/**
 * Exterior-only presentation rules for ships the viewer is not aboard (wiki
 * `Architecture/Visibility and Interest Management`, hard rule 6: "Other ships never render
 * interiors"). Pure data: the renderer builds remote hulls from `exteriorOnlyDress`, never from a
 * deck dressing, and the server names a remote hull only by its public prefab exterior id.
 */
import type { DressedShip } from "./ship-dresser";

/** Published exterior id of a trusted developer prefab hull: `prefab:<prefabId>`. The prefab
 * document revision travels separately (`appearanceRevision`), so the pair names one blueprint
 * pin's hull without any per-instance data. */
export const PREFAB_EXTERIOR_PREFIX = "prefab:";
/** A perceived ship with no published exterior (not a trusted prefab): drawn as a marker only. */
export const UNPUBLISHED_EXTERIOR_ID = "unpublished";
const PREFAB_ID = /^[a-z0-9][a-z0-9.-]{2,63}$/;

export function prefabExteriorAssetId(prefabId: string): string {
  if (!PREFAB_ID.test(prefabId)) throw Error("Invalid prefab id");
  return PREFAB_EXTERIOR_PREFIX + prefabId;
}

/** The prefab id named by a published exterior id, or undefined for any other id. */
export function prefabIdOfExterior(assetId: string): string | undefined {
  if (!assetId.startsWith(PREFAB_EXTERIOR_PREFIX)) return undefined;
  const id = assetId.slice(PREFAB_EXTERIOR_PREFIX.length);
  return PREFAB_ID.test(id) ? id : undefined;
}

/**
 * The flight-view exterior of a dressed prefab and nothing else: hull, roof, exterior
 * components (face, rear, top and edge mounts) and hull markings. Interior-attached modules
 * (including consoles visible through a canopy), deck furniture, room lights, room labels and
 * wall contact strips are dropped, as is every deck-only placement.
 */
export function exteriorOnlyDress(dressed: DressedShip): DressedShip {
  const outside = <T extends { view: string }>(rows: readonly T[]) =>
    rows.filter((r) => r.view !== "deck");
  return {
    ...dressed,
    kit: outside(dressed.kit),
    generated: outside(dressed.generated),
    decals: outside(dressed.decals),
    components: outside(dressed.components).filter(
      (c) => c.placement.mount.attach !== "interior",
    ),
    objects: [],
    lights: [],
    labels: [],
    contacts: [],
  };
}
