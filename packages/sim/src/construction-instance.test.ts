import { expect, test, vi } from 'vitest';
import { emptyLayout, stampTile, type LayoutDocument } from '../../content/src/ship-layout';
import { compileConstruction, constructionHash, readConstructionDraft } from './construction-transactions';
import { bindConstructionLayout } from './construction-layout';
import { planConstructionInstance, type ConstructionSpawnRequest } from './construction-instance';
import { compileDeckCollision, resolveDeckCollision, canOccupyDeck } from './construction-collision';

function layout(): LayoutDocument {
  const doc = emptyLayout('source-layout', 'lower');
  doc.decks.push({ ...doc.decks[0], id: 'upper', name: 'Upper', order: 1, elevation: 128 });
  doc.tiles = doc.decks.flatMap(deck => [stampTile(`floor-${deck.id}-a`, deck.id, 'rectangle', [0, 0]), stampTile(`floor-${deck.id}-b`, deck.id, 'rectangle', [64, 0])]);
  return doc;
}
const snapshot = (doc = layout()) => compileConstruction(JSON.stringify(bindConstructionLayout(doc).document));
const request = (sha: string, sourceDeckId = 'lower'): ConstructionSpawnRequest => ({ blueprintRevisionId: 'blueprint-revision-7', expectedBlueprintSha256: sha, sourceDeckId,
  bodyRadiusM: 0.25, bodyHeightM: 1.8, perimeterHalfWidthM: 0.05, partitionHalfWidthM: 0.05, objectCollisionBindings: [] });
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
function allocator(offset = 0) { let counter = offset; return vi.fn(() => uuid(++counter)); }

test('two spawns allocate disjoint IDs while sharing only immutable native asset/interface identities', () => {
  const compiled = snapshot(), allocate = allocator();
  const a = planConstructionInstance(compiled, request(compiled.sha256), allocate);
  const b = planConstructionInstance(compiled, request(compiled.sha256), allocate);
  expect(a.allocatedIds).toHaveLength(7);
  expect(a.allocatedIds.some(id => b.allocatedIds.includes(id))).toBe(false);
  expect(a.document.floorKit).toEqual(b.document.floorKit);
  expect(a.document.floors.map(f => f.partId)).toEqual(b.document.floors.map(f => f.partId));
  expect(a.document.layout.id).toBe(a.instanceId);
  expect(a.blueprintSha256).toBe(compiled.sha256);
  expect(a.blueprintRevisionId).toBe('blueprint-revision-7');
  expect(a.mappings.traversalLinks).toEqual([]); expect(a.mappings.cargoGrids).toEqual([]);
  expect(() => readConstructionDraft(JSON.stringify(a.document))).not.toThrow();
  expect(compileConstruction(JSON.stringify(a.document)).readiness).toEqual(a.readiness);
});

test('floor native placements and semantic support share fresh IDs with remapped deck references', () => {
  const compiled = snapshot(), plan = planConstructionInstance(compiled, request(compiled.sha256), allocator());
  for (const floor of plan.document.floors) {
    const tile = plan.document.layout.tiles.find(t => t.id === floor.id)!;
    expect(tile.deckId).toBe(floor.deckId);
    expect(plan.mappings.floors.some(m => m.instanceId === floor.id && m.sourceId.startsWith('floor-'))).toBe(true);
    expect(plan.document.layout.decks.some(d => d.id === floor.deckId)).toBe(true);
  }
  expect(plan.document.layout.playableDeckId).toBe(plan.spawn.deckId);
});

test('safe spawn selects requested deck, verifies circle clearance and includes native deck-top datum', () => {
  const compiled = snapshot(), plan = planConstructionInstance(compiled, request(compiled.sha256, 'upper'), allocator());
  expect(plan.spawn.sourceDeckId).toBe('upper'); expect(plan.spawn.walkingElevationM).toBe(4.1875);
  const frame = resolveDeckCollision(compileDeckCollision(plan.document.layout, plan.spawn.deckId, { shipId: plan.instanceId, perimeterHalfWidthM: 0.05, partitionHalfWidthM: 0.05 }), []);
  expect(canOccupyDeck(frame, { shipId: plan.instanceId, deckId: plan.spawn.deckId, position: plan.spawn.positionM }, 0.25)).toBe(true);
});

test('rejects wrong hash, modified canonical data and forged readiness before allocating IDs', () => {
  const compiled = snapshot(), allocate = allocator();
  expect(() => planConstructionInstance(compiled, request('a'.repeat(64)), allocate)).toThrow('SHA');
  expect(() => planConstructionInstance({ ...compiled, canonical: compiled.canonical + ' ' }, request(compiled.sha256), allocate)).toThrow('SHA');
  const noncanonical = JSON.stringify(JSON.parse(compiled.canonical), null, 2), digest = constructionHash(noncanonical);
  expect(() => planConstructionInstance({ ...compiled, canonical: noncanonical, sha256: digest }, request(digest), allocate)).toThrow('canonical');
  expect(allocate).not.toHaveBeenCalled();
  const forged = { ...compiled, readiness: { geometry: true, nativeFloors: true, pressure: true, services: true, nativeDamage: true, flight: true } };
  expect(planConstructionInstance(forged, request(compiled.sha256), allocator()).readiness).toEqual(compiled.readiness);
});

test('allocator rejects malformed, duplicate, reserved and blueprint source entity IDs', () => {
  const compiled = snapshot();
  expect(() => planConstructionInstance(compiled, request(compiled.sha256), () => 'source-layout')).toThrow('Allocator');
  expect(() => planConstructionInstance(compiled, request(compiled.sha256), () => uuid(1))).toThrow('duplicate');
  expect(() => planConstructionInstance(compiled, { ...request(compiled.sha256), reservedIds: [uuid(1)] }, allocator())).toThrow('occupied');
  expect(() => planConstructionInstance(compiled, { ...request(compiled.sha256), reservedIds: [uuid(0xabcdef).toUpperCase()] }, () => uuid(0xabcdef))).toThrow('occupied');
  const doc = layout(); doc.tiles[0].id = uuid(1); const withUuid = snapshot(doc);
  expect(() => planConstructionInstance(withUuid, request(withUuid.sha256), allocator())).toThrow('blueprint entity');
});

test('safe-spawn failure rejects instead of clamping body radius or choosing another deck', () => {
  const doc = emptyLayout('triangle-layout', 'lower'); doc.tiles = [stampTile('triangle', 'lower', 'triangle', [0, 0])];
  const compiled = snapshot(doc), allocate = allocator();
  expect(() => planConstructionInstance(compiled, { ...request(compiled.sha256), bodyRadiusM: 1 }, allocate)).toThrow('No safe spawn');
  expect(() => planConstructionInstance(compiled, request(compiled.sha256, 'unknown-deck'), allocate)).toThrow('Unknown');
  expect(allocate).not.toHaveBeenCalled();
  expect(planConstructionInstance(compiled, request(compiled.sha256), allocator()).spawn.positionM).toHaveLength(2);
});

function detailed() {
  const doc = layout();
  doc.partitions = [{ id: 'partition', deckId: 'lower', a: [64, 0], b: [64, 64], seal: 'design-sealed' }];
  doc.openings = [{ id: 'door', deckId: 'lower', partitionId: 'partition', a: [64, 16], b: [64, 48], kind: 'door', clearance: 16, sill: 0 }];
  doc.rooms = [{ id: 'room', deckId: 'lower', name: 'Cargo name is not a cargo grid', type: 'Cargo', seed: [32, 32], boundaryIds: ['partition'], access: 'crew', floorTheme: 'none', wallTheme: 'none' }];
  doc.fittings = [{ id: 'fixture', deckId: 'upper', definitionId: 'native-box', revision: 'r1', position: [32, 32], quarterTurns: 0, reflected: false, footprint: [8, 8], clearance: 0, kind: 'container', container: { columns: 2, rows: 2, contents: [] } }];
  doc.assembly = { schema: 'sidereal.layout-assembly.v1', source: null, revisions: { 'native-trim': 'sha-fixture-only' }, parts: [{ id: 'visual', assetId: 'native-trim', position: [1, 1, 0], rotation: 0, flipped: false, removedCells: [] }] };
  doc.nodes = [{ id: 'source', deckId: 'upper', point: [16, 16], channel: 'power', kind: 'endpoint', direction: 'out', medium: 'electricity' },
    { id: 'sink', deckId: 'upper', point: [48, 16], channel: 'power', kind: 'endpoint', direction: 'in', medium: 'electricity' }];
  doc.routes = [{ id: 'route', deckId: 'upper', channel: 'power', from: 'source', to: 'sink', path: [[16, 16], [48, 16]], capacity: null }];
  return doc;
}
const bindings = () => [{ sourceObjectId: 'fixture', definitionId: 'approved-box-collider', deckIds: ['upper'], obstacles: [] },
  { sourceObjectId: 'visual', definitionId: 'approved-nonblocking-trim', deckIds: ['lower'], obstacles: [] }];

test('objects, openings, room boundaries and route endpoints remap without copying live state or inferring services', () => {
  const compiled = snapshot(detailed()), plan = planConstructionInstance(compiled, { ...request(compiled.sha256), objectCollisionBindings: bindings() }, allocator());
  const d = plan.document.layout;
  expect(d.openings[0].partitionId).toBe(d.partitions[0].id);
  expect(d.rooms[0].boundaryIds).toEqual([d.partitions[0].id]);
  expect(d.routes[0].from).toBe(d.nodes.find(n => n.direction === 'out')!.id);
  expect(d.routes[0].to).toBe(d.nodes.find(n => n.direction === 'in')!.id);
  expect(d.fittings[0].definitionId).toBe('native-box'); expect(d.fittings[0].container!.contents).toEqual([]);
  expect(d.assembly!.parts[0].assetId).toBe('native-trim'); expect(d.assembly!.revisions).toEqual({ 'native-trim': 'sha-fixture-only' });
  expect(plan.mappings.objects).toHaveLength(2); expect(plan.mappings.cargoGrids).toEqual([]);
  expect(plan.readiness.services).toBe(false); expect(plan.readiness.pressure).toBe(false);
});

test('unresolved object collision coverage and physically blocked floors reject before allocation', () => {
  const compiled = snapshot(detailed()), allocate = allocator();
  expect(() => planConstructionInstance(compiled, request(compiled.sha256), allocate)).toThrow('collision coverage');
  const badBindings = bindings(); badBindings[0].deckIds = ['lower'];
  expect(() => planConstructionInstance(compiled, { ...request(compiled.sha256), objectCollisionBindings: badBindings }, allocate)).toThrow('actual deck');
  expect(() => planConstructionInstance(compiled, { ...request(compiled.sha256), objectCollisionBindings: [bindings()[0], {
    ...bindings()[1], obstacles: [{ vertices: [[0, 0], [4, 0], [4, 2], [0, 2]] }],
  }] }, allocate)).toThrow('No safe spawn');
  expect(allocate).not.toHaveBeenCalled();
});

test('allocation order and spawn choice are deterministic, source snapshot is unchanged and world host needs no structuredClone', () => {
  const compiled = snapshot(), before = JSON.stringify(compiled);
  const a = planConstructionInstance(compiled, request(compiled.sha256), allocator());
  vi.stubGlobal('structuredClone', undefined);
  try { expect(planConstructionInstance(compiled, request(compiled.sha256), allocator())).toEqual(a); }
  finally { vi.unstubAllGlobals(); }
  expect(JSON.stringify(compiled)).toBe(before);
});

test('cross-domain source identities cannot alias floors, openings, objects or routing nodes', () => {
  const base = snapshot(detailed());
  for (const mutation of [
    (d: ReturnType<typeof bindConstructionLayout>['document']) => { d.layout.openings[0].id = d.layout.partitions[0].id; },
    (d: ReturnType<typeof bindConstructionLayout>['document']) => { d.layout.assembly!.parts[0].id = d.layout.tiles[0].id; },
    (d: ReturnType<typeof bindConstructionLayout>['document']) => { d.layout.nodes[0].id = d.layout.fittings[0].id; },
    (d: ReturnType<typeof bindConstructionLayout>['document']) => { d.layout.decks[0].holes = [{ id: d.layout.routes[0].id, seed: [16, 16] }]; },
  ]) {
    const content = JSON.parse(base.canonical); mutation(content);
    const canonical = JSON.stringify(content), sha256 = constructionHash(canonical), allocate = allocator();
    expect(() => planConstructionInstance({ ...base, canonical, sha256 }, { ...request(sha256), objectCollisionBindings: bindings() }, allocate)).toThrow(/duplicate|Duplicate|Invalid hole declaration/);
    expect(allocate).not.toHaveBeenCalled();
  }
});

test('standing clearance subtracts native floor top and never silently chooses a taller deck', () => {
  const doc = layout(); doc.decks[1].ceiling = 63;
  const compiled = snapshot(doc), allocate = allocator();
  expect(() => planConstructionInstance(compiled, request(compiled.sha256, 'upper'), allocate)).toThrow('standing clearance');
  expect(allocate).not.toHaveBeenCalled();
  expect(planConstructionInstance(compiled, request(compiled.sha256, 'lower'), allocator()).spawn.bodyHeightM).toBe(1.8);
  doc.decks[1].ceiling = 64; const taller = snapshot(doc);
  expect(planConstructionInstance(taller, { ...request(taller.sha256, 'upper'), bodyHeightM: 1.8125 }, allocator()).spawn.walkingElevationM).toBe(4.1875);
  for (const bodyHeightM of [0, -1, NaN, Infinity]) expect(() => planConstructionInstance(compiled, { ...request(compiled.sha256), bodyHeightM }, allocator())).toThrow('standing height');
});

test('UUID remapping cannot produce an instance above the same 262144-byte parser budget', () => {
  const doc = emptyLayout('s', 'd'); doc.tiles = [stampTile('f', 'd', 'rectangle', [0, 0])];
  doc.rooms = Array.from({ length: 1100 }, (_, i) => ({ id: `r${i}`, deckId: 'd', name: 'name'.repeat(10), type: 'room', seed: [32, 32],
    boundaryIds: [], access: 'crew', floorTheme: 'none', wallTheme: 'none' }));
  const compiled = snapshot(doc);
  expect(new TextEncoder().encode(compiled.canonical).length).toBeLessThan(262144);
  expect(() => planConstructionInstance(compiled, request(compiled.sha256, 'd'), allocator())).toThrow('construction document byte budget');
});
