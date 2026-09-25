import { SenderError } from "spacetimedb/server";
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import { CURRENT_WAYFARER_STARTER } from "../../content/src/wayfarer-current-starter";
import {
  archiveJson,
  priorOperation,
  requireShipOperator,
} from "./ship-operator";
import { archiveUpdate } from "./ship-wipe";
import { isAwaitingShip } from "./ship-policy";
import {
  installReplacementWayfarer,
  type WayfarerStarterContext,
} from "./wayfarer-starter-authority";

type Context = ReducerCtx<InferSchema<typeof world>>;
type CharacterRow = NonNullable<
  ReturnType<Context["db"]["character"]["id"]["find"]>
>;

/** Server-side spawn path for one published prefab ship. A spawner installs a
 * complete ship owned by `actor.owner` in the shared system and boards the
 * existing character at the prefab's spawn deck in the same transaction:
 * character.shipId/localX/localY, construction_location, input,
 * world_admission and an active game_ship_access row. It must never create a
 * new character, touch another account's rows or write map/system state. */
export interface PrefabShipSpawner {
  readonly prefabId: string;
  /** Legacy templates are the ships being removed; they need explicit opt-in. */
  readonly legacy: boolean;
  readonly description: string;
  readonly blueprintSha256: string;
  spawn(ctx: Context, actor: CharacterRow): { shipId: string };
}

const spawners = new Map<string, PrefabShipSpawner>();

/** Prefab ship work (SHIPS-PREFABS) registers its published blueprints here at
 * module load. Duplicate IDs are a programming error. */
export function registerPrefabShipSpawner(spawner: PrefabShipSpawner) {
  if (!/^[a-z0-9][a-z0-9.-]{2,63}$/.test(spawner.prefabId))
    throw Error("Invalid prefab ship ID " + spawner.prefabId);
  if (spawners.has(spawner.prefabId))
    throw Error("Duplicate prefab ship spawner " + spawner.prefabId);
  spawners.set(spawner.prefabId, spawner);
}

export function prefabShipSpawners() {
  return [...spawners.values()];
}

/** Stand-in that proves the assignment path against the only template this
 * authority can qualify today (the r002 rebuilt Wayfarer). It is marked legacy:
 * assigning it re-introduces the ship being removed, so the reducer refuses it
 * unless `allowLegacy` is set. Used by tests and smoke, not by the runbook. */
export const LEGACY_WAYFARER_PREFAB_ID = "legacy-wayfarer-r002";
registerPrefabShipSpawner({
  prefabId: LEGACY_WAYFARER_PREFAB_ID,
  legacy: true,
  description: "Legacy rebuilt Wayfarer r002 (stand-in; being removed)",
  blueprintSha256: CURRENT_WAYFARER_STARTER.sha256,
  spawn(ctx, actor) {
    // The starter writer treats an existing entitlement receipt as "already
    // issued". The wiped ship's receipt is archived by the caller before this.
    const installed = installReplacementWayfarer(
      ctx as unknown as WayfarerStarterContext,
      actor,
    );
    if (installed.kind !== "created")
      throw Error("Legacy Wayfarer assignment did not install a ship");
    return { shipId: installed.actor.shipId };
  },
});

export type AssignPrefabShipArgs = {
  operationId: string;
  characterId: string;
  prefabId: string;
  expectedCharacterShipId: string;
  allowLegacy: boolean;
};

export function assignPrefabShip(ctx: Context, args: AssignPrefabShipArgs) {
  requireShipOperator(ctx);
  const request = JSON.stringify({
    characterId: args.characterId,
    prefabId: args.prefabId,
    expectedCharacterShipId: args.expectedCharacterShipId,
    allowLegacy: args.allowLegacy,
  });
  if (priorOperation(ctx.db, ctx.sender, args.operationId, "assign-prefab", request))
    return;
  const spawner = spawners.get(args.prefabId);
  if (!spawner)
    throw new SenderError(
      `Unknown prefab ship ${args.prefabId}; registered: ${[...spawners.keys()].join(", ")}`,
    );
  if (spawner.legacy && !args.allowLegacy)
    throw new SenderError(
      `${args.prefabId} is a legacy ship being removed; pass allowLegacy only for tests`,
    );
  const actor = ctx.db.character.id.find(args.characterId);
  if (!actor) throw new SenderError("Character not found");
  if (actor.shipId !== args.expectedCharacterShipId)
    throw new SenderError("Character ship changed since the request was prepared");
  if (!isAwaitingShip(actor))
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

  const sequence = { next: 0 };
  const op = args.operationId;
  const receipt = ctx.db.personalStarterReceipt.owner.find(actor.owner);
  if (receipt) {
    ctx.db.shipWipeArchive.insert({
      id: `${op}:${String(sequence.next++).padStart(7, "0")}`,
      operationId: op,
      tableName: "personalStarterReceipt",
      action: "deleted",
      rowJson: archiveJson(receipt),
    });
    ctx.db.personalStarterReceipt.owner.delete(actor.owner);
  }
  archiveUpdate(ctx, op, sequence, "character", actor as never);

  const { shipId } = spawner.spawn(ctx, actor);

  const boarded = ctx.db.character.id.find(actor.id);
  const ship = ctx.db.ship.id.find(shipId);
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  const access = ctx.db.gameShipAccess.shipId.find(shipId);
  if (
    !boarded ||
    boarded.shipId !== shipId ||
    boarded.owner.toHexString() !== actor.owner.toHexString() ||
    boarded.name !== actor.name ||
    !ship ||
    ship.owner.toHexString() !== actor.owner.toHexString() ||
    !location ||
    location.instanceId !== shipId ||
    !access ||
    access.characterId !== actor.id ||
    access.owner.toHexString() !== actor.owner.toHexString() ||
    access.lifecycle !== "active" ||
    !ctx.db.worldAdmission.characterId.find(actor.id)
  )
    throw new SenderError("Prefab spawn did not board the character with valid ownership");

  // Personal containers follow their character onto the new ship.
  for (const container of [...ctx.db.inventoryContainer.by_character.filter(actor.id)]) {
    if (container.shipId !== "") continue;
    archiveUpdate(ctx, op, sequence, "inventoryContainer", container as never);
    ctx.db.inventoryContainer.id.update({ ...container, shipId });
  }

  ctx.db.shipOperatorOperation.insert({
    operationId: op,
    principal: ctx.sender,
    kind: "assign-prefab",
    request,
    summaryJson: archiveJson({
      characterId: actor.id,
      characterName: actor.name,
      owner: actor.owner.toHexString(),
      prefabId: spawner.prefabId,
      blueprintSha256: spawner.blueprintSha256,
      shipId,
      shipName: ship.name,
      deckId: location.deckId,
      archivedRows: sequence.next,
    }),
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
