import { expect, test } from 'vitest';
import { compileConstructionServices, allocateConstructionServices, type ConstructionServiceNetwork, type ServicePort, type ServiceRoute,
  type ServicePoint3, type ConstructionServiceChannel, SERVICE_QUANTITY_UNITS } from './construction-services';

function node(id: string, position: ServicePoint3, direction: ServicePort['direction'] = 'both', channel: ConstructionServiceChannel = 'power'): ServicePort {
  return { id, position, direction, kind: 'port', regionId: 'room', deckId: 'deck', definitionId: `test-${id}`, channel,
    medium: channel === 'power' ? 'electricity' : channel, connectorFamily: 'fixture-connector', capacityPerSecond: 100 };
}
function route(id: string, from: ServicePort, to: ServicePort, capacity = 100): ServiceRoute {
  const path: ServicePoint3[] = [[...from.position]];
  for (let axis = 0; axis < 3; axis++) if (path.at(-1)![axis] !== to.position[axis]) {
    const next = [...path.at(-1)!] as ServicePoint3; next[axis] = to.position[axis]; path.push(next);
  }
  return { id, fromPortId: from.id, toPortId: to.id, definitionId: `test-${id}`, channel: from.channel, medium: from.medium,
    connectorFamily: from.connectorFamily, capacityPerSecond: capacity, clearanceUnits: 1, path, feedthroughIds: [], riserDefinitionId: null };
}
function network(nodes: ServicePort[], routes: ServiceRoute[]): ConstructionServiceNetwork {
  return { regions: [{ id: 'room', deckId: 'deck', box: [0, 0, 0, 128, 128, 128] }], boundaries: [], feedthroughs: [], nodes, routes };
}
function simple() {
  const source = node('source', [16, 16, 16], 'out'), sink = node('sink', [112, 16, 16], 'in');
  return network([source, sink], [route('line', source, sink)]);
}
function crossing(vertical = false): ConstructionServiceNetwork {
  const n = simple();
  n.regions = vertical ? [{ id: 'room', deckId: 'deck', box: [0, 0, 0, 128, 128, 64] }, { id: 'other', deckId: 'upper', box: [0, 0, 64, 128, 128, 128] }]
    : [{ id: 'room', deckId: 'deck', box: [0, 0, 0, 64, 128, 128] }, { id: 'other', deckId: 'deck', box: [64, 0, 0, 128, 128, 128] }];
  n.nodes[1].regionId = 'other'; n.nodes[1].deckId = vertical ? 'upper' : 'deck';
  n.nodes[1].position = vertical ? [16, 16, 112] : [112, 16, 16];
  n.routes = [route('line', n.nodes[0], n.nodes[1])];
  n.routes[0].riserDefinitionId = vertical ? 'test-riser' : null;
  n.boundaries = [{ id: 'boundary', aRegionId: 'room', bRegionId: 'other', kind: vertical ? 'deck' : 'wall', axis: vertical ? 2 : 0,
    coordinate: 64, span: [0, 0, 128, 128], pressureSealRequired: true }];
  n.feedthroughs = [{ id: 'gland', boundaryId: 'boundary', definitionId: 'test-sealed-gland', position: vertical ? [16, 16, 64] : [64, 16, 16],
    sealed: true, channel: 'power', medium: 'electricity', connectorFamily: 'fixture-connector', capacityPerSecond: 100, clearanceUnits: 2 }];
  n.routes[0].feedthroughIds = ['gland']; return n;
}
const codes = (n: ConstructionServiceNetwork) => compileConstructionServices(n).diagnostics.map(d => d.code);
const allocate = (n: ConstructionServiceNetwork, quantity = 25) => allocateConstructionServices(compileConstructionServices(n), [{ portId: 'source', availableQuantity: quantity }], [{ portId: 'sink', requestedQuantity: quantity, priority: 0 }], 1);

test('exact endpoints and explicit approved wall penetrations compile and carry conserved supply', () => {
  const n = crossing(), result = compileConstructionServices(n);
  expect(result.diagnostics).toEqual([]);
  const allocation = allocate(n);
  expect(allocation.supplies).toEqual([{ portId: 'source', consumedQuantity: 25, remainingQuantity: 0 }]);
  expect(allocation.consumers).toEqual([{ portId: 'sink', deliveredQuantity: 25, unmetQuantity: 0 }]);
  expect(allocation.routes).toEqual([{ routeId: 'line', quantity: 25 }]);
});

test('cross-deck vertical riser requires its explicit adapter and rated sealed deck feedthrough', () => {
  const n = crossing(true); expect(compileConstructionServices(n).valid).toBe(true);
  n.routes[0].riserDefinitionId = null; expect(codes(n)).toContain('riser');
  n.routes[0].riserDefinitionId = 'test-riser'; n.feedthroughs[0].sealed = false;
  expect(codes(n)).toContain('unsealed-penetration');
});

test('missing, displaced, unsealed or undersized feedthrough never silently joins chambers', () => {
  const missing = crossing(); missing.routes[0].feedthroughIds = []; expect(codes(missing)).toContain('feedthrough');
  const shifted = crossing(); shifted.feedthroughs[0].position[1]++; expect(codes(shifted)).toContain('feedthrough');
  const unsealed = crossing(); unsealed.feedthroughs[0].sealed = false; expect(codes(unsealed)).toContain('unsealed-penetration');
  const undersized = crossing(); undersized.feedthroughs[0].capacityPerSecond = 50; expect(codes(undersized)).toContain('feedthrough-rating');
  const omittedWall = crossing(); omittedWall.boundaries = []; omittedWall.feedthroughs = []; omittedWall.routes[0].feedthroughIds = [];
  expect(codes(omittedWall)).toContain('boundary');
});

test('a cable crossing in 3D creates no connectivity between otherwise separate routes', () => {
  const a = node('a', [16, 64, 16], 'out'), b = node('b', [112, 64, 16], 'in'), c = node('c', [64, 16, 16], 'out'), d = node('d', [64, 112, 16], 'in');
  const n = compileConstructionServices(network([a, b, c, d], [route('horizontal', a, b), route('vertical', c, d)]));
  expect(n.valid).toBe(true);
  const result = allocateConstructionServices(n, [{ portId: 'a', availableQuantity: 30 }], [{ portId: 'd', requestedQuantity: 30, priority: 0 }], 1);
  expect(result.consumers[0].deliveredQuantity).toBe(0); expect(result.supplies[0].remainingQuantity).toBe(30);
});

test('colocated endpoint IDs are not implicit junctions', () => {
  const a = node('a', [16, 16, 16], 'out'), b = node('b', [64, 16, 16], 'in'), c = node('c', [64, 16, 16], 'out'), d = node('d', [112, 16, 16], 'in');
  const n = compileConstructionServices(network([a, b, c, d], [route('ab', a, b), route('cd', c, d)]));
  const result = allocateConstructionServices(n, [{ portId: 'a', availableQuantity: 50 }], [{ portId: 'd', requestedQuantity: 50, priority: 0 }], 1);
  expect(result.consumers[0].deliveredQuantity).toBe(0);
});

test('junction IDs share capacity and higher-priority consumer receives its demand first', () => {
  const source = node('source', [16, 16, 16], 'out'), junction = node('bus', [64, 16, 16]), a = node('a', [96, 16, 16], 'in'), b = node('b', [64, 96, 16], 'in');
  junction.kind = 'junction'; junction.capacityPerSecond = 15;
  const n = compileConstructionServices(network([source, junction, a, b], [route('source-bus', source, junction), route('bus-a', junction, a), route('bus-b', junction, b)]));
  const result = allocateConstructionServices(n, [{ portId: 'source', availableQuantity: 50 }], [{ portId: 'b', requestedQuantity: 10, priority: 0 }, { portId: 'a', requestedQuantity: 10, priority: 5 }], 1);
  expect(result.consumers).toEqual([{ portId: 'a', deliveredQuantity: 10, unmetQuantity: 0 }, { portId: 'b', deliveredQuantity: 5, unmetQuantity: 5 }]);
  expect(result.supplies[0]).toEqual({ portId: 'source', consumedQuantity: 15, remainingQuantity: 35 });
});

test('residual rerouting can satisfy lower priority without stealing higher-priority delivery', () => {
  const ids = ['s1', 's2', 'a', 'b', 't1', 't2'];
  const ns = ids.map((id, i) => node(id, [16 + i * 16, 16, 16], id.startsWith('s') ? 'out' : id.startsWith('t') ? 'in' : 'both'));
  const [s1, s2, a, b, t1, t2] = ns;
  const n = compileConstructionServices(network(ns, [route('s1-a', s1, a, 10), route('s1-b', s1, b, 10), route('s2-a', s2, a, 10), route('a-t1', a, t1, 10), route('b-t2', b, t2, 10)]));
  const result = allocateConstructionServices(n, [{ portId: 's1', availableQuantity: 10 }, { portId: 's2', availableQuantity: 10 }],
    [{ portId: 't1', requestedQuantity: 10, priority: 9 }, { portId: 't2', requestedQuantity: 10, priority: 1 }], 1);
  expect(result.consumers.map(c => c.deliveredQuantity)).toEqual([10, 10]);
  expect(result.routes.find(r => r.routeId === 's1-a')?.quantity).toBe(0);
  expect(result.routes.find(r => r.routeId === 's2-a')?.quantity).toBe(10);
  expect(result.exhausted).toBe(false);
});

test('rate times timestep and actual available amounts bound consumption without replenishing sources', () => {
  const n = simple(); n.routes[0].capacityPerSecond = 10;
  const result = allocateConstructionServices(compileConstructionServices(n), [{ portId: 'source', availableQuantity: 7 }], [{ portId: 'sink', requestedQuantity: 20, priority: 0 }], 0.5);
  expect(result.supplies[0]).toEqual({ portId: 'source', consumedQuantity: 5, remainingQuantity: 2 });
  expect(result.consumers[0]).toEqual({ portId: 'sink', deliveredQuantity: 5, unmetQuantity: 15 });
  const empty = allocateConstructionServices(compileConstructionServices(n), [{ portId: 'source', availableQuantity: 0 }], [{ portId: 'sink', requestedQuantity: 20, priority: 0 }], 1);
  expect(empty.consumers[0].deliveredQuantity).toBe(0);
});

test('isolated breakers/valves and disabled devices stop delivery while preserving available supply', () => {
  const n = compileConstructionServices(simple());
  for (const availability of [{ disabledNodeIds: [], disabledRouteIds: ['line'] }, { disabledNodeIds: ['source'], disabledRouteIds: [] }, { disabledNodeIds: ['sink'], disabledRouteIds: [] }]) {
    const result = allocateConstructionServices(n, [{ portId: 'source', availableQuantity: 30 }], [{ portId: 'sink', requestedQuantity: 30, priority: 0 }], 1, availability);
    expect(result.supplies[0].remainingQuantity).toBe(30); expect(result.consumers[0].deliveredQuantity).toBe(0);
  }
});

test('channel and medium must match even if ports and routes geometrically fit', () => {
  const mismatch = simple(); mismatch.nodes[1].channel = 'fuel'; expect(codes(mismatch)).toContain('compatibility');
  const medium = simple(); medium.nodes[1].medium = 'hydrogen'; expect(codes(medium)).toContain('compatibility');
  const connector = simple(); connector.nodes[1].connectorFamily = 'other'; expect(codes(connector)).toContain('compatibility');
  const direction = simple(); direction.nodes[1].direction = 'out'; expect(codes(direction)).toContain('direction');
  const wrongFeed = crossing(); wrongFeed.feedthroughs[0].medium = 'hydrogen'; expect(codes(wrongFeed)).toContain('feedthrough-rating');
});

test('all five channel adapters conserve their own quantities independently', () => {
  for (const channel of Object.keys(SERVICE_QUANTITY_UNITS) as ConstructionServiceChannel[]) {
    const a = node('source', [16, 16, 16], 'out', channel), b = node('sink', [112, 16, 16], 'in', channel);
    const result = allocate(network([a, b], [route('line', a, b)]), 42);
    expect(result.supplies[0].consumedQuantity).toBe(42); expect(result.consumers[0].deliveredQuantity).toBe(42);
  }
});

test('exact endpoint coordinates, region identity, Manhattan geometry and shaft clearances are required', () => {
  const offset = simple(); offset.routes[0].path[0][0]++; expect(codes(offset)).toContain('endpoint-position');
  const diagonal = simple(); diagonal.routes[0].path.at(-1)![1]++; expect(codes(diagonal)).toContain('route-axis');
  const clearance = simple(); clearance.routes[0].clearanceUnits = 17; expect(codes(clearance)).toContain('route-clearance');
  const outside = simple(); outside.nodes[0].position[0] = -1; expect(codes(outside)).toContain('admission');
  const gap = crossing(); gap.regions[1].box[0] = 65; gap.boundaries = []; gap.feedthroughs = []; gap.routes[0].feedthroughIds = [];
  expect(codes(gap)).toContain('route-region');
});

test('feedthrough references cannot be reused as an undeclared connection between independent routes', () => {
  const n = crossing(); n.routes.push({ ...structuredClone(n.routes[0]), id: 'second-line' });
  expect(codes(n)).toContain('feedthrough-occupied');
  const duplicate = crossing(); duplicate.routes[0].feedthroughIds.push('gland'); expect(codes(duplicate)).toContain('unused-feedthrough');
});

test('directed route cycles remain bounded and do not manufacture resource quantities', () => {
  const s = node('source', [16, 16, 16], 'out'), a = node('a', [32, 16, 16]), b = node('b', [64, 16, 16]), t = node('sink', [96, 16, 16], 'in');
  const result = allocate(network([s, a, b, t], [route('sa', s, a), route('ab', a, b), route('ba', b, a), route('bt', b, t)]), 70);
  expect(result.exhausted).toBe(false); expect(result.consumers[0].deliveredQuantity).toBe(70);
  expect(result.supplies[0].consumedQuantity).toBe(70);
  expect(result.routes.find(r => r.routeId === 'ba')?.quantity).toBe(0);
});

test('input ordering is deterministic and neither compiler nor allocator mutates source records', () => {
  const original = crossing(), snapshot = structuredClone(original);
  const reversed = { ...original, regions: [...original.regions].reverse(), nodes: [...original.nodes].reverse(), routes: [...original.routes].reverse() };
  expect(compileConstructionServices(original)).toEqual(compileConstructionServices(reversed));
  expect(allocate(original)).toEqual(allocate(reversed)); expect(original).toEqual(snapshot);
});

test('invalid capacities, duplicate identities, negative supplies and stale runtime state reject', () => {
  const negative = simple(); negative.routes[0].capacityPerSecond = -1; expect(codes(negative)).toContain('admission');
  const duplicate = simple(); duplicate.nodes.push(duplicate.nodes[0]); expect(codes(duplicate)).toContain('admission');
  const n = compileConstructionServices(simple()), demands = [{ portId: 'sink', requestedQuantity: 10, priority: 0 }];
  expect(() => allocateConstructionServices(n, [{ portId: 'source', availableQuantity: -1 }], demands, 1)).toThrow('actual supply');
  expect(() => allocateConstructionServices(n, [{ portId: 'source', availableQuantity: 10 }], demands, 2)).toThrow('timestep');
  expect(() => allocateConstructionServices(n, [], demands, 1, { disabledNodeIds: [], disabledRouteIds: ['missing'] })).toThrow('availability');
  expect(() => allocateConstructionServices(n, [{ portId: 'sink', availableQuantity: 10 }], demands, 1)).toThrow('actual supply');
});
