import { SenderError } from "spacetimedb/server";
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import { CURRENT_WAYFARER_STARTER } from "../../content/src/wayfarer-current-starter";
import {
  archiveJson,
  archiveRow,
  mapRowCounts,
  priorOperation,
  requireShipOperator,
} from "./ship-operator";
import {
  installReplacementWayfarer,
  type WayfarerStarterContext,
} from "./wayfarer-starter-authority";

type Context = ReducerCtx<InferSchema<typeof world>>;
export type CharacterRow = NonNullable<
  ReturnType<Context["db"]["character"]["id"]["find"]>
>;

/** Where the new ship appears. World XY metres and heading radians. */
export type PrefabSpawnPose =
  | { kind: "berth" }
  | { kind: "at"; systemId: string; x: number; y: number; heading: number };

export type PrefabSpawnRequest = { pose: PrefabSpawnPose; name: string };

/** Server-side spawn path for one published prefab ship (SHIPS-PREFABS
 * registers these; see docs/handoffs/ship_asset_removal_plan.md). In the same
 * transaction a spawner installs a complete ship owned by `actor.owner` and
 * boards the EXISTING awaiting-ship character at the prefab spawn deck:
 * character.shipId/localX/localY, construction_location, input,
 * world_admission and an active game_ship_access row. It never inserts a
 * character, personal kit or starter receipt, and never writes map state. */
export interface PrefabShipSpawner {
  readonly prefabId: string;
  /** Ship-components catalog revision the prefab compiled against. */
  readonly catalogRevision: string;
  readonly blueprintSha256: string;
  /** Legacy Wayfarer templates are the ships being removed; they are refused
   * unless allowLegacy is set (isolated legacy regression smoke only). */
  readonly legacy: boolean;
  readonly description: string;
  spawn(
    ctx: Context,
    actor: CharacterRow,
    request: PrefabSpawnRequest,
  ): { shipId: string; deckId: string };
}

const spawners = new Map<string, PrefabShipSpawner>();

export function registerPrefabShipSpawner(spawner: PrefabShipSpawner) {
  if (!/^[a-z0-9][a-z0-9.-]{2,63}$/.test(spawner.prefabId))
    throw Error("Invalid prefab ship ID " + spawner.prefabId);
  if (!spawner.catalogRevision) throw Error("Prefab catalog revision required");
  if (spawners.has(spawner.prefabId))
    throw Error("Duplicate prefab ship spawner " + spawner.prefabId);
  spawners.set(spawner.prefabId, spawner);
}

export function prefabShipSpawner(prefabId: string) {
  return spawners.get(prefabId);
}

export function prefabShipSpawners() {
  return [...spawners.values()];
}

/** Legacy stand-in: the only template this authority can qualify today. It is
 * never used by the runbook; it exists so the isolated legacy regression smoke
 * and unit tests can exercise the assignment and starter paths. */
export const LEGACY_WAYFARER_PREFAB_ID = "legacy-wayfarer-r002";
registerPrefabShipSpawner({
  prefabId: LEGACY_WAYFARER_PREFAB_ID,
  catalogRevision: "legacy-wayfarer",
  legacy: true,
  description: "Legacy rebuilt Wayfarer r002 (being removed; isolated regression only)",
  blueprintSha256: CURRENT_WAYFARER_STARTER.sha256,
  spawn(ctx, actor, request) {
    if (request.pose.kind !== "berth")
      throw new SenderError("Legacy Wayfarer only supports canonical berths");
    const installed = installReplacementWayfarer(
      ctx as unknown as WayfarerStarterContext,
      actor,
    );
    if (installed.kind !== "created")
      throw Error("Legacy Wayfarer assignment did not install a ship");
    const location = ctx.db.constructionLocation.characterId.find(actor.id);
    return { shipId: installed.actor.shipId, deckId: location?.deckId ?? "" };
  },
});

export function parseSpawnPose(json: string): PrefabSpawnPose {
  if (!json) return { kind: "berth" };
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new SenderError("Spawn pose must be JSON");
  }
  const pose = value as Record<string, unknown>;
  if (pose?.kind === "berth" && Object.keys(pose).length === 1) return { kind: "berth" };
  if (
    pose?.kind === "at" &&
    typeof pose.systemId === "string" &&
    pose.systemId &&
    [pose.x, pose.y, pose.heading].every(
      (v) => typeof v === "number" && Number.isFinite(v),
    ) &&
    Math.abs(pose.x as number) <= 1e12 &&
    Math.abs(pose.y as number) <= 1e12 &&
    Object.keys(pose).length === 5
  )
    return {
      kind: "at",
      systemId: pose.systemId,
      x: pose.x as number,
      y: pose.y as number,
      heading: pose.heading as number,
    };
  throw new SenderError(
    'Spawn pose must be {"kind":"berth"} or {"kind":"at","systemId","x","y","heading"}',
  );
}

/** Shared by the operator reducer and starter onboarding. Validates the
 * awaiting-ship character, archives its before-image and starter receipt,
 * spawns, then re-verifies ownership, access, location, admission, pose and
 * unchanged map rows. Any failure rolls back the whole reducer. */
export function boardPrefabShip(
  ctx: Context,
  actor: CharacterRow,
  spawner: PrefabShipSpawner,
  request: PrefabSpawnRequest,
  operationId: string,
  sequence: { next: number },
) {
  if (actor.shipId !== "")
    throw new SenderError("Character already has a ship; wipe or retire it first");
  if ([...ctx.db.ship.by_owner.filter(actor.owner)].length)
    throw new SenderError("Account already owns a ship");
  if (
    [...ctx.db.character.by_owner.filter(actor.owner)].length !== 1 ||
    ctx.db.constructionLocation.characterId.find(actor.id) ||
    ctx.db.worldAdmission.characterId.find(actor.id) ||
    ctx.db.input.characterId.find(actor.id)
  )
    throw new SenderError("Character presence rows must be clear before boarding");
  const mapBefore = archiveJson(mapRowCounts(ctx.db));
  const receipt = ctx.db.personalStarterReceipt.owner.find(actor.owner);
  if (receipt) {
    // Entitlement history for the removed ship; the spawner may not reuse it.
    archiveRow(ctx.db, operationId, sequence, "personalStarterReceipt", "deleted", receipt);
    ctx.db.personalStarterReceipt.owner.delete(actor.owner);
  }
  archiveRow(ctx.db, operationId, sequence, "character", "updated", actor);

  const { shipId, deckId } = spawner.spawn(ctx, actor, request);

  const boarded = ctx.db.character.id.find(actor.id);
  const ship = ctx.db.ship.id.find(shipId);
  const motion = ctx.db.shipWorldMotion.shipId.find(shipId);
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  const access = ctx.db.gameShipAccess.shipId.find(shipId);
  const owner = actor.owner.toHexString();
  if (
    !boarded ||
    boarded.shipId !== shipId ||
    boarded.owner.toHexString() !== owner ||
    boarded.name !== actor.name ||
    !ship ||
    ship.owner.toHexString() !== owner ||
    !motion ||
    !location ||
    location.instanceId !== shipId ||
    location.deckId !== deckId ||
    !access ||
    access.characterId !== actor.id ||
    access.owner.toHexString() !== owner ||
    access.lifecycle !== "active" ||
    !ctx.db.worldAdmission.characterId.find(actor.id) ||
    [...ctx.db.character.by_owner.filter(actor.owner)].length !== 1
  )
    throw new SenderError("Prefab spawn did not board the character with valid ownership");
  if (
    request.pose.kind === "at" &&
    (motion.systemId !== request.pose.systemId ||
      Math.abs(motion.x - request.pose.x) > 1e-6 ||
      Math.abs(motion.y - request.pose.y) > 1e-6 ||
      Math.abs(motion.heading - request.pose.heading) > 1e-9)
  )
    throw new SenderError("Prefab spawn did not honour the requested pose");
  if (archiveJson(mapRowCounts(ctx.db)) !== mapBefore)
    throw new SenderError("Prefab spawn would change map state; aborted");

  // Personal containers follow their character onto the new ship.
  for (const container of [...ctx.db.inventoryContainer.by_character.filter(actor.id)]) {
    if (container.shipId !== "") continue;
    archiveRow(ctx.db, operationId, sequence, "inventoryContainer", "updated", container);
    ctx.db.inventoryContainer.id.update({ ...container, shipId });
  }
  return {
    shipId,
    shipName: ship.name,
    deckId,
    pose: { systemId: motion.systemId, x: motion.x, y: motion.y, heading: motion.heading },
  };
}

export type AssignPrefabShipArgs = {
  operationId: string;
  characterId: string;
  prefabId: string;
  expectedCatalogRevision: string;
  spawnPoseJson: string;
  expectedCharacterShipId: string;
  allowLegacy: boolean;
};

export function requireSpawner(
  prefabId: string,
  expectedCatalogRevision: string,
  allowLegacy: boolean,
) {
  const spawner = spawners.get(prefabId);
  if (!spawner)
    throw new SenderError(
      `Unknown prefab ship ${prefabId}; registered: ${[...spawners.keys()].join(", ")}`,
    );
  if (spawner.catalogRevision !== expectedCatalogRevision)
    throw new SenderError(
      `Prefab ${prefabId} catalog revision is ${spawner.catalogRevision}, not ${expectedCatalogRevision}`,
    );
  if (spawner.legacy && !allowLegacy)
    throw new SenderError(
      `${prefabId} is a legacy ship being removed; it is only allowed in isolated regression tests`,
    );
  return spawner;
}

export function assignPrefabShip(ctx: Context, args: AssignPrefabShipArgs) {
  requireShipOperator(ctx);
  const request = JSON.stringify({
    characterId: args.characterId,
    prefabId: args.prefabId,
    expectedCatalogRevision: args.expectedCatalogRevision,
    spawnPoseJson: args.spawnPoseJson,
    expectedCharacterShipId: args.expectedCharacterShipId,
    allowLegacy: args.allowLegacy,
  });
  if (priorOperation(ctx.db, ctx.sender, args.operationId, "assign-prefab", request))
    return;
  const spawner = requireSpawner(args.prefabId, args.expectedCatalogRevision, args.allowLegacy);
  const pose = parseSpawnPose(args.spawnPoseJson);
  const actor = ctx.db.character.id.find(args.characterId);
  if (!actor) throw new SenderError("Character not found");
  if (actor.shipId !== args.expectedCharacterShipId)
    throw new SenderError("Character ship changed since the request was prepared");
  const sequence = { next: 0 };
  const result = boardPrefabShip(
    ctx,
    actor,
    spawner,
    { pose, name: actor.name },
    args.operationId,
    sequence,
  );
  ctx.db.shipOperatorOperation.insert({
    operationId: args.operationId,
    principal: ctx.sender,
    kind: "assign-prefab",
    request,
    summaryJson: archiveJson({
      characterId: actor.id,
      characterName: actor.name,
      owner: actor.owner.toHexString(),
      prefabId: spawner.prefabId,
      catalogRevision: spawner.catalogRevision,
      blueprintSha256: spawner.blueprintSha256,
      legacy: spawner.legacy,
      ...result,
      archivedRows: sequence.next,
    }),
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
