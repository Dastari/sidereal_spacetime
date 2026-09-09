import type { Identity } from "spacetimedb";
import {
  stepSystemSpace,
  type SystemFlightControl,
} from "@sidereal/sim/system-space";
import { spatialCell } from "@sidereal/sim/spatial-cells";
import type { RigidBody } from "@sidereal/sim/collision";
import { LAB_HULL } from "@sidereal/content/space";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import {
  LAB_FLIGHT_ACTUATORS,
  LAB_FLIGHT_COMPUTER,
  LAB_FLIGHT_MASS,
  LAB_FLIGHT_PROFILE,
  LAB_FLIGHT_SPEED,
} from "@sidereal/content/flight";
import { consumeInputControl, type InputControlContext } from "./input-control";
import type {
  SharedWorldDatabase,
  ShipMotionRow,
  BodyMotionRow,
} from "./shared-world";
interface Actor {
  id: string;
  owner: Identity;
  connected: boolean;
  sprinting: boolean;
  shipId: string;
}
interface Output {
  id: string;
  shipId: string;
  actuatorId: string;
  throttle: number;
  tick: bigint;
}
export interface SharedPhysicsContext extends Omit<InputControlContext, "db"> {
  db: Omit<InputControlContext["db"], "character"> &
    SharedWorldDatabase & {
      character: {
        id: {
          find(id: string): Actor | null | undefined;
          update(row: Actor): unknown;
        };
        by_owner: { filter(owner: Identity): Iterable<Actor> };
      };
      ship: { id: { find(id: string): { id: string } | null | undefined } };
      station: {
        shipId: {
          find(id: string):
            | {
                id: string;
                shipId: string;
                occupantId?: string;
                operational: boolean;
              }
            | null
            | undefined;
        };
      };
      actuatorOutput: {
        id: {
          find(id: string): Output | null | undefined;
          update(row: Output): unknown;
        };
        insert(row: Output): unknown;
      };
    };
}
export interface SharedPhysicsReport {
  systemId: string;
  status: "absent" | "idle" | "stepped" | "exhausted";
  reason?: string;
  bodyCount: number;
  changedMotions: number;
  changedOutputs: number;
  impacts: number;
}
function limited<T>(rows: Iterable<T>, max: number): T[] | undefined {
  const result: T[] = [];
  for (const row of rows) {
    if (result.length === max) return undefined;
    result.push(row);
  }
  return result;
}
/** One invocation per fixed world tick/system, never once per observer or ship.
 * This first adapter only admits the pinned stock Wayfarer flight installation;
 * authored construction ships need their own approved hull/mass/actuator compiler.
 * Parent scheduled reducer must verify ctx.sender === ctx.databaseIdentity. */
export function stepSharedWorld(
  ctx: SharedPhysicsContext,
  systemId = SHARED_SYSTEM_SEED.systemId,
): SharedPhysicsReport {
  const report: SharedPhysicsReport = {
    systemId,
    status: "absent",
    bodyCount: 0,
    changedMotions: 0,
    changedOutputs: 0,
    impacts: 0,
  };
  const system = ctx.db.worldSystem.id.find(systemId);
  if (!system) return report;
  const sampleTick = ctx.timestamp.microsSinceUnixEpoch / 50_000n;
  if (system.lastSimulationTick >= sampleTick)
    return {
      ...report,
      status: system.lastSimulationTick === sampleTick ? "idle" : "exhausted",
      reason:
        system.lastSimulationTick === sampleTick
          ? "sample-already-applied"
          : "sample-regressed",
    };
  const ships = limited(ctx.db.shipWorldMotion.by_system.filter(systemId), 60);
  const descriptions = limited(
    ctx.db.systemBody.by_system.filter(systemId),
    32,
  );
  if (!ships || !descriptions)
    return {
      ...report,
      status: "exhausted",
      reason: "island-admission-budget",
    };
  const bodies: RigidBody[] = [],
    controls: SystemFlightControl[] = [],
    shipRows = new Map<string, ShipMotionRow>(),
    rockRows = new Map<string, BodyMotionRow>();
  for (const ship of ships) {
    if (ship.systemId !== systemId || !ctx.db.ship.id.find(ship.shipId))
      return { ...report, status: "exhausted", reason: "invalid-system-ship" };
    shipRows.set(ship.shipId, ship);
    bodies.push({
      ...ship,
      id: ship.shipId,
      ...LAB_HULL,
      massKg: LAB_FLIGHT_MASS.massKg,
      inertia: LAB_FLIGHT_MASS.inertiaKgM2,
    });
    const station = ctx.db.station.shipId.find(ship.shipId);
    const actor = station?.occupantId
      ? ctx.db.character.id.find(station.occupantId)
      : undefined;
    const admission = actor
      ? ctx.db.worldAdmission.characterId.find(actor.id)
      : undefined;
    const input = actor ? ctx.db.input.characterId.find(actor.id) : undefined;
    const age = input
      ? ctx.timestamp.microsSinceUnixEpoch - input.updatedMicros
      : -1n;
    const enabled = !!(
      station?.operational &&
      station.shipId === ship.shipId &&
      actor?.connected &&
      actor.shipId === ship.shipId &&
      admission?.shipId === ship.shipId &&
      admission.systemId === systemId &&
      admission.owner.isEqual(actor.owner) &&
      input &&
      age >= 0n &&
      age < 300000n &&
      consumeInputControl(ctx, actor.id) &&
      LAB_FLIGHT_COMPUTER.installed &&
      LAB_FLIGHT_COMPUTER.powered
    );
    controls.push({
      bodyId: ship.shipId,
      enabled,
      intent: enabled
        ? { throttle: input!.throttle, turn: input!.turn }
        : { throttle: 0, turn: 0 },
      mass: LAB_FLIGHT_MASS,
      actuators: LAB_FLIGHT_ACTUATORS,
      profile: LAB_FLIGHT_PROFILE,
      maxForwardSpeed: LAB_FLIGHT_SPEED.forward,
      maxReverseSpeed: LAB_FLIGHT_SPEED.reverse,
    });
  }
  for (const body of descriptions) {
    if (body.systemId !== systemId)
      return { ...report, status: "exhausted", reason: "invalid-system-body" };
    if (body.kind !== "asteroid") continue;
    const motion = ctx.db.bodyWorldMotion.bodyId.find(body.id);
    if (!motion || motion.systemId !== systemId)
      return { ...report, status: "exhausted", reason: "missing-body-motion" };
    rockRows.set(body.id, motion);
    bodies.push({
      ...motion,
      id: body.id,
      massKg: body.massKg,
      inertia: 0.5 * body.massKg * body.radius ** 2,
      radius: body.radius,
      halfLength: 0,
    });
  }
  report.bodyCount = bodies.length;
  // Do not truncate/partition an over-budget shared island or move a subset of it.
  if (bodies.length > 64)
    return { ...report, status: "exhausted", reason: "body-budget" };
  const result = stepSystemSpace(bodies, controls);
  report.status = result.exhausted
    ? "exhausted"
    : result.changedBodyIds.length
      ? "stepped"
      : "idle";
  report.reason = result.reason;
  report.impacts = result.impacts;
  const changed = new Set(result.changedBodyIds);
  for (const body of result.bodies) {
    if (!changed.has(body.id)) continue;
    const cell = spatialCell(body),
      motion = {
        x: body.x,
        y: body.y,
        vx: body.vx,
        vy: body.vy,
        heading: body.heading,
        omega: body.omega,
        cellX: BigInt(cell.cellX),
        cellY: BigInt(cell.cellY),
      };
    const ship = shipRows.get(body.id),
      rock = rockRows.get(body.id);
    if (ship)
      ctx.db.shipWorldMotion.shipId.update({
        ...ship,
        ...motion,
        serverTick: sampleTick > ship.serverTick ? sampleTick : ship.serverTick,
      });
    else if (rock)
      ctx.db.bodyWorldMotion.bodyId.update({
        ...rock,
        ...motion,
        serverTick: sampleTick > rock.serverTick ? sampleTick : rock.serverTick,
      });
    report.changedMotions++;
  }
  for (const command of result.commands)
    for (const actuator of command.actuators) {
      const id = `${command.bodyId}:${actuator.id}`,
        old = ctx.db.actuatorOutput.id.find(id),
        motion = shipRows.get(command.bodyId)!;
      if (old && old.throttle === actuator.throttle) continue;
      // Missing zero outputs are already visually off: do not seed nine idle rows.
      if (!old && actuator.throttle === 0) continue;
      const row = {
        id,
        shipId: command.bodyId,
        actuatorId: actuator.id,
        throttle: actuator.throttle,
        tick: sampleTick > motion.serverTick ? sampleTick : motion.serverTick,
      };
      if (old) ctx.db.actuatorOutput.id.update(row);
      else ctx.db.actuatorOutput.insert(row);
      report.changedOutputs++;
    }
  // One small clock write per active system sample; completely idle samples do
  // not write. Admission motion stamps are not proof that physics has run.
  if (report.changedMotions || report.changedOutputs)
    ctx.db.worldSystem.id.update({ ...system, lastSimulationTick: sampleTick });
  return report;
}
