import { newSystemMap, mapBodyName } from "@sidereal/content/system-map";
import type { ReducerCtx, ViewCtx, InferSchema } from "spacetimedb/server";
import type world from "./index";
import type { SystemMapDocument } from "@sidereal/content/system-map";
import {
  compileZones,
  zoneMembership,
  zoneChanges,
  sweepZones,
  ZONE_LIMITS,
  type CompiledZone,
  type ZoneChange,
  type ZoneWork,
} from "@sidereal/sim/zones";
import type { MotionSegment } from "@sidereal/sim/collision";
import type { ShipMotionRow } from "./shared-world";
import { ownWorldAdmission } from "./shared-world-views";
type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
interface Transition extends ZoneChange {
  segment: number;
  sequence: string;
  tick: string;
  reason: string;
  mapRevision: string;
}
function planState(
  ctx: Context,
  systemId: string,
  ship: Pick<ShipMotionRow, "shipId" | "x" | "y">,
  zones: CompiledZone[],
  revision: bigint,
  trace: readonly MotionSegment[],
  tick: bigint,
  reason: string,
  work: ZoneWork,
  priorZones: CompiledZone[] = zones,
) {
  const old = ctx.db.shipZoneState.shipId.find(ship.shipId);
  let active: string[] =
    old && old.systemId === systemId
      ? JSON.parse(old.activeJson)
      : zoneMembership(zones, { ...ship, height: 0 });
  let sequence = old?.sequence ?? 0n;
  let history: Transition[] = old ? JSON.parse(old.transitionsJson) : [];
  let segment = 0;
  const pending: (Omit<
    Transition,
    "sequence" | "tick" | "mapRevision"
  > | null)[] = [];
  const append = (changes: ZoneChange[], why: string) => {
    for (const c of changes) {
      if (why === "movement" && c.fraction === 0 && !c.entered) {
        let prior = -1;
        for (let i = pending.length - 1; i >= 0; i--) {
          const e = pending[i];
          if (
            e?.segment === segment - 1 &&
            e.reason === "movement" &&
            e.fraction === 1 &&
            e.entered &&
            e.zoneId === c.zoneId
          ) {
            prior = i;
            break;
          }
        }
        if (prior >= 0) {
          pending[prior] = null;
          continue;
        }
      }
      pending.push({ ...c, segment, reason: why });
    }
  };
  const initial = zoneMembership(zones, { ...ship, height: 0 });
  append(
    zoneChanges(
      [
        ...priorZones,
        ...zones.filter((z) => !priorZones.some((p) => p.id === z.id)),
      ],
      active,
      initial,
      0,
    ),
    reason,
  );
  active = initial;
  for (const s of trace) {
    if (s.bodyId !== ship.shipId) continue;
    segment++;
    if (s.kind === "correction") {
      const next = zoneMembership(zones, { ...s.to, height: 0 });
      append(zoneChanges(zones, active, next), "physics-correction");
      active = next;
    } else {
      const result = sweepZones(
        zones,
        { ...s.from, height: 0 },
        { ...s.to, height: 0 },
        active,
        work,
      );
      append(result.changes, "movement");
      active = result.active;
    }
  }
  for (const event of pending)
    if (event) {
      sequence++;
      history.push({
        ...event,
        sequence: sequence.toString(),
        tick: tick.toString(),
        mapRevision: revision.toString(),
      });
    }
  if (history.length > ZONE_LIMITS.history)
    history = history.slice(-ZONE_LIMITS.history);
  if (
    old &&
    old.systemId === systemId &&
    old.mapRevision === revision &&
    old.sequence === sequence &&
    old.activeJson === JSON.stringify(active)
  )
    return undefined;
  return {
    shipId: ship.shipId,
    systemId,
    mapRevision: revision,
    stateRevision: (old?.stateRevision ?? 0n) + 1n,
    sequence,
    earliestSequence: history.length
      ? BigInt(history[0].sequence)
      : sequence + 1n,
    activeJson: JSON.stringify(active),
    transitionsJson: JSON.stringify(history),
  };
}
function write(ctx: Context, row: NonNullable<ReturnType<typeof planState>>) {
  if (ctx.db.shipZoneState.shipId.find(row.shipId))
    ctx.db.shipZoneState.shipId.update(row);
  else ctx.db.shipZoneState.insert(row);
}
export function publishZones(
  ctx: Context,
  doc: SystemMapDocument,
  revision: bigint,
) {
  const zones = compileZones(doc),
    tick = ctx.timestamp.microsSinceUnixEpoch / 50000n;
  const priorZones = [...ctx.db.systemZone.by_system.filter(doc.id)].map(
    (r) => JSON.parse(r.definitionJson) as CompiledZone,
  );
  const work = { remaining: 6_000_000 };
  const plans = [...ctx.db.shipWorldMotion.by_system.filter(doc.id)].map(
    (ship) =>
      planState(
        ctx,
        doc.id,
        ship,
        zones,
        revision,
        [],
        tick,
        "map-edit",
        work,
        priorZones,
      ),
  );
  for (const old of ctx.db.systemZone.by_system.filter(doc.id))
    ctx.db.systemZone.id.delete(old.id);
  for (const z of zones)
    ctx.db.systemZone.insert({
      id: JSON.stringify([doc.id, z.id]),
      systemId: doc.id,
      zoneId: z.id,
      revision,
      definitionJson: JSON.stringify(z),
    });
  for (const row of plans) if (row) write(ctx, row);
}
/** Called only with accepted solver traces. All plans are prepared before database writes. */
export function stepZones(
  ctx: Context,
  systemId: string,
  ships: readonly ShipMotionRow[],
  trace: readonly MotionSegment[],
  tick: bigint,
): boolean {
  const rows = [...ctx.db.systemZone.by_system.filter(systemId)];
  if (!rows.length) {
    const map = ctx.db.systemMapDefinition.id.find(systemId);
    if (!map) {
      const bodies = [...ctx.db.systemBody.by_system.filter(systemId)]
        .filter((b) => b.kind !== "asteroid")
        .map((b) => {
          const motion = ctx.db.bodyWorldMotion.bodyId.find(b.id)!;
          return {
            id: b.id,
            name: mapBodyName(b.id, b.id),
            kind: b.kind,
            radius: b.radius,
            x: motion.x,
            y: motion.y,
            height: b.height,
          };
        });
      const doc = newSystemMap(systemId, bodies);
      doc.name = "System " + systemId.slice(0, 60);
      publishZones(ctx, doc, 0n);
    } else publishZones(ctx, JSON.parse(map.documentJson), map.revision);
    return stepZones(ctx, systemId, ships, trace, tick);
  }
  const zones = rows
    .map((r) => JSON.parse(r.definitionJson) as CompiledZone)
    .sort(
      (a, b) => a.level - b.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const work = { remaining: 6_000_000 };
  const plans = ships.map((ship) =>
    planState(
      ctx,
      systemId,
      ship,
      zones,
      rows[0].revision,
      trace,
      tick,
      "reconcile",
      work,
    ),
  );
  for (const row of plans) if (row) write(ctx, row);
  return plans.some(Boolean);
}
export function ownShipZones(ctx: ReadContext) {
  const result = [];
  for (const admission of ownWorldAdmission(ctx)) {
    const motion = ctx.db.shipWorldMotion.shipId.find(admission.shipId),
      row = ctx.db.shipZoneState.shipId.find(admission.shipId);
    if (
      row &&
      motion?.systemId === admission.systemId &&
      row.systemId === admission.systemId
    )
      result.push(row);
  }
  return result;
}
