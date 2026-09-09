import * as nativePressure from "./construction-native-pressure";
import { compilePublishedNativePressureRoom } from "@sidereal/sim/construction-native-room-published";
import { constructionAtmosphere } from "./construction-atmosphere-tables";
import {
  constructionNativePressure,
  constructionAtmosphereClock,
} from "./construction-native-pressure-tables";
import * as constructionDoors from "./construction-doors";
import * as constructionInstances from "./construction-instances";
import * as construction from "./construction";
import {
  constructionGrant,
  constructionDraft,
  constructionBlueprint,
  constructionReceipt,
  constructionInstance,
  constructionDeck,
  constructionLocation,
  constructionDoor,
} from "./construction-tables";
import * as auth from "./auth";
import { authSession, retiredIdentity, identityLink } from "./auth-tables";
import { connectionPresence, connected, lastDisconnected } from "./presence";
import { characterAppearance, appearanceReceipt } from "./appearance-tables";
import * as appearance from "./appearance";
import { storageBinding } from "./storage-tables";
import { combatAim, weaponEnergy, combatReceipt } from "./combat-tables";
import * as combat from "./combat";
import { alignPilotLayout } from "./pilot-layout";
import { pilotLayoutReceipt } from "./pilot-layout-tables";
import { PILOT_LAYOUT, constrainLabDeck } from "../../content/src/pilot-layout";
import {
  interactionObject,
  couchSeat,
  interactionReceipt,
} from "./interaction-tables";
import * as interactions from "./interactions";
import {
  characterUniformIssue,
  inventoryState,
  inventoryItem,
  inventoryContainer,
  inventoryHotbar,
  inventoryReceipt,
} from "./inventory-tables";
import * as inventory from "./inventory";
import * as inventoryOperations from "./inventory-operations";
import { schema, table, t, SenderError } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import { walk, assertRevision } from "../../sim/src/index";
import { STARTER } from "../../content/src/index";
import { CABIN_COLLIDERS } from "../../content/src/interior";
import { LAB_BODIES, bodyDiscoverable } from "../../content/src/space";
import { LAB_FLIGHT_ACTUATORS } from "../../content/src/flight";
import { actuatorOutput, spaceBody, stepLabSpace } from "./space";
const character = table(
  {
    name: "character",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    name: t.string(),
    shipId: t.string(),
    localX: t.f64(),
    localY: t.f64(),
    connected: t.bool(),
    sprinting: t.bool().default(false),
  },
);
const ship = table(
  {
    name: "ship",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    name: t.string(),
    revision: t.u64(),
    x: t.f64(),
    y: t.f64(),
    vx: t.f64(),
    vy: t.f64(),
    heading: t.f64(),
    omega: t.f64(),
    massKg: t.f64(),
    thrustN: t.f64(),
    turnAcceleration: t.f64(),
    tick: t.u64(),
  },
);
const station = table(
  { name: "station" },
  {
    id: t.string().primaryKey(),
    shipId: t.string().unique(),
    occupantId: t.option(t.string()),
    localX: t.f64(),
    localY: t.f64(),
    operational: t.bool(),
  },
);
const input = table(
  { name: "input" },
  {
    characterId: t.string().primaryKey(),
    sequence: t.u64(),
    throttle: t.f64(),
    turn: t.f64(),
    dx: t.f64(),
    dy: t.f64(),
    updatedMicros: t.u64(),
    sprint: t.bool().default(false),
  },
);
const editReceipt = table(
  {
    name: "edit_receipt",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    shipId: t.string(),
    revision: t.u64(),
    name: t.string(),
    createdMicros: t.u64(),
  },
);
const movementTimer = table(
  { name: "movement_timer" },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() },
);
const db = schema({
  constructionAtmosphere,
  constructionNativePressure,
  constructionAtmosphereClock,
  constructionGrant,
  constructionDraft,
  constructionBlueprint,
  constructionReceipt,
  constructionInstance,
  constructionDeck,
  constructionLocation,
  constructionDoor,
  connectionPresence,
  authSession,
  retiredIdentity,
  identityLink,
  characterAppearance,
  appearanceReceipt,
  storageBinding,
  combatAim,
  weaponEnergy,
  combatReceipt,
  pilotLayoutReceipt,
  interactionObject,
  couchSeat,
  interactionReceipt,
  characterUniformIssue,
  inventoryState,
  inventoryItem,
  inventoryContainer,
  inventoryHotbar,
  inventoryReceipt,
  character,
  ship,
  station,
  input,
  editReceipt,
  movementTimer,
  spaceBody,
  actuatorOutput,
});
export default db;
export const ownAppearance = db.view(
  { name: "own_appearance", public: true },
  t.array(appearance.appearanceProjection),
  auth.gameView(appearance.ownAppearance),
);
export const setCharacterAppearance = db.reducer(
  {
    appearanceJson: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(appearance.setCharacterAppearance),
);
export const ownActuatorOutputs = db.view(
  { name: "own_actuator_outputs", public: true },
  t.array(actuatorOutput.rowType),
  (ctx) =>
    !auth.canReadGame(ctx)
      ? []
      : [...ctx.db.ship.by_owner.filter(ctx.sender)].flatMap((s) => [
          ...ctx.db.actuatorOutput.by_ship.filter(s.id),
        ]),
);
export const ownSpaceBodies = db.view(
  { name: "own_space_bodies", public: true },
  t.array(spaceBody.rowType),
  (ctx) =>
    !auth.canReadGame(ctx)
      ? []
      : [...ctx.db.ship.by_owner.filter(ctx.sender)].flatMap((s) =>
          [...ctx.db.spaceBody.by_ship.filter(s.id)].filter((b) =>
            bodyDiscoverable(b.kind, b.x, b.y, s.x, s.y),
          ),
        ),
);
export const ownCharacters = db.view(
  { name: "own_characters", public: true },
  t.array(character.rowType),
  (ctx) =>
    !auth.canReadGame(ctx)
      ? []
      : [...ctx.db.character.by_owner.filter(ctx.sender)],
);
export const ownShips = db.view(
  { name: "own_ships", public: true },
  t.array(ship.rowType),
  (ctx) =>
    !auth.canReadGame(ctx) ? [] : [...ctx.db.ship.by_owner.filter(ctx.sender)],
);
export const ownStations = db.view(
  { name: "own_stations", public: true },
  t.array(station.rowType),
  (ctx) =>
    !auth.canReadGame(ctx)
      ? []
      : [...ctx.db.ship.by_owner.filter(ctx.sender)].flatMap((s) => {
          const seat = ctx.db.station.shipId.find(s.id);
          return seat ? [seat] : [];
        }),
);
export const ownEditReceipts = db.view(
  { name: "own_edit_receipts", public: true },
  t.array(editReceipt.rowType),
  (ctx) =>
    !auth.canReadGame(ctx)
      ? []
      : [...ctx.db.editReceipt.by_owner.filter(ctx.sender)],
);
export const init = db.init((ctx) => {
  ctx.db.movementTimer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(50000n),
  });
});
export const enterLab = db.reducer({ name: t.string() }, (ctx, { name }) => {
  auth.requireGame(ctx);
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 40)
    throw new SenderError("Use a character name between 2 and 40 characters");
  const existing = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  const seedBodies = (shipId: string) => {
    const keys = new Set(
      [...ctx.db.spaceBody.by_ship.filter(shipId)].map((b) => b.key),
    );
    for (const body of LAB_BODIES)
      if (!keys.has(body.key))
        ctx.db.spaceBody.insert({
          ...body,
          id: ctx.newUuidV4().toString(),
          shipId,
          vx: 0,
          vy: 0,
          heading: 0,
          omega: 0,
          tick: 0n,
        });
  };
  if (existing) {
    if (ctx.db.constructionLocation.characterId.find(existing.id)) {
      ctx.db.character.id.update({ ...existing, connected: true });
      return;
    }
    inventory.seedStorage(ctx, existing.id);
    inventory.seedCharacterUniforms(ctx, existing.id);
    alignPilotLayout(ctx, existing.shipId);
    seedBodies(existing.shipId);
    interactions.seedInteractions(ctx, existing.shipId);
    ctx.db.character.id.update({
      ...ctx.db.character.id.find(existing.id)!,
      connected: true,
    });
    return;
  }
  const characterId = ctx.newUuidV4().toString(),
    shipId = ctx.newUuidV4().toString();
  interactions.seedInteractions(ctx, shipId);
  ctx.db.character.insert({
    id: characterId,
    owner: ctx.sender,
    name: clean,
    shipId,
    localX: 0,
    localY: PILOT_LAYOUT.station.y,
    connected: true,
    sprinting: false,
  });
  ctx.db.ship.insert({
    id: shipId,
    owner: ctx.sender,
    name: STARTER.name,
    revision: 1n,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    omega: 0,
    massKg: STARTER.massKg,
    thrustN: STARTER.thrustN,
    turnAcceleration: STARTER.turnAcceleration,
    tick: 0n,
  });
  ctx.db.station.insert({
    id: ctx.newUuidV4().toString(),
    shipId,
    occupantId: characterId,
    localX: 0,
    localY: PILOT_LAYOUT.station.y,
    operational: true,
  });
  alignPilotLayout(ctx, shipId);
  seedBodies(shipId);
  ctx.db.input.insert({
    characterId,
    sequence: 0n,
    throttle: 0,
    turn: 0,
    dx: 0,
    dy: 0,
    updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
    sprint: false,
  });
});
export const connectSession = db.clientConnected(connected);
export const disconnect = db.clientDisconnected((ctx) => {
  if (lastDisconnected(ctx)) auth.clearOwner(ctx, ctx.sender);
});
export const setIntent = db.reducer(
  {
    sequence: t.u64(),
    throttle: t.f64(),
    turn: t.f64(),
    dx: t.f64(),
    dy: t.f64(),
    sprint: t.bool(),
  },
  (ctx, args) => {
    auth.requireGame(ctx);
    if (
      ![args.throttle, args.turn, args.dx, args.dy].every(
        (v) => Number.isFinite(v) && Math.abs(v) <= 1,
      )
    )
      throw new SenderError("Invalid input");
    const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
    if (!actor?.connected) throw new SenderError("Enter the lab first");
    const command = ctx.db.input.characterId.find(actor.id);
    if (!command || args.sequence <= command.sequence)
      throw new SenderError("Stale input sequence");
    const seat = ctx.db.station.shipId.find(actor.shipId);
    const controlled = seat?.operational && seat.occupantId === actor.id;
    if ((args.throttle !== 0 || args.turn !== 0) && !controlled)
      throw new SenderError("Occupy the control station to pilot");
    ctx.db.input.characterId.update({
      ...command,
      ...args,
      sprint: args.sprint && !controlled && (args.dx !== 0 || args.dy !== 0),
      updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  },
);
export const useStation = db.reducer((ctx) => {
  auth.requireGame(ctx);
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor?.connected) throw new SenderError("Character unavailable");
  const seat = ctx.db.station.shipId.find(actor.shipId);
  if (!seat?.operational) throw new SenderError("Station unavailable");
  if (ctx.db.couchSeat.characterId.find(actor.id))
    throw new SenderError("Stand up before using the control station");
  if (seat.occupantId === actor.id) {
    ctx.db.station.id.update({ ...seat, occupantId: undefined });
  } else {
    if (seat.occupantId) throw new SenderError("Station occupied");
    if (
      Math.hypot(actor.localX - seat.localX, actor.localY - seat.localY) > 1.8
    )
      throw new SenderError("Move closer to the control station");
    ctx.db.station.id.update({ ...seat, occupantId: actor.id });
    ctx.db.character.id.update({
      ...actor,
      localX: seat.localX,
      localY: seat.localY,
      sprinting: false,
    });
  }
  if (actor.sprinting)
    ctx.db.character.id.update({
      ...ctx.db.character.id.find(actor.id)!,
      sprinting: false,
    });
  combat.clearAim(ctx, actor.id);
  const command = ctx.db.input.characterId.find(actor.id);
  if (command)
    ctx.db.input.characterId.update({
      ...command,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
});
export const renameShip = db.reducer(
  {
    shipId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
    name: t.string(),
  },
  (ctx, args) => {
    auth.requireGame(ctx);
    const target = ctx.db.ship.id.find(args.shipId);
    if (!target || !target.owner.isEqual(ctx.sender))
      throw new SenderError("Ship edit denied");
    const name = args.name.trim();
    if (
      name.length < 2 ||
      name.length > 48 ||
      args.operationId.length < 8 ||
      args.operationId.length > 80
    )
      throw new SenderError("Invalid edit");
    const receiptId = ctx.sender.toHexString() + ":" + args.operationId;
    const previous =
      ctx.db.editReceipt.id.find(receiptId) ??
      auth.previousReceipt(ctx, args.operationId);
    if (previous) {
      if (previous.shipId !== args.shipId || previous.name !== name)
        throw new SenderError("Operation ID reused for a different edit");
      return;
    }
    try {
      assertRevision(target.revision, args.expectedRevision);
    } catch {
      throw new SenderError("Revision conflict: reload the current ship");
    }
    const revision = target.revision + 1n;
    ctx.db.ship.id.update({ ...target, name, revision });
    ctx.db.editReceipt.insert({
      id: receiptId,
      owner: ctx.sender,
      shipId: target.id,
      revision,
      name,
      createdMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  },
);
export const stepWorld = db.reducer(
  { onSchedule: movementTimer },
  { scheduledMessage: movementTimer.rowType },
  (ctx) => {
    if (!ctx.sender.isEqual(ctx.databaseIdentity))
      throw new SenderError("Server schedule only");
    auth.expireSessions(ctx);
    construction.expireGrants(ctx);
    constructionDoors.stepDoors(ctx);
    nativePressure.stepNativePressure(ctx, compilePublishedNativePressureRoom);
    combat.stepCombat(ctx);
    for (const target of ctx.db.ship.iter()) {
      const seat = ctx.db.station.shipId.find(target.id);
      const actor = seat?.occupantId
        ? ctx.db.character.id.find(seat.occupantId)
        : undefined;
      const command = actor
        ? ctx.db.input.characterId.find(actor.id)
        : undefined;
      const enabled =
        seat?.operational &&
        actor?.connected &&
        auth.canConsume(ctx, actor.owner) &&
        actor.shipId === target.id &&
        command &&
        ctx.timestamp.microsSinceUnixEpoch - command.updatedMicros < 300000n;
      // Lazy additive fixture migration also initializes existing persistent ships.
      for (const actuator of LAB_FLIGHT_ACTUATORS) {
        const id = `${target.id}:${actuator.id}`;
        const output = ctx.db.actuatorOutput.id.find(id);
        if (!output)
          ctx.db.actuatorOutput.insert({
            id,
            shipId: target.id,
            actuatorId: actuator.id,
            throttle: 0,
            tick: target.tick,
          });
        else if (!enabled && output.throttle !== 0)
          ctx.db.actuatorOutput.id.update({
            ...output,
            throttle: 0,
            tick: target.tick,
          });
      }
      const intent = enabled
        ? { throttle: command.throttle, turn: command.turn }
        : { throttle: 0, turn: 0 };
      const rocks = [...ctx.db.spaceBody.by_ship.filter(target.id)].filter(
        (b) => b.kind === "asteroid",
      );
      if (
        intent.throttle === 0 &&
        intent.turn === 0 &&
        target.vx === 0 &&
        target.vy === 0 &&
        target.omega === 0 &&
        rocks.every((b) => b.vx === 0 && b.vy === 0 && b.omega === 0)
      )
        continue;
      const result = stepLabSpace(target, rocks, intent, Boolean(enabled));
      for (const command of result.commands) {
        const output = ctx.db.actuatorOutput.id.find(
          `${target.id}:${command.id}`,
        )!;
        if (output.throttle !== command.throttle)
          ctx.db.actuatorOutput.id.update({
            ...output,
            throttle: command.throttle,
            tick: target.tick + 1n,
          });
      }
      const { x, y, vx, vy, heading, omega } = result.ship;
      ctx.db.ship.id.update({
        ...target,
        x,
        y,
        vx,
        vy,
        heading,
        omega,
        tick: target.tick + 1n,
      });
      for (const motion of result.rocks) {
        const rock = rocks.find((b) => b.id === motion.id)!;
        if (
          ["x", "y", "vx", "vy", "heading", "omega"].some(
            (k) =>
              rock[k as keyof typeof rock] !== motion[k as keyof typeof motion],
          )
        )
          ctx.db.spaceBody.id.update({
            ...rock,
            x: motion.x,
            y: motion.y,
            vx: motion.vx,
            vy: motion.vy,
            heading: motion.heading,
            omega: motion.omega,
            tick: rock.tick + 1n,
          });
      }
      if (result.exhausted)
        console.warn("Contact event budget exhausted for lab", target.id);
    }
    for (const actor of ctx.db.character.iter()) {
      const seat = ctx.db.station.shipId.find(actor.shipId);
      const command = ctx.db.input.characterId.find(actor.id);
      const active =
        actor.connected &&
        auth.canConsume(ctx, actor.owner) &&
        seat?.occupantId !== actor.id &&
        !ctx.db.couchSeat.characterId.find(actor.id) &&
        command &&
        ctx.timestamp.microsSinceUnixEpoch - command.updatedMicros < 300000n &&
        (command.dx !== 0 || command.dy !== 0);
      if (!active) {
        if (actor.sprinting)
          ctx.db.character.id.update({ ...actor, sprinting: false });
        continue;
      }
      if (constructionInstances.stepActor(ctx, actor, command)) continue;
      let point = { x: actor.localX, y: actor.localY };
      for (let i = 0; i < 3; i++)
        point = walk(
          point.x,
          point.y,
          command.dx,
          command.dy,
          CABIN_COLLIDERS,
          command.sprint,
          constrainLabDeck,
        );
      const sprinting =
        command.sprint &&
        (point.x !== actor.localX || point.y !== actor.localY);
      ctx.db.character.id.update({
        ...actor,
        localX: point.x,
        localY: point.y,
        sprinting,
      });
    }
  },
);

export const ownInventoryState = db.view(
  { name: "own_inventory_state", public: true },
  t.array(inventory.stateProjection),
  auth.gameView(inventory.inventoryStateView),
);
export const ownInventoryItems = db.view(
  { name: "own_inventory_items", public: true },
  t.array(inventory.itemProjection),
  auth.gameView(inventory.inventoryItemsView),
);
export const ownInventoryContainers = db.view(
  { name: "own_inventory_containers", public: true },
  t.array(inventory.containerProjection),
  auth.gameView(inventory.inventoryContainersView),
);
export const ownInventoryHotbar = db.view(
  { name: "own_inventory_hotbar", public: true },
  t.array(inventory.hotbarProjection),
  auth.gameView(inventory.inventoryHotbarView),
);
export const ownGroundItems = db.view(
  { name: "own_ground_items", public: true },
  t.array(inventoryOperations.groundItemProjection),
  auth.gameView(inventoryOperations.groundItemsView),
);
export const transferInventoryItem = db.reducer(
  {
    itemId: t.string(),
    containerId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(inventoryOperations.transferItem),
);
export const takeAllInventoryItems = db.reducer(
  {
    containerId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(inventoryOperations.takeAll),
);
export const dropInventoryItem = db.reducer(
  { itemId: t.string(), expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(inventoryOperations.dropItem),
);
export const claimStarterKit = db.reducer(auth.gameAction(inventory.claimKit));
export const claimCharacterArmory = db.reducer(
  { expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(inventory.claimCharacterArmory),
);
export const moveInventoryItem = db.reducer(
  {
    itemId: t.string(),
    containerId: t.string(),
    x: t.i32(),
    y: t.i32(),
    rotated: t.bool(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(inventory.moveItem),
);
export const equipInventoryItem = db.reducer(
  { itemId: t.string(), expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(inventory.equipItem),
);
export const assignInventoryHotbar = db.reducer(
  {
    slot: t.u8(),
    itemId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(inventory.assignHotbar),
);
export const activateInventoryHotbar = db.reducer(
  { slot: t.u8(), expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(inventory.activateHotbar),
);

export const ownInteractions = db.view(
  { name: "own_interactions", public: true },
  t.array(interactions.interactionProjection),
  auth.gameView(interactions.interactionView),
);
export const interactObject = db.reducer(
  {
    objectId: t.string(),
    action: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(interactions.interact),
);

export const ownCombat = db.view(
  { name: "own_combat", public: true },
  t.array(combat.combatProjection),
  auth.gameView(combat.combatView),
);
export const setCombatAim = db.reducer(
  { active: t.bool(), angle: t.f64() },
  auth.gameAction(combat.setAim),
);
export const fireWeapon = db.reducer(
  { itemId: t.string(), expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(combat.fire),
);

export const ownIdentityLinks = db.view(
  { name: "own_identity_links", public: true },
  t.array(auth.identityLinkProjection),
  auth.ownIdentityLinks,
);
export const requestIdentityLink = db.reducer(
  {
    targetIdentity: t.string(),
    expectedCharacterId: t.string(),
    operationId: t.string(),
  },
  auth.requestIdentityLink,
);
export const acceptIdentityLink = db.reducer(
  { requestId: t.string(), operationId: t.string() },
  auth.acceptIdentityLink,
);

export const ownConstructionGrants = db.view(
  { name: "own_construction_grants", public: true },
  t.array(construction.grantProjection),
  auth.gameView(construction.ownGrants),
);
export const ownConstructionDrafts = db.view(
  { name: "own_construction_drafts", public: true },
  t.array(construction.draftProjection),
  auth.gameView(construction.ownDrafts),
);
export const ownConstructionBlueprints = db.view(
  { name: "own_construction_blueprints", public: true },
  t.array(construction.blueprintProjection),
  auth.gameView(construction.ownBlueprints),
);
export const setConstructionGrant = db.reducer(
  {
    principal: t.string(),
    workspaceId: t.string(),
    capability: t.string(),
    expiresMicros: t.u64(),
    revoked: t.bool(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(construction.setGrant),
);
export const saveConstructionDraft = db.reducer(
  {
    workspaceId: t.string(),
    draftId: t.string(),
    documentJson: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(construction.saveDraft),
);
export const publishConstructionBlueprint = db.reducer(
  {
    workspaceId: t.string(),
    draftId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(construction.publishBlueprint),
);

export const ownConstructionInstances = db.view(
  { name: "own_construction_instances", public: true },
  t.array(constructionInstances.instanceProjection),
  auth.gameView(constructionInstances.ownInstances),
);
export const ownConstructionDecks = db.view(
  { name: "own_construction_decks", public: true },
  t.array(constructionInstances.deckProjection),
  auth.gameView(constructionInstances.ownDecks),
);
export const spawnConstructionBlueprint = db.reducer(
  {
    blueprintId: t.string(),
    expectedSha256: t.string(),
    sourceDeckId: t.string(),
    operationId: t.string(),
  },
  auth.gameAction(constructionInstances.spawnBlueprint),
);

export const ownConstructionLocation = db.view(
  { name: "own_construction_location", public: true },
  t.array(constructionInstances.locationProjection),
  auth.gameView(constructionInstances.ownLocation),
);
export const enterConstructionReview = db.reducer(
  {
    instanceId: t.string(),
    expectedShipId: t.string(),
    operationId: t.string(),
  },
  auth.gameAction(constructionInstances.enterReview),
);
export const leaveConstructionReview = db.reducer(
  {
    expectedVisitId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(constructionInstances.leaveReview),
);

export const ownConstructionDoors = db.view(
  { name: "own_construction_doors", public: true },
  t.array(constructionDoors.doorProjection),
  auth.gameView(constructionDoors.ownDoors),
);
export const setConstructionDoor = db.reducer(
  {
    openingId: t.string(),
    expectedVisitId: t.string(),
    expectedRevision: t.u64(),
    open: t.bool(),
    operationId: t.string(),
  },
  auth.gameAction(constructionDoors.requestDoor),
);

export const ownConstructionNativePressure = db.view(
  { name: "own_construction_native_pressure", public: true },
  t.array(nativePressure.nativePressureProjection),
  auth.gameView(nativePressure.ownNativePressure),
);
