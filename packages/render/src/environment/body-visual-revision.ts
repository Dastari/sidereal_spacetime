import type { SpaceBodyState } from "./index";
import type { PlanetLOD } from "./layered-planet";

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && a.length !== (b as unknown[]).length) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  for (const key in left)
    if (Object.hasOwn(left, key) && (!Object.hasOwn(right, key) || !equal(left[key], right[key]))) return false;
  for (const key in right) if (Object.hasOwn(right, key) && !Object.hasOwn(left, key)) return false;
  return true;
}

/** Snapshot only on visual changes; replicated position/spin never invalidate art.
 * Comparing nested scalar values also detects recipes mutated in place. */
export function createBodyVisualRevision() {
  let snapshot: {kind:string;appearance:string;seed:number;radius:number;recipe:SpaceBodyState["recipe"];lod:PlanetLOD;ice:boolean;volcanic:boolean} | undefined;
  let revision = 0;
  return (body: SpaceBodyState, lod: PlanetLOD, ice: boolean, volcanic: boolean) => {
    if (!snapshot || snapshot.kind !== body.kind || snapshot.appearance !== body.appearance ||
        snapshot.seed !== body.seed || snapshot.radius !== body.radius || snapshot.lod !== lod ||
        snapshot.ice !== ice || snapshot.volcanic !== volcanic || !equal(snapshot.recipe, body.recipe)) {
      snapshot = {kind:body.kind,appearance:body.appearance,seed:body.seed,radius:body.radius,
        recipe:body.recipe === undefined ? undefined : structuredClone(body.recipe),lod,ice,volcanic};
      revision++;
    }
    return revision;
  };
}
