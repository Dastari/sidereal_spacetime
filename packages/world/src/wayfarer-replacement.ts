import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import { CURRENT_WAYFARER_STARTER } from "@sidereal/content/wayfarer-current-starter";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { requireWayfarerReplacementOperator } from "./wayfarer-replacement-operator";
import { installReplacementWayfarer } from "./wayfarer-starter-authority";

type Context = ReducerCtx<InferSchema<typeof world>>;
/** Explicit runtime scope. Authentication, characters/appearance, authoring documents,
 * global celestial state and historical operation/audit records are excluded. */
export const REPLACED_SHIP_TABLES = [
  "inventoryState",
  "inventoryItem",
  "inventoryContainer",
  "inventoryHotbar",
  "characterUniformIssue",
  "inventoryContainerScope",
  "inventoryItemMembership",
  "instanceInventoryBinding",
  "storageBinding",
  "combatAim",
  "weaponEnergy",
  "couchSeat",
  "interactionObject",
  "constructionInteractionBinding",
  "input",
  "inputControl",
  "inputControlCursor",
  "station",
  "ship",
  "spaceBody",
  "actuatorOutput",
  "shipWorldMotion",
  "gameShipAccess",
  "worldAdmission",
  "legacyBodyAlias",
  "constructionLocation",
  "constructionPilotSeat",
  "constructionFlightReview",
  "constructionReviewOrigin",
  "constructionTraversal",
  "constructionTraversalReservation",
  "constructionTraversalLink",
  "constructionTraversalClock",
  "constructionStairLink",
  "constructionStairWalk",
  "constructionStairReservation",
  "constructionAtmosphere",
  "constructionNativePressure",
  "constructionAtmosphereClock",
  "constructionInstance",
  "constructionDeck",
  "constructionDoor",
  "constructionAirlock",
  "constructionFlightBinding",
  "constructionFlightFitting",
  "constructionFlightStation",
  "constructionFlightCompiled",
  "constructionFlightDirty",
  "constructionFlightDamageEvent",
  "constructionFlightConsumption",
  "constructionPassengerGrant",
  "wayfarerRefitAttachment",
  "constructionCargoAssembly",
  "constructionCargoGrid",
  "constructionCargoPlacement",
  "personalStarterReceipt",
] as const satisfies readonly (keyof Context["db"])[];
const references = new Set([
  "id",
  "characterId",
  "rootCharacterId",
  "shipId",
  "instanceId",
  "sourceInstanceId",
  "targetInstanceId",
  "fromInstanceId",
  "toInstanceId",
  "returnShipId",
  "containerId",
  "parentContainerId",
  "sourceContainerId",
  "targetContainerId",
  "itemId",
  "parentItemId",
  "objectId",
  "placedObjectId",
  "stationId",
  "deckId",
  "sourceDeckId",
  "targetDeckId",
  "fromDeckId",
  "toDeckId",
  "linkId",
  "reservationId",
  "assemblyId",
  "gridId",
  "bodyId",
]);
type Row = Record<string, unknown>;
/** Bounded dependency closure over UUID references, never owner identity or JSON text. */
export function replacementRows(
  entries: readonly { table: string; row: Row }[],
  characterId: string,
  shipId: string,
) {
  if (entries.length > 100000) throw Error("Replacement scan budget exceeded");
  const ids = new Set([characterId, shipId]),
    selected = new Set<number>();
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    entries.forEach(({ row }, i) => {
      if (
        selected.has(i) ||
        !Object.entries(row).some(
          ([key, value]) =>
            references.has(key) && typeof value === "string" && ids.has(value),
        )
      )
        return;
      selected.add(i);
      if (typeof row.id === "string" && row.id) ids.add(row.id);
      // These rows are keyed by another entity's UUID. Follow only their primary
      // entity keys; never follow destination/owner keys into another ship.
      for (const key of ["containerId", "itemId", "objectId", "placedObjectId"])
        if (typeof row[key] === "string" && row[key])
          ids.add(row[key] as string);
      changed = true;
    });
    if (!changed) return [...selected].map((i) => entries[i]);
  }
  throw Error("Replacement dependency budget exceeded");
}
export function replacePlayerWayfarer(
  ctx: Context,
  args: {
    characterId: string;
    expectedShipId: string;
    expectedShipRevision: bigint;
  },
) {
  requireWayfarerReplacementOperator(ctx);
  const key = `wayfarer-r002-replacement:${args.characterId}`;
  const request = JSON.stringify({
    ...args,
    expectedShipRevision: String(args.expectedShipRevision),
    target: CURRENT_WAYFARER_STARTER.sha256,
  });
  const prior = ctx.db.constructionReceipt.id.find(key);
  if (prior) {
    if (!prior.principal.isEqual(ctx.sender) || prior.request !== request)
      throw Error("Replacement receipt conflict");
    return;
  }
  const actor = ctx.db.character.id.find(args.characterId);
  const ship = ctx.db.ship.id.find(args.expectedShipId);
  if (
    !actor ||
    !ship ||
    actor.shipId !== ship.id ||
    !actor.owner.isEqual(ship.owner) ||
    ship.revision !== args.expectedShipRevision
  )
    throw Error("Player ship revision or ownership changed");
  if (
    [...ctx.db.character.iter()].filter((a) => a.shipId === ship.id).length !==
    1
  )
    throw Error("Replacement requires one personal character aboard");
  const instance = ctx.db.constructionInstance.id.find(ship.id);
  if (instance && instance.blueprintSha256 !== WAYFARER_STARTER.sha256)
    throw Error("Only legacy player Wayfarers are eligible for this migration");
  if (
    ctx.db.constructionReviewOrigin.characterId.find(actor.id) ||
    ctx.db.constructionFlightReview.characterId.find(actor.id)
  )
    throw Error("Finish temporary construction review before replacement");
  let passengerVisits = 0;
  for (const visit of ctx.db.constructionPassengerVisit.iter()) {
    if (++passengerVisits > 128)
      throw Error("Passenger replacement check budget exceeded");
    if (
      visit.characterId === actor.id ||
      visit.shipId === ship.id ||
      visit.sourceShipId === ship.id
    )
      throw Error("Finish passenger return before replacement");
  }
  const entries: { table: (typeof REPLACED_SHIP_TABLES)[number]; row: Row }[] =
    [];
  for (const table of REPLACED_SHIP_TABLES) {
    for (const row of ctx.db[table].iter()) {
      if (entries.length >= 100000)
        throw Error("Replacement scan budget exceeded");
      entries.push({ table, row: row as unknown as Row });
    }
  }
  const removed = replacementRows(entries, actor.id, ship.id);
  for (const { table, row } of removed) {
    if (
      (table === "ship" || table === "constructionInstance") &&
      row.id !== ship.id
    )
      throw Error("Replacement would cross into another ship");
    if (
      table === "inventoryContainer" &&
      row.characterId &&
      row.characterId !== actor.id &&
      row.shipId !== ship.id
    )
      throw Error("Replacement would cross into another character's inventory");
  }
  // Deletes and the complete qualified installation share this reducer transaction.
  // Any failed geometry, cargo, flight, kit or receipt check rolls all of it back.
  for (const { table, row } of removed)
    (
      ctx.db[table as (typeof REPLACED_SHIP_TABLES)[number]] as unknown as {
        delete(row: Row): boolean;
      }
    ).delete(row);
  const installed = installReplacementWayfarer(ctx, actor);
  if (installed.kind !== "created")
    throw Error("Replacement did not install a new ship");
  ctx.db.constructionReceipt.insert({
    id: key,
    principal: ctx.sender,
    request,
    resultId: installed.actor.shipId,
    revision: 1n,
  });
}
