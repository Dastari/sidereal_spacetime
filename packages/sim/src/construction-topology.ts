/** Pure pressure adapter, not a geometry compiler or authority endpoint.
 * Inputs must come from validated structural interfaces, never room labels or GLB bounds.
 * Each face is accounted for exactly once. A null endpoint is explicit exterior vacuum.
 * `continuous` joins are permanent unpartitioned volume. Doors/hatches/vents/breaches use
 * finite-conductance `flow` boundaries even while open: opening does not teleport gas.
 * Temperature is fixed globally; species, heat, sonic flow and injury are not modeled.
 */
export const PRESSURE_LIMITS = Object.freeze({ cells: 2048, boundaries: 8192, facesPerCell: 64,
  idLength: 128, minVolumeM3: 1e-6, maxVolumeM3: 1e9, maxTotalMoles: 1e15,
  maxConductance: 1e6, maxStepSeconds: 1, substeps: 16 });
export const PRESSURE_TEMPERATURE_K = 293.15;
export const GAS_CONSTANT = 8.31446261815324;
const RT = PRESSURE_TEMPERATURE_K * GAS_CONSTANT;

export interface PressureCell { id: string; deckId: string; volumeM3: number; faces: readonly string[] }
export interface PressureFace { cellId: string; faceId: string }
export type PressureBoundary = {
  id: string; a: PressureFace; b: PressureFace | null;
} & ({ kind: 'sealed'; pressureDefinitionId: string }
  | { kind: 'continuous' }
  | { kind: 'flow'; conductanceMolesPerSecondPa: number; sourceDefinitionId: string });
export interface PressureStructure { cells: readonly PressureCell[]; boundaries: readonly PressureBoundary[] }
export interface PressureCompartment { id: string; cellIds: readonly string[]; deckIds: readonly string[]; volumeM3: number }
export interface PressureFlow { id: string; a: string; b: string | null; conductanceMolesPerSecondPa: number }
export interface PressureTopology {
  cells: readonly PressureCell[]; compartments: readonly PressureCompartment[];
  cellCompartment: ReadonlyMap<string, string>; flows: readonly PressureFlow[];
}
/** Persistent adapter rows must cover every compartment exactly once. */
export interface CompartmentGas { compartmentId: string; moles: number }

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Pressure topology: ${message}`);
}
function validId(id: string) { return typeof id === 'string' && id.length > 0 && id.length <= PRESSURE_LIMITS.idLength; }
function bounded(value: number, low: number, high: number) { return Number.isFinite(value) && value >= low && value <= high; }
const faceKey = (face: PressureFace) => JSON.stringify([face.cellId, face.faceId]);

export function compilePressureTopology(structure: PressureStructure): PressureTopology {
  requireCondition(structure.cells.length > 0 && structure.cells.length <= PRESSURE_LIMITS.cells, 'cell count out of bounds');
  requireCondition(structure.boundaries.length <= PRESSURE_LIMITS.boundaries, 'boundary count out of bounds');
  const cells = [...structure.cells].sort((a, b) => compare(a.id, b.id));
  const byId = new Map<string, PressureCell>(), parent = new Map<string, string>(), declared = new Set<string>();
  for (const cell of cells) {
    requireCondition(validId(cell.id) && validId(cell.deckId) && !byId.has(cell.id), 'invalid or duplicate cell identity');
    requireCondition(bounded(cell.volumeM3, PRESSURE_LIMITS.minVolumeM3, PRESSURE_LIMITS.maxVolumeM3), `invalid volume ${cell.id}`);
    requireCondition(cell.faces.length > 0 && cell.faces.length <= PRESSURE_LIMITS.facesPerCell, `invalid faces ${cell.id}`);
    for (const faceId of cell.faces) {
      const key = faceKey({ cellId: cell.id, faceId });
      requireCondition(validId(faceId) && !declared.has(key), `invalid or duplicate face ${key}`);
      declared.add(key);
    }
    byId.set(cell.id, cell); parent.set(cell.id, cell.id);
  }
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(id) !== id) { const next = parent.get(id)!; parent.set(id, root); id = next; }
    return root;
  };
  const boundaries = [...structure.boundaries].sort((a, b) => compare(a.id, b.id));
  const seen = new Set<string>(), assigned = new Set<string>();
  for (const boundary of boundaries) {
    requireCondition(validId(boundary.id) && !seen.has(boundary.id), 'invalid or duplicate boundary identity');
    seen.add(boundary.id);
    for (const endpoint of boundary.b ? [boundary.a, boundary.b] : [boundary.a]) {
      const key = faceKey(endpoint);
      requireCondition(declared.has(key) && !assigned.has(key), `unknown or multiply assigned face ${key}`);
      assigned.add(key);
    }
    requireCondition(!boundary.b || boundary.a.cellId !== boundary.b.cellId, `self boundary ${boundary.id}`);
    if (boundary.kind === 'continuous') {
      requireCondition(boundary.b, 'continuous boundary cannot merge with vacuum');
      const a = find(boundary.a.cellId), b = find(boundary.b.cellId);
      if (a !== b) parent.set(compare(a, b) < 0 ? b : a, compare(a, b) < 0 ? a : b);
    } else if (boundary.kind === 'flow') {
      requireCondition(validId(boundary.sourceDefinitionId), 'flow requires an explicit functional definition');
      requireCondition(bounded(boundary.conductanceMolesPerSecondPa, 0, PRESSURE_LIMITS.maxConductance), 'invalid conductance');
    } else {
      requireCondition(boundary.kind === 'sealed' && validId(boundary.pressureDefinitionId), 'seal requires an explicit pressure definition');
    }
  }
  requireCondition(assigned.size === declared.size, 'unassigned faces; exterior exposure must be explicit');
  const groups = new Map<string, PressureCell[]>();
  for (const cell of cells) { const root = find(cell.id); const group = groups.get(root) ?? []; group.push(cell); groups.set(root, group); }
  const cellCompartment = new Map<string, string>();
  const compartments = [...groups.values()].map(group => {
    // Minimum immutable source-cell identity: deterministic without insertion-order hashes.
    const id = `volume:${group[0].id}`;
    for (const cell of group) cellCompartment.set(cell.id, id);
    return { id, cellIds: group.map(cell => cell.id), deckIds: [...new Set(group.map(cell => cell.deckId))].sort(compare),
      volumeM3: group.reduce((sum, cell) => sum + cell.volumeM3, 0) };
  });
  const flows: PressureFlow[] = [];
  for (const boundary of boundaries) if (boundary.kind === 'flow') {
    const a = cellCompartment.get(boundary.a.cellId)!, b = boundary.b ? cellCompartment.get(boundary.b.cellId)! : null;
    if (a !== b && boundary.conductanceMolesPerSecondPa > 0) flows.push({ id: boundary.id, a, b,
      conductanceMolesPerSecondPa: boundary.conductanceMolesPerSecondPa });
  }
  return { cells: cells.map(cell => ({ ...cell, faces: [...cell.faces].sort(compare) })), compartments, cellCompartment, flows };
}

function checkedGas(topology: PressureTopology, gas: readonly CompartmentGas[]): Map<string, number> {
  requireCondition(gas.length === topology.compartments.length, 'gas rows must cover every compartment');
  const ids = new Set(topology.compartments.map(c => c.id)), result = new Map<string, number>();
  let total = 0;
  for (const row of gas) {
    requireCondition(ids.has(row.compartmentId) && !result.has(row.compartmentId), 'unknown or duplicate gas row');
    requireCondition(bounded(row.moles, 0, PRESSURE_LIMITS.maxTotalMoles), 'invalid gas amount');
    total += row.moles; result.set(row.compartmentId, row.moles);
  }
  requireCondition(total <= PRESSURE_LIMITS.maxTotalMoles, 'total gas exceeds solver bound');
  return result;
}
export function pressurePascals(moles: number, volumeM3: number): number {
  requireCondition(bounded(moles, 0, PRESSURE_LIMITS.maxTotalMoles) && Number.isFinite(volumeM3) && volumeM3 >= PRESSURE_LIMITS.minVolumeM3, 'invalid pressure inputs');
  return moles * RT / volumeM3;
}

/** Remap once on a topology revision. Gas is uniform within each old compartment.
 * Unchanged cell IDs retain their share even if their volume changes (compression).
 * New cells start empty. Deleted-cell gas is returned explicitly for authority to reject,
 * capture in a reservoir, or account as expelled; this helper never silently deletes it.
 * Subdividing a cell requires an upstream overlap mapping, not new IDs passed here.
 */
export function remapCompartmentGas(previous: PressureTopology, next: PressureTopology, gas: readonly CompartmentGas[]) {
  const amounts = checkedGas(previous, gas), oldCells = new Map(previous.cells.map(cell => [cell.id, cell]));
  const nextAmounts = new Map(next.compartments.map(compartment => [compartment.id, 0]));
  let removedMoles = 0;
  for (const compartment of previous.compartments) {
    const amount = amounts.get(compartment.id)!;
    let allocated = 0;
    for (let i = 0; i < compartment.cellIds.length; i++) {
      const cellId = compartment.cellIds[i];
      // Last share is the exact remainder, avoiding drift through repeated split/merge.
      const share = i === compartment.cellIds.length - 1 ? Math.max(0, amount - allocated)
        : Math.min(amount - allocated, amount * oldCells.get(cellId)!.volumeM3 / compartment.volumeM3);
      allocated += share;
      const destination = next.cellCompartment.get(cellId);
      if (destination === undefined) removedMoles += share;
      else nextAmounts.set(destination, nextAmounts.get(destination)! + share);
    }
  }
  return { gas: next.compartments.map(c => ({ compartmentId: c.id, moles: nextAmounts.get(c.id)! })), removedMoles };
}

/** Fixed-temperature finite-volume linear-conductance approximation.
 * Exact pairwise exponential transfers cannot overshoot equilibrium or go negative.
 * Sixteen bounded symmetric forward/reverse sweeps reduce ordering bias; they are an
 * operator-splitting approximation, not compressible-fluid/sonic-flow simulation.
 * Closed seals do no work. Vacuum takes gas out of the modeled ship, recorded separately.
 */
export function stepCompartmentGas(topology: PressureTopology, gas: readonly CompartmentGas[], seconds: number) {
  requireCondition(bounded(seconds, 0, PRESSURE_LIMITS.maxStepSeconds), 'timestep out of bounds');
  const amounts = checkedGas(topology, gas), volumes = new Map(topology.compartments.map(c => [c.id, c.volumeM3]));
  let ventedMoles = 0;
  const transfers = new Map(topology.flows.map(flow => [flow.id, 0]));
  const dt = seconds / (2 * PRESSURE_LIMITS.substeps);
  const exchange = (flow: PressureFlow) => {
    const a = amounts.get(flow.a)!, va = volumes.get(flow.a)!;
    const b = flow.b === null ? 0 : amounts.get(flow.b)!;
    const vb = flow.b === null ? Infinity : volumes.get(flow.b)!;
    const inverse = 1 / va + 1 / vb;
    const equilibriumTransfer = (a / va - b / vb) / inverse;
    const transfer = Math.max(-b, Math.min(a, equilibriumTransfer * -Math.expm1(-flow.conductanceMolesPerSecondPa * RT * inverse * dt)));
    amounts.set(flow.a, a - transfer);
    if (flow.b !== null) amounts.set(flow.b, b + transfer); else ventedMoles += transfer;
    transfers.set(flow.id, transfers.get(flow.id)! + transfer);
  };
  if (seconds > 0) for (let step = 0; step < PRESSURE_LIMITS.substeps; step++) {
    for (const flow of topology.flows) exchange(flow);
    for (let i = topology.flows.length - 1; i >= 0; i--) exchange(topology.flows[i]);
  }
  return { gas: topology.compartments.map(c => ({ compartmentId: c.id, moles: amounts.get(c.id)! })), ventedMoles,
    transfers: topology.flows.map(flow => ({ boundaryId: flow.id, molesAToB: transfers.get(flow.id)! })) };
}

export type AirlockSide = 'inner' | 'outer';
export interface AirlockDoor { open: boolean; obstructed: boolean; sealIntact: boolean }
export interface AirlockState {
  inner: AirlockDoor; outer: AirlockDoor; powered: boolean;
  chamberBreached: boolean; pumpTarget: AirlockSide | null;
}
export interface AirlockPressure { chamberPa: number; innerPa: number; outerPa: number; maxOpeningDifferentialPa: number }
export type AirlockIntent = { kind: 'open' | 'close'; side: AirlockSide; emergency?: boolean }
  | { kind: 'startPump'; side: AirlockSide } | { kind: 'stopPump' };
export type AirlockDecision = { ok: true; state: AirlockState; emergencyExposure: boolean }
  | { ok: false; reason: 'invalid-pressure' | 'unauthorized-override' | 'no-power' | 'obstructed' | 'interlock' | 'unsafe-pressure' | 'broken-seal' };

/** Mechanical policy only. The server checks actor permissions/revisions/proximity,
 * supplies actual pressure/power/seal states and separately applies pump gas transfers.
 * Emergency manual opening explicitly permits decompression/both-open, never obstruction.
 * Pump target is a request to a validated source/reservoir/vent adapter; it creates no gas.
 */
export function transitionAirlock(state: AirlockState, pressure: AirlockPressure, intent: AirlockIntent, emergencyAuthorized = false): AirlockDecision {
  if (Object.values(pressure).some(value => !Number.isFinite(value) || value < 0)) return { ok: false, reason: 'invalid-pressure' };
  const next = { ...state, inner: { ...state.inner }, outer: { ...state.outer } };
  // Power loss cancels pumping. Call with stopPump from the supply-state adapter too.
  if (!next.powered) next.pumpTarget = null;
  if (intent.kind === 'stopPump') { next.pumpTarget = null; return { ok: true, state: next, emergencyExposure: false }; }
  const selected = next[intent.side], other = next[intent.side === 'inner' ? 'outer' : 'inner'];
  if (intent.kind === 'startPump') {
    if (!next.powered) return { ok: false, reason: 'no-power' };
    if (selected.open || other.open) return { ok: false, reason: 'interlock' };
    if (next.chamberBreached || !selected.sealIntact || !other.sealIntact) return { ok: false, reason: 'broken-seal' };
    next.pumpTarget = intent.side;
    return { ok: true, state: next, emergencyExposure: false };
  }
  if (intent.emergency && !emergencyAuthorized) return { ok: false, reason: 'unauthorized-override' };
  if (!next.powered && !intent.emergency) return { ok: false, reason: 'no-power' };
  if (selected.obstructed) return { ok: false, reason: 'obstructed' };
  if (intent.kind === 'open' && !intent.emergency) {
    if (other.open || next.pumpTarget !== null) return { ok: false, reason: 'interlock' };
    if (next.chamberBreached || !other.sealIntact) return { ok: false, reason: 'broken-seal' };
    if (Math.abs(pressure.chamberPa - pressure[intent.side === 'inner' ? 'innerPa' : 'outerPa']) > pressure.maxOpeningDifferentialPa)
      return { ok: false, reason: 'unsafe-pressure' };
  }
  selected.open = intent.kind === 'open'; next.pumpTarget = null;
  return { ok: true, state: next, emergencyExposure: !!intent.emergency && selected.open };
}
