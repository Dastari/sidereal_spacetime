import type { resolveShipFlightDefinition } from "./construction-flight-resolver";
import type { Identity } from "spacetimedb";
import {
  stepSystemSpace,
  type SystemFlightControl,
  type SystemActuatorConsumption,
} from "@sidereal/sim/system-space";
import { spatialCell } from "@sidereal/sim/spatial-cells";
import type { RigidBody } from "@sidereal/sim/collision";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import {
  toCenterOfMassMotion,
  toAuthoredFrameMotion,
} from "@sidereal/sim/flight-frame";
import type { MassProperties } from "@sidereal/sim/ifcs";
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
        by_ship: { filter(shipId: string): Iterable<Output> };
        id: {
          delete(id: string): unknown;
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
 * All ship inertia, hull offsets and control inputs come from compiled authority.
 * Persisted motion retains the authored origin while contacts advance the COM.
 * Parent scheduled reducer must verify ctx.sender === ctx.databaseIdentity. */
export function stepSharedWorld(
  ctx: SharedPhysicsContext,
  systemId = SHARED_SYSTEM_SEED.systemId,
  hooks: {
    compileDirty(): void;
    definitionForShip(
      shipId: string,
    ): ReturnType<typeof resolveShipFlightDefinition>;
    canPilot(characterId: string): boolean;
    recordConsumption(
      sampleTick: bigint,
      usage: readonly SystemActuatorConsumption[],
    ): void;
  },
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
  hooks.compileDirty();
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
  const rejectIsland = (reason: string): SharedPhysicsReport => {
    // No command was integrated. Clear retained telemetry for the entire island
    // so a rejected initial definition cannot leave another ship's old burn lit.
    for (const ship of ships) {
      const outputs = limited(
        ctx.db.actuatorOutput.by_ship.filter(ship.shipId),
        256,
      );
      if (!outputs) throw Error("Flight output budget");
      for (const output of outputs) {
        ctx.db.actuatorOutput.id.delete(output.id);
        report.changedOutputs++;
      }
    }
    return { ...report, status: "exhausted", reason };
  };
  const bodies: RigidBody[] = [],
    controls: SystemFlightControl[] = [],
    shipRows = new Map<string, ShipMotionRow>(),
    rockRows = new Map<string, BodyMotionRow>(),
    masses = new Map<string, MassProperties>();
  for (const ship of ships) {
    if (ship.systemId !== systemId || !ctx.db.ship.id.find(ship.shipId))
      return rejectIsland("invalid-system-ship");
    const definition = hooks.definitionForShip(ship.shipId);
    if (definition.status === "invalid") return rejectIsland(definition.reason);
    shipRows.set(ship.shipId, ship);
    masses.set(ship.shipId, definition.mass);
    bodies.push({
      ...toCenterOfMassMotion(ship, definition.mass),
      ...definition.hull,
      id: ship.shipId,
      massKg: definition.mass.massKg,
      inertia: definition.mass.inertiaKgM2,
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
      definition.status === "ready" &&
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
      definition.computer.installed &&
      definition.computer.powered &&
      hooks.canPilot(actor.id)
    );
    if (definition.status === "ready")
      controls.push({
        bodyId: ship.shipId,
        enabled,
        intent: enabled
          ? { throttle: input!.throttle, turn: input!.turn }
          : { throttle: 0, turn: 0 },
        mass: definition.mass,
        actuators: definition.actuators,
        profile: definition.profile,
        envelope: definition.envelope,
        maxForwardSpeed: definition.speed.forward,
        maxReverseSpeed: definition.speed.reverse,
      });
  }
  for (const body of descriptions) {
    if (body.systemId !== systemId) return rejectIsland("invalid-system-body");
    if (body.kind !== "asteroid") continue;
    const motion = ctx.db.bodyWorldMotion.bodyId.find(body.id);
    if (!motion || motion.systemId !== systemId)
      return rejectIsland("missing-body-motion");
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
  if (bodies.length > 64) return rejectIsland("body-budget");
  const result = stepSystemSpace(bodies, controls);
  hooks.recordConsumption(sampleTick, result.consumption);
  const consumed = result.consumption.some((s) =>
    s.actuators.some((a) => a.newtonSeconds > 0),
  );
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
    const mass = masses.get(body.id);
    const frame = mass ? toAuthoredFrameMotion(body, mass) : body;
    const cell = spatialCell(frame),
      motion = {
        x: frame.x,
        y: frame.y,
        vx: frame.vx,
        vy: frame.vy,
        heading: frame.heading,
        omega: frame.omega,
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
  const outputs = new Map(
    result.commands.map((command) => [
      command.bodyId,
      new Set(command.actuators.map((a) => a.id)),
    ]),
  );
  for (const ship of ships) {
    const current = outputs.get(ship.shipId);
    const oldOutputs = limited(
      ctx.db.actuatorOutput.by_ship.filter(ship.shipId),
      256,
    );
    if (!oldOutputs) throw Error("Flight output budget");
    for (const old of oldOutputs) {
      if (current?.has(old.actuatorId)) continue;
      // Removal/rejection cannot leave a previously firing plume behind. Valid
      // repaired definitions backfill their complete output set on the next tick.
      ctx.db.actuatorOutput.id.delete(old.id);
      report.changedOutputs++;
    }
  }
  for (const command of result.commands)
    for (const actuator of command.actuators) {
      const id = `${command.bodyId}:${actuator.id}`,
        old = ctx.db.actuatorOutput.id.find(id),
        motion = shipRows.get(command.bodyId)!;
      if (old && old.throttle === actuator.throttle) continue;
      // Engine-status views promise the complete installed actuator set. Backfill
      // each missing row once (including zero), then preserve steady idle silence.
      // This also repairs ships admitted before automatic shared entry existed.
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
  if (report.changedMotions || report.changedOutputs || consumed)
    ctx.db.worldSystem.id.update({ ...system, lastSimulationTick: sampleTick });
  return report;
}
