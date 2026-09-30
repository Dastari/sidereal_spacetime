/** S4-2: installed state owns joules; S4-1 compiles only topology and pinned rules. */
import {
  SHARED_SYSTEM_MAX_SHIPS,
  SHARED_SYSTEM_SEED,
} from "@sidereal/content/shared-system";
import { prefabPowerFactor as legacyPrefabPowerFactor } from "@sidereal/sim/combat-damage";
import { recordLifecycleEvent } from "./lifecycle";
import { t } from "spacetimedb/server";
import type { InferSchema, ReducerCtx, ViewCtx } from "spacetimedb/server";
import type world from "./index";
import {
  compilePrefabShipSystems,
  shipSystemsAvailability,
  type PrefabShipSystemsCompile,
} from "@sidereal/sim/prefab-ship-systems";
import {
  powerDevices,
  stepPower,
  POWER_STEP_SECONDS,
} from "@sidereal/sim/ship-power";
import { prefabSourceMountId } from "@sidereal/sim/prefab-flight-supply";
import { prefabBindingOf } from "./combat-damage";
import { markShipFlightDirty } from "./construction-flight-dirty";
import { markShipSystemsDirty } from "./ship-systems-dirty";
import { acceptedPassengerAccess } from "./construction-passenger-access";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
type Db = Context["db"];
export const SHIP_POWER_SOLVES_PER_TICK = SHARED_SYSTEM_MAX_SHIPS;
const COMPILES = new Map<string, PrefabShipSystemsCompile>();
function compile(ctx: Pick<Context, "db">, shipId: string) {
  const instance = ctx.db.constructionInstance.id.find(shipId);
  const binding = instance && prefabBindingOf(instance);
  if (!instance || !binding)
    throw Error("Power requires pinned prefab instance");
  const conditions = [...ctx.db.shipComponentDamage.by_ship.filter(shipId)].map(
    (r) => ({ objectId: r.objectId, performance: r.performance }),
  );
  const key = JSON.stringify([
    instance.blueprintSha256,
    instance.revision.toString(),
    binding.catalog,
    conditions,
  ]);
  let value = COMPILES.get(key);
  if (!value) {
    value = compilePrefabShipSystems(binding.doc, binding.catalog, conditions);
    if (COMPILES.size >= 128) COMPILES.clear();
    COMPILES.set(key, value);
  }
  return value;
}
function reconcile(
  ctx: Context,
  shipId: string,
  compiled: PrefabShipSystemsCompile,
  policy: "issue" | "compile" | "legacy",
) {
  const devices = powerDevices(compiled.input);
  const old = [...ctx.db.shipPowerDevice.by_ship.filter(shipId)];
  const seen = new Set<string>();
  for (const d of devices) {
    const identity = `${prefabBindingOf(ctx.db.constructionInstance.id.find(shipId)!)!.catalog}/${d.definition}`;
    const found = old.find(
      (r) =>
        r.mountId === d.id &&
        r.definition.split("/").at(-1)?.split("@")[0] ===
          d.definition.split("@")[0],
    );
    if (found) {
      seen.add(found.id);
      if (found.definition !== identity || found.energyJ > d.capacityJ)
        ctx.db.shipPowerDevice.id.update({
          ...found,
          definition: identity,
          energyJ: Math.min(found.energyJ, d.capacityJ),
        });
      continue;
    }
    const id = ctx.newUuidV4().toString();
    seen.add(id);
    const performance = compiled.input.performance?.[d.id] ?? 1;
    const energyJ = policy === "issue" && d.alive ? d.capacityJ : 0;
    ctx.db.shipPowerDevice.insert({
      id,
      shipId,
      mountId: d.id,
      definition: identity,
      // Charge provisioning is an explicit trusted install action, never a compile effect.
      energyJ,
      running: policy === "legacy" && performance === 1 && d.generationW > 0,
      issuedMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
    recordLifecycleEvent(
      ctx,
      {
        objectId: id,
        objectKind: "component",
        definitionRef: identity,
        frameId: shipId,
        ownerId: shipId,
      },
      "component.installed",
      { causationId: `power-install:${id}` },
      { mountId: d.id, energyJ, policy },
    );
  }
  for (const row of old) if (!seen.has(row.id)) retire(ctx, row);
}
function retire(
  ctx: Context,
  row: NonNullable<ReturnType<Db["shipPowerDevice"]["id"]["find"]>>,
) {
  recordLifecycleEvent(
    ctx,
    {
      objectId: row.id,
      objectKind: "component",
      definitionRef: row.definition,
      frameId: row.shipId,
      ownerId: row.shipId,
    },
    "component.removed",
    { causationId: `power-retire:${row.id}` },
    { mountId: row.mountId, energyJ: row.energyJ },
  );
  ctx.db.shipPowerDevice.id.delete(row.id);
}
/** Called only by trusted prefab install. Existing matching devices retain their UUID/J. */
export function installPrefabPower(ctx: Context, shipId: string) {
  if (!ctx.db.shipPowerInstallation.shipId.find(shipId))
    ctx.db.shipPowerInstallation.insert({
      shipId,
      initializedMicros: ctx.timestamp.microsSinceUnixEpoch,
      policy: "issued",
      lastSolvedTick: 0n,
    });
  const marker = ctx.db.shipPowerInstallation.shipId.find(shipId)!;
  if (marker.policy === "legacy-pending")
    ctx.db.shipPowerInstallation.shipId.update({ ...marker, policy: "issued" });
  reconcile(ctx, shipId, compile(ctx, shipId), "issue");
  ctx.db.shipPowerState.shipId.delete(shipId);
}
function initializeLegacy(
  ctx: Context,
  shipId: string,
  compiled: PrefabShipSystemsCompile,
) {
  const marker = ctx.db.shipPowerInstallation.shipId.find(shipId)!;
  const legacy = marker.policy === "legacy-pending";
  reconcile(ctx, shipId, compiled, legacy ? "legacy" : "compile");
  if (legacy) {
    restoreKnownLegacyDerating(ctx, shipId, compiled);
    ctx.db.shipPowerInstallation.shipId.update({
      ...marker,
      policy: "legacy-running",
    });
  }
}
/** Only remove a proven old power factor; unrelated physical reductions remain unchanged. */
function restoreKnownLegacyDerating(
  ctx: Context,
  shipId: string,
  compiled: PrefabShipSystemsCompile,
) {
  const { fittings, factor, physical } = legacyDerating(ctx, shipId, compiled);
  if (factor >= 1) return;
  let corrected = false;
  for (const f of fittings) {
    const mount = prefabSourceMountId(f.sourceDeviceId);
    if (!mount || f.revision < 1n) continue;
    const actual = physical(mount),
      expected = actual * factor;
    if (Math.abs(f.availability - expected) > 1e-9 || f.availability >= actual)
      continue;
    const receipt = ctx.db.constructionFlightReceipt.id.find(
      JSON.stringify([
        "server-flight-damage",
        `combat-damage:${f.id}:${f.revision - 1n}`,
      ]),
    );
    if (!receipt) continue;
    try {
      const record = JSON.parse(receipt.requestJson),
        event = JSON.parse(record.event);
      if (
        record.result !== "applied" ||
        event.id !== `combat-damage:${f.id}:${f.revision - 1n}` ||
        event.shipId !== shipId ||
        event.fittingId !== f.id ||
        String(event.expectedFittingRevision) !== String(f.revision - 1n) ||
        !Number.isFinite(event.lossFraction) ||
        event.lossFraction <= 0 ||
        event.lossFraction > 1 ||
        (record.sourceCreatedMicros !== undefined &&
          BigInt(record.sourceCreatedMicros) >=
            ctx.db.shipPowerClock.id.find(0)!.legacyCutoffMicros) ||
        event.sourceEventId?.startsWith(`combat-damage:${shipId}:`) !== true
      )
        continue;
      ctx.db.constructionFlightFitting.id.update({
        ...f,
        availability: actual,
        revision: f.revision + 1n,
      });
      corrected = true;
    } catch {
      /* Unknown provenance stays conservative. */
    }
  }
  const binding = ctx.db.constructionFlightBinding.shipId.find(shipId);
  if (corrected && binding)
    ctx.db.constructionFlightBinding.shipId.update({
      ...binding,
      revision: binding.revision + 1n,
    });
}
function legacyDerating(
  ctx: Context,
  shipId: string,
  compiled: PrefabShipSystemsCompile,
) {
  const fittings = [
    ...ctx.db.constructionFlightFitting.by_ship.filter(shipId),
  ].filter((f) => f.installed && f.powered);
  const fitted = new Set(
    fittings.map((f) => prefabSourceMountId(f.sourceDeviceId)),
  );
  const definitions = new Map(
    compiled.input.catalog.components.map((d) => [d.id, d]),
  );
  const mounts = compiled.input.components.map((p) => ({
    mountId: p.id.slice("mount:".length),
    generationKw: definitions.get(p.componentId)!.power.generationKw,
    activeKw: definitions.get(p.componentId)!.power.activeKw,
    fitted: fitted.has(p.id.slice("mount:".length)),
  }));
  const physical = (id: string) =>
    compiled.input.performance?.[`mount:${id}`] ?? 1;
  const factor = legacyPrefabPowerFactor(mounts, physical);
  return { fittings, factor, physical };
}
/** Queued pre-runtime events may drain after the one-time cleanup. Preserve their original
 * receipt payload but apply only proven physical loss, never raise current availability. */
export function legacyQueuedPowerDamageLoss(
  ctx: Context,
  event: {
    id: string;
    shipId: string;
    fittingId: string;
    sourceEventId: string;
    createdMicros: bigint;
    lossFraction: number;
    expectedFittingRevision: bigint;
  },
  fitting: NonNullable<
    ReturnType<Db["constructionFlightFitting"]["id"]["find"]>
  >,
) {
  const clock = ctx.db.shipPowerClock.id.find(0);
  const marker = ctx.db.shipPowerInstallation.shipId.find(event.shipId);
  if (
    !clock ||
    event.createdMicros >= clock.legacyCutoffMicros ||
    (marker?.policy !== "legacy-pending" &&
      marker?.policy !== "legacy-running") ||
    event.id !== `combat-damage:${fitting.id}:${fitting.revision}` ||
    event.expectedFittingRevision !== fitting.revision ||
    !event.sourceEventId.startsWith(`combat-damage:${event.shipId}:`) ||
    !fitting.installed ||
    !fitting.powered
  )
    return event.lossFraction;
  const { factor, physical } = legacyDerating(
    ctx,
    event.shipId,
    compile(ctx, event.shipId),
  );
  const mount = prefabSourceMountId(fitting.sourceDeviceId);
  if (!mount || factor >= 1) return event.lossFraction;
  const actual = physical(mount);
  const oldTarget = fitting.availability * (1 - event.lossFraction);
  if (oldTarget >= actual || Math.abs(oldTarget - actual * factor) > 1e-9)
    return event.lossFraction;
  return fitting.availability > 0
    ? 1 - Math.min(fitting.availability, actual) / fitting.availability
    : 0;
}
/** Trusted refit lifecycle, never exposed as a client reducer. A replacement at the SAME
 * socket/component retires the old UUID. Compiler recreation is empty, not issue stock. */
export function replaceInstalledPowerDevice(
  ctx: Context,
  shipId: string,
  mountId: string,
  expectedDeviceId: string,
) {
  const installed = ctx.db.shipPowerDevice.id.find(expectedDeviceId);
  if (
    !installed ||
    installed.shipId !== shipId ||
    installed.mountId !== mountId
  )
    throw Error("Power device replacement revision mismatch");
  const compiled = compile(ctx, shipId);
  if (!compiled.input.components.some((p) => p.id === mountId))
    throw Error("Installed power mount required");
  retire(ctx, installed);
  reconcile(ctx, shipId, compiled, "compile");
  invalidate(ctx, shipId, ctx.db.shipPowerState.shipId.find(shipId));
  markShipSystemsDirty(ctx, shipId, "refit");
  markShipFlightDirty(ctx, shipId);
}
/** No wall-clock catch-up: server downtime freezes energy; repeat schedule calls solve once. */
export function stepShipPower(ctx: Context) {
  const now = ctx.timestamp.microsSinceUnixEpoch,
    tick = now / 50_000n;
  const clock =
    ctx.db.shipPowerClock.id.find(0) ??
    ctx.db.shipPowerClock.insert({
      id: 0,
      legacyCutoffMicros: now,
      lastTick: tick,
      admissionValid: true,
    });
  const admitted = [];
  for (const motion of ctx.db.shipWorldMotion.by_system.filter(
    SHARED_SYSTEM_SEED.systemId,
  )) {
    admitted.push(motion);
    if (admitted.length > SHARED_SYSTEM_MAX_SHIPS) break;
  }
  const valid = admitted.length <= SHARED_SYSTEM_MAX_SHIPS;
  ctx.db.shipPowerClock.id.update({
    ...clock,
    lastTick: tick,
    admissionValid: valid,
  });
  if (!valid) {
    // Invalid historical/manual admission already exceeds the physics contract. Fail the
    // entire fleet closed, never integrate a partial island or throw the character/world tick.
    if (clock.admissionValid)
      for (const actor of ctx.db.character.iter())
        clearShipControl(ctx.db, actor.shipId);
    return;
  }
  const selected = admitted
    .map((m) => ctx.db.constructionInstance.id.find(m.shipId))
    .filter(
      (instance) =>
        !!instance &&
        !!ctx.db.ship.id.find(instance.id) &&
        !!prefabBindingOf(instance),
    )
    .sort((a, b) => (a!.id < b!.id ? -1 : a!.id > b!.id ? 1 : 0));
  for (const candidate of selected) {
    const instance = candidate!;
    const shipId = instance.id;
    if (!ctx.db.shipPowerInstallation.shipId.find(shipId)) {
      const motion = admitted.find((m) => m.shipId === shipId)!;
      const legacy =
        instance.createdMicros < clock.legacyCutoffMicros &&
        motion.serverTick < clock.legacyCutoffMicros / 50_000n;
      ctx.db.shipPowerInstallation.insert({
        shipId,
        initializedMicros: now,
        policy: legacy ? "legacy-pending" : "unissued",
        lastSolvedTick: 0n,
      });
    }

    const row = ctx.db.shipSystemsState.shipId.find(shipId);
    const previous = ctx.db.shipPowerState.shipId.find(shipId);
    if (
      !row ||
      ctx.db.shipSystemsDirty.shipId.find(shipId) ||
      row.instanceRevision !== instance.revision
    ) {
      invalidate(ctx, shipId, previous);
      continue;
    }
    if (
      previous?.tick === tick &&
      previous.inputHash === row.inputHash &&
      previous.instanceRevision === instance.revision
    )
      continue;
    const compiled = compile(ctx, shipId);
    if (compiled.inputHash !== row.inputHash) {
      markShipSystemsDirty(ctx, shipId, "backfill");
      invalidate(ctx, shipId, previous);
      continue;
    }
    initializeLegacy(ctx, shipId, compiled);
    const marker = ctx.db.shipPowerInstallation.shipId.find(shipId)!;
    if (marker.lastSolvedTick >= tick) continue;
    const fuel = shipSystemsAvailability(compiled, "combat");
    // Connectivity is a prerequisite to output/startup, not a reservoir simulation.
    // An intact but starved source is stopped without damaging any installed store.
    const devices = powerDevices(compiled.input).map((d) =>
      d.generationW > 0 && (fuel[d.id]?.fuel ?? 1) < 1
        ? { ...d, generationW: 0, demandW: 0, idleW: 0 }
        : d,
    );
    const installed = [...ctx.db.shipPowerDevice.by_ship.filter(shipId)];
    const result = stepPower(
      devices,
      compiled.report.networks,
      installed.map((r) => ({
        id: r.mountId,
        uuid: r.id,
        energyJ: r.energyJ,
        running: r.running,
      })),
    );
    for (const state of result.devices) {
      const old = installed.find((r) => r.id === state.uuid)!;
      if (old.energyJ !== state.energyJ || old.running !== state.running)
        ctx.db.shipPowerDevice.id.update({
          ...old,
          energyJ: state.energyJ,
          running: state.running,
        });
    }
    const supply = Object.fromEntries(
      devices.map((d) => [
        d.id,
        (result.supply[d.id] ?? 0) * (fuel[d.id]?.fuel ?? 1),
      ]),
    );
    const coreIds = compiled.input.components
      .filter((p) => p.componentId.startsWith("computer-core."))
      .map((p) => p.id);
    for (const id of coreIds)
      if ((compiled.input.performance?.[id] ?? 1) < 1) supply[id] = 0;
    const corePowered = coreIds.some(
      (id) =>
        (compiled.input.performance?.[id] ?? 1) === 1 && (supply[id] ?? 0) >= 1,
    );
    const supplyJson = JSON.stringify(supply);
    const next = {
      shipId,
      instanceRevision: instance.revision,
      inputHash: row.inputHash,
      tick,
      solvedMicros: now,
      energyJ: result.devices.reduce((n, s) => n + s.energyJ, 0),
      generationW:
        result.networks.reduce((n, r) => n + r.generationJ, 0) /
        POWER_STEP_SECONDS,
      demandW: devices.reduce((n, d) => n + d.demandW, 0),
      brownout: result.networks.some((r) => r.brownout),
      corePowered,
      supplyJson,
      networksJson: JSON.stringify(result.networks),
    };
    if (previous) ctx.db.shipPowerState.shipId.update(next);
    else ctx.db.shipPowerState.insert(next);
    ctx.db.shipPowerInstallation.shipId.update({
      ...marker,
      lastSolvedTick: tick,
    });
    if (
      !previous ||
      previous.supplyJson !== supplyJson ||
      previous.corePowered !== corePowered
    )
      markShipFlightDirty(ctx, shipId);
    if (!corePowered || (previous && !previous.corePowered))
      clearShipControl(ctx.db, shipId);
  }
}
function clearShipControl(db: Db, shipId: string) {
  for (const actor of db.character.by_ship.filter(shipId)) {
    const input = db.input.characterId.find(actor.id);
    if (input && (input.throttle || input.turn))
      db.input.characterId.update({
        ...input,
        throttle: 0,
        turn: 0,
      });
  }
}
function invalidate(
  ctx: Context,
  shipId: string,
  row: ReturnType<Db["shipPowerState"]["shipId"]["find"]>,
) {
  if (row) ctx.db.shipPowerState.shipId.delete(shipId);
  if (row) markShipFlightDirty(ctx, shipId);
  clearShipControl(ctx.db, shipId);
}
/** Current authority only. A missing/dirty compile must never reuse yesterday's power. */
export function currentShipPower(
  ctx: { db: ReadContext["db"]; timestamp?: Context["timestamp"] },
  shipId: string,
) {
  const row = ctx.db.shipPowerState.shipId.find(shipId);
  const instance = ctx.db.constructionInstance.id.find(shipId);
  const compiled = ctx.db.shipSystemsState.shipId.find(shipId);
  if (
    !row ||
    !instance ||
    !compiled ||
    ctx.db.shipSystemsDirty.shipId.find(shipId) ||
    row.instanceRevision !== instance.revision ||
    row.inputHash !== compiled.inputHash ||
    compiled.instanceRevision !== instance.revision
  )
    return undefined;
  const clock = ctx.db.shipPowerClock.id.find(0);
  if (
    !clock ||
    !clock.admissionValid ||
    row.tick > clock.lastTick ||
    clock.lastTick > row.tick + 2n ||
    row.tick !== row.solvedMicros / 50_000n
  )
    return undefined;
  if (ctx.timestamp) {
    // Enqueue timestamps can precede a committed scheduled solve by microseconds.
    // The transaction reads that committed state, including across a tick boundary.
    // Permit at most one fixed step ahead; old-state expiry remains exactly 100 ms.
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const age = now - row.solvedMicros;
    if (age > 100_000n || age < -50_000n || row.tick > now / 50_000n + 1n)
      return undefined;
  }
  return row;
}
export function prefabPowerReady(
  ctx: { db: ReadContext["db"]; timestamp?: Context["timestamp"] },
  shipId: string,
) {
  const instance = ctx.db.constructionInstance.id.find(shipId);
  // The power runtime governs prefab ships only; other construction admissions retain their gate.
  return (
    !instance ||
    !prefabBindingOf(instance) ||
    !!currentShipPower(ctx, shipId)?.corePowered
  );
}
export function powerSupplyOf(
  ctx: Pick<Context, "db">,
  shipId: string,
): Readonly<Record<string, number>> {
  const row = currentShipPower(ctx, shipId);
  return row ? JSON.parse(row.supplyJson) : {};
}
function readableShips(ctx: ReadContext) {
  const ids = new Set<string>();
  let count = 0;
  for (const ship of ctx.db.ship.by_owner.filter(ctx.sender)) {
    if (++count > 64) break;
    ids.add(ship.id);
  }
  count = 0;
  for (const actor of ctx.db.character.by_owner.filter(ctx.sender)) {
    if (++count > 4) break;
    const visit = ctx.db.constructionPassengerVisit.characterId.find(actor.id);
    if (
      visit?.shipId === actor.shipId &&
      acceptedPassengerAccess(ctx, actor.id).readInterior
    )
      ids.add(actor.shipId);
  }
  return ids;
}
export const powerSummaryProjection = t.row("ShipPowerSummary", {
  shipId: t.string().primaryKey(),
  instanceRevision: t.u64(),
  tick: t.u64(),
  energyJ: t.f64(),
  generationW: t.f64(),
  demandW: t.f64(),
  brownout: t.bool(),
  corePowered: t.bool(),
  networksJson: t.string(),
});
export const powerDeviceProjection = t.row("ShipPowerDeviceStatus", {
  id: t.string().primaryKey(),
  shipId: t.string(),
  mountId: t.string(),
  definition: t.string(),
  energyJ: t.f64(),
  running: t.bool(),
});
export function ownShipPower(ctx: ReadContext) {
  return [...readableShips(ctx)].flatMap((id) => {
    const row = currentShipPower(ctx, id);
    if (!row) return [];
    const {
      shipId,
      instanceRevision,
      tick,
      energyJ,
      generationW,
      demandW,
      brownout,
      corePowered,
      networksJson,
    } = row;
    return [
      {
        shipId,
        instanceRevision,
        tick,
        energyJ,
        generationW,
        demandW,
        brownout,
        corePowered,
        networksJson,
      },
    ];
  });
}
export function ownShipPowerDevices(ctx: ReadContext) {
  return [...readableShips(ctx)].flatMap((shipId) =>
    [...ctx.db.shipPowerDevice.by_ship.filter(shipId)].map(
      ({ id, mountId, definition, energyJ, running }) => ({
        id,
        shipId,
        mountId,
        definition,
        energyJ,
        running,
      }),
    ),
  );
}
