import { expect, test } from 'vitest';
import {
  compilePressureTopology, remapCompartmentGas, stepCompartmentGas, pressurePascals,
  transitionAirlock, PRESSURE_LIMITS, type PressureStructure, type PressureBoundary,
  type CompartmentGas, type AirlockState,
} from './construction-topology';

const face = (cellId: string, faceId: string) => ({ cellId, faceId });
function structure(join: 'continuous' | 'sealed' | 'flow' = 'sealed', conductance = 0.0001): PressureStructure {
  const shared = { id: 'between', a: face('a', 'east'), b: face('b', 'west') };
  const boundary: PressureBoundary = join === 'sealed' ? { ...shared, kind: join, pressureDefinitionId: 'test-pressure-wall' }
    : join === 'flow' ? { ...shared, kind: join, sourceDefinitionId: 'test-door', conductanceMolesPerSecondPa: conductance }
      : { ...shared, kind: join };
  return {
    cells: [{ id: 'a', deckId: 'lower', volumeM3: 10, faces: ['east', 'shell'] },
      { id: 'b', deckId: 'upper', volumeM3: 30, faces: ['west', 'shell'] }],
    boundaries: [boundary, ...['a', 'b'].map(id => ({ id: `shell-${id}`, a: face(id, 'shell'), b: null,
      kind: 'sealed' as const, pressureDefinitionId: 'test-pressure-shell' }))],
  };
}
const gas = (a = 100, b = 0): CompartmentGas[] => [{ compartmentId: 'volume:a', moles: a }, { compartmentId: 'volume:b', moles: b }];
const total = (rows: readonly CompartmentGas[]) => rows.reduce((sum, row) => sum + row.moles, 0);

test('compartments depend on explicit structural faces, joining continuous deck shafts deterministically', () => {
  const input = structure('continuous');
  const topology = compilePressureTopology(input);
  expect(topology.compartments).toEqual([{ id: 'volume:a', cellIds: ['a', 'b'], deckIds: ['lower', 'upper'], volumeM3: 40 }]);
  const reordered = compilePressureTopology({ cells: [...input.cells].reverse(), boundaries: [...input.boundaries].reverse() });
  expect(reordered).toEqual(topology);
  expect(compilePressureTopology(structure()).compartments).toHaveLength(2);
});

test('open vertical hatch is a gradual flow, not an instantaneous topological equalization', () => {
  const topology = compilePressureTopology(structure('flow'));
  expect(topology.compartments).toHaveLength(2);
  const next = stepCompartmentGas(topology, gas(), 0.1);
  expect(next.gas[0].moles).toBeLessThan(100);
  expect(next.gas[0].moles).toBeGreaterThan(25);
  expect(next.gas[1].moles).toBeGreaterThan(0);
  expect(total(next.gas)).toBeCloseTo(100, 11);
  expect(next.ventedMoles).toBe(0);
  expect(next.transfers[0].molesAToB).toBeCloseTo(next.gas[1].moles, 11);
  expect(pressurePascals(next.gas[0].moles, 10)).toBeGreaterThan(pressurePascals(next.gas[1].moles, 30));
});

test('maximum conductance reaches correct volume-weighted equilibrium without negative gas or overshoot', () => {
  const topology = compilePressureTopology(structure('flow', PRESSURE_LIMITS.maxConductance));
  const forward = stepCompartmentGas(topology, gas(100, 0), 1);
  expect(forward.gas).toEqual(gas(25, 75));
  const reverse = stepCompartmentGas(topology, gas(0, 100), 1);
  expect(reverse.gas).toEqual(gas(25, 75));
  expect(reverse.transfers[0].molesAToB).toBe(-25);
});

test('sealed closures and zero-conductance closed doors retain gas exactly', () => {
  for (const input of [structure('sealed'), structure('flow', 0)]) {
    const next = stepCompartmentGas(compilePressureTopology(input), gas(7, 91), 1);
    expect(next.gas).toEqual(gas(7, 91));
    expect(next.transfers).toEqual([]);
    expect(next.ventedMoles).toBe(0);
  }
});

test('an exterior structural breach vents explicitly; a decorative armor change supplies no flow edge', () => {
  const intact = structure('sealed');
  const original = gas(100, 300);
  expect(stepCompartmentGas(compilePressureTopology(intact), original, 1).gas).toEqual(original);
  const broken: PressureStructure = { ...intact, boundaries: intact.boundaries.map(boundary => boundary.id !== 'shell-a' ? boundary
    : { id: boundary.id, a: boundary.a, b: null, kind: 'flow', sourceDefinitionId: 'test-structural-breach', conductanceMolesPerSecondPa: 0.001 }) };
  const result = stepCompartmentGas(compilePressureTopology(broken), original, 1);
  expect(result.gas[0].moles).toBeGreaterThan(0);
  expect(result.gas[0].moles).toBeLessThan(100);
  expect(result.gas[1].moles).toBe(300);
  expect(total(result.gas) + result.ventedMoles).toBeCloseTo(400, 10);
  expect(result.transfers[0].boundaryId).toBe('shell-a');
});

test('split and merge conserve moles by old cell volumes across two decks without pressure duplication', () => {
  const merged = compilePressureTopology(structure('continuous')), split = compilePressureTopology(structure());
  let current: CompartmentGas[] = [{ compartmentId: 'volume:a', moles: 117.123456789 }];
  for (let i = 0; i < 200; i++) {
    const divided = remapCompartmentGas(merged, split, current);
    expect(divided.removedMoles).toBe(0);
    expect(divided.gas[1].moles / divided.gas[0].moles).toBeCloseTo(3, 12);
    current = remapCompartmentGas(split, merged, divided.gas).gas;
  }
  expect(current[0].moles).toBeCloseTo(117.123456789, 11);
  const unequal = remapCompartmentGas(split, merged, gas(11, 29));
  expect(unequal.gas).toEqual([{ compartmentId: 'volume:a', moles: 40 }]);
});

test('new volume starts empty; removed volume reports its gas; resizing retained cells compresses without creating gas', () => {
  const previous = compilePressureTopology(structure('continuous'));
  const next = compilePressureTopology({ cells: [{ id: 'a', deckId: 'lower', volumeM3: 5, faces: ['shell'] },
    { id: 'new', deckId: 'upper', volumeM3: 50, faces: ['shell'] }], boundaries: ['a', 'new'].map(id => ({ id, a: face(id, 'shell'),
    b: null, kind: 'sealed', pressureDefinitionId: 'test-pressure-shell' })) });
  const result = remapCompartmentGas(previous, next, [{ compartmentId: 'volume:a', moles: 80 }]);
  expect(result.gas).toEqual([{ compartmentId: 'volume:a', moles: 20 }, { compartmentId: 'volume:new', moles: 0 }]);
  expect(result.removedMoles).toBe(60);
  expect(total(result.gas) + result.removedMoles).toBe(80);
});

test('branched leaks and pressure flows stay nonnegative and conserve ship plus expelled gas over many steps', () => {
  const cells = Array.from({ length: 20 }, (_, i) => ({ id: `c${i.toString().padStart(2, '0')}`, deckId: `deck${i % 3}`,
    volumeM3: 1 + (i % 5) * 5, faces: ['before', 'after'] }));
  const boundaries: PressureBoundary[] = cells.slice(0, -1).map((cell, i) => ({ id: `join-${cell.id}`, a: face(cell.id, 'after'),
    b: face(cells[i + 1].id, 'before'), kind: 'flow', sourceDefinitionId: 'test-door', conductanceMolesPerSecondPa: i % 3 === 0 ? 1e6 : 0.0001 }));
  boundaries.push({ id: 'vacuum-a', a: face(cells[0].id, 'before'), b: null, kind: 'flow', sourceDefinitionId: 'test-breach', conductanceMolesPerSecondPa: 0.00001 },
    { id: 'vacuum-b', a: face(cells.at(-1)!.id, 'after'), b: null, kind: 'flow', sourceDefinitionId: 'test-breach', conductanceMolesPerSecondPa: 0.00003 });
  const topology = compilePressureTopology({ cells, boundaries });
  let state = topology.compartments.map((c, i) => ({ compartmentId: c.id, moles: i % 2 ? 0 : 300 }));
  const original = total(state); let vented = 0;
  for (let i = 0; i < 300; i++) {
    const result = stepCompartmentGas(topology, state, 0.25); state = result.gas; vented += result.ventedMoles;
    expect(state.every(row => Number.isFinite(row.moles) && row.moles >= 0)).toBe(true);
  }
  expect(vented).toBeGreaterThan(0);
  expect(total(state) + vented).toBeCloseTo(original, 8);
});

test('reject incomplete, duplicate, self, implicit-vacuum and unapproved pressure interfaces', () => {
  const base = structure();
  expect(() => compilePressureTopology({ ...base, boundaries: base.boundaries.slice(1) })).toThrow('unassigned');
  expect(() => compilePressureTopology({ ...base, boundaries: [...base.boundaries, { ...base.boundaries[0], id: 'duplicate-face' }] })).toThrow('multiply assigned');
  expect(() => compilePressureTopology({ ...base, cells: [...base.cells, base.cells[0]] })).toThrow('duplicate cell');
  expect(() => compilePressureTopology({ ...base, boundaries: [{ id: 'self', a: face('a', 'east'), b: face('a', 'shell'), kind: 'continuous' }] })).toThrow('self boundary');
  expect(() => compilePressureTopology({ ...base, boundaries: base.boundaries.map(b => b.id === 'shell-a' ? { ...b, kind: 'continuous' } : b) })).toThrow('vacuum');
  expect(() => compilePressureTopology({ ...base, boundaries: base.boundaries.map(b => b.id === 'shell-a' ? { ...b, kind: 'sealed', pressureDefinitionId: '' } : b) })).toThrow('pressure definition');
  expect(() => compilePressureTopology({ ...base, cells: base.cells.map(c => c.id === 'a' ? { ...c, volumeM3: NaN } : c) })).toThrow('volume');
  expect(() => compilePressureTopology(structure('flow', -1))).toThrow('conductance');
  expect(() => compilePressureTopology(structure('flow', Infinity))).toThrow('conductance');
  expect(() => compilePressureTopology({ ...base, cells: Array.from({ length: PRESSURE_LIMITS.cells + 1 }, () => base.cells[0]) })).toThrow('cell count');
  expect(() => compilePressureTopology({ ...base, boundaries: Array.from({ length: PRESSURE_LIMITS.boundaries + 1 }, () => base.boundaries[0]) })).toThrow('boundary count');
});

test('bounded solver rejects invalid row coverage, amounts and timestep and never mutates caller state', () => {
  const topology = compilePressureTopology(structure('flow')), input = gas(50, 25), before = structuredClone(input);
  expect(() => stepCompartmentGas(topology, input.slice(1), 1)).toThrow('cover');
  expect(() => stepCompartmentGas(topology, [input[0], input[0]], 1)).toThrow('duplicate gas');
  expect(() => stepCompartmentGas(topology, gas(-1), 1)).toThrow('gas amount');
  expect(() => stepCompartmentGas(topology, gas(Infinity), 1)).toThrow('gas amount');
  expect(() => stepCompartmentGas(topology, gas(1e15, 1e15), 1)).toThrow('total gas');
  for (const dt of [-1, 1.01, NaN]) expect(() => stepCompartmentGas(topology, input, dt)).toThrow('timestep');
  expect(stepCompartmentGas(topology, input, 0).gas).toEqual(input);
  stepCompartmentGas(topology, input, 1);
  expect(input).toEqual(before);
});

const lock = (): AirlockState => ({ inner: { open: false, obstructed: false, sealIntact: true },
  outer: { open: false, obstructed: false, sealIntact: true }, powered: true, chamberBreached: false, pumpTarget: null });
const pressures = { chamberPa: 100000, innerPa: 100000, outerPa: 0, maxOpeningDifferentialPa: 1000 };
test('airlock enforces differential, opposing door, pump and breach interlocks without inventing gas', () => {
  const state = lock();
  expect(transitionAirlock(state, pressures, { kind: 'open', side: 'outer' })).toEqual({ ok: false, reason: 'unsafe-pressure' });
  const opened = transitionAirlock(state, pressures, { kind: 'open', side: 'inner' });
  expect(opened.ok).toBe(true);
  if (!opened.ok) return;
  expect(transitionAirlock(opened.state, { ...pressures, outerPa: 100000 }, { kind: 'open', side: 'outer' })).toEqual({ ok: false, reason: 'interlock' });
  expect(transitionAirlock(opened.state, pressures, { kind: 'startPump', side: 'outer' })).toEqual({ ok: false, reason: 'interlock' });
  const pumping = transitionAirlock(state, pressures, { kind: 'startPump', side: 'outer' });
  expect(pumping.ok && pumping.state.pumpTarget).toBe('outer');
  if (pumping.ok) expect(transitionAirlock(pumping.state, pressures, { kind: 'open', side: 'inner' })).toEqual({ ok: false, reason: 'interlock' });
  expect(transitionAirlock({ ...state, chamberBreached: true }, pressures, { kind: 'startPump', side: 'inner' })).toEqual({ ok: false, reason: 'broken-seal' });
  expect(state).toEqual(lock());
});

test('airlock power loss, manual emergency intent and obstructions have explicit outcomes', () => {
  const state = { ...lock(), powered: false, pumpTarget: 'outer' as const };
  expect(transitionAirlock(state, pressures, { kind: 'open', side: 'inner' })).toEqual({ ok: false, reason: 'no-power' });
  expect(transitionAirlock(state, pressures, { kind: 'stopPump' })).toMatchObject({ ok: true, state: { pumpTarget: null } });
  const emergency = { kind: 'open' as const, side: 'outer' as const, emergency: true };
  expect(transitionAirlock(state, pressures, emergency)).toEqual({ ok: false, reason: 'unauthorized-override' });
  expect(transitionAirlock(state, pressures, emergency, true)).toMatchObject({ ok: true, state: { outer: { open: true }, pumpTarget: null }, emergencyExposure: true });
  expect(transitionAirlock({ ...state, outer: { ...state.outer, obstructed: true } }, pressures, emergency, true)).toEqual({ ok: false, reason: 'obstructed' });
  expect(transitionAirlock(lock(), { ...pressures, outerPa: NaN }, emergency, true)).toEqual({ ok: false, reason: 'invalid-pressure' });
});
