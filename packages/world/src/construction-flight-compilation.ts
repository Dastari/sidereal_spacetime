import { Range, type Infer } from "spacetimedb/server";
import type {
  constructionFlightCompiled,
  constructionFlightDirty,
} from "./construction-flight-tables";
import {
  compileFlightDefinition,
  flightDefinitionInputHash,
  type FlightDefinitionInput,
} from "@sidereal/sim/flight-definition";

export type CompiledFlightRow = Infer<
  typeof constructionFlightCompiled.rowType
>;
type DirtyRow = Infer<typeof constructionFlightDirty.rowType>;
export interface FlightCompilationDatabase {
  constructionFlightCompiled: {
    shipId: {
      find(id: string): CompiledFlightRow | null | undefined;
      update(row: CompiledFlightRow): unknown;
    };
    insert(row: CompiledFlightRow): unknown;
  };
  constructionFlightDirty: {
    shipId: {
      find(id: string): DirtyRow | null | undefined;
      delete(id: string): unknown;
    };
    insert(row: DirtyRow): unknown;
    count(): bigint;
    by_revision: { filter(range: Range<bigint>): Iterable<DirtyRow> };
  };
}
/** Called inside the transaction that changes physical input. Preserve queue age
 * when another mutation arrives, and never write an unchanged pending marker. */
export function markFlightDirty(
  db: FlightCompilationDatabase,
  shipId: string,
  revision: bigint,
) {
  if (shipId && !db.constructionFlightDirty.shipId.find(shipId))
    db.constructionFlightDirty.insert({ shipId, revision });
}
export const FLIGHT_COMPILATIONS_PER_TICK = 2;

/** Trusted scheduled adapter. Input gathering is server-owned; this hook is
 * never a reducer argument. Rejected changes retain only the last valid inertia
 * and hull for uncontrolled coasting, never its actuators or computer grant. */
export function compileDirtyFlights(
  db: FlightCompilationDatabase,
  inputForShip: (shipId: string) => FlightDefinitionInput,
) {
  const pending: DirtyRow[] = [];
  // Indexed oldest-first scan stops after the fixed compilation budget; neither
  // queue size nor the number of simultaneous dirty ships expands tick work.
  for (const row of db.constructionFlightDirty.by_revision.filter(
    new Range<bigint>(),
  )) {
    pending.push(row);
    if (pending.length === FLIGHT_COMPILATIONS_PER_TICK) break;
  }
  const report = {
    attempted: 0,
    changed: 0,
    rejected: 0,
    remaining: Number(db.constructionFlightDirty.count()) - pending.length,
  };
  for (const dirty of pending.slice(0, FLIGHT_COMPILATIONS_PER_TICK)) {
    report.attempted++;
    const compiled = compileShipFlight(db, dirty.shipId, inputForShip);
    report.changed += compiled.changed;
    report.rejected += compiled.rejected;
  }
  return report;
}

/** One explicitly requested installation/admission must have valid inertia before
 * it can join a contact island. This bounded one-ship operation is also reused by
 * the scheduled dirty queue; it does not grant activation or pilot authority. */
export function compileShipFlight(
  db: FlightCompilationDatabase,
  shipId: string,
  inputForShip: (shipId: string) => FlightDefinitionInput,
) {
  const report = { changed: 0, rejected: 0 };
  const old = db.constructionFlightCompiled.shipId.find(shipId);
  let inputHash = "",
    row: CompiledFlightRow;
  try {
    const input = inputForShip(shipId);
    inputHash = flightDefinitionInputHash(input);
    if (old?.inputHash === inputHash && old.status === "ready") {
      db.constructionFlightDirty.shipId.delete(shipId);
      return report;
    }
    const compiled = compileFlightDefinition(input);
    if (compiled.status !== "ready") throw Error(compiled.reason);
    row = {
      shipId: shipId,
      revision: (old?.revision ?? 0n) + 1n,
      inputHash,
      definitionHash: compiled.definitionHash,
      ...compiled.mass,
      envelopeJson: JSON.stringify(compiled.envelope),
      actuatorsJson: JSON.stringify(compiled.actuators),
      computersJson: JSON.stringify(compiled.computers),
      hullJson: JSON.stringify(compiled.hull),
      contributionsJson: JSON.stringify(compiled.contributions),
      status: "ready",
      reason: "",
    };
  } catch (error) {
    report.rejected++;
    row = {
      shipId: shipId,
      revision: (old?.revision ?? 0n) + 1n,
      inputHash,
      definitionHash: old?.definitionHash ?? "",
      massKg: old?.massKg ?? 0,
      centerX: old?.centerX ?? 0,
      centerY: old?.centerY ?? 0,
      inertiaKgM2: old?.inertiaKgM2 ?? 0,
      hullJson: old?.hullJson ?? "null",
      contributionsJson: old?.contributionsJson ?? "[]",
      envelopeJson: "null",
      actuatorsJson: "[]",
      computersJson: "[]",
      status: "rejected",
      reason: String(error instanceof Error ? error.message : error).slice(
        0,
        4096,
      ),
    };
  }
  // Stable rejection and unchanged input are quiet, including malformed inputs
  // that cannot be hashed. The next real dirty event still retries compilation.
  const { revision: _next, ...nextState } = row;
  const { revision: _previous, ...oldState } = old ?? {};
  if (JSON.stringify(nextState) !== JSON.stringify(oldState)) {
    if (old) db.constructionFlightCompiled.shipId.update(row);
    else db.constructionFlightCompiled.insert(row);
    report.changed++;
  }
  db.constructionFlightDirty.shipId.delete(shipId);
  return report;
}
