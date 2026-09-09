import { compilePublishedNativeExternalAirlock } from "@sidereal/sim/construction-airlock-published";
import {
  ownedGameShipAccess,
  GAME_OWNED_TEMPLATE_NAMESPACE,
} from "./game-ship-access-authority";
import {
  table,
  t,
  SenderError,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type world from "./index";
import * as auth from "./auth";
import { consumeInputControl } from "./input-control";
import { requireGrant, operation, receipt } from "./construction";
import {
  readNativeAirlockDocument,
  nativeAirlockCollision,
  bindNativeAirlockPlan,
  type NativeAirlockDocument,
} from "@sidereal/sim/construction-airlock-document";
import {
  acceptNativeExternalAirlockInstallation,
  nativeExternalAirlockPressure,
  NATIVE_EXTERNAL_AIRLOCK_AUDIT_SHA256,
  type NativeExternalAirlockPlan,
} from "@sidereal/sim/construction-airlock-plan";
import {
  requestNativeAirlock,
  stepNativeAirlock,
  type NativeAirlockState,
  type NativeAirlockContext,
} from "@sidereal/sim/construction-airlock-controller";
import { doorSweepOccupied } from "@sidereal/sim/construction-door-motion";
import {
  canReachOnDeck,
  canOccupyDeck,
} from "@sidereal/sim/construction-collision";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { stableStringify } from "@sidereal/sim/layout-geometry";
import {
  initializeAtmosphere,
  replaceAtmosphereModel,
  stepAtmosphere,
  ownAtmospheres,
} from "./construction-atmosphere";
import type { NativeRoomInstalledPart } from "@sidereal/sim/construction-native-room";

export const constructionAirlock = table(
  {
    name: "construction_airlock",
    indexes: [
      { accessor: "by_active", algorithm: "btree", columns: ["active"] },
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
    ],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    deckId: t.string(),
    innerDoorId: t.string().unique(),
    outerDoorId: t.string().unique(),
    documentHash: t.string(),
    auditSha256: t.string(),
    installationFingerprint: t.string(),
    installedPartsJson: t.string(),
    innerSealRetraction: t.f64(),
    outerSealRetraction: t.f64(),
    innerFraction: t.f64(),
    outerFraction: t.f64(),
    driverActorId: t.string(),
    driverConnectionId: t.string(),
    driveDoorId: t.string(),
    driveExpiresMicros: t.u64(),
    active: t.bool(),
    tick: t.u64(),
    lastScheduleMicros: t.u64(),
    revision: t.u64(),
  },
);
export interface ConstructionAirlockRow {
  id: string;
  owner: Identity;
  deckId: string;
  innerDoorId: string;
  outerDoorId: string;
  documentHash: string;
  auditSha256: string;
  installationFingerprint: string;
  installedPartsJson: string;
  innerSealRetraction: number;
  outerSealRetraction: number;
  innerFraction: number;
  outerFraction: number;
  driverActorId: string;
  driverConnectionId: string;
  driveDoorId: string;
  driveExpiresMicros: bigint;
  active: boolean;
  tick: bigint;
  lastScheduleMicros: bigint;
  revision: bigint;
}
interface AirlockReadTable {
  id: { find(id: string): ConstructionAirlockRow | null | undefined };
  by_owner: { filter(owner: Identity): Iterable<ConstructionAirlockRow> };
  by_active: { filter(active: boolean): Iterable<ConstructionAirlockRow> };
}
interface AirlockTable extends AirlockReadTable {
  insert(row: ConstructionAirlockRow): unknown;
  id: AirlockReadTable["id"] & { update(row: ConstructionAirlockRow): unknown };
}
export type AirlockContext = ReducerCtx<InferSchema<typeof world>> & {
  db: { constructionAirlock: AirlockTable };
};
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender"> & {
  db: { constructionAirlock: AirlockReadTable };
};
export type NativeAirlockCompiler = (
  instanceId: string,
) => NativeExternalAirlockPlan;
const FLOW = {
  id: "native-airlock-review-flow-v1",
  openConductance: 0.002,
  unsealedConductance: 0.00001,
};
const hash = (value: unknown) => constructionHash(stableStringify(value));
const requireAirlock = (ok: unknown, reason: string): void => {
  if (!ok) throw new SenderError("Airlock: " + reason);
};
import { scopedAtmosphereTable } from "./construction-atmosphere-scope";
export { scopedAtmosphereTable } from "./construction-atmosphere-scope";
const bindPlan = bindNativeAirlockPlan;
const cache = new Map<
  string,
  {
    documentHash: string;
    installedPartsJson: string;
    fingerprint: string;
    document: NativeAirlockDocument;
    plan: NativeExternalAirlockPlan;
  }
>();
function verified(
  ctx: Pick<ReadContext, "db">,
  row: ConstructionAirlockRow,
  compile: NativeAirlockCompiler,
) {
  const instance = ctx.db.constructionInstance.id.find(row.id);
  requireAirlock(
    instance &&
      instance.owner.isEqual(row.owner) &&
      hash(instance.documentJson) === row.documentHash &&
      row.auditSha256 === NATIVE_EXTERNAL_AIRLOCK_AUDIT_SHA256,
    "installed source/document changed",
  );
  const previous = cache.get(row.id);
  if (
    previous &&
    previous.documentHash === row.documentHash &&
    previous.installedPartsJson === row.installedPartsJson &&
    previous.fingerprint === row.installationFingerprint
  )
    return previous;
  const document = readNativeAirlockDocument(instance!.documentJson),
    plan = bindPlan(document, compile, row.id);
  requireAirlock(
    document.airlockRoom.deckId === row.deckId &&
      document.airlockRoom.innerDoorId === row.innerDoorId &&
      document.airlockRoom.outerDoorId === row.outerDoorId,
    "accepted native identity binding changed",
  );
  requireAirlock(
    acceptNativeExternalAirlockInstallation(
      plan,
      JSON.parse(row.installedPartsJson) as NativeRoomInstalledPart[],
    ) === row.installationFingerprint,
    "installed native parts changed",
  );
  const result = {
    documentHash: row.documentHash,
    installedPartsJson: row.installedPartsJson,
    fingerprint: row.installationFingerprint,
    document,
    plan,
  };
  if (cache.size >= 32) cache.clear();
  cache.set(row.id, result);
  return result;
}
function doors(ctx: Pick<ReadContext, "db">, row: ConstructionAirlockRow) {
  const inner = ctx.db.constructionDoor.id.find(row.innerDoorId),
    outer = ctx.db.constructionDoor.id.find(row.outerDoorId);
  requireAirlock(
    inner &&
      outer &&
      inner.instanceId === row.id &&
      outer.instanceId === row.id &&
      inner.deckId === row.deckId &&
      outer.deckId === row.deckId &&
      inner.x === 2 &&
      inner.y === 0 &&
      inner.quarterTurns === 1 &&
      outer.x === 6 &&
      outer.y === 2 &&
      outer.quarterTurns === 3 &&
      inner.fraction === row.innerFraction &&
      outer.fraction === row.outerFraction,
    "door bypassed accepted native controller",
  );
  return { inner: inner!, outer: outer! };
}
function state(
  ctx: Pick<ReadContext, "db">,
  row: ConstructionAirlockRow,
): NativeAirlockState {
  const d = doors(ctx, row);
  return {
    inner: {
      hingeFraction: d.inner.fraction,
      sealRetraction: row.innerSealRetraction,
      targetOpen: d.inner.targetOpen,
      blocked: d.inner.blocked,
    },
    outer: {
      hingeFraction: d.outer.fraction,
      sealRetraction: row.outerSealRetraction,
      targetOpen: d.outer.targetOpen,
      blocked: d.outer.blocked,
    },
    pumpTarget: null,
  };
}
function pressure(
  ctx: Pick<ReadContext, "db">,
  row: ConstructionAirlockRow,
  plan: NativeExternalAirlockPlan,
) {
  const values = ownAtmospheres(
    {
      by_owner: {
        filter: function* () {
          const gas = ctx.db.constructionAtmosphere.id.find(row.id);
          if (gas) yield gas;
        },
      },
    },
    row.owner,
  )[0];
  requireAirlock(values, "missing accounted atmosphere");
  const topology = nativeExternalAirlockPressure(
    plan,
    row.deckId,
    state(ctx, row),
    FLOW,
  ).topology;
  const p = (id: string) =>
    values.compartments.find((c) => c.id === topology.cellCompartment.get(id))!
      .pressurePa;
  return {
    chamberPa: p(plan.cells[1].id),
    innerPa: p(plan.cells[0].id),
    outerPa: 0,
    maxOpeningDifferentialPa: 1000,
  };
}
export function installNativeAirlock(
  ctx: AirlockContext,
  instanceId: string,
  actualParts: readonly NativeRoomInstalledPart[],
  compile: NativeAirlockCompiler,
) {
  const instance = ctx.db.constructionInstance.id.find(instanceId);
  requireAirlock(
    instance && instance.owner.isEqual(ctx.sender),
    "owned instance required",
  );
  const document = readNativeAirlockDocument(instance!.documentJson),
    plan = bindPlan(document, compile, instanceId),
    a = document.airlockRoom;
  const fingerprint = acceptNativeExternalAirlockInstallation(
      plan,
      actualParts,
    ),
    old = ctx.db.constructionAirlock.id.find(instanceId);
  if (old) {
    requireAirlock(
      old.documentHash === hash(instance!.documentJson) &&
        old.installationFingerprint === fingerprint &&
        old.installedPartsJson === stableStringify(actualParts),
      "conflicting installation replay",
    );
    verified(ctx, old, compile);
    doors(ctx, old);
    requireAirlock(
      ctx.db.constructionAtmosphere.id.find(instanceId),
      "missing retained gas",
    );
    return old;
  }
  requireAirlock(
    [
      ...ctx.db.constructionAirlock.by_active.filter(false),
      ...ctx.db.constructionAirlock.by_active.filter(true),
    ].length < 32,
    "installation budget",
  );
  for (const door of plan.doors) {
    requireAirlock(
      !ctx.db.constructionDoor.id.find(door.id),
      "door identity already installed",
    );
    ctx.db.constructionDoor.insert({
      id: door.id,
      instanceId,
      deckId: a.deckId,
      x: door.originM[0],
      y: door.originM[1],
      quarterTurns: door.quarterTurns,
      fraction: 0,
      targetOpen: false,
      blocked: false,
      moving: false,
      revision: 1n,
    });
  }
  const row: ConstructionAirlockRow = {
    id: instanceId,
    owner: instance!.owner,
    deckId: a.deckId,
    innerDoorId: a.innerDoorId,
    outerDoorId: a.outerDoorId,
    documentHash: hash(instance!.documentJson),
    auditSha256: NATIVE_EXTERNAL_AIRLOCK_AUDIT_SHA256,
    installationFingerprint: fingerprint,
    installedPartsJson: stableStringify(actualParts),
    innerSealRetraction: 0,
    outerSealRetraction: 0,
    innerFraction: 0,
    outerFraction: 0,
    driverActorId: "",
    driverConnectionId: "",
    driveDoorId: "",
    driveExpiresMicros: 0n,
    active: false,
    tick: 0n,
    lastScheduleMicros: 0n,
    revision: 1n,
  };
  const model = nativeExternalAirlockPressure(
    plan,
    a.deckId,
    state(ctx, row),
    FLOW,
  );
  initializeAtmosphere(
    ctx.db.constructionAtmosphere,
    instance!,
    {
      structure: model.structure,
      proofHash: hash([row.auditSha256, fingerprint, model.structure, FLOW]),
    },
    { kind: "vacuum" },
    0n,
  );
  ctx.db.constructionAirlock.insert(row);
  return row;
}
function validDriver(
  ctx: AirlockContext,
  row: ConstructionAirlockRow,
  document: NativeAirlockDocument,
  plan: NativeExternalAirlockPlan,
) {
  const actor = ctx.db.character.id.find(row.driverActorId),
    visit = actor && ctx.db.constructionLocation.characterId.find(actor.id),
    lease = actor && ctx.db.inputControl.characterId.find(actor.id),
    instance = ctx.db.constructionInstance.id.find(row.id);
  if (
    !actor?.connected ||
    !actor.owner.isEqual(row.owner) ||
    actor.shipId !== row.id ||
    !visit ||
    visit.instanceId !== row.id ||
    visit.deckId !== row.deckId ||
    !lease ||
    lease.connectionId !== row.driverConnectionId ||
    row.driveExpiresMicros <= ctx.timestamp.microsSinceUnixEpoch ||
    !consumeInputControl(ctx, actor.id) ||
    !auth.canConsume(ctx, row.owner) ||
    ctx.db.couchSeat.characterId.find(actor.id) ||
    ctx.db.constructionTraversal.characterId.find(actor.id) ||
    ctx.db.constructionStairWalk.characterId.find(actor.id)
  )
    return false;
  try {
    if (instance!.workspaceId === GAME_OWNED_TEMPLATE_NAMESPACE) {
      if (
        !ownedGameShipAccess(
          { ...ctx, sender: row.owner },
          row.id,
          row.deckId,
          ctx.timestamp.microsSinceUnixEpoch,
        ).useObjects
      )
        return false;
    } else {
      requireGrant(
        { ...ctx, sender: row.owner },
        instance!.workspaceId,
        "draft.read",
      );
      requireGrant(
        { ...ctx, sender: row.owner },
        instance!.workspaceId,
        "instance.spawn",
      );
    }
  } catch {
    return false;
  }
  return serviceReach(ctx, row, document, plan, actor, row.driveDoorId);
}
/** Same supported approach/obstruction test is used by command consumption and the view. */
function serviceReach(
  ctx: Pick<ReadContext, "db">,
  row: ConstructionAirlockRow,
  document: NativeAirlockDocument,
  plan: NativeExternalAirlockPlan,
  actor: { localX: number; localY: number },
  doorId: string,
) {
  const s = state(ctx, row),
    frame = nativeAirlockCollision(document, plan, [
      {
        openingId: row.innerDoorId,
        fraction: s.inner.hingeFraction,
        sealRetraction: s.inner.sealRetraction,
      },
      {
        openingId: row.outerDoorId,
        fraction: s.outer.hingeFraction,
        sealRetraction: s.outer.sealRetraction,
      },
    ]);
  const current = {
    shipId: row.id,
    deckId: row.deckId,
    position: [actor.localX, actor.localY] as [number, number],
  };
  if (!canOccupyDeck(frame, current, 0.3)) return false;
  const x = doorId === row.innerDoorId ? 2 : 6;
  // Existing native assets have no separately qualified service handle socket.
  // This is explicitly a nearby manual SERVICE operation, not a made-up handle.
  // Keep the service stance outside the entire1.25m leaf sweep plus0.3m body,
  // otherwise the closing door can invalidate its own service approach mid-motion.
  const target = {
    ...current,
    position: [x + (actor.localX < x ? -1.6 : 1.6), 1] as [number, number],
  };
  return (
    Math.hypot(actor.localX - x, actor.localY - 1) <= 2.5 &&
    canReachOnDeck(frame, current, target, 2.5)
  );
}
function motionContext(
  ctx: AirlockContext,
  row: ConstructionAirlockRow,
  plan: NativeExternalAirlockPlan,
  drive: boolean,
): NativeAirlockContext {
  const bodies = [...ctx.db.constructionLocation.by_instance.filter(row.id)]
    .filter((v) => v.deckId === row.deckId)
    .map((v) => ctx.db.character.id.find(v.characterId))
    .filter((a) => a && a.shipId === row.id)
    .map((a) => ({
      position: [a!.localX, a!.localY] as [number, number],
      radius: 0.3,
    }));
  const sweep = (side: "inner" | "outer") =>
    doorSweepOccupied(
      {
        id: side === "inner" ? row.innerDoorId : row.outerDoorId,
        origin: side === "inner" ? [2, 0] : [6, 2],
        quarterTurns: side === "inner" ? 1 : 3,
      },
      bodies,
    );
  // "powered" is the pure mechanism's actuation gate. Here it is supplied ONLY
  // by bounded accepted manual work; no electrical supply or motor is asserted.
  return {
    pressure: pressure(ctx, row, plan),
    powered: drive,
    actuatedSides: [row.driveDoorId === row.innerDoorId ? "inner" : "outer"],
    chamberIntact: true,
    sealsQualified: { inner: true, outer: true },
    motion: {
      inner: {
        hingeSeconds: 1,
        sealSeconds: 0.25,
        hingeObstructed: sweep("inner"),
        sealObstructed: sweep("inner"),
      },
      outer: {
        hingeSeconds: 1,
        sealSeconds: 0.25,
        hingeObstructed: sweep("outer"),
        sealObstructed: sweep("outer"),
      },
    },
  };
}
export function requestNativeAirlockDoor(
  ctx: AirlockContext,
  args: {
    openingId: string;
    expectedVisitId: string;
    expectedRevision: bigint;
    open: boolean;
    operationId: string;
  },
  compile: NativeAirlockCompiler,
): boolean {
  const door = ctx.db.constructionDoor.id.find(args.openingId),
    row = door && ctx.db.constructionAirlock.id.find(door.instanceId);
  if (!row) return false;
  auth.requireGame(ctx);
  const actor = ctx.db.character.by_owner
      .filter(ctx.sender)
      [Symbol.iterator]()
      .next().value,
    visit = actor && ctx.db.constructionLocation.characterId.find(actor.id);
  requireAirlock(
    actor &&
      visit?.visitId === args.expectedVisitId &&
      row.owner.isEqual(ctx.sender),
    "accepted owned visit required",
  );
  const { document, plan } = verified(ctx, row, compile),
    lease = ctx.db.inputControl.characterId.find(actor!.id);
  requireAirlock(
    lease?.connectionId === ctx.connectionId!.toHexString(),
    "active input-control connection required",
  );
  requireAirlock(
    !row.driverActorId || row.driveDoorId === door!.id,
    "another mechanism is being operated",
  );
  const driven = {
    ...row,
    driverActorId: actor!.id,
    driverConnectionId: ctx.connectionId!.toHexString(),
    driveDoorId: door!.id,
    driveExpiresMicros: ctx.timestamp.microsSinceUnixEpoch + 3_000_000n,
  };
  requireAirlock(
    validDriver(ctx, driven, document, plan),
    "manual service requires supported nearby actor/control/access",
  );
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "native-airlock-manual-service",
      ...args,
      expectedRevision: args.expectedRevision.toString(),
    },
    args.expectedRevision,
    door!.revision,
  );
  if (op.replay) return true;
  const side = door!.id === row.innerDoorId ? "inner" : "outer",
    decision = requestNativeAirlock(
      state(ctx, row),
      motionContext(ctx, row, plan, true),
      { kind: args.open ? "open" : "close", side },
      true,
    );
  if (!decision.ok) throw new SenderError("Airlock: " + decision.reason);
  const accepted =
    side === "inner" ? state(ctx, row).inner : state(ctx, row).outer;
  if (
    accepted.hingeFraction === (args.open ? 1 : 0) &&
    accepted.sealRetraction === (args.open ? 1 : 0) &&
    accepted.targetOpen === args.open
  ) {
    receipt(ctx, op.key, op.request, door!.id, door!.revision);
    return true;
  }
  ctx.db.constructionDoor.id.update({
    ...door!,
    targetOpen: args.open,
    blocked: false,
    moving: true,
    revision: door!.revision + 1n,
  });
  ctx.db.constructionAirlock.id.update({
    ...driven,
    active: true,
    revision: row.revision + 1n,
  });
  receipt(ctx, op.key, op.request, door!.id, door!.revision + 1n);
  return true;
}
export function stepNativeAirlocks(
  ctx: AirlockContext,
  compile: NativeAirlockCompiler,
) {
  const rows = [...ctx.db.constructionAirlock.by_active.filter(true)];
  requireAirlock(rows.length <= 32, "active controller budget");
  let changed = 0;
  for (const row of rows) {
    const now = ctx.timestamp.microsSinceUnixEpoch;
    if (now <= row.lastScheduleMicros || now - row.lastScheduleMicros < 50_000n)
      continue;
    const { document, plan } = verified(ctx, row, compile),
      before = state(ctx, row),
      d = doors(ctx, row),
      drive = validDriver(ctx, row, document, plan),
      context = motionContext(ctx, row, plan, drive);
    const next = stepNativeAirlock(before, context, 0.05);
    const table = scopedAtmosphereTable(ctx.db.constructionAtmosphere, [
      row.id,
    ]);
    const gasBefore = table.id.find(row.id)!;
    const model = nativeExternalAirlockPressure(plan, row.deckId, next, FLOW),
      proofHash = hash([
        row.auditSha256,
        row.installationFingerprint,
        model.structure,
        FLOW,
      ]);
    if (gasBefore.proofHash !== proofHash)
      replaceAtmosphereModel(
        table,
        row.id,
        gasBefore.revision,
        { structure: model.structure, proofHash },
        "reject-removal",
      );
    const gasChanges = stepAtmosphere(table, row.tick + 1n, 0.05);
    let poseChanged = false;
    for (const side of ["inner", "outer"] as const) {
      const old = d[side],
        n = next[side],
        moving =
          drive &&
          (n.hingeFraction !== (n.targetOpen ? 1 : 0) ||
            n.sealRetraction !== (n.targetOpen ? 1 : 0));
      if (
        old.fraction !== n.hingeFraction ||
        old.blocked !== n.blocked ||
        old.moving !== moving
      ) {
        ctx.db.constructionDoor.id.update({
          ...old,
          fraction: n.hingeFraction,
          blocked: n.blocked,
          moving,
          revision: old.revision + 1n,
        });
        poseChanged = true;
      }
    }
    const selected =
      row.driveDoorId === row.innerDoorId ? next.inner : next.outer;
    const keepDriver =
      drive &&
      (selected.hingeFraction !== (selected.targetOpen ? 1 : 0) ||
        selected.sealRetraction !== (selected.targetOpen ? 1 : 0));
    const updated = {
      ...row,
      innerFraction: next.inner.hingeFraction,
      outerFraction: next.outer.hingeFraction,
      innerSealRetraction: next.inner.sealRetraction,
      outerSealRetraction: next.outer.sealRetraction,
      driverActorId: keepDriver ? row.driverActorId : "",
      driverConnectionId: keepDriver ? row.driverConnectionId : "",
      driveDoorId: keepDriver ? row.driveDoorId : "",
      driveExpiresMicros: keepDriver ? row.driveExpiresMicros : 0n,
      active: keepDriver || gasChanges > 0,
    };
    const semantic = (
      Object.keys(updated) as (keyof ConstructionAirlockRow)[]
    ).some((key) => updated[key] !== row[key]);
    if (semantic || poseChanged || gasChanges) {
      ctx.db.constructionAirlock.id.update({
        ...updated,
        tick: row.tick + 1n,
        lastScheduleMicros: now,
        revision: row.revision + 1n,
      });
      changed++;
    }
  }
  return changed;
}
export const nativeAirlockProjection = t.row("NativeAirlockStatus", {
  id: t.string().primaryKey(),
  deckId: t.string(),
  innerDoorId: t.string(),
  outerDoorId: t.string(),
  innerFraction: t.f64(),
  outerFraction: t.f64(),
  innerSealRetraction: t.f64(),
  outerSealRetraction: t.f64(),
  interiorPressurePa: t.f64(),
  chamberPressurePa: t.f64(),
  outerPressurePa: t.f64(),
  manualServiceActive: t.bool(),
  innerCanService: t.bool(),
  outerCanService: t.bool(),
  revision: t.u64(),
});
export function ownNativeAirlocks(
  ctx: ReadContext,
  compile: NativeAirlockCompiler = compilePublishedNativeExternalAirlock,
) {
  if (!auth.canReadGame(ctx)) return [];
  const actor = ctx.db.character.by_owner
      .filter(ctx.sender)
      [Symbol.iterator]()
      .next().value,
    visit = actor && ctx.db.constructionLocation.characterId.find(actor.id),
    row = visit && ctx.db.constructionAirlock.id.find(visit.instanceId),
    instance = row && ctx.db.constructionInstance.id.find(row.id);
  if (
    !row ||
    !instance ||
    !row.owner.isEqual(ctx.sender) ||
    actor!.shipId !== row.id ||
    visit!.deckId !== row.deckId
  )
    return [];
  const gameAccess = ownedGameShipAccess(ctx, row.id, row.deckId);
  if (
    instance.workspaceId === GAME_OWNED_TEMPLATE_NAMESPACE &&
    !gameAccess.readInterior
  )
    return [];
  const grants = [...ctx.db.constructionGrant.by_principal.filter(ctx.sender)];
  if (
    !gameAccess.readInterior &&
    !["draft.read", "instance.spawn"].every((cap) =>
      grants.some(
        (g) =>
          g.workspaceId === instance.workspaceId &&
          g.capability === cap &&
          !g.revoked,
      ),
    )
  )
    return [];
  const gas = ownAtmospheres(
    {
      by_owner: {
        filter: function* () {
          const v = ctx.db.constructionAtmosphere.id.find(row.id);
          if (v) yield v;
        },
      },
    },
    row.owner,
  )[0];
  if (!gas) return [];
  // Native cells have stable identities; the common topology projection hashes
  // those identities, so order explicitly by each stored compartment's cell list.
  const structure = JSON.parse(
    ctx.db.constructionAtmosphere.id.find(row.id)!.structureJson,
  ) as { cells: { id: string }[] };
  const topology = compilePressureTopology(
    JSON.parse(ctx.db.constructionAtmosphere.id.find(row.id)!.structureJson),
  );
  const pa = (suffix: string) => {
    const cell = structure.cells.find((c) => c.id === `${row.id}:${suffix}`);
    return gas.compartments.find(
      (c) => c.id === topology.cellCompartment.get(cell!.id),
    )!.pressurePa;
  };
  const lease = ctx.db.inputControl.characterId.find(actor!.id),
    presence =
      lease && ctx.db.connectionPresence.connectionId.find(lease.connectionId),
    session = lease && ctx.db.authSession.connectionId.find(lease.connectionId);
  // Views use materialized admission/expiry; reducers revalidate time and the exact calling connection.
  const controls = !!(
    actor!.connected &&
    lease?.owner.isEqual(ctx.sender) &&
    presence?.owner.isEqual(ctx.sender) &&
    session?.owner.isEqual(ctx.sender) &&
    session.game &&
    !ctx.db.couchSeat.characterId.find(actor!.id) &&
    !ctx.db.constructionTraversal.characterId.find(actor!.id) &&
    !ctx.db.constructionStairWalk.characterId.find(actor!.id)
  );
  const { document, plan } = verified(ctx, row, compile);
  const canService = (doorId: string) =>
    controls &&
    (!row.driverActorId || row.driveDoorId === doorId) &&
    serviceReach(ctx, row, document, plan, actor!, doorId);
  return [
    {
      id: row.id,
      deckId: row.deckId,
      innerDoorId: row.innerDoorId,
      outerDoorId: row.outerDoorId,
      innerFraction: row.innerFraction,
      outerFraction: row.outerFraction,
      innerSealRetraction: row.innerSealRetraction,
      outerSealRetraction: row.outerSealRetraction,
      interiorPressurePa: pa("interior"),
      chamberPressurePa: pa("chamber"),
      outerPressurePa: 0,
      manualServiceActive: !!row.driverActorId,
      innerCanService: canService(row.innerDoorId),
      outerCanService: canService(row.outerDoorId),
      revision: row.revision,
    },
  ];
}
import { compilePressureTopology } from "@sidereal/sim/construction-topology";

/** Read only accepted door/seal pose; generic geometry must not bypass this binding. */
export function acceptedNativeAirlockCollision(
  ctx: Pick<ReadContext, "db">,
  instance: { id: string },
  deckId: string,
  compile: NativeAirlockCompiler,
) {
  const row = ctx.db.constructionAirlock.id.find(instance.id);
  requireAirlock(
    row && row.deckId === deckId,
    "accepted airlock installation/deck required",
  );
  const { document, plan } = verified(ctx, row!, compile),
    s = state(ctx, row!);
  return nativeAirlockCollision(document, plan, [
    {
      openingId: row!.innerDoorId,
      fraction: s.inner.hingeFraction,
      sealRetraction: s.inner.sealRetraction,
    },
    {
      openingId: row!.outerDoorId,
      fraction: s.outer.hingeFraction,
      sealRetraction: s.outer.sealRetraction,
    },
  ]);
}
