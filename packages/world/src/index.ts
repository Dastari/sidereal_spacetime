import { schema, table, t, SenderError } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import { integrate, walk, assertRevision } from "../../sim/src/index";
import { STARTER } from "../../content/src/index";
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
  character,
  ship,
  station,
  input,
  editReceipt,
  movementTimer,
});
export default db;
export const ownCharacters = db.view(
  { name: "own_characters", public: true },
  t.array(character.rowType),
  (ctx) => [...ctx.db.character.by_owner.filter(ctx.sender)],
);
export const ownShips = db.view(
  { name: "own_ships", public: true },
  t.array(ship.rowType),
  (ctx) => [...ctx.db.ship.by_owner.filter(ctx.sender)],
);
export const ownStations = db.view(
  { name: "own_stations", public: true },
  t.array(station.rowType),
  (ctx) =>
    [...ctx.db.ship.by_owner.filter(ctx.sender)].flatMap((s) => {
      const seat = ctx.db.station.shipId.find(s.id);
      return seat ? [seat] : [];
    }),
);
export const ownEditReceipts = db.view(
  { name: "own_edit_receipts", public: true },
  t.array(editReceipt.rowType),
  (ctx) => [...ctx.db.editReceipt.by_owner.filter(ctx.sender)],
);
export const init = db.init((ctx) => {
  ctx.db.movementTimer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(50000n),
  });
});
export const enterLab = db.reducer({ name: t.string() }, (ctx, { name }) => {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 40)
    throw new SenderError("Use a character name between 2 and 40 characters");
  const existing = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (existing) {
    ctx.db.character.id.update({ ...existing, connected: true });
    return;
  }
  const characterId = ctx.newUuidV4().toString(),
    shipId = ctx.newUuidV4().toString();
  ctx.db.character.insert({
    id: characterId,
    owner: ctx.sender,
    name: clean,
    shipId,
    localX: 0,
    localY: 6,
    connected: true,
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
    localY: 6,
    operational: true,
  });
  ctx.db.input.insert({
    characterId,
    sequence: 0n,
    throttle: 0,
    turn: 0,
    dx: 0,
    dy: 0,
    updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
});
export const disconnect = db.clientDisconnected((ctx) => {
  for (const actor of ctx.db.character.by_owner.filter(ctx.sender)) {
    ctx.db.character.id.update({ ...actor, connected: false });
    const seat = ctx.db.station.shipId.find(actor.shipId);
    if (seat?.occupantId === actor.id)
      ctx.db.station.id.update({ ...seat, occupantId: undefined });
    const command = ctx.db.input.characterId.find(actor.id);
    if (command)
      ctx.db.input.characterId.update({
        ...command,
        throttle: 0,
        turn: 0,
        dx: 0,
        dy: 0,
      });
  }
});
export const setIntent = db.reducer(
  {
    sequence: t.u64(),
    throttle: t.f64(),
    turn: t.f64(),
    dx: t.f64(),
    dy: t.f64(),
  },
  (ctx, args) => {
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
      updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  },
);
export const useStation = db.reducer((ctx) => {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor?.connected) throw new SenderError("Character unavailable");
  const seat = ctx.db.station.shipId.find(actor.shipId);
  if (!seat?.operational) throw new SenderError("Station unavailable");
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
    });
  }
  const command = ctx.db.input.characterId.find(actor.id);
  if (command)
    ctx.db.input.characterId.update({
      ...command,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
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
    const previous = ctx.db.editReceipt.id.find(receiptId);
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
        actor.shipId === target.id &&
        command &&
        ctx.timestamp.microsSinceUnixEpoch - command.updatedMicros < 300000n;
      const intent = enabled
        ? { throttle: command.throttle, turn: command.turn }
        : { throttle: 0, turn: 0 };
      if (
        intent.throttle === 0 &&
        intent.turn === 0 &&
        target.vx === 0 &&
        target.vy === 0 &&
        target.omega === 0
      )
        continue;
      let motion = target;
      for (let i = 0; i < 3; i++)
        motion = {
          ...motion,
          ...integrate(
            motion,
            intent,
            target.massKg,
            target.thrustN,
            target.turnAcceleration,
          ),
        };
      ctx.db.ship.id.update({ ...motion, tick: target.tick + 1n });
    }
    for (const actor of ctx.db.character.iter()) {
      if (!actor.connected) continue;
      const seat = ctx.db.station.shipId.find(actor.shipId);
      if (seat?.occupantId === actor.id) continue;
      const command = ctx.db.input.characterId.find(actor.id);
      if (
        !command ||
        ctx.timestamp.microsSinceUnixEpoch - command.updatedMicros >= 300000n ||
        (command.dx === 0 && command.dy === 0)
      )
        continue;
      let point = { x: actor.localX, y: actor.localY };
      for (let i = 0; i < 3; i++)
        point = walk(point.x, point.y, command.dx, command.dy);
      ctx.db.character.id.update({
        ...actor,
        localX: point.x,
        localY: point.y,
      });
    }
  },
);
