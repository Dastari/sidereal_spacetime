import { compareText } from './layout-geometry';

/** Typed utility routing and conserved-capacity allocation. Geometry uses integer
 * 1/32 m XYZ. Each channel has its own quantity; channels/mediums never substitute.
 * This is not a pressure, voltage, latency or thermal solver and mints no resources.
 */
export const SERVICE_LIMITS = Object.freeze({ nodes: 512, routes: 1024, pathPoints: 32, segments: 4096,
  regions: 256, regionIntervals: 8192, boundaries: 512, feedthroughs: 512, coordinate: 8192, rate: 1e12, requests: 128, augmentations: 1024 });
export const SERVICE_QUANTITY_UNITS = Object.freeze({ power: 'J', fuel: 'kg', data: 'byte', coolant: 'kg', ventilation: 'mol' });
export type ConstructionServiceChannel = keyof typeof SERVICE_QUANTITY_UNITS;
export type ServicePoint3 = [number, number, number];
export type ServiceBox3 = [number, number, number, number, number, number];
export interface ServiceRegion { id: string; deckId: string; box: ServiceBox3 }
export interface ServiceBoundary {
  id: string; aRegionId: string; bRegionId: string; kind: 'wall' | 'deck' | 'hull';
  axis: 0 | 1 | 2; coordinate: number; span: [number, number, number, number]; pressureSealRequired: boolean;
}
export interface ServicePort {
  id: string; kind: 'port' | 'junction'; definitionId: string; position: ServicePoint3; regionId: string; deckId: string;
  channel: ConstructionServiceChannel; medium: string; connectorFamily: string; direction: 'in' | 'out' | 'both'; capacityPerSecond: number;
}
export interface ServiceFeedthrough {
  id: string; boundaryId: string; definitionId: string; position: ServicePoint3; sealed: boolean;
  channel: ConstructionServiceChannel; medium: string; connectorFamily: string; clearanceUnits: number; capacityPerSecond: number;
}
export interface ServiceRoute {
  id: string; fromPortId: string; toPortId: string; definitionId: string; channel: ConstructionServiceChannel; medium: string; connectorFamily: string;
  capacityPerSecond: number; clearanceUnits: number; path: ServicePoint3[]; feedthroughIds: string[]; riserDefinitionId: string | null;
}
export interface ConstructionServiceNetwork { regions: ServiceRegion[]; boundaries: ServiceBoundary[]; nodes: ServicePort[]; feedthroughs: ServiceFeedthrough[]; routes: ServiceRoute[] }
export interface ServiceDiagnostic { code: string; ids: string[]; message: string }
export interface CompiledServiceNetwork { valid: boolean; diagnostics: ServiceDiagnostic[]; nodes: readonly ServicePort[]; routes: readonly ServiceRoute[] }
const id = (s: string) => typeof s === 'string' && s.length > 0 && s.length <= 128;
const integer = (n: number) => Number.isInteger(n) && Math.abs(n) <= SERVICE_LIMITS.coordinate;
const point = (p: ServicePoint3) => p.length === 3 && p.every(integer);
const same = (a: ServicePoint3, b: ServicePoint3) => a.every((n, i) => n === b[i]);
const rate = (n: number) => Number.isFinite(n) && n > 0 && n <= SERVICE_LIMITS.rate;
const channel = (s: ConstructionServiceChannel) => Object.hasOwn(SERVICE_QUANTITY_UNITS, s);
const inBox = (p: ServicePoint3, b: ServiceBox3) => p.every((n, i) => n >= b[i] && n <= b[i + 3]);
const overlap = (a: ServiceBox3, b: ServiceBox3) => [0, 1, 2].every(i => a[i] < b[i + 3] && b[i] < a[i + 3]);
const sorted = <T extends { id: string }>(items: readonly T[]) => [...items].sort((a, b) => compareText(a.id, b.id));
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function unique(items: readonly { id: string }[]) { const ids = new Set<string>(); for (const item of items) { assert(id(item.id) && !ids.has(item.id), 'Invalid/duplicate identity'); ids.add(item.id); } }
function onBoundary(p: ServicePoint3, boundary: ServiceBoundary, margin = 0) {
  const axes = [0, 1, 2].filter(axis => axis !== boundary.axis);
  return p[boundary.axis] === boundary.coordinate && p[axes[0]] - margin >= boundary.span[0] && p[axes[0]] + margin <= boundary.span[2]
    && p[axes[1]] - margin >= boundary.span[1] && p[axes[1]] + margin <= boundary.span[3];
}

export function compileConstructionServices(input: ConstructionServiceNetwork): CompiledServiceNetwork {
  const result: CompiledServiceNetwork = { valid: false, diagnostics: [], nodes: [], routes: [] };
  const issue = (code: string, ids: string[], message: string) => result.diagnostics.push({ code, ids: [...ids].sort(compareText), message });
  const finish = () => { result.diagnostics.sort((a, b) => compareText(a.code, b.code) || compareText(a.ids.join(','), b.ids.join(','))); result.valid = result.diagnostics.length === 0; return result; };
  const regions = new Map<string, ServiceRegion>(), nodes = new Map<string, ServicePort>(), boundaries = new Map<string, ServiceBoundary>(), feedthroughs = new Map<string, ServiceFeedthrough>();
  try {
    assert(input.regions.length > 0 && input.regions.length <= SERVICE_LIMITS.regions && input.nodes.length <= SERVICE_LIMITS.nodes
      && input.routes.length <= SERVICE_LIMITS.routes && input.boundaries.length <= SERVICE_LIMITS.boundaries && input.feedthroughs.length <= SERVICE_LIMITS.feedthroughs, 'Service network admission budget exceeded');
    for (const list of [input.regions, input.nodes, input.routes, input.boundaries, input.feedthroughs]) unique(list);
    for (const region of input.regions) {
      assert(id(region.deckId) && region.box.length === 6 && region.box.every(integer) && [0, 1, 2].every(i => region.box[i] < region.box[i + 3]), 'Invalid service region');
      regions.set(region.id, region);
    }
    for (let i = 0; i < input.regions.length; i++) for (let j = i + 1; j < input.regions.length; j++) assert(!overlap(input.regions[i].box, input.regions[j].box), 'Service regions overlap');
    for (const boundary of input.boundaries) {
      const a = regions.get(boundary.aRegionId), b = regions.get(boundary.bRegionId);
      assert(a && b && a.id !== b.id && [0, 1, 2].includes(boundary.axis) && integer(boundary.coordinate) && ['wall', 'deck', 'hull'].includes(boundary.kind)
        && boundary.span.length === 4 && boundary.span.every(integer) && boundary.span[0] < boundary.span[2] && boundary.span[1] < boundary.span[3]
        && typeof boundary.pressureSealRequired === 'boolean', 'Invalid structural service boundary');
      const axis = boundary.axis, other = [0, 1, 2].filter(i => i !== axis);
      assert((a.box[axis + 3] === boundary.coordinate && b.box[axis] === boundary.coordinate) || (b.box[axis + 3] === boundary.coordinate && a.box[axis] === boundary.coordinate), 'Boundary is not a shared region face');
      assert(other.every((i, k) => boundary.span[k] >= Math.max(a.box[i], b.box[i]) && boundary.span[k + 2] <= Math.min(a.box[i + 3], b.box[i + 3])), 'Boundary extends outside shared face');
      assert(a.deckId === b.deckId || boundary.kind === 'deck' || boundary.kind === 'hull', 'Cross-deck boundary requires deck/hull interface');
      boundaries.set(boundary.id, boundary);
    }
    for (const node of input.nodes) {
      const region = regions.get(node.regionId);
      assert(region && node.deckId === region.deckId && point(node.position) && inBox(node.position, region.box), 'Port position/deck does not match region');
      assert(id(node.definitionId) && channel(node.channel) && id(node.medium) && id(node.connectorFamily) && rate(node.capacityPerSecond)
        && ['in', 'out', 'both'].includes(node.direction) && ['port', 'junction'].includes(node.kind)
        && (node.kind !== 'junction' || node.direction === 'both'), 'Invalid functional port or junction');
      nodes.set(node.id, node);
    }
    for (const feedthrough of input.feedthroughs) {
      const boundary = boundaries.get(feedthrough.boundaryId);
      assert(boundary && point(feedthrough.position) && integer(feedthrough.clearanceUnits) && feedthrough.clearanceUnits > 0
        && onBoundary(feedthrough.position, boundary, feedthrough.clearanceUnits), 'Feedthrough is outside its structural interface/clearance');
      assert(id(feedthrough.definitionId) && channel(feedthrough.channel) && id(feedthrough.medium) && id(feedthrough.connectorFamily)
        && rate(feedthrough.capacityPerSecond) && typeof feedthrough.sealed === 'boolean', 'Invalid feedthrough definition');
      feedthroughs.set(feedthrough.id, feedthrough);
    }
    let segments = 0;
    for (const route of input.routes) {
      assert(id(route.definitionId) && channel(route.channel) && id(route.medium) && id(route.connectorFamily) && rate(route.capacityPerSecond)
        && integer(route.clearanceUnits) && route.clearanceUnits > 0 && (route.riserDefinitionId === null || id(route.riserDefinitionId)), 'Invalid route definition');
      assert(route.path.length >= 2 && route.path.length <= SERVICE_LIMITS.pathPoints && route.path.every(point)
        && route.feedthroughIds.length <= SERVICE_LIMITS.feedthroughs && route.feedthroughIds.every(id), 'Invalid route geometry/references');
      segments += route.path.length - 1;
      assert(segments <= SERVICE_LIMITS.segments, 'Route segment budget exceeded');
    }
  } catch (error) { issue('admission', [], String(error)); return finish(); }
  const feedthroughOwners = new Map<string, string>();
  let regionIntervals = 0;
  for (const route of sorted(input.routes)) {
    const from = nodes.get(route.fromPortId), to = nodes.get(route.toPortId);
    if (!from || !to || from.id === to.id) { issue('endpoint', [route.id], 'Route requires distinct explicit endpoint IDs'); continue; }
    if (from.direction === 'in' || to.direction === 'out') issue('direction', [route.id], 'Route violates endpoint direction');
    if ([from, to].some(n => n.channel !== route.channel || n.medium !== route.medium || n.connectorFamily !== route.connectorFamily)) issue('compatibility', [route.id], 'Channel, medium and connector family must match endpoints');
    if (!same(route.path[0], from.position) || !same(route.path.at(-1)!, to.position)) issue('endpoint-position', [route.id], 'Route geometry must terminate at the exact named ports');
    const traversed: { regionId: string; start: ServicePoint3; end: ServicePoint3 }[] = [];
    let geometryValid = true, vertical = false;
    for (let i = 1; i < route.path.length; i++) {
      const a = route.path[i - 1], b = route.path[i], changed = [0, 1, 2].filter(axis => a[axis] !== b[axis]);
      if (changed.length !== 1) { issue('route-axis', [route.id], 'Each route segment must be a nonzero lattice axis segment'); geometryValid = false; break; }
      const axis = changed[0]; vertical ||= axis === 2;
      const lineRegions = input.regions.filter(region => [0, 1, 2].every(k => k === axis || (a[k] >= region.box[k] && a[k] <= region.box[k + 3])));
      const cuts = [...new Set([a[axis], b[axis], ...lineRegions.flatMap(region => [region.box[axis], region.box[axis + 3]])])]
        .filter(n => n >= Math.min(a[axis], b[axis]) && n <= Math.max(a[axis], b[axis])).sort((x, y) => a[axis] < b[axis] ? x - y : y - x);
      for (let j = 1; j < cuts.length; j++) {
        if (++regionIntervals > SERVICE_LIMITS.regionIntervals) { issue('region-budget', [], 'Route region interval budget exceeded'); return finish(); }
        const mid = [...a] as ServicePoint3; mid[axis] = (cuts[j - 1] + cuts[j]) / 2;
        const containing = lineRegions.filter(region => inBox(mid, region.box));
        if (containing.length !== 1) { issue('route-region', [route.id], 'Route crosses undeclared volume or lies ambiguously on a region boundary'); geometryValid = false; break; }
        const region = containing[0];
        if ([0, 1, 2].some(k => k !== axis && (mid[k] - route.clearanceUnits < region.box[k] || mid[k] + route.clearanceUnits > region.box[k + 3])))
          issue('route-clearance', [route.id, region.id], 'Route clearance exceeds region/shaft cross-section');
        const start = [...a] as ServicePoint3, end = [...a] as ServicePoint3; start[axis] = cuts[j - 1]; end[axis] = cuts[j];
        traversed.push({ regionId: region.id, start, end });
      }
      if (!geometryValid) break;
    }
    if (vertical && route.riserDefinitionId === null) issue('riser', [route.id], 'Vertical routing requires an explicit riser definition');
    if (!geometryValid) continue;
    if (traversed[0]?.regionId !== from.regionId || traversed.at(-1)?.regionId !== to.regionId) issue('endpoint-region', [route.id], 'Route interior does not connect the named endpoint regions');
    const used = new Set<string>();
    for (let i = 1; i < traversed.length; i++) {
      const a = traversed[i - 1], b = traversed[i]; if (a.regionId === b.regionId) continue;
      const candidates = input.boundaries.filter(boundary => ((boundary.aRegionId === a.regionId && boundary.bRegionId === b.regionId)
        || (boundary.aRegionId === b.regionId && boundary.bRegionId === a.regionId)) && onBoundary(a.end, boundary));
      if (candidates.length !== 1 || !same(a.end, b.start)) { issue('boundary', [route.id], 'Region crossing lacks one exact declared structural boundary'); continue; }
      const boundary = candidates[0];
      const fittings = route.feedthroughIds.map(fid => feedthroughs.get(fid)).filter(f => f && f.boundaryId === boundary.id && same(f.position, a.end));
      if (fittings.length !== 1) { issue('feedthrough', [route.id, boundary.id], 'Crossing requires one explicitly referenced feedthrough at the exact point'); continue; }
      const fitting = fittings[0]!;
      if (used.has(fitting.id)) issue('feedthrough-reuse', [route.id, fitting.id], 'One route cannot loop through a feedthrough repeatedly');
      used.add(fitting.id);
      if (fitting.channel !== route.channel || fitting.medium !== route.medium || fitting.connectorFamily !== route.connectorFamily
        || fitting.capacityPerSecond < route.capacityPerSecond || fitting.clearanceUnits < route.clearanceUnits)
        issue('feedthrough-rating', [route.id, fitting.id], 'Feedthrough medium, connector, capacity or clearance is incompatible');
      if (boundary.pressureSealRequired && !fitting.sealed) issue('unsealed-penetration', [route.id, fitting.id], 'Pressure boundary requires a rated sealed penetration; leak coupling is not implemented');
      const owner = feedthroughOwners.get(fitting.id);
      if (owner && owner !== route.id) issue('feedthrough-occupied', [route.id, owner, fitting.id], 'Independent routes require independent feedthrough connector IDs');
      feedthroughOwners.set(fitting.id, route.id);
    }
    if (new Set(route.feedthroughIds).size !== route.feedthroughIds.length || route.feedthroughIds.some(fid => !used.has(fid))) issue('unused-feedthrough', [route.id], 'Unknown, duplicate or unused feedthrough references reject');
  }
  if (!result.diagnostics.length) {
    result.nodes = sorted(input.nodes).map(n => ({ ...n, position: [...n.position] as ServicePoint3 }));
    result.routes = sorted(input.routes).map(r => ({ ...r, path: r.path.map(p => [...p] as ServicePoint3), feedthroughIds: [...r.feedthroughIds].sort(compareText) }));
  }
  return finish();
}

export interface ServiceSupply { portId: string; availableQuantity: number }
export interface ServiceDemand { portId: string; requestedQuantity: number; priority: number }
export interface ServiceAvailability { disabledNodeIds: readonly string[]; disabledRouteIds: readonly string[] }
interface ResidualEdge { to: number; reverse: number; capacity: number; initial: number }

/** Bounded priority max flow with node and route capacities. Supplies are actual
 * authority-owned amounts for this tick; unconsumed amounts are returned untouched.
 * Power uses J, fuel/coolant kg, ventilation mol, data byte budget. Rates are per second.
 * Directed cycles are allowed; geometric crossings and colocated ports create no edges.
 */
export function allocateConstructionServices(network: CompiledServiceNetwork, supplies: readonly ServiceSupply[], demands: readonly ServiceDemand[],
  seconds: number, availability: ServiceAvailability = { disabledNodeIds: [], disabledRouteIds: [] }) {
  assert(network.valid, 'Cannot allocate invalid service network');
  assert(Number.isFinite(seconds) && seconds > 0 && seconds <= 1, 'Service timestep must be (0,1] seconds');
  assert(supplies.length <= SERVICE_LIMITS.requests && demands.length <= SERVICE_LIMITS.requests, 'Supply/demand budget exceeded');
  const nodes = new Map(network.nodes.map(n => [n.id, n])), routeIds = new Set(network.routes.map(r => r.id));
  assert(availability.disabledNodeIds.length <= network.nodes.length && availability.disabledRouteIds.length <= network.routes.length
    && new Set(availability.disabledNodeIds).size === availability.disabledNodeIds.length && new Set(availability.disabledRouteIds).size === availability.disabledRouteIds.length
    && availability.disabledNodeIds.every(n => nodes.has(n)) && availability.disabledRouteIds.every(r => routeIds.has(r)), 'Unknown/duplicate availability identity');
  const disabledNodes = new Set(availability.disabledNodeIds), disabledRoutes = new Set(availability.disabledRouteIds);
  const supplyIds = new Set<string>(), demandIds = new Set<string>();
  for (const supply of supplies) {
    const node = nodes.get(supply.portId);
    assert(node && node.kind === 'port' && node.direction !== 'in' && !supplyIds.has(node.id)
      && Number.isFinite(supply.availableQuantity) && supply.availableQuantity >= 0 && supply.availableQuantity <= SERVICE_LIMITS.rate, 'Invalid actual supply'); supplyIds.add(node.id);
  }
  for (const demand of demands) {
    const node = nodes.get(demand.portId);
    assert(node && node.kind === 'port' && node.direction !== 'out' && !demandIds.has(node.id) && !supplyIds.has(node.id)
      && Number.isFinite(demand.requestedQuantity) && demand.requestedQuantity >= 0 && demand.requestedQuantity <= SERVICE_LIMITS.rate
      && Number.isInteger(demand.priority) && demand.priority >= 0 && demand.priority <= 255, 'Invalid consumer demand'); demandIds.add(node.id);
  }
  const orderedNodes = sorted(network.nodes), index = new Map(orderedNodes.map((n, i) => [n.id, i * 2]));
  const source = orderedNodes.length * 2, sink = source + 1, graph: ResidualEdge[][] = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from: number, to: number, capacity: number) => {
    const edge = { to, reverse: graph[to].length, capacity, initial: capacity };
    graph[from].push(edge); graph[to].push({ to: from, reverse: graph[from].length - 1, capacity: 0, initial: 0 }); return edge;
  };
  const nodeEdges = new Map(orderedNodes.map(n => [n.id, addEdge(index.get(n.id)!, index.get(n.id)! + 1, disabledNodes.has(n.id) ? 0 : n.capacityPerSecond * seconds)]));
  const routeEdges = new Map(sorted(network.routes).map(r => [r.id, addEdge(index.get(r.fromPortId)! + 1, index.get(r.toPortId)!, disabledRoutes.has(r.id) ? 0 : r.capacityPerSecond * seconds)]));
  const supplyEdges = new Map([...supplies].sort((a, b) => compareText(a.portId, b.portId)).map(s => [s.portId, addEdge(source, index.get(s.portId)!, s.availableQuantity)]));
  const demandEdges = new Map<string, ResidualEdge>();
  let augmentations = 0, exhausted = false;
  const augment = () => {
    const parents = new Int32Array(graph.length).fill(-1), parentEdges = new Int32Array(graph.length).fill(-1), queue = [source]; parents[source] = source;
    for (let head = 0; head < queue.length && parents[sink] === -1; head++) {
      const current = queue[head];
      for (let i = 0; i < graph[current].length; i++) {
        const edge = graph[current][i];
        if (edge.capacity > 0 && parents[edge.to] === -1) { parents[edge.to] = current; parentEdges[edge.to] = i; queue.push(edge.to); if (edge.to === sink) break; }
      }
    }
    if (parents[sink] === -1) return false;
    if (augmentations >= SERVICE_LIMITS.augmentations) { exhausted = true; return false; }
    let quantity = Infinity;
    for (let node = sink; node !== source; node = parents[node]) quantity = Math.min(quantity, graph[parents[node]][parentEdges[node]].capacity);
    for (let node = sink; node !== source; node = parents[node]) {
      const edge = graph[parents[node]][parentEdges[node]]; edge.capacity = Math.max(0, edge.capacity - quantity); graph[node][edge.reverse].capacity += quantity;
    }
    augmentations++; return true;
  };
  // Add terminals in priority order. Previously delivered terminal flows cannot be
  // reversed through the sink, so lower priority never steals accepted allocations.
  for (const demand of [...demands].sort((a, b) => b.priority - a.priority || compareText(a.portId, b.portId))) {
    demandEdges.set(demand.portId, addEdge(index.get(demand.portId)! + 1, sink, demand.requestedQuantity));
    if (!exhausted) while (augment()) { /* bounded by explicit augmentation cap */ }
  }
  const used = (edge: ResidualEdge) => Math.max(0, edge.initial - edge.capacity);
  return { exhausted, augmentations,
    supplies: [...supplies].sort((a, b) => compareText(a.portId, b.portId)).map(s => ({ portId: s.portId, consumedQuantity: used(supplyEdges.get(s.portId)!), remainingQuantity: s.availableQuantity - used(supplyEdges.get(s.portId)!) })),
    consumers: [...demands].sort((a, b) => compareText(a.portId, b.portId)).map(d => ({ portId: d.portId, deliveredQuantity: used(demandEdges.get(d.portId)!), unmetQuantity: d.requestedQuantity - used(demandEdges.get(d.portId)!) })),
    routes: sorted(network.routes).map(r => ({ routeId: r.id, quantity: used(routeEdges.get(r.id)!) })),
    nodes: orderedNodes.map(n => ({ nodeId: n.id, quantity: used(nodeEdges.get(n.id)!) })) };
}
