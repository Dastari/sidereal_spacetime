/**
 * Trusted prefab ship installation (SHIPS-PREFABS). No reducer registration: callers are
 * operator reducers (SHIPS-REMOVAL `operator_assign_prefab_ship` via `prefabSpawnerFor`) or
 * smoke-only modules, and they own authorisation.
 *
 * In one transaction it installs a complete ship owned by the character's account from a
 * developer prefab (grammar data -> construction document -> instance -> dormant flight ->
 * activation) and boards the EXISTING character at the prefab spawn deck. It never creates a
 * character, personal kit or starter receipt and never writes map state.
 */
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabStats } from "@sidereal/content/ship-prefab";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import { PREFAB_DECK_ID, prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import { planPrefabConstructionFlight, prefabFlightModelFor } from "@sidereal/sim/prefab-flight";
import { prefabPilotPose, qualifyPilotGeometry } from "@sidereal/sim/construction-pilot";
import { TRUSTED_PREFAB_BLUEPRINT_PREFIX } from "@sidereal/sim/game-ship-access";
import { GAME_OWNED_TEMPLATE_NAMESPACE } from "./game-ship-access-authority";
import { ensureCanonicalSystem, reserveBerth } from "./shared-world";
import { constructionCollision, installDoors } from "./construction-doors";
import { insertQualifiedFlightPlan } from "./construction-flight-writer";
import { compileShipFlight } from "./construction-flight-compilation";
import { readConstructionFlightInput } from "./construction-flight-input";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
import { commitFlightCharacter, markShipFlightDirty } from "./construction-flight-dirty";

type Context = ReducerCtx<InferSchema<typeof world>>;
export type PrefabCharacterRow = NonNullable<ReturnType<Context["db"]["character"]["id"]["find"]>>;

/** Where the new ship appears: a reserved berth, or explicit world XY metres and heading. */
export type PrefabShipPose =
  | { kind: "berth" }
  | { kind: "at"; systemId: string; x: number; y: number; heading: number };

export interface PrefabShipRequest {
  prefabId: string;
  pose: PrefabShipPose;
  /** Gameplay ship name; defaults to the prefab name. */
  name?: string;
}

/** Walking support on prefab decks: native floor top (6/32 m above the deck datum). */
const PREFAB_STANDING_HEIGHT = 0.1875;

/** Canonical construction document and blueprint identity for a developer prefab. */
export function trustedPrefabTemplate(prefabId: string) {
  const prefab = prefabById(prefabId);
  if (!prefab) throw Error("Unknown prefab ship " + prefabId);
  const catalog = defaultPrefabComponentCatalog();
  const snapshot = compileConstruction(JSON.stringify(prefabConstructionDocument(prefab, catalog)));
  return {
    prefab,
    catalogRevision: catalog.revision,
    blueprintRevisionId: `${TRUSTED_PREFAB_BLUEPRINT_PREFIX}${prefab.id}:r${prefab.revision}`,
    snapshot,
  };
}

/** Install and board. Throws (rolling back the transaction) on any failed precondition. */
export function installPrefabShip(ctx: Context, actor: PrefabCharacterRow, request: PrefabShipRequest): { shipId: string; deckId: string } {
  const template = trustedPrefabTemplate(request.prefabId);
  const owner = actor.owner;
  // Every writer below acts for the character's account, not the operator.
  const ownerCtx = new Proxy(ctx, {
    get(target, key) {
      if (key === "sender") return owner;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Context;
  const taken = (id: string) =>
    !!(
      ctx.db.character.id.find(id) ||
      ctx.db.ship.id.find(id) ||
      ctx.db.station.id.find(id) ||
      ctx.db.inventoryItem.id.find(id) ||
      ctx.db.inventoryContainer.id.find(id) ||
      ctx.db.interactionObject.id.find(id) ||
      ctx.db.constructionInstance.id.find(id) ||
      ctx.db.constructionDeck.id.find(id) ||
      ctx.db.constructionFlightFitting.id.find(id)
    );
  const allocate = () => {
    for (let i = 0; i < 8; i++) {
      const id = ctx.newUuidV4().toString();
      if (!taken(id)) return id;
    }
    throw Error("Prefab identity allocation failed");
  };
  const plan = planConstructionInstance(
    template.snapshot,
    {
      blueprintRevisionId: template.blueprintRevisionId,
      expectedBlueprintSha256: template.snapshot.sha256,
      sourceDeckId: PREFAB_DECK_ID,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: [],
    },
    allocate,
  );
  const shipId = plan.instanceId;
  const name = (request.name ?? template.prefab.name).trim().slice(0, 40) || template.prefab.name;
  const documentJson = JSON.stringify(plan.document);
  ctx.db.constructionInstance.insert({
    id: shipId,
    owner,
    workspaceId: GAME_OWNED_TEMPLATE_NAMESPACE,
    blueprintId: plan.blueprintRevisionId,
    blueprintSha256: plan.blueprintSha256,
    name,
    revision: 1n,
    documentJson,
    idMapJson: JSON.stringify(plan.mappings),
    spawnDeckId: plan.spawn.deckId,
    spawnX: plan.spawn.positionM[0],
    spawnY: plan.spawn.positionM[1],
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  for (const deck of plan.document.layout.decks) {
    const source = plan.mappings.decks.find((m) => m.instanceId === deck.id);
    if (!source) throw Error("Prefab source deck mapping missing");
    ctx.db.constructionDeck.insert({
      id: deck.id,
      instanceId: shipId,
      sourceDeckId: source.sourceId,
      name: deck.name,
      elevation: deck.elevation / 32,
      ceiling: deck.ceiling / 32,
    });
  }
  installDoors(ctx, shipId, plan.document);

  // Placement: a berth sized for this hull, or the caller's explicit pose.
  const model = prefabFlightModelFor(`${shipId}:${plan.blueprintSha256}`, documentJson);
  const system = ensureCanonicalSystem(ctx.db);
  const serverTick = ctx.timestamp.microsSinceUnixEpoch / 50_000n;
  const placement =
    request.pose.kind === "berth"
      ? { systemId: system.id, ...reserveBerth(ctx.db, system.id, model.hull.radius + model.hull.halfLength), serverTick }
      : { systemId: request.pose.systemId, x: request.pose.x, y: request.pose.y, serverTick };
  const flight = planPrefabConstructionFlight(
    { id: shipId, revision: 1n, blueprintSha256: plan.blueprintSha256, documentJson, spawnDeckId: plan.spawn.deckId, name },
    placement,
    allocate,
  );
  insertQualifiedFlightPlan(ownerCtx, flight);
  const ship = ctx.db.ship.id.find(shipId)!;
  const heading = request.pose.kind === "at" ? request.pose.heading : 0;
  ctx.db.ship.id.update({ ...ship, name, heading });
  if (heading) {
    const motion = ctx.db.shipWorldMotion.shipId.find(shipId)!;
    ctx.db.shipWorldMotion.shipId.update({ ...motion, heading });
  }

  // Activation: the same compile -> dormant -> pilot geometry -> active sequence as the starter.
  const binding = ctx.db.constructionFlightBinding.shipId.find(shipId);
  const instance = ctx.db.constructionInstance.id.find(shipId)!;
  const station = ctx.db.station.id.find(flight.station.id);
  const mapping = ctx.db.constructionFlightStation.stationId.find(flight.station.id);
  if (!binding || !station || !mapping || binding.lifecycle !== "installed-dormant" || station.occupantId || station.operational)
    throw Error("Complete empty dormant prefab flight required");
  compileShipFlight(ctx.db, shipId, (id) => readConstructionFlightInput(ctx, id));
  const definition = resolveShipFlightDefinition(
    {
      binding: () => binding,
      constructionInstanceExists: () => true,
      currentInstanceRevision: () => instance.revision,
      fittings: (id) => ctx.db.constructionFlightFitting.by_ship.filter(id),
      compiled: (id) => ctx.db.constructionFlightCompiled.shipId.find(id),
      dirty: (id) => !!ctx.db.constructionFlightDirty.shipId.find(id),
    },
    shipId,
  );
  if (definition.status !== "dormant") throw Error("Prefab flight definition required: " + definition.reason);
  qualifyPilotGeometry({
    instance,
    frame: constructionCollision(ctx, instance, binding.deckId),
    seatPlacedObjectId: mapping.seatPlacedObjectId,
    supportHeightAt: () => PREFAB_STANDING_HEIGHT,
    pose: prefabPilotPose([station.localX, station.localY]),
  });
  ctx.db.station.id.update({ ...station, operational: true });
  ctx.db.constructionFlightBinding.shipId.update({ ...binding, lifecycle: "active", revision: binding.revision + 1n });

  // Board the existing character.
  const [x, y] = plan.spawn.positionM;
  commitFlightCharacter(ctx, { ...actor, shipId, localX: x, localY: y, sprinting: false }, (row) => ctx.db.character.id.update(row));
  markShipFlightDirty(ctx, shipId);
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  const locationRow = {
    characterId: actor.id,
    visitId: ctx.newUuidV4().toString(),
    instanceId: shipId,
    deckId: plan.spawn.deckId,
    returnShipId: "",
    returnX: 0,
    returnY: 0,
    revision: (location?.revision ?? 0n) + 1n,
  };
  if (location) ctx.db.constructionLocation.characterId.update(locationRow);
  else ctx.db.constructionLocation.insert(locationRow);
  const input = ctx.db.input.characterId.find(actor.id);
  const inputRow = { characterId: actor.id, sequence: input?.sequence ?? 0n, throttle: 0, turn: 0, dx: 0, dy: 0, updatedMicros: ctx.timestamp.microsSinceUnixEpoch, sprint: false };
  if (input) ctx.db.input.characterId.update(inputRow);
  else ctx.db.input.insert(inputRow);
  const admission = ctx.db.worldAdmission.characterId.find(actor.id);
  const admissionRow = { characterId: actor.id, owner, shipId, systemId: flight.motion.systemId, revision: (admission?.revision ?? 0n) + 1n };
  if (admission) ctx.db.worldAdmission.characterId.update(admissionRow);
  else ctx.db.worldAdmission.insert(admissionRow);
  ctx.db.gameShipAccess.insert({
    shipId,
    instanceId: shipId,
    owner,
    characterId: actor.id,
    deckId: plan.spawn.deckId,
    templateSha256: plan.blueprintSha256,
    instanceRevision: 1n,
    lifecycle: "active",
  });
  return { shipId, deckId: plan.spawn.deckId };
}

/**
 * Spawner in the shape of SHIPS-REMOVAL's `PrefabShipSpawner` (packages/world/src/ship-assign.ts
 * on feat/ship-removal-operator-tools); register with `registerPrefabShipSpawner`.
 */
export function prefabSpawnerFor(prefabId: string) {
  const template = trustedPrefabTemplate(prefabId);
  const stats = prefabStats(template.prefab, defaultPrefabComponentCatalog());
  return {
    prefabId,
    catalogRevision: template.catalogRevision,
    blueprintSha256: template.snapshot.sha256,
    legacy: false as const,
    description: `${template.prefab.name} (${template.prefab.faction} ${template.prefab.role}, size ${template.prefab.sizeClass}, ${stats.lengthM}x${stats.beamM} m)`,
    spawn: (ctx: Context, actor: PrefabCharacterRow, request: { pose: PrefabShipPose; name: string }) =>
      installPrefabShip(ctx, actor, { prefabId, pose: request.pose, name: request.name }),
  };
}

/** The small ships offered to the owner as starters. */
export const STARTER_PREFAB_IDS = ["fed.s.wren", "rj.s.jackal", "au.s.lumen"] as const;
