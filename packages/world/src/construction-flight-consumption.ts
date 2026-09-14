import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import type { SystemActuatorConsumption } from "@sidereal/sim/system-space";

type Context = Pick<ReducerCtx<InferSchema<typeof world>>, "db">;
/** Bounded latest-sample telemetry for M4's future accounting hook. No fuel or
 * electrical energy is deducted. Zero/idle samples leave the last burn stamped. */
export function recordFlightConsumption(
  ctx: Context,
  sampleTick: bigint,
  usage: readonly SystemActuatorConsumption[],
) {
  if (usage.length > 64 || sampleTick < 0n)
    throw Error("Flight consumption budget");
  const ships = new Set<string>();
  let count = 0;
  const pending = [];
  for (const sample of usage) {
    if (
      !sample.bodyId ||
      sample.bodyId.length > 128 ||
      ships.has(sample.bodyId) ||
      sample.actuators.length > 256
    )
      throw Error("Invalid flight consumption sample");
    ships.add(sample.bodyId);
    const ids = new Set<string>();
    for (const actuator of sample.actuators) {
      if (
        ++count > 1024 ||
        !actuator.id ||
        actuator.id.length > 256 ||
        ids.has(actuator.id) ||
        !Number.isFinite(actuator.newtonSeconds) ||
        actuator.newtonSeconds < 0
      )
        throw Error("Invalid flight consumption actuator");
      ids.add(actuator.id);
    }
    if (!sample.actuators.some((a) => a.newtonSeconds > 0)) continue;
    const compiled = ctx.db.constructionFlightCompiled.shipId.find(
      sample.bodyId,
    );
    if (compiled?.status !== "ready")
      throw Error("Compiled flight consumption required");
    const row = {
      shipId: sample.bodyId,
      sampleTick,
      compiledRevision: compiled.revision,
      inputHash: compiled.inputHash,
      actuatorsJson: JSON.stringify(sample.actuators),
    };
    const old = ctx.db.constructionFlightConsumption.shipId.find(sample.bodyId);
    if (old && old.sampleTick >= sampleTick) {
      if (
        old.sampleTick === sampleTick &&
        old.inputHash === row.inputHash &&
        old.compiledRevision === row.compiledRevision &&
        old.actuatorsJson === row.actuatorsJson
      )
        continue;
      throw Error("Flight consumption sample conflict");
    }
    pending.push({ old, row });
  }
  // Validate the whole bounded sample before any writes, even in test adapters.
  for (const { old, row } of pending) {
    if (old) ctx.db.constructionFlightConsumption.shipId.update(row);
    else ctx.db.constructionFlightConsumption.insert(row);
  }
}
