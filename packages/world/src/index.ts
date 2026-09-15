import {
  systemMapDefinition,
  fieldAsteroid,
  systemMapEdit,
} from "./system-map-tables";
import * as systemMap from "./system-map";
import { migrateSolarSystem } from "./solar-system-migration";
import { constructionCargoAssembly } from "./construction-cargo-assembly-tables";
import {
  constructionCargoGrid,
  constructionCargoPlacement,
  constructionCargoOperation,
} from "./construction-cargo-grid-tables";
import { installCargoHandlingFixture as installCarrierFixture } from "./construction-cargo-fixture";
import { moveCargoCarriers } from "./construction-cargo-carriers";
import {
  ownCargoCarriers as readCargoCarriers,
  ownCargoGrids as readCargoGrids,
  cargoCarrierProjection,
  cargoGridProjection,
} from "./construction-cargo-carrier-views";
import {
  wayfarerRefitReceipt,
  wayfarerRefitAttachment,
  wayfarerLiquidReceipt,
  wayfarerRefitOfferProjection,
  wayfarerRefitAttachmentProjection,
} from "./wayfarer-refit-tables";
import {
  refitExistingWayfarer as applyWayfarerRefit,
  ownWayfarerRefitOffer as readWayfarerRefitOffer,
  ownWayfarerRefitAttachments as readWayfarerRefitAttachments,
} from "./wayfarer-refit-authority";
import { transferWayfarerLiquid as applyWayfarerLiquid } from "./wayfarer-liquid-transfer";
import { constructionReviewOrigin } from "./construction-review-origin";
import * as nativeAirlock from "./construction-airlock";
import { compilePublishedNativeExternalAirlock } from "@sidereal/sim/construction-airlock-published";
import { preserveWayfarerStarterKit } from "./wayfarer-personal-kit";
import {
  personalStarterReceipt,
  gameShipAccess,
} from "./wayfarer-starter-tables";
import { createWayfarerStarterAuthority } from "./wayfarer-starter-authority";
import {
  gameShipAccessProjection,
  ownGameShipAccess as readGameShipAccess,
} from "./game-ship-access-authority";
import {
  constructionFlightBinding,
  constructionFlightFitting,
  constructionFlightStation,
  constructionFlightReceipt,
} from "./construction-flight-tables";
import { constructionPilotSeat } from "./construction-pilot-tables";
import { constructionFlightReview } from "./construction-flight-review-tables";
import {
  authoredFlightProjection,
  authoredFlightFittingProjection,
  ownAuthoredFlights as readAuthoredFlights,
  ownAuthoredFlightFittings as readAuthoredFlightFittings,
} from "./construction-flight-views";
import {
  beginConstructionFlightReview,
  returnConstructionFlightReview,
} from "./construction-flight-review";
import { installConstructionFlightAuthority } from "./construction-flight-authority";
import { activateConstructionFlight } from "./construction-flight-activation";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
import {
  enterConstructionPilotAuthority,
  canConsumeConstructionPilot,
  recoverConstructionPilotAuthority,
  recoverPendingConstructionPilots,
} from "./construction-pilot-authority";
import {
  worldSystem,
  celestialMigrationReceipt,
  shipWorldMotion,
  systemBody,
  bodyWorldMotion,
  worldAdmission,
  worldJoinReceipt,
  legacyBodyAlias,
} from "./shared-world-tables";
import * as sharedWorld from "./shared-world";
import * as sharedViews from "./shared-world-views";
import { stepSharedWorld } from "./shared-world-physics";
import { SHARED_STOCK_EXTERIOR_ID } from "@sidereal/content/shared-system";
import * as stairs from "./construction-stairs-authority";
import {
  createConstructionStairWorldHooks,
  admittedStairWalks,
  admittedStairEgressGeometry,
} from "./construction-stairs-world-hooks";
import {
  constructionStairLink,
  constructionStairWalk,
  constructionStairReservation,
  constructionStairAudit,
} from "./construction-stairs-tables";
import * as inputControl from "./input-control";
import {
  inputControl as inputControlTable,
  inputControlCursor,
} from "./input-control-tables";
import * as nativePressure from "./construction-native-pressure";
import * as traversal from "./construction-traversal";
import { nativeTraversalRegistry } from "./construction-traversal-registry";
import {
  constructionTraversalLink,
  constructionTraversal,
  constructionTraversalReservation,
  constructionTraversalClock,
  constructionTraversalAudit,
} from "./construction-traversal-tables";
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
import {
  inventoryContainerScope,
  inventoryItemMembership,
  instanceInventoryBinding,
  scopedInventoryReceipt,
} from "./scoped-inventory-tables";
import * as constructionInteractions from "./construction-interactions";
import * as scopedCargo from "./scoped-inventory-authority";
import {
  scopedCargoContainerProjection,
  scopedCargoItemProjection,
  scopedCarriedRevisionProjection,
} from "./scoped-inventory-tables";
import * as inventory from "./inventory";
import * as inventoryOperations from "./inventory-operations";
import { schema, table, t, SenderError } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import { walk, assertRevision } from "../../sim/src/index";
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
  constructionCargoAssembly,
  constructionCargoGrid,
  constructionCargoPlacement,
  constructionCargoOperation,
  wayfarerRefitReceipt,
  wayfarerRefitAttachment,
  wayfarerLiquidReceipt,
  personalStarterReceipt,
  gameShipAccess,
  constructionFlightBinding,
  constructionFlightFitting,
  constructionFlightStation,
  constructionFlightReceipt,
  constructionPilotSeat,
  constructionFlightReview,
  systemMapDefinition,
  systemMapEdit,
  fieldAsteroid,
  worldSystem,
  celestialMigrationReceipt,
  shipWorldMotion,
  systemBody,
  bodyWorldMotion,
  worldAdmission,
  worldJoinReceipt,
  legacyBodyAlias,
  constructionStairLink,
  constructionStairWalk,
  constructionStairReservation,
  constructionStairAudit,
  inputControl: inputControlTable,
  inputControlCursor,
  constructionTraversalLink,
  constructionTraversal,
  constructionTraversalReservation,
  constructionTraversalClock,
  constructionTraversalAudit,
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
  inventoryContainerScope,
  inventoryItemMembership,
  instanceInventoryBinding,
  scopedInventoryReceipt,
  constructionReviewOrigin,
  constructionAirlock: nativeAirlock.constructionAirlock,
  constructionInteractionBinding:
    constructionInteractions.constructionInteractionBinding,
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
  auth.gameAction(appearance.setCharacterAppearance, true),
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
          ctx.db.shipWorldMotion.shipId.find(s.id)
            ? []
            : [...ctx.db.spaceBody.by_ship.filter(s.id)].filter((b) =>
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
    !auth.canReadGame(ctx)
      ? []
      : [...ctx.db.ship.by_owner.filter(ctx.sender)].map((s) => {
          const m = ctx.db.shipWorldMotion.shipId.find(s.id);
          // Preserve owner-only membership and the legacy projection shape. The static
          // ship row remains migration evidence; only the lean motion row advances.
          return m
            ? {
                ...s,
                x: m.x,
                y: m.y,
                vx: m.vx,
                vy: m.vy,
                heading: m.heading,
                omega: m.omega,
                tick: m.serverTick,
              }
            : s;
        }),
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
    if (ctx.db.shipWorldMotion.shipId.find(shipId)) return;
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
  createWayfarerStarterAuthority(ctx, clean);
});
export const connectSession = db.clientConnected(connected);
export const bindGameSession = db.reducer(
  { connectionId: t.string() },
  auth.bindGameSession,
);
export const disconnect = db.clientDisconnected((ctx) => {
  inputControl.disconnectInputControl(ctx);
  if (lastDisconnected(ctx)) {
    traversal.interruptConstructionTraversalOwner(ctx, ctx.sender);
    auth.clearOwner(ctx, ctx.sender, "disconnect");
  }
});
export const claimInputControl = db.reducer((ctx) => {
  auth.requireGame(ctx);
  inputControl.claimInputControl(ctx);
});
export const releaseInputControl = db.reducer((ctx) => {
  auth.requireGame(ctx);
  inputControl.releaseInputControl(ctx);
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
    if (ctx.db.constructionTraversal.characterId.find(actor.id)) return;
    const command = ctx.db.input.characterId.find(actor.id);
    if (!command || !inputControl.canRecordInput(ctx, actor.id, args.sequence))
      return;
    const seat = ctx.db.station.shipId.find(actor.shipId);
    const onStair = !!ctx.db.constructionStairWalk.characterId.find(actor.id);
    const controlled =
      !onStair &&
      seat?.operational &&
      seat.occupantId === actor.id &&
      (!ctx.db.constructionFlightBinding.shipId.find(actor.shipId) ||
        canConsumeConstructionPilot(ctx, actor.id));
    if ((args.throttle !== 0 || args.turn !== 0) && !controlled)
      throw new SenderError("Occupy the control station to pilot");
    if (!inputControl.recordInput(ctx, actor.id, args.sequence)) return;
    ctx.db.input.characterId.update({
      ...command,
      ...args,
      sprint:
        args.sprint &&
        !controlled &&
        !onStair &&
        (args.dx !== 0 || args.dy !== 0),
      updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  },
);
export const useStation = db.reducer((ctx) => {
  auth.requireGame(ctx);
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor?.connected) throw new SenderError("Character unavailable");
  traversal.requireStandingConstructionActor(ctx, actor.id);
  stairs.requireNoConstructionStair(ctx, actor.id);
  if (ctx.db.constructionFlightBinding.shipId.find(actor.shipId))
    throw new SenderError("Use the native construction pilot command");
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
    migrateSolarSystem(ctx.db, ctx.timestamp.microsSinceUnixEpoch);
    auth.expireSessions(ctx);
    construction.expireGrants(ctx);
    constructionInteractions.recoverConstructionSeats(ctx);
    recoverPendingConstructionPilots(ctx);
    constructionDoors.stepDoors(ctx);
    nativePressure.stepNativePressure(ctx, compilePublishedNativePressureRoom);
    nativeAirlock.stepNativeAirlocks(
      ctx,
      compilePublishedNativeExternalAirlock,
    );
    traversal.stepConstructionTraversals(ctx, nativeTraversalRegistry);
    stairs.stepConstructionStairs(ctx, createConstructionStairWorldHooks(ctx));
    combat.stepCombat(ctx);
    // The canonical contact island advances once for all admitted ships/bodies,
    // never inside the legacy per-owner loop below.
    stepSharedWorld(ctx, undefined, {
      definitionForShip: (shipId) =>
        resolveShipFlightDefinition(
          {
            binding: (id) => ctx.db.constructionFlightBinding.shipId.find(id),
            constructionInstanceExists: (id) =>
              !!ctx.db.constructionInstance.id.find(id),
            currentInstanceRevision: (id) =>
              ctx.db.constructionInstance.id.find(id)?.revision,
            fittings: (id) =>
              ctx.db.constructionFlightFitting.by_ship.filter(id),
          },
          shipId,
        ),
      canPilot: (characterId) => {
        const actor = ctx.db.character.id.find(characterId);
        return (
          !!actor &&
          (!ctx.db.constructionFlightBinding.shipId.find(actor.shipId) ||
            canConsumeConstructionPilot(ctx, characterId))
        );
      },
    });
    for (const target of ctx.db.ship.iter()) {
      if (ctx.db.shipWorldMotion.shipId.find(target.id)) continue;
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
        inputControl.consumeInputControl(ctx, actor.id) &&
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
        inputControl.consumeInputControl(ctx, actor.id) &&
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
      if (
        constructionInstances.stepActor(
          ctx,
          actor,
          command,
          createConstructionStairWorldHooks(ctx),
        )
      )
        continue;
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
      if (
        point.x !== actor.localX ||
        point.y !== actor.localY ||
        sprinting !== actor.sprinting
      )
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
  auth.gameAction(inventoryOperations.transferItem, true),
);
export const takeAllInventoryItems = db.reducer(
  {
    containerId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(inventoryOperations.takeAll, true),
);
export const dropInventoryItem = db.reducer(
  { itemId: t.string(), expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(inventoryOperations.dropItem, true),
);
export const storeAllInventoryItems = db.reducer(
  {
    containerId: t.string(),
    destinationId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(inventoryOperations.storeAll, true),
);
export const claimStarterKit = db.reducer(
  auth.gameAction((ctx) => {
    if (!preserveWayfarerStarterKit(ctx)) inventory.claimKit(ctx);
  }, true),
);
export const claimCharacterArmory = db.reducer(
  { expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(inventory.claimCharacterArmory, true),
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
  auth.gameAction(inventory.moveItem, true),
);
export const equipInventoryItem = db.reducer(
  { itemId: t.string(), expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(inventory.equipItem, true),
);
export const assignInventoryHotbar = db.reducer(
  {
    slot: t.u8(),
    itemId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(inventory.assignHotbar, true),
);
export const activateInventoryHotbar = db.reducer(
  { slot: t.u8(), expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(inventory.activateHotbar, true),
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
  auth.gameAction(interactions.interact, true),
);

export const ownCombat = db.view(
  { name: "own_combat", public: true },
  t.array(combat.combatProjection),
  auth.gameView(combat.combatView),
);
export const setCombatAim = db.reducer(
  { active: t.bool(), angle: t.f64() },
  auth.gameAction(combat.setAim, true),
);
export const fireWeapon = db.reducer(
  { itemId: t.string(), expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(combat.fire, true),
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
  auth.gameAction(construction.setGrant, true),
);
export const saveConstructionDraft = db.reducer(
  {
    workspaceId: t.string(),
    draftId: t.string(),
    documentJson: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(construction.saveDraft, true),
);
export const publishConstructionBlueprint = db.reducer(
  {
    workspaceId: t.string(),
    draftId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(construction.publishBlueprint, true),
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
  auth.gameAction(constructionInstances.spawnBlueprint, true),
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
  auth.gameAction(constructionInstances.enterReview, true),
);
export const leaveConstructionReview = db.reducer(
  {
    expectedVisitId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(constructionInstances.leaveReview, true),
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
  auth.gameAction(constructionDoors.requestDoor, true),
);

export const ownConstructionNativePressure = db.view(
  { name: "own_construction_native_pressure", public: true },
  t.array(nativePressure.nativePressureProjection),
  auth.gameView(nativePressure.ownNativePressure),
);

export const ownConstructionTraversals = db.view(
  { name: "own_construction_traversals", public: true },
  t.array(traversal.traversalProjection),
  auth.gameView(traversal.ownConstructionTraversals),
);
export const ownConstructionTraversalLinks = db.view(
  { name: "own_construction_traversal_links", public: true },
  t.array(traversal.traversalLinkProjection),
  auth.gameView(traversal.ownConstructionTraversalLinks),
);
export const beginConstructionTraversal = db.reducer(
  {
    linkId: t.string(),
    expectedVisitId: t.string(),
    expectedLocationRevision: t.u64(),
    expectedInstanceRevision: t.u64(),
    expectedLinkRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction((ctx, args) => {
    const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
    if (!actor) throw new SenderError("Connected character required");
    stairs.requireNoConstructionStair(ctx, actor.id);
    traversal.beginConstructionTraversal(
      ctx,
      actor.id,
      args,
      nativeTraversalRegistry,
    );
  }),
);
export const cancelConstructionTraversal = db.reducer(
  {
    traversalId: t.string(),
    expectedVisitId: t.string(),
    expectedRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction((ctx, args) => {
    const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
    if (!actor) throw new SenderError("Connected character required");
    traversal.cancelConstructionTraversal(ctx, actor.id, args);
  }),
);

export const ownConstructionStairWalks = db.view(
  { name: "own_construction_stair_walks", public: true },
  t.array(stairs.stairWalkProjection),
  admittedStairWalks,
);
export const ownConstructionStairEgressGeometry = db.view(
  { name: "own_construction_stair_egress_geometry", public: true },
  t.array(stairs.stairEgressProjection),
  admittedStairEgressGeometry,
);

// Shared-space admission is explicit and additive. No login relocates a ship.
export const joinSharedSystem = db.reducer(
  {
    characterId: t.string(),
    shipId: t.string(),
    expectedShipRevision: t.u64(),
    expectedAdmissionRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(sharedWorld.joinSharedSystem),
);
export const ownWorldAdmission = db.view(
  { name: "own_world_admission", public: true },
  t.array(sharedViews.ownWorldAdmissionProjection),
  auth.gameView(sharedViews.ownWorldAdmission),
);
export const visibleShipMotion = db.view(
  { name: "visible_ship_motion", public: true },
  t.array(sharedViews.visibleShipMotionProjection),
  auth.gameView(sharedViews.visibleShipMotion),
);
export const visibleShipDescriptions = db.view(
  { name: "visible_ship_descriptions", public: true },
  t.array(sharedViews.visibleShipDescriptionProjection),
  auth.gameView((ctx) =>
    sharedViews.visibleShipDescriptions(ctx, (shipId) =>
      ctx.db.shipWorldMotion.shipId.find(shipId)
        ? {
            publishedExteriorAssetId: SHARED_STOCK_EXTERIOR_ID,
            appearanceRevision: 1n,
          }
        : undefined,
    ),
  ),
);
export const visibleBodyMotion = db.view(
  { name: "visible_body_motion", public: true },
  t.array(sharedViews.visibleBodyMotionProjection),
  auth.gameView(sharedViews.visibleBodyMotion),
);
export const visibleBodyDescriptions = db.view(
  { name: "visible_body_descriptions", public: true },
  t.array(sharedViews.visibleBodyDescriptionProjection),
  auth.gameView(sharedViews.visibleBodyDescriptions),
);

export const ownReachableCargoContainers = db.view(
  { name: "own_reachable_cargo_containers", public: true },
  t.array(scopedCargoContainerProjection),
  auth.gameView(scopedCargo.reachableCargoContainers),
);
export const ownReachableCargoItems = db.view(
  { name: "own_reachable_cargo_items", public: true },
  t.array(scopedCargoItemProjection),
  auth.gameView(scopedCargo.reachableCargoItems),
);
export const ownCarriedInventoryRevisions = db.view(
  { name: "own_carried_inventory_revisions", public: true },
  t.array(scopedCarriedRevisionProjection),
  auth.gameView(scopedCargo.carriedInventoryRevisions),
);
export const transferScopedCargoItem = db.reducer(
  {
    operationId: t.string(),
    itemId: t.string(),
    expectedItemRevision: t.u64(),
    sourceContainerId: t.string(),
    expectedSourceRevision: t.u64(),
    destinationContainerId: t.string(),
    expectedDestinationRevision: t.u64(),
    expectedCharacterRevision: t.u64(),
    x: t.i32(),
    y: t.i32(),
    rotated: t.bool(),
  },
  auth.gameAction(scopedCargo.moveScopedCargo, true),
);

export const ownConstructionSeat = db.view(
  { name: "own_construction_seat", public: true },
  t.array(constructionInteractions.constructionSeatProjection),
  auth.gameView(constructionInteractions.ownConstructionSeat),
);

// Explicit owner review membership switch; ordinary login never invokes these.
export const beginAuthoredFlightReview = db.reducer(
  {
    expectedVisitId: t.string(),
    expectedVisitRevision: t.u64(),
    expectedAdmissionRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(beginConstructionFlightReview, true),
);
export const returnAuthoredFlightReview = db.reducer(
  {
    expectedVisitId: t.string(),
    expectedVisitRevision: t.u64(),
    expectedAdmissionRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(returnConstructionFlightReview, true),
);
// Explicit additive installation/activation. Neither boards nor moves an actor.
export const installAuthoredShipFlight = db.reducer(
  {
    instanceId: t.string(),
    expectedInstanceRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction((ctx, args) => {
    installConstructionFlightAuthority(ctx, args, {
      reserveBerth: (current) => {
        const system = sharedWorld.ensureCanonicalSystem(current.db);
        return {
          systemId: system.id,
          ...sharedWorld.reserveBerth(current.db, system.id),
          serverTick: current.timestamp.microsSinceUnixEpoch / 50_000n,
        };
      },
    });
  }),
);
export const activateAuthoredShipFlight = db.reducer(
  { shipId: t.string(), expectedRevision: t.u64(), operationId: t.string() },
  auth.gameAction(activateConstructionFlight),
);
export const enterAuthoredPilot = db.reducer(
  {
    stationId: t.string(),
    expectedStationRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(enterConstructionPilotAuthority, true),
);
export const leaveAuthoredPilot = db.reducer(
  auth.gameAction((ctx) => {
    const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
    if (!actor?.connected) throw new SenderError("Active character required");
    recoverConstructionPilotAuthority(ctx, actor.id, "stand");
  }, true),
);
export const ownAuthoredFlights = db.view(
  { name: "own_authored_flights", public: true },
  t.array(authoredFlightProjection),
  auth.gameView(readAuthoredFlights),
);
export const ownAuthoredFlightFittings = db.view(
  { name: "own_authored_flight_fittings", public: true },
  t.array(authoredFlightFittingProjection),
  auth.gameView(readAuthoredFlightFittings),
);

export const ownGameShipAccess = db.view(
  { name: "own_game_ship_access", public: true },
  t.array(gameShipAccessProjection),
  auth.gameView(readGameShipAccess),
);

export const ownNativeAirlocks = db.view(
  { name: "own_native_airlocks", public: true },
  t.array(nativeAirlock.nativeAirlockProjection),
  auth.gameView(nativeAirlock.ownNativeAirlocks),
);

export const refitExistingWayfarer = db.reducer(
  {
    shipId: t.string(),
    expectedShipRevision: t.u64(),
    expectedInventoryRevision: t.u64(),
    fingerprint: t.string(),
    operationId: t.string(),
  },
  auth.gameAction(applyWayfarerRefit, true),
);
export const ownWayfarerRefitOffer = db.view(
  { name: "own_wayfarer_refit_offer", public: true },
  t.array(wayfarerRefitOfferProjection),
  auth.gameView(readWayfarerRefitOffer),
);
export const ownWayfarerRefitAttachments = db.view(
  { name: "own_wayfarer_refit_attachments", public: true },
  t.array(wayfarerRefitAttachmentProjection),
  auth.gameView(readWayfarerRefitAttachments),
);
export const transferWayfarerLiquid = db.reducer(
  {
    sourceId: t.string(),
    destinationId: t.string(),
    litres: t.f64(),
    expectedSourceRevision: t.u64(),
    expectedDestinationRevision: t.u64(),
    expectedInventoryRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction(applyWayfarerLiquid, true),
);

export const ownCargoCarriers = db.view(
  { name: "own_cargo_carriers", public: true },
  t.array(cargoCarrierProjection),
  auth.gameView(readCargoCarriers),
);
export const ownCargoGrids = db.view(
  { name: "own_cargo_grids", public: true },
  t.array(cargoGridProjection),
  auth.gameView(readCargoGrids),
);
export const installCargoHandlingFixture = db.reducer(
  {
    instanceId: t.string(),
    expectedInstanceRevision: t.u64(),
    operationId: t.string(),
  },
  auth.gameAction((ctx, args) => {
    installCarrierFixture(ctx, args);
  }, true),
);
export const moveCargoCarrier = db.reducer(
  {
    gridId: t.string(),
    expectedGridRevision: t.u64(),
    operationId: t.string(),
    containerId: t.string(),
    expectedPlacementRevision: t.u64(),
    expectedInventoryRevision: t.u64(),
    originX: t.i32(),
    originY: t.i32(),
    originZ: t.i32(),
    quarterTurns: t.u8(),
  },
  auth.gameAction((ctx, args) => {
    moveCargoCarriers(ctx, {
      gridId: args.gridId,
      expectedGridRevision: args.expectedGridRevision,
      operationId: args.operationId,
      edits: [
        {
          kind: "move",
          containerId: args.containerId,
          expectedPlacementRevision: args.expectedPlacementRevision,
          expectedInventoryRevision: args.expectedInventoryRevision,
          origin: [args.originX, args.originY, args.originZ],
          quarterTurns: args.quarterTurns,
        },
      ],
    });
  }, true),
);

export const ownSystemMaps = db.view(
  { name: "own_system_maps", public: true },
  t.array(systemMap.mapProjection),
  auth.gameView(systemMap.ownMaps),
);
export const ownMapShips = db.view(
  { name: "own_map_ships", public: true },
  t.array(systemMap.mapShipProjection),
  auth.gameView(systemMap.ownMapShips),
);
export const admittedSystemScapes = db.view(
  { name: "admitted_system_scapes", public: true },
  t.array(systemMap.systemScapeProjection),
  auth.gameView(systemMap.admittedSystemScapes),
);
export const applySystemMap = db.reducer(
  {
    documentJson: t.string(),
    expectedRevision: t.u64(),
    sourceFingerprint: t.string(),
    operationId: t.string(),
  },
  auth.gameAction(systemMap.applySystemMap, true),
);

export const nearbyFieldAsteroids = db.view(
  { name: "nearby_field_asteroids", public: true },
  t.array(systemMap.nearbyFieldProjection),
  auth.gameView(systemMap.nearbyFieldAsteroids),
);
