/**
 * Ship logic authority (wiki `Systems/Ship Logic`): device state, presses, timers and the facts
 * the rules need (who stands in a doorway). The rules themselves are pure
 * (`packages/sim/src/ship-logic.ts`); the wiring comes from the ship's embedded prefab document.
 *
 * - `press_ship_button`: proximity E on a wall button. Aboard: the actor stands on the deck in reach
 *   of an interior panel. Outside: the actor's EVA body is in the ship's frame in reach of an
 *   exterior panel AND passes `evaEntryAllowed` (the same single gate that admits entry).
 * - Timers fire in the world tick (`stepShipLogic`, bounded per tick).
 * - Door states feed walking collision (a closed interior door is a wall), EVA doorways (an open
 *   exterior door is the only lane through the hull) and the renderer's door leaves.
 * Every consumption rechecks the actor (connected, authenticated, alive, in reach, access).
 */
import { SenderError, t } from "spacetimedb/server";
import type { InferSchema, ReducerCtx, ViewCtx } from "spacetimedb/server";
import type world from "./index";
import {
  readShipPrefab,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import {
  LOGIC_BUDGET,
  evaluateLogic,
  initialLogicStates,
  logicTimerOf,
  readLogicState,
  type LogicDeviceState,
  type LogicEvent,
} from "@sidereal/sim/ship-logic";
import {
  inChamber,
  inDoorway,
  reachablePanel,
  shipLogicModel,
  type ShipLogicModel,
} from "@sidereal/sim/ship-logic-model";
import { prefabEvaModel, type EvaShipModel } from "@sidereal/sim/eva";
import { isDead } from "./combat-damage";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
type Db = Context["db"];
type ReadDb = ReadContext["db"];

export interface ShipPrefabBinding {
  shipId: string;
  revision: bigint;
  doc: ShipPrefabDocumentV1;
  catalog: PrefabComponentCatalog;
  logic: ShipLogicModel | null;
  eva: EvaShipModel;
}

const bindings = new Map<string, ShipPrefabBinding | null>();
/** Parsed prefab binding of a construction instance (cached per instance revision), or null. */
export function shipPrefabBinding(
  db: {
    constructionInstance: {
      id: {
        find(
          id: string,
        ):
          | { id: string; revision: bigint; documentJson: string }
          | null
          | undefined;
      };
    };
  },
  shipId: string,
): ShipPrefabBinding | null {
  const instance = db.constructionInstance.id.find(shipId);
  if (!instance) return null;
  const key = instance.id + ":" + instance.revision;
  if (bindings.has(key)) return bindings.get(key)!;
  if (bindings.size >= 128) bindings.clear();
  let binding: ShipPrefabBinding | null = null;
  try {
    const raw = (
      JSON.parse(instance.documentJson) as {
        prefab?: { document?: unknown; catalog?: unknown };
      }
    ).prefab;
    if (raw && typeof raw === "object" && typeof raw.catalog === "string") {
      const doc = readShipPrefab(raw.document);
      const catalog = prefabComponentCatalogFor(raw.catalog);
      binding = {
        shipId,
        revision: instance.revision,
        doc,
        catalog,
        logic: shipLogicModel(doc, catalog),
        eva: prefabEvaModel(doc, catalog),
      };
    }
  } catch {
    binding = null;
  }
  bindings.set(key, binding);
  return binding;
}

const stateKey = (shipId: string, deviceId: string) => `${shipId}/${deviceId}`;

/** Current state of a device: its stored row for this instance revision, else the initial state. */
export function logicDeviceState(
  db: Pick<ReadDb, "shipLogicState">,
  binding: ShipPrefabBinding,
  deviceId: string,
): LogicDeviceState | undefined {
  const node = binding.logic?.graph.devices.get(deviceId);
  if (!binding.logic || !node) return;
  const row = db.shipLogicState.key.find(stateKey(binding.shipId, deviceId));
  const stored =
    row && row.instanceRevision === binding.revision
      ? readLogicState(node.kind, row.stateJson)
      : undefined;
  return stored ?? initialLogicStates(binding.logic.graph).get(deviceId);
}

/** Whether the door `doorId` of the ship is open (logic-actuated doors only; others: undefined). */
export function logicDoorOpen(
  db: Pick<ReadDb, "shipLogicState">,
  binding: ShipPrefabBinding,
  doorId: string,
): boolean | undefined {
  const door = binding.logic?.doors.find((d) => d.doorId === doorId);
  if (!door) return;
  const s = logicDeviceState(db, binding, door.deviceId);
  return s?.kind === "door" ? s.open : undefined;
}

/** Ids of the ship's exterior doors that are open now. */
export function openExteriorDoors(
  db: Pick<ReadDb, "shipLogicState">,
  binding: ShipPrefabBinding,
): Set<string> {
  const open = new Set<string>();
  for (const d of binding.logic?.doors ?? [])
    if (d.exterior && logicDoorOpen(db, binding, d.doorId)) open.add(d.doorId);
  return open;
}

/**
 * Walking-layout opening states of the ship's logic doors (interior doors only): a closed door is a
 * wall for walking, spawn and reach. Only openings present in `known` are reported.
 */
export function logicOpeningStates(
  db: Pick<ReadDb, "shipLogicState" | "constructionInstance">,
  shipId: string,
  known: ReadonlySet<string>,
): { openingId: string; passable: boolean }[] {
  const binding = shipPrefabBinding(db, shipId);
  const out: { openingId: string; passable: boolean }[] = [];
  for (const d of binding?.logic?.doors ?? [])
    if (d.openingId && known.has(d.openingId))
      out.push({
        openingId: d.openingId,
        passable: !!logicDoorOpen(db, binding!, d.doorId),
      });
  return out;
}

/** Bodies in the doorway of a door device: crew on the deck and spacewalkers in the ship's frame. */
function doorObstructed(
  db: Db,
  binding: ShipPrefabBinding,
  deviceId: string,
): boolean {
  const door = binding.logic?.doors.find((d) => d.deviceId === deviceId);
  if (!door) return false;
  // Crowd size is not an obstruction. Inspect the complete indexed membership;
  // stop only when a body actually occupies this doorway.
  for (const l of db.constructionLocation.by_instance.filter(binding.shipId)) {
    const c = db.character.id.find(l.characterId);
    if (
      c &&
      c.shipId === binding.shipId &&
      inDoorway(door, [c.localX, c.localY])
    )
      return true;
  }
  for (const b of db.evaBody.by_anchor.filter(binding.shipId)) {
    if (b.phase === "local" && inDoorway(door, [b.localX, b.localY]))
      return true;
  }
  return false;
}

function writeStates(
  ctx: Context,
  binding: ShipPrefabBinding,
  states: Map<string, LogicDeviceState>,
) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const [deviceId, state] of [...states].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const key = stateKey(binding.shipId, deviceId);
    const json = JSON.stringify(state);
    if (json.length > LOGIC_BUDGET.stateBytes)
      throw new Error(`Logic state of ${deviceId} exceeds its budget`);
    const row = {
      key,
      shipId: binding.shipId,
      deviceId,
      kind: state.kind,
      instanceRevision: binding.revision,
      stateJson: json,
      updatedMicros: now,
    };
    const existing = ctx.db.shipLogicState.key.find(key);
    if (existing) {
      if (
        existing.stateJson !== json ||
        existing.instanceRevision !== binding.revision
      )
        ctx.db.shipLogicState.key.update(row);
    } else ctx.db.shipLogicState.insert(row);
    const due = logicTimerOf(state);
    const timer = ctx.db.shipLogicTimer.key.find(key);
    if (!due) {
      if (timer) ctx.db.shipLogicTimer.key.delete(key);
      continue;
    }
    const next = {
      key,
      shipId: binding.shipId,
      deviceId,
      instanceRevision: binding.revision,
      dueMicros: BigInt(due),
    };
    if (!timer) ctx.db.shipLogicTimer.insert(next);
    else if (
      timer.dueMicros !== next.dueMicros ||
      timer.instanceRevision !== binding.revision
    )
      ctx.db.shipLogicTimer.key.update(next);
  }
}

/** Evaluate one event on a ship's logic and persist the result. Returns the evaluation. */
export function fireShipLogic(
  ctx: Context,
  shipId: string,
  event: LogicEvent,
  suitRefusal: (characterId: string) => string,
) {
  const binding = shipPrefabBinding(ctx.db, shipId);
  if (!binding?.logic) return;
  const result = evaluateLogic(
    binding.logic.graph,
    (id) => logicDeviceState(ctx.db, binding, id)!,
    event,
    {
      now: Number(ctx.timestamp.microsSinceUnixEpoch),
      obstructed: (id) => doorObstructed(ctx.db, binding, id),
    },
  );
  // A queued close or stage timer can consume after occupants/equipment change.
  // Check only controllers touched by this event, before committing any output.
  for (const [id, next] of result.states) {
    if (next.kind !== "airlock-controller") continue;
    const before = logicDeviceState(ctx.db, binding, id);
    if (
      (next.phase === "depressurising" ||
        (before?.kind === "airlock-controller" &&
          before.phase === "depressurising")) &&
      unsuitedChamberOccupant(ctx.db, binding, id, suitRefusal)
    )
      return { applied: false } as const;
  }
  writeStates(ctx, binding, result.states);
  return { applied: true, evaluation: result } as const;
}

function actorOf(ctx: Pick<Context, "db" | "sender">) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor?.connected) throw new SenderError("Character unavailable");
  if (isDead(ctx, actor.id)) throw new SenderError("You are dead");
  return actor;
}

/** E on a wall button: validated proximity and side, then a press event. */
export function pressShipButton(
  ctx: Context,
  args: { shipId: string; deviceId: string },
  /** The EVA entry gate (`evaEntryAllowed`), required to press an exterior panel. */
  exteriorAllowed: (actorId: string, shipId: string) => boolean,
  /**
   * The suit rule (EVA suit, helmet and jetpack equipped): an empty string when suited, else the
   * refusal message. Only consulted when the press would depressurise an airlock chamber.
   */
  suitRefusal: (characterId: string) => string,
) {
  const actor = actorOf(ctx);
  const binding = shipPrefabBinding(ctx.db, args.shipId);
  const panel = binding?.logic?.panels.find(
    (p) => p.deviceId === args.deviceId,
  );
  if (!binding?.logic || !panel) throw new SenderError("No button there");
  if (!ctx.db.shipWorldMotion.shipId.find(args.shipId))
    throw new SenderError("The ship is not in open space");
  const body = ctx.db.evaBody.characterId.find(actor.id);
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  if (!body && location) {
    if (location.instanceId !== args.shipId || actor.shipId !== args.shipId)
      throw new SenderError("Move closer to the button");
    if (panel.side !== "interior")
      throw new SenderError("That button is on the outside of the hull");
    if (
      ctx.db.couchSeat.characterId.find(actor.id) ||
      ctx.db.constructionPilotSeat.characterId.find(actor.id)
    )
      throw new SenderError("Stand up first");
    if (
      reachablePanel(binding.logic, [actor.localX, actor.localY], "interior")
        ?.deviceId !== panel.deviceId
    )
      throw new SenderError("Move closer to the button");
  } else if (body) {
    if (body.phase !== "local" || body.anchorShipId !== args.shipId)
      throw new SenderError("Move closer to the button");
    if (panel.side !== "exterior")
      throw new SenderError("That button is inside the ship");
    if (
      reachablePanel(binding.logic, [body.localX, body.localY], "exterior")
        ?.deviceId !== panel.deviceId
    )
      throw new SenderError("Move closer to the button");
    if (!exteriorAllowed(actor.id, args.shipId))
      throw new SenderError("The panel does not respond to you");
  } else throw new SenderError("Move closer to the button");
  refuseUnsuitedDepressurisation(
    ctx,
    binding,
    actor,
    !body,
    panel.deviceId,
    suitRefusal,
  );
  const outcome = fireShipLogic(
    ctx,
    args.shipId,
    { kind: "press", device: panel.deviceId },
    suitRefusal,
  );
  if (outcome?.applied === false)
    throw new SenderError(
      "Someone in the airlock has no EVA suit: the airlock will not depressurise",
    );
}

/** Complete physical chamber membership; disconnected bodies remain occupants. */
function unsuitedChamberOccupant(
  db: Db,
  binding: ShipPrefabBinding,
  controllerId: string,
  suitRefusal: (characterId: string) => string,
): boolean {
  const chamber = binding.logic?.chambers.find(
    (c) => c.controllerId === controllerId,
  );
  if (!chamber) return false;
  for (const l of db.constructionLocation.by_instance.filter(binding.shipId)) {
    const c = db.character.id.find(l.characterId);
    if (
      c &&
      c.shipId === binding.shipId &&
      inChamber(chamber, [c.localX, c.localY]) &&
      suitRefusal(c.id)
    )
      return true;
  }
  return false;
}

/**
 * Vacuum safety (owner 2026-09-29: a space suit, helmet and EVA jetpack before existing in vacuum):
 * a press that would start depressurising an airlock chamber is refused when the presser (from
 * inside the ship) or anyone standing in that chamber is not suited. Exposure damage is later work.
 */
function refuseUnsuitedDepressurisation(
  ctx: Context,
  binding: ShipPrefabBinding,
  actor: { id: string },
  pressedFromAboard: boolean,
  deviceId: string,
  suitRefusal: (characterId: string) => string,
) {
  const logic = binding.logic!;
  const preview = evaluateLogic(
    logic.graph,
    (id) => logicDeviceState(ctx.db, binding, id)!,
    { kind: "press", device: deviceId },
    {
      now: Number(ctx.timestamp.microsSinceUnixEpoch),
      obstructed: () => false,
    },
  );
  for (const [id, next] of preview.states) {
    const before = logicDeviceState(ctx.db, binding, id);
    if (
      next.kind !== "airlock-controller" ||
      before?.kind !== "airlock-controller" ||
      before.phase !== "pressurised" ||
      next.phase !== "depressurising"
    )
      continue;
    if (pressedFromAboard) {
      const refusal = suitRefusal(actor.id);
      if (refusal) throw new SenderError(refusal);
    }
    if (unsuitedChamberOccupant(ctx.db, binding, id, suitRefusal))
      throw new SenderError(
        "Someone in the airlock has no EVA suit: the airlock will not depressurise",
      );
  }
}

/** Fire due timers (bounded); drop timers of retired revisions or missing ships. */
export function stepShipLogic(
  ctx: Context,
  suitRefusal: (characterId: string) => string,
) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const due: { key: string; shipId: string; deviceId: string; rev: bigint }[] =
    [];
  let seen = 0;
  for (const timer of ctx.db.shipLogicTimer.iter()) {
    if (++seen > LOGIC_BUDGET.timersPerTick * 4) break;
    if (timer.dueMicros <= now)
      due.push({
        key: timer.key,
        shipId: timer.shipId,
        deviceId: timer.deviceId,
        rev: timer.instanceRevision,
      });
  }
  due.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const t of due.slice(0, LOGIC_BUDGET.timersPerTick)) {
    const binding = shipPrefabBinding(ctx.db, t.shipId);
    if (
      !binding?.logic ||
      binding.revision !== t.rev ||
      !binding.logic.graph.devices.has(t.deviceId)
    ) {
      ctx.db.shipLogicTimer.key.delete(t.key);
      continue;
    }
    const outcome = fireShipLogic(
      ctx,
      t.shipId,
      { kind: "timer", device: t.deviceId },
      suitRefusal,
    );
    if (outcome?.applied === false) {
      const pending = ctx.db.shipLogicTimer.key.find(t.key);
      if (pending)
        ctx.db.shipLogicTimer.key.update({
          ...pending,
          dueMicros: now + BigInt(LOGIC_BUDGET.doorRetryMicros),
        });
      continue;
    }
    // Defensive: a timer the device did not move forward never spins.
    const after = ctx.db.shipLogicTimer.key.find(t.key);
    if (after && after.dueMicros <= now)
      ctx.db.shipLogicTimer.key.delete(t.key);
  }
}

/** Remove a ship's logic rows (ship wipe / removal). */
export function deleteShipLogic(ctx: Pick<Context, "db">, shipId: string) {
  for (const row of [...ctx.db.shipLogicState.by_ship.filter(shipId)])
    ctx.db.shipLogicState.key.delete(row.key);
  for (const row of [...ctx.db.shipLogicTimer.by_ship.filter(shipId)])
    ctx.db.shipLogicTimer.key.delete(row.key);
}

// ------------------------------------------------------------------ view

export const visibleShipLogicProjection = t.row("ShipLogicDeviceStatus", {
  key: t.string().primaryKey(),
  shipId: t.string(),
  deviceId: t.string(),
  kind: t.string(),
  /** door: open/closed/locked; airlock-controller: its phase; button: its light. */
  state: t.string(),
  /** Status light (buttons and controllers). */
  light: t.string(),
  /** Doors: open now. */
  open: t.bool(),
  /** Controllers: end of the running stage (µs, 0 = none or waiting for the doors to seal). */
  endsMicros: t.u64(),
  /** Buttons: last accepted press (µs). */
  pressedMicros: t.u64(),
});

/**
 * Device states of the ships the viewer is at: the ship they stand aboard, the ship whose frame
 * their EVA body is in, and the home ship they left. Door, light and phase values only; never who
 * pressed or any other character data. A ship the viewer is only floating beside (EVA frame of
 * another ship, no interior presence) shows its exterior devices only: hull-face buttons and
 * exterior doors, never interior doors, interior buttons or controllers (wiki `Architecture/
 * Visibility and Interest Management`, hard rule 6).
 */
export function visibleShipLogic(ctx: ReadContext) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor?.connected) return [];
  // Interior presence: aboard now, or the ship this spacewalker left through its airlock.
  const inside = new Set<string>();
  const ships = new Set<string>();
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  if (location) inside.add(location.instanceId);
  const body = ctx.db.evaBody.characterId.find(actor.id);
  if (body?.exitShipId) inside.add(body.exitShipId);
  for (const id of inside) ships.add(id);
  if (body?.anchorShipId) ships.add(body.anchorShipId);
  const out = [];
  for (const shipId of [...ships].sort()) {
    const binding = shipPrefabBinding(ctx.db, shipId);
    if (!binding?.logic) continue;
    const exterior = inside.has(shipId)
      ? undefined
      : new Set([
          ...binding.logic.panels
            .filter((p) => p.side === "exterior")
            .map((p) => p.deviceId),
          ...binding.logic.doors
            .filter((d) => d.exterior)
            .map((d) => d.deviceId),
        ]);
    for (const node of binding.logic.graph.devices.values()) {
      if (exterior && !exterior.has(node.id)) continue;
      const s = logicDeviceState(ctx.db, binding, node.id);
      if (!s) continue;
      out.push({
        key: stateKey(shipId, node.id),
        shipId,
        deviceId: node.id,
        kind: node.kind,
        state:
          s.kind === "door"
            ? s.open
              ? "open"
              : s.locked
                ? "locked"
                : "closed"
            : s.kind === "airlock-controller"
              ? s.phase
              : s.light,
        light:
          s.kind === "button"
            ? s.light
            : s.kind === "airlock-controller"
              ? s.phase === "pressurised"
                ? "green"
                : s.phase === "vacuum"
                  ? "red"
                  : "amber"
              : "off",
        open: s.kind === "door" ? s.open : false,
        endsMicros: BigInt(s.kind === "airlock-controller" ? s.endsMicros : 0),
        pressedMicros: BigInt(s.kind === "button" ? s.pressedMicros : 0),
      });
    }
  }
  return out;
}
