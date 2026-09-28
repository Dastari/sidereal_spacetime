/**
 * Authoritative end point of an accepted handheld shot. The server casts the beam from the
 * shooter's committed deck position along the accepted aim; nothing here trusts a client hit.
 *
 * Prefab ships use the compiled prefab structure (walls, hull shell, bow profiles, tall furniture)
 * and other prefab ships' hulls; native construction ships use their walking-collision segments.
 * Character bodies on the same ship and deck stop the beam before the structure does (friendly
 * fire is on); `combat-damage.ts` applies the damage.
 */
import type { ReducerCtx, InferSchema } from "spacetimedb/server";
import type world from "./index";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import {
  castBeamWithShips,
  castPrefabBeam,
  castSegmentBeam,
  prefabBeamModel,
  type BeamHit,
  type BeamShipTarget,
  type PrefabBeamModel,
} from "@sidereal/sim/prefab-beam";
import { constructionCollision } from "./construction-doors";
import { castCharacterBeam } from "@sidereal/sim/combat-damage";
import { characterTargets } from "./combat-damage";

type Context = ReducerCtx<InferSchema<typeof world>>;
type Instance = { id: string; revision: bigint; documentJson: string };

const models = new Map<string, PrefabBeamModel | null>();
function beamModelFor(instance: Instance): PrefabBeamModel | null {
  const key = instance.id + ":" + instance.revision;
  if (models.has(key)) return models.get(key)!;
  if (models.size >= 64) models.clear();
  let model: PrefabBeamModel | null = null;
  try {
    const binding = (
      JSON.parse(instance.documentJson) as {
        prefab?: { document?: unknown; catalog?: unknown };
      }
    ).prefab;
    if (binding && typeof binding === "object")
      model = prefabBeamModel(
        readShipPrefab(binding.document),
        prefabComponentCatalogFor(String(binding.catalog)),
      );
  } catch {
    model = null;
  }
  models.set(key, model);
  return model;
}

/** Other ships further than this from the shooter's ship are never tested. */
const OTHER_SHIP_REACH_M = 200;

/** A beam hit, or a character body (`kind: "character"`, `targetId` = character id). */
export type ShotHit = Omit<BeamHit, "kind"> & {
  kind: BeamHit["kind"] | "character";
};

/** The structure hit, unless a character body on the same ship and deck is reached first. */
export function resolveShotImpact(
  ctx: Context,
  actor: { id: string; shipId: string; localX: number; localY: number },
  angle: number,
  rangeM: number,
): ShotHit {
  const structure = resolveStructureImpact(ctx, actor, angle, rangeM);
  const body = castCharacterBeam(
    [actor.localX, actor.localY],
    angle,
    structure.distanceM,
    characterTargets(ctx, actor),
  );
  return body
    ? {
        kind: "character",
        targetId: body.id,
        distanceM: body.distanceM,
        point: body.point,
      }
    : structure;
}

function resolveStructureImpact(
  ctx: Context,
  actor: { id: string; shipId: string; localX: number; localY: number },
  angle: number,
  rangeM: number,
): BeamHit {
  const origin: [number, number] = [actor.localX, actor.localY];
  const none = (): BeamHit => ({
    kind: "none",
    targetId: "",
    distanceM: rangeM,
    point: [
      origin[0] + Math.sin(angle) * rangeM,
      origin[1] + Math.cos(angle) * rangeM,
    ],
  });
  const instance = ctx.db.constructionInstance.id.find(actor.shipId);
  if (!instance) return none();
  const model = beamModelFor(instance);
  if (model) {
    const own = ctx.db.ship.id.find(actor.shipId);
    if (!own) return castPrefabBeam(model, origin, angle, rangeM);
    const others: BeamShipTarget[] = [];
    for (const ship of ctx.db.ship.iter()) {
      if (ship.id === own.id) continue;
      if (
        Math.hypot(ship.x - own.x, ship.y - own.y) >
        rangeM + OTHER_SHIP_REACH_M
      )
        continue;
      const other = ctx.db.constructionInstance.id.find(ship.id);
      const otherModel = other && beamModelFor(other);
      if (otherModel)
        others.push({
          id: ship.id,
          x: ship.x,
          y: ship.y,
          heading: ship.heading,
          model: otherModel,
        });
    }
    return castBeamWithShips(
      { model, x: own.x, y: own.y, heading: own.heading },
      origin,
      angle,
      rangeM,
      others,
    );
  }
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  if (!location || location.instanceId !== instance.id) return none();
  try {
    return castSegmentBeam(
      constructionCollision(ctx, instance, location.deckId).segments,
      origin,
      angle,
      rangeM,
    );
  } catch {
    return none();
  }
}
