import type { Identity } from "spacetimedb";
import {
  compilePressureTopology,
  stepCompartmentGas,
  remapCompartmentGas,
  pressurePascals,
  type PressureStructure,
  type PressureTopology,
  type CompartmentGas,
} from "@sidereal/sim/construction-topology";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { stableStringify } from "@sidereal/sim/layout-geometry";

export const ATMOSPHERE_LIMITS = Object.freeze({
  instances: 32,
  cells: 256,
  flows: 256,
  boundaries: 2048,
  bytes: 262144,
});
export interface AtmosphereRow {
  id: string;
  owner: Identity;
  structureJson: string;
  proofHash: string;
  initialAllocationHash: string;
  gasJson: string;
  sourceMoles: number;
  ventedMoles: number;
  removedMoles: number;
  revision: bigint;
  lastTick: bigint;
}
export interface AtmosphereTable {
  iter(): IterableIterator<AtmosphereRow>;
  insert(row: AtmosphereRow): unknown;
  id: {
    find(id: string): AtmosphereRow | undefined | null;
    update(row: AtmosphereRow): unknown;
  };
  by_owner: { filter(owner: Identity): IterableIterator<AtmosphereRow> };
}
/** This is a server-only accepted model, not a transport payload or proof verifier.
 * Parent must build it from certified native coverage/free-volume definitions. */
export interface AcceptedAtmosphereModel {
  structure: PressureStructure;
  proofHash: string;
}
export type InitialAtmosphereAllocation =
  | { kind: "vacuum" }
  | { kind: "allocated"; allocationId: string; gas: readonly CompartmentGas[] };
const encode = stableStringify;
function model(input: AcceptedAtmosphereModel): {
  json: string;
  topology: PressureTopology;
} {
  if (!/^[a-f0-9]{64}$/.test(input.proofHash))
    throw Error("Native pressure validation hash required");
  if (
    input.structure.cells.length > ATMOSPHERE_LIMITS.cells ||
    input.structure.boundaries.length > ATMOSPHERE_LIMITS.boundaries
  )
    throw Error("Atmosphere model exceeds admitted work budget");
  const topology = compilePressureTopology(input.structure),
    json = encode(input.structure);
  if (
    topology.cells.length > ATMOSPHERE_LIMITS.cells ||
    topology.flows.length > ATMOSPHERE_LIMITS.flows ||
    new TextEncoder().encode(json).length > ATMOSPHERE_LIMITS.bytes
  )
    throw Error("Atmosphere model exceeds admitted work budget");
  return { json, topology };
}
function validateTick(tick: bigint) {
  if (typeof tick !== "bigint" || tick < 0n || tick > 18446744073709551615n)
    throw Error("Invalid atmosphere simulation tick");
}
const amount = (gas: readonly CompartmentGas[]) =>
  gas.reduce((n, g) => n + g.moles, 0);
// Immutable derived topology only. Gas and accounting are parsed/revalidated
// every time; a changed structure string always compiles independently.
const topologyCache = new Map<string, PressureTopology>();
function stored(row: AtmosphereRow) {
  let topology = topologyCache.get(row.structureJson);
  if (!topology) {
    topology = compilePressureTopology(
      JSON.parse(row.structureJson) as PressureStructure,
    );
    if (topologyCache.size >= ATMOSPHERE_LIMITS.instances * 2)
      topologyCache.delete(topologyCache.keys().next().value!);
    topologyCache.set(row.structureJson, topology);
  }
  const gas = stepCompartmentGas(
    topology,
    JSON.parse(row.gasJson) as CompartmentGas[],
    0,
  ).gas;
  const accounted = amount(gas) + row.ventedMoles + row.removedMoles;
  if (
    ![row.sourceMoles, row.ventedMoles, row.removedMoles, accounted].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) ||
    Math.abs(accounted - row.sourceMoles) > 1e-8 * Math.max(1, row.sourceMoles)
  )
    throw Error("Persistent atmosphere resource accounting mismatch");
  return { topology, gas };
}
/** Called only inside a validated spawn transaction. It never runs on reconnect.
 * An allocated gas charge must already be authorized/accounted by the parent template
 * resource policy; the default is vacuum. Repeating a spawn cannot allocate twice. */
export function initializeAtmosphere(
  table: AtmosphereTable,
  instance: { id: string; owner: Identity },
  accepted: AcceptedAtmosphereModel,
  allocation: InitialAtmosphereAllocation,
  tick: bigint,
) {
  validateTick(tick);
  const compiled = model(accepted),
    old = table.id.find(instance.id),
    allocationHash = constructionHash(encode(allocation));
  if (old) {
    if (
      !old.owner.isEqual(instance.owner) ||
      old.proofHash !== accepted.proofHash ||
      old.structureJson !== compiled.json ||
      old.initialAllocationHash !== allocationHash
    )
      throw Error("Atmosphere initialization conflicts with existing instance");
    return old;
  }
  let count = 0;
  for (const _ of table.iter())
    if (++count >= ATMOSPHERE_LIMITS.instances)
      throw Error("Atmosphere instance admission budget exhausted");
  if (
    allocation.kind === "allocated" &&
    (!allocation.allocationId || allocation.allocationId.length > 160)
  )
    throw Error("Explicit gas allocation identity required");
  const gas =
    allocation.kind === "vacuum"
      ? compiled.topology.compartments.map((c) => ({
          compartmentId: c.id,
          moles: 0,
        }))
      : allocation.gas;
  stepCompartmentGas(compiled.topology, gas, 0);
  const row: AtmosphereRow = {
    id: instance.id,
    owner: instance.owner,
    structureJson: compiled.json,
    proofHash: accepted.proofHash,
    initialAllocationHash: allocationHash,
    gasJson: encode(gas),
    sourceMoles: amount(gas),
    ventedMoles: 0,
    removedMoles: 0,
    revision: 1n,
    lastTick: tick,
  };
  table.insert(row);
  return row;
}
/** Topology edit helper; parent owns actor permission, operation receipt and native
 * damage/refit transaction. Removed gas requires an explicit disposition. */
export function replaceAtmosphereModel(
  table: AtmosphereTable,
  instanceId: string,
  expectedRevision: bigint,
  accepted: AcceptedAtmosphereModel,
  disposition: "reject-removal" | "vent" | "capture",
) {
  if (!["reject-removal", "vent", "capture"].includes(disposition))
    throw Error("Invalid removed gas disposition");
  const old = table.id.find(instanceId);
  if (!old || old.revision !== expectedRevision)
    throw Error("Atmosphere revision conflict");
  const before = stored(old),
    next = model(accepted),
    mapped = remapCompartmentGas(before.topology, next.topology, before.gas);
  if (mapped.removedMoles > 0 && disposition === "reject-removal")
    throw Error("Removed cell gas requires explicit disposition");
  const row = {
    ...old,
    structureJson: next.json,
    proofHash: accepted.proofHash,
    gasJson: encode(mapped.gas),
    revision: old.revision + 1n,
    ventedMoles:
      old.ventedMoles + (disposition === "vent" ? mapped.removedMoles : 0),
    removedMoles:
      old.removedMoles + (disposition === "capture" ? mapped.removedMoles : 0),
  };
  table.id.update(row);
  // Capture is a receipt amount, not a newly materialized reservoir: parent must
  // commit the receiving resource row in this same transaction or reject it.
  return {
    row,
    capturedMoles: disposition === "capture" ? mapped.removedMoles : 0,
  };
}
/** One bounded fixed simulation tick, not wall-clock catch-up. Same/older tick is
 * ignored, so reconnect/replayed scheduling cannot run gas exchange twice. */
export function stepAtmosphere(
  table: AtmosphereTable,
  tick: bigint,
  seconds: number,
) {
  validateTick(tick);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 1)
    throw Error("Invalid atmosphere timestep");
  const rows = [...table.iter()];
  if (rows.length > ATMOSPHERE_LIMITS.instances)
    throw Error("Atmosphere instance admission budget exceeded");
  let changed = 0;
  for (const row of rows) {
    if (tick <= row.lastTick) continue;
    const current = stored(row),
      next = stepCompartmentGas(current.topology, current.gas, seconds);
    const gasJson = encode(next.gas);
    // A no-op step has no resource or replay effect. Keep lastTick as the last
    // committed gas step instead of rewriting the large structure blob at 20 Hz.
    if (gasJson === row.gasJson && next.ventedMoles === 0) continue;
    table.id.update({
      ...row,
      gasJson,
      lastTick: tick,
      ventedMoles: row.ventedMoles + next.ventedMoles,
      revision: row.revision + 1n,
    });
    if (gasJson !== row.gasJson) changed++;
  }
  return changed;
}
/** Owner projection only; exported helpers do not register a public base table.
 * Parent gameView must also perform the current connection/JWT policy. */
export function ownAtmospheres(
  table: Pick<AtmosphereTable, "by_owner">,
  owner: Identity,
) {
  return [...table.by_owner.filter(owner)].map((row) => {
    const { topology, gas } = stored(row),
      byId = new Map(gas.map((g) => [g.compartmentId, g.moles]));
    return {
      instanceId: row.id,
      revision: row.revision,
      ventedMoles: row.ventedMoles,
      compartments: topology.compartments.map((c) => ({
        id: c.id,
        deckIds: [...c.deckIds],
        volumeM3: c.volumeM3,
        pressurePa: pressurePascals(byId.get(c.id)!, c.volumeM3),
      })),
    };
  });
}
