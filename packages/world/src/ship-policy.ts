import { SenderError } from "spacetimedb/server";
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import { archiveJson, priorOperation, requireShipOperator } from "./ship-operator";
import { issueWayfarerPersonalKit } from "./wayfarer-personal-kit";
import { boardPrefabShip, prefabShipSpawner, requireSpawner } from "./ship-assign";
import { createWayfarerStarterAuthority } from "./wayfarer-starter-authority";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadDb = {
  shipPolicy: {
    id: {
      find(id: string):
        | { starterPrefabId: string; revision: bigint }
        | null
        | undefined;
    };
  };
};

export const SHIP_POLICY_ID = "global";

/** Configured starter prefab, or "" (the default, also when no policy row
 * exists): new characters never receive a legacy Wayfarer and wait for an
 * operator-assigned ship. */
export function starterPrefabId(ctx: { db: ReadDb }) {
  return ctx.db.shipPolicy.id.find(SHIP_POLICY_ID)?.starterPrefabId ?? "";
}

/** Legacy starter configured (isolated legacy regression only). */
export function legacyStarterConfigured(ctx: { db: ReadDb }) {
  const id = starterPrefabId(ctx);
  return !!id && !!prefabShipSpawner(id)?.legacy;
}

/** A character that exists without any ship: after a wipe, or created while no
 * starter prefab is configured. No frame, no flight input, until boarded. */
export function isAwaitingShip(actor: { shipId: string }) {
  return actor.shipId === "";
}

export function setStarterPrefab(
  ctx: Context,
  args: {
    operationId: string;
    prefabId: string;
    expectedCatalogRevision: string;
    allowLegacy: boolean;
  },
) {
  requireShipOperator(ctx);
  const request = JSON.stringify({
    prefabId: args.prefabId,
    expectedCatalogRevision: args.expectedCatalogRevision,
    allowLegacy: args.allowLegacy,
  });
  if (priorOperation(ctx.db, ctx.sender, args.operationId, "starter-policy", request))
    return;
  if (args.prefabId)
    requireSpawner(args.prefabId, args.expectedCatalogRevision, args.allowLegacy);
  const prior = ctx.db.shipPolicy.id.find(SHIP_POLICY_ID);
  const row = {
    id: SHIP_POLICY_ID,
    starterPrefabId: args.prefabId,
    revision: (prior?.revision ?? 0n) + 1n,
    operationId: args.operationId,
    updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
  };
  if (prior) ctx.db.shipPolicy.id.update(row);
  else ctx.db.shipPolicy.insert(row);
  ctx.db.shipOperatorOperation.insert({
    operationId: args.operationId,
    principal: ctx.sender,
    kind: "starter-policy",
    request,
    summaryJson: archiveJson({
      starterPrefabId: args.prefabId,
      previous: prior ? prior.starterPrefabId : null,
      revision: row.revision,
    }),
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}

/** Persistent character with its personal carried kit and no ship. */
export function createShiplessCharacter(ctx: Context, name: string) {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 40)
    throw new SenderError("Use a character name between 2 and 40 characters");
  if ([...ctx.db.character.by_owner.filter(ctx.sender)].length)
    throw new SenderError("Account already has a character");
  let id = ctx.newUuidV4().toString();
  for (let i = 0; ctx.db.character.id.find(id) || ctx.db.inventoryItem.id.find(id); i++) {
    if (i > 8) throw new SenderError("Fresh character UUID required");
    id = ctx.newUuidV4().toString();
  }
  ctx.db.character.insert({
    id,
    owner: ctx.sender,
    name: clean,
    shipId: "",
    localX: 0,
    localY: 0,
    connected: true,
    sprinting: false,
  });
  issueWayfarerPersonalKit(ctx, id);
  return id;
}

/** New-account onboarding. Never creates a legacy Wayfarer unless the operator
 * explicitly configured the legacy regression starter. With no starter prefab
 * (the default) the character waits for an operator-assigned ship. */
export function onboardNewCharacter(ctx: Context, name: string) {
  const prefabId = starterPrefabId(ctx);
  const spawner = prefabId ? prefabShipSpawner(prefabId) : undefined;
  // Isolated legacy regression only: the historical all-in-one starter writer.
  if (spawner?.legacy) {
    createWayfarerStarterAuthority(ctx, name.trim());
    return [...ctx.db.character.by_owner.filter(ctx.sender)][0]!.id;
  }
  const characterId = createShiplessCharacter(ctx, name);
  if (!spawner) return characterId; // No (or unregistered) starter: wait for a ship.
  const actor = ctx.db.character.id.find(characterId)!;
  boardPrefabShip(
    ctx,
    actor,
    spawner,
    { pose: { kind: "berth" }, name: actor.name },
    `starter:${characterId}`,
    { next: 0 },
  );
  return characterId;
}
