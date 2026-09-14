import { markShipFlightDirty } from "./construction-flight-dirty";
import { requireQualifiedPreservedFuelMount } from "@sidereal/sim/wayfarer-refit-mount";
import type {
  Infer,
  InferSchema,
  ReducerCtx,
  ViewCtx,
} from "spacetimedb/server";
import type world from "./index";
import {
  wayfarerRefitReceipt,
  wayfarerRefitAttachment,
} from "./wayfarer-refit-tables";
import { requireGame } from "./auth";
import {
  auditWayfarerRefitStorage,
  REFIT_FUEL_ATTACHMENT,
  type RefitContainer,
} from "@sidereal/sim/wayfarer-refit-audit";
import { planWayfarerRefit } from "@sidereal/sim/wayfarer-refit";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import {
  INVENTORY_DEFINITIONS,
  LIQUID_DENSITY_KG_PER_LITRE,
  CHARACTER_CARRY_LIMIT_KG,
} from "@sidereal/content/inventory";
import { validateInventory } from "@sidereal/sim/inventory";
import { ownedGameShipAccess } from "./game-ship-access-authority";
import { planLegacyInventoryMetadata } from "./scoped-inventory-migration";
import { synchronizeLegacyInventory } from "./scoped-inventory-authority";
import { QUALIFIED_CARGO_APPROACHES } from "./scoped-inventory-installation";
import { qualifyCargoAccessPoint } from "./scoped-inventory";
import { wayfarerThresholdElevation } from "@sidereal/sim/wayfarer-threshold";
import { installDoors } from "./construction-doors";
import { qualifyPilotGeometry } from "@sidereal/sim/construction-pilot";

type Base = ReducerCtx<InferSchema<typeof world>>;
export type RefitReadContext = Pick<
  ViewCtx<InferSchema<typeof world>>,
  "db" | "sender"
>;
type Receipt = Infer<typeof wayfarerRefitReceipt.rowType>;
type Attachment = Infer<typeof wayfarerRefitAttachment.rowType>;
export type RefitContext = Omit<Base, "db"> & {
  db: Base["db"] & {
    wayfarerRefitReceipt: {
      shipId: { find(id: string): Receipt | undefined | null };
      insert(row: Receipt): unknown;
    };
    wayfarerRefitAttachment: {
      id: { find(id: string): Attachment | undefined | null };
      by_instance: { filter(id: string): Iterable<Attachment> };
      insert(row: Attachment): unknown;
    };
  };
};
export interface RefitRequest {
  shipId: string;
  expectedShipRevision: bigint;
  expectedInventoryRevision: bigint;
  fingerprint: string;
  operationId: string;
}
const serialize = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
const sorted = <T extends { id: string }>(rows: Iterable<T>) =>
  [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
function snapshot(ctx: RefitReadContext, shipId: string) {
  const actors = [...ctx.db.character.by_owner.filter(ctx.sender)],
    actor = actors[0],
    ship = ctx.db.ship.id.find(shipId),
    station = ctx.db.station.shipId.find(shipId);
  if (
    actors.length !== 1 ||
    !actor?.connected ||
    actor.shipId !== shipId ||
    !ship?.owner.isEqual(ctx.sender) ||
    !station
  )
    throw Error("Owned connected legacy ship required");
  if (
    ctx.db.constructionInstance.id.find(shipId) ||
    ctx.db.gameShipAccess.shipId.find(shipId) ||
    ctx.db.constructionLocation.characterId.find(actor.id)
  )
    throw Error("Ship already authored or actor is visiting another instance");
  if (ctx.db.constructionReviewOrigin.characterId.find(actor.id))
    throw Error("Finish current construction review before refit");
  if (station.occupantId || ctx.db.couchSeat.characterId.find(actor.id))
    throw Error("Release active controls and stand before refit");
  const command = ctx.db.input.characterId.find(actor.id);
  if (
    command &&
    (command.dx ||
      command.dy ||
      command.throttle ||
      command.turn ||
      command.sprint)
  )
    throw Error("Stop movement before refit");
  const admission = ctx.db.worldAdmission.characterId.find(actor.id),
    motion = ctx.db.shipWorldMotion.shipId.find(shipId);
  if (
    !admission ||
    admission.shipId !== shipId ||
    !admission.owner.isEqual(ctx.sender) ||
    !motion ||
    motion.systemId !== admission.systemId
  )
    throw Error("Join the shared system explicitly before refitting");
  const items = sorted(ctx.db.inventoryItem.by_character.filter(actor.id)),
    containers = sorted(
      ctx.db.inventoryContainer.by_character.filter(actor.id),
    );
  const bindings = sorted(ctx.db.storageBinding.by_character.filter(actor.id));
  const interactions = sorted(ctx.db.interactionObject.by_ship.filter(shipId));
  const state = ctx.db.inventoryState.characterId.find(actor.id);
  if (items.length || containers.length) {
    const pockets = containers.find(
      (c) => c.carried && !c.parentItemId && c.kind === "grid",
    );
    if (!pockets) throw Error("Complete personal inventory required");
    validateInventory(
      { items, containers },
      INVENTORY_DEFINITIONS,
      LIQUID_DENSITY_KG_PER_LITRE,
      pockets.id,
      CHARACTER_CARRY_LIMIT_KG,
    );
  }
  const storage = auditWayfarerRefitStorage({
    characterId: actor.id,
    shipId,
    items,
    containers: containers as RefitContainer[],
    bindings: bindings.map((b) => ({
      containerId: b.containerId,
      sourcePlacementId: b.placementId,
    })),
  });
  const fingerprint = constructionHash(
    serialize({
      actorId: actor.id,
      shipId,
      station,
      shipRevision: ship.revision,
      inventoryRevision: state?.revision ?? 0n,
      items,
      containers,
      bindings,
      interactions,
    }),
  );
  return {
    actor,
    ship,
    station,
    admission,
    motion,
    items,
    containers,
    bindings,
    interactions,
    state,
    storage,
    fingerprint,
  };
}
export function ownWayfarerRefitOffer(ctx: RefitReadContext) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor) return [];
  if (ctx.db.gameShipAccess.shipId.find(actor.shipId)) return [];
  try {
    const s = snapshot(ctx, actor.shipId);
    return [
      {
        shipId: s.ship.id,
        characterId: s.actor.id,
        expectedShipRevision: s.ship.revision,
        expectedInventoryRevision: s.state?.revision ?? 0n,
        fingerprint: s.fingerprint,
        status: "ready",
      },
    ];
  } catch (error) {
    return [
      {
        shipId: actor.shipId,
        characterId: actor.id,
        expectedShipRevision: 0n,
        expectedInventoryRevision: 0n,
        fingerprint: "",
        status: String(error).replace(/^Error: /, ""),
      },
    ];
  }
}
/** Full transaction: exceptions propagate, including any late scope/receipt write.
 * No reset, replacement ship, new cargo contents or authoring grant is created. */
export function refitExistingWayfarer(ctx: RefitContext, args: RefitRequest) {
  requireGame(ctx);
  if (
    !/^[0-9a-f-]{36}$/i.test(args.operationId) ||
    args.fingerprint.length !== 64
  )
    throw Error("Valid operation and state fingerprint required");
  const request = serialize(args),
    old = ctx.db.wayfarerRefitReceipt.shipId.find(args.shipId);
  if (old) {
    if (!old.owner.isEqual(ctx.sender) || old.request !== request)
      throw Error("Ship already converted or refit operation differs");
    return old;
  }
  const s = snapshot(ctx, args.shipId);
  if (
    s.ship.revision !== args.expectedShipRevision ||
    (s.state?.revision ?? 0n) !== args.expectedInventoryRevision ||
    s.fingerprint !== args.fingerprint
  )
    throw Error("Refit state changed; review the current offer");
  for (const root of s.storage.rootBindings)
    if (
      root.requiresAttachment &&
      (root.conserved.capacityLitres !== 100 || root.conserved.maxMassKg !== 80)
    )
      throw Error("Changed fuel mount ratings require explicit qualification");
  for (const root of s.storage.rootBindings)
    if (root.requiresAttachment)
      requireQualifiedPreservedFuelMount({
        baseSha256: WAYFARER_STARTER.sha256,
        assetId: REFIT_FUEL_ATTACHMENT.assetId,
        assetSha256: REFIT_FUEL_ATTACHMENT.glbSha256,
        x: -3,
        y: 7,
        z: 0.1875,
        capacityLitres: root.conserved.capacityLitres,
        maxMassKg: root.conserved.maxMassKg,
      });
  const p = planWayfarerRefit({
    shipId: s.ship.id,
    stationId: s.station.id,
    actorPosition: [s.actor.localX, s.actor.localY],
    systemId: s.motion.systemId,
    x: s.motion.x,
    y: s.motion.y,
    serverTick: s.motion.serverTick,
    hasFuel: s.storage.rootBindings.some((b) => b.requiresAttachment),
    allocateUuid: () => ctx.newUuidV4().toString(),
    identityExists: (id) =>
      !!(
        ctx.db.character.id.find(id) ||
        ctx.db.ship.id.find(id) ||
        ctx.db.station.id.find(id) ||
        ctx.db.constructionInstance.id.find(id) ||
        ctx.db.constructionDeck.id.find(id) ||
        ctx.db.inventoryItem.id.find(id) ||
        ctx.db.inventoryContainer.id.find(id) ||
        ctx.db.interactionObject.id.find(id) ||
        ctx.db.constructionFlightFitting.id.find(id)
      ),
  });
  for (const key of ["massKg", "thrustN", "turnAcceleration"] as const)
    if (s.ship[key] !== p.flight.ship[key])
      throw Error(
        "Changed legacy flight ratings require a separate qualified conversion",
      );
  // Telemetry is a replaceable projection, not an installed component identity.
  // Legacy output keys use source labels; native outputs use fitting UUIDs.
  // Reject unknown keys, then replace the complete set atomically so obsolete
  // commands cannot survive conversion or appear beside the new nine outputs.
  const oldOutputs = [...ctx.db.actuatorOutput.by_ship.filter(s.ship.id)];
  const sourceActuators = new Set(
    p.flight.actuators.map((a) => a.sourceDeviceId),
  );
  if (
    oldOutputs.some(
      (o) =>
        !sourceActuators.has(o.actuatorId) ||
        o.id !== `${s.ship.id}:${o.actuatorId}`,
    )
  )
    throw Error("Legacy actuator telemetry mapping requires explicit review");
  const objects = new Map(
    p.instance.mappings.objects.map((m) => [m.sourceId, m.instanceId]),
  );
  const rootPlan = s.storage.rootBindings.map((b) => {
    const placed = b.requiresAttachment
      ? p.attachmentId
      : objects.get(b.sourcePlacementId);
    if (!placed) throw Error("Conserved cargo placement missing");
    const point = b.requiresAttachment
      ? REFIT_FUEL_ATTACHMENT.approachM
      : QUALIFIED_CARGO_APPROACHES[b.sourcePlacementId];
    if (!point) throw Error("Conserved cargo access point missing");
    const scope = {
      kind: "instance" as const,
      instanceId: s.ship.id,
      deckId: p.instance.spawn.deckId,
      placedObjectId: placed,
      instanceRevision: 1n,
      accessPointM: [
        point[0],
        point[1],
        wayfarerThresholdElevation(...point),
      ] as const,
    };
    if (
      !qualifyCargoAccessPoint(scope, {
        instanceRevision: 1n,
        frame: p.frame,
        supportHeightAt: wayfarerThresholdElevation,
      })
    )
      throw Error("Conserved root lacks qualified access");
    return { b, placed, scope };
  });
  const allowedInteractions = new Set([
    "room-lounge",
    "room-hydroponics-tray--2.4",
    "room-hydroponics-tray--1.5",
    "room-hydroponics-tray--0.6",
  ]);
  const seen = new Set<string>();
  for (const o of s.interactions) {
    if (
      !allowedInteractions.has(o.placementId) ||
      !objects.has(o.placementId) ||
      seen.has(o.placementId)
    )
      throw Error("Legacy interaction mapping requires explicit review");
    seen.add(o.placementId);
  }
  const i = p.instance,
    instance = {
      id: s.ship.id,
      owner: ctx.sender,
      workspaceId: "trusted-starter-templates",
      blueprintId: i.blueprintRevisionId,
      blueprintSha256: i.blueprintSha256,
      name: i.document.layout.name,
      revision: 1n,
      documentJson: JSON.stringify(i.document),
      idMapJson: JSON.stringify(i.mappings),
      spawnDeckId: i.spawn.deckId,
      spawnX: s.actor.localX,
      spawnY: s.actor.localY,
      createdMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
  qualifyPilotGeometry({
    instance,
    frame: p.frame,
    seatPlacedObjectId: p.flight.station.placedObjectId,
    supportHeightAt: wayfarerThresholdElevation,
  });
  const metadata = planLegacyInventoryMetadata(
    s.actor.id,
    { items: s.items, containers: s.containers },
    { items: s.items, containers: s.containers },
  );
  // All conservation, shape, permissions and revision checks completed above.
  ctx.db.constructionInstance.insert(instance);
  for (const deck of i.document.layout.decks)
    ctx.db.constructionDeck.insert({
      id: deck.id,
      instanceId: instance.id,
      sourceDeckId: i.mappings.decks.find((m) => m.instanceId === deck.id)!
        .sourceId,
      name: deck.name,
      elevation: deck.elevation / 32,
      ceiling: deck.ceiling / 32,
    });
  installDoors(ctx, instance.id, i.document);
  synchronizeLegacyInventory(ctx, s.actor.id, {
    items: s.items,
    containers: s.containers,
  });
  for (const { b, placed, scope } of rootPlan) {
    for (const m of metadata.containerMembership.filter(
      (m) => m.rootContainerId === b.containerId,
    )) {
      const c = ctx.db.inventoryContainer.id.find(m.containerId)!,
        oldScope = ctx.db.inventoryContainerScope.containerId.find(c.id)!;
      ctx.db.inventoryContainer.id.update({
        ...c,
        characterId: "",
        ...(c.id === b.containerId
          ? { localX: b.targetM[0], localY: b.targetM[1] }
          : {}),
      });
      ctx.db.inventoryContainerScope.containerId.update({
        ...oldScope,
        rootKind: "instance",
        rootCharacterId: "",
        instanceId: instance.id,
        deckId: i.spawn.deckId,
        placedObjectId: placed,
        instanceRevision: 1n,
        definitionRevision: b.requiresAttachment
          ? "preserved-fuel-floor-mount-v1"
          : "preserved-legacy-cargo-v1",
        accessX: scope.accessPointM[0],
        accessY: scope.accessPointM[1],
        accessZ: scope.accessPointM[2],
        revision: oldScope.revision + 1n,
      });
    }
    for (const m of metadata.itemMembership.filter(
      (m) => m.rootContainerId === b.containerId,
    )) {
      const item = ctx.db.inventoryItem.id.find(m.itemId)!,
        oldMember = ctx.db.inventoryItemMembership.itemId.find(m.itemId)!;
      ctx.db.inventoryItem.id.update({ ...item, characterId: "" });
      ctx.db.inventoryItemMembership.itemId.update({
        ...oldMember,
        rootCharacterId: "",
        revision: oldMember.revision + 1n,
      });
    }
    ctx.db.instanceInventoryBinding.insert({
      placedObjectId: placed,
      containerId: b.containerId,
      instanceId: instance.id,
      deckId: i.spawn.deckId,
      definitionRevision: b.requiresAttachment
        ? "preserved-fuel-floor-mount-v1"
        : "preserved-legacy-cargo-v1",
    });
    if (b.requiresAttachment)
      ctx.db.wayfarerRefitAttachment.insert({
        id: placed,
        instanceId: instance.id,
        deckId: i.spawn.deckId,
        containerId: b.containerId,
        assetId: REFIT_FUEL_ATTACHMENT.assetId,
        assetSha256: REFIT_FUEL_ATTACHMENT.glbSha256,
        x: -3,
        y: 7,
        z: 0.1875,
        revision: 1n,
      });
  }
  for (const o of s.interactions) {
    const placed = objects.get(o.placementId)!;
    ctx.db.interactionObject.id.update({ ...o, placementId: placed });
    ctx.db.constructionInteractionBinding.insert({
      objectId: o.id,
      placedObjectId: placed,
      instanceId: instance.id,
      deckId: i.spawn.deckId,
      sourceId: o.placementId,
      instanceRevision: 1n,
      recoveryRequested: false,
      recoveryReason: "",
    });
  }
  const f = p.flight,
    station = f.station;
  ctx.db.station.id.update({
    ...s.station,
    localX: station.localX,
    localY: station.localY,
  });
  ctx.db.constructionFlightStation.insert({
    stationId: s.station.id,
    shipId: instance.id,
    deckId: i.spawn.deckId,
    seatPlacedObjectId: station.placedObjectId,
    consolePlacedObjectId: station.consolePlacedObjectId,
    revision: 1n,
  });
  for (const fitting of [f.computer, ...f.actuators])
    ctx.db.constructionFlightFitting.insert({
      id: fitting.id,
      shipId: instance.id,
      placedObjectId: fitting.placedObjectId,
      sourceDeviceId: fitting.sourceDeviceId,
      definitionId: fitting.definitionId,
      definitionRevision: 1,
      kind: fitting === f.computer ? "computer" : "actuator",
      installed: true,
      powered: true,
      availability: "availability" in fitting ? fitting.availability : 1,
      revision: 1n,
    });
  for (const output of oldOutputs) ctx.db.actuatorOutput.id.delete(output.id);
  for (const actuator of f.actuators)
    ctx.db.actuatorOutput.insert({
      id: `${instance.id}:${actuator.id}`,
      shipId: instance.id,
      actuatorId: actuator.id,
      throttle: 0,
      tick: s.motion.serverTick,
    });
  ctx.db.constructionFlightBinding.insert({
    shipId: instance.id,
    instanceId: instance.id,
    owner: ctx.sender,
    deckId: i.spawn.deckId,
    stationId: s.station.id,
    instanceRevision: 1n,
    blueprintSha256: i.blueprintSha256,
    definitionId: f.definitionId,
    definitionSha256: f.definitionSha256,
    lifecycle: s.station.operational ? "active" : "installed-dormant",
    revision: 1n,
  });
  ctx.db.ship.id.update({ ...s.ship, revision: s.ship.revision + 1n });
  ctx.db.constructionLocation.insert({
    characterId: s.actor.id,
    visitId: ctx.newUuidV4().toString(),
    instanceId: instance.id,
    deckId: i.spawn.deckId,
    returnShipId: "",
    returnX: 0,
    returnY: 0,
    revision: 1n,
  });
  ctx.db.gameShipAccess.insert({
    shipId: instance.id,
    instanceId: instance.id,
    owner: ctx.sender,
    characterId: s.actor.id,
    deckId: i.spawn.deckId,
    templateSha256: i.blueprintSha256,
    instanceRevision: 1n,
    lifecycle: "active",
  });
  if (s.state)
    ctx.db.inventoryState.characterId.update({
      ...s.state,
      revision: s.state.revision + 1n,
    });
  const result = {
    shipId: instance.id,
    owner: ctx.sender,
    characterId: s.actor.id,
    operationId: args.operationId,
    request,
    deckId: i.spawn.deckId,
    templateSha256: WAYFARER_STARTER.sha256,
    completedMicros: ctx.timestamp.microsSinceUnixEpoch,
  };
  ctx.db.wayfarerRefitReceipt.insert(result);
  markShipFlightDirty(ctx, instance.id);
  return result;
}
export function ownWayfarerRefitAttachments(ctx: RefitReadContext) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0],
    v = actor && ctx.db.constructionLocation.characterId.find(actor.id);
  if (!v || !ownedGameShipAccess(ctx, v.instanceId, v.deckId).readInterior)
    return [];
  return [
    ...ctx.db.wayfarerRefitAttachment.by_instance.filter(v.instanceId),
  ].filter((a) => a.deckId === v.deckId);
}
