import { SenderError } from "spacetimedb/server";
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import { priorOperation, requireShipOperator } from "./ship-operator";
import { issueWayfarerPersonalKit } from "./wayfarer-personal-kit";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadDb = {
  shipPolicy: {
    id: { find(id: string): { starterShipsEnabled: boolean } | null | undefined };
  };
};

export const SHIP_POLICY_ID = "global";

/** Absent policy row keeps the historical behaviour, so publishing this module
 * changes nothing until the operator explicitly disables starter ships. */
export function starterShipsEnabled(ctx: { db: ReadDb }) {
  return ctx.db.shipPolicy.id.find(SHIP_POLICY_ID)?.starterShipsEnabled ?? true;
}

/** A character that exists without any ship: after a wipe, or created while
 * starter ships are disabled. It has no frame to walk in and no flight input
 * until an operator assigns a ship. */
export function isAwaitingShip(actor: { shipId: string }) {
  return actor.shipId === "";
}

export function setStarterShipPolicy(
  ctx: Context,
  args: { operationId: string; enabled: boolean },
) {
  requireShipOperator(ctx);
  const request = JSON.stringify({ enabled: args.enabled });
  if (priorOperation(ctx.db, ctx.sender, args.operationId, "starter-policy", request))
    return;
  const prior = ctx.db.shipPolicy.id.find(SHIP_POLICY_ID);
  const row = {
    id: SHIP_POLICY_ID,
    starterShipsEnabled: args.enabled,
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
    summaryJson: JSON.stringify({
      starterShipsEnabled: args.enabled,
      previous: prior ? prior.starterShipsEnabled : null,
      revision: row.revision.toString(),
    }),
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}

/** Onboarding while starter ships are disabled: a persistent character with its
 * personal carried kit and no ship, in the awaiting-ship state. */
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
