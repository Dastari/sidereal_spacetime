import { expect, test } from 'vitest';
import { validateCargoStack, proposeCargoChanges, cargoContactUnionArea, type CargoInterface, type CargoGrid, type CargoPlacement,
  type CargoPoint, type CargoRect } from './construction-cargo';

function definition(id: string, width = 32, depth = width): CargoInterface {
  return { id, definitionId: `test-approved-${id}`, revision: 'fixture-only', kind: 'cargo', size: [width, depth, 32], quarterTurns: [0, 1, 2, 3],
    bearingFamily: 'cargo-test', tareMassKg: 10, maxGrossMassKg: 1000, maxTopLoadKg: 1000, allowMultipleSupports: true,
    bottom: [{ id: 'bottom', rect: [0, 0, width, depth], maxLoadKg: 2000 }],
    top: [{ id: 'top', rect: [0, 0, width, depth], maxLoadKg: 2000 }], clearances: [] };
}
const catalog = () => [definition('small'), definition('large', 64)];
function grid(): CargoGrid { return { id: 'cargo-grid', deckId: 'cargo-deck', footprint: [[0, 0], [128, 0], [128, 128], [0, 128]],
  baseZ: 0, roofZ: 128, horizontalStepUnits: 32, snapOrigin: [0, 0], acceptedFamilies: ['cargo-test'], maxLoadKg: 10000,
  bearingPatches: [{ id: 'deck', rect: [0, 0, 128, 128], maxLoadKg: 10000 }], reservedVolumes: [] }; }
const place = (containerId: string, interfaceId: string, origin: CargoPoint): CargoPlacement => ({ containerId, interfaceId, origin,
  quarterTurns: 0, payloadMassKg: 0, secured: true });
function stack() { return [place('base', 'large', [0, 0, 0]), ...[[0, 0], [32, 0], [0, 32], [32, 32]].map(([x, y], i) => place(`middle-${i}`, 'small', [x, y, 32])), place('top', 'large', [0, 0, 64])]; }
const codes = (result: ReturnType<typeof validateCargoStack>) => result.diagnostics.map(d => d.code);

test('2x2 supports four 1x1 cargo containers whose union supports another 2x2', () => {
  const result = validateCargoStack(grid(), catalog(), stack());
  expect(result.diagnostics).toEqual([]); expect(result.valid).toBe(true);
  expect(result.contacts.filter(c => c.containerId === 'top')).toHaveLength(4);
  expect(result.contacts.filter(c => c.containerId === 'top').map(c => c.areaUnits2)).toEqual([1024, 1024, 1024, 1024]);
  expect(result.loads.find(c => c.containerId === 'base')).toEqual({ containerId: 'base', grossMassKg: 10, supportedMassKg: 50, transmittedMassKg: 60 });
  expect(result.loads.find(c => c.containerId === 'middle-0')?.transmittedMassKg).toBe(12.5);
  expect(result.gridLoadKg).toBe(60);
});

test('exact union coverage detects a missing corner, uneven tier and inset bearing gaps', () => {
  expect(codes(validateCargoStack(grid(), catalog(), stack().filter(p => p.containerId !== 'middle-3')))).toContain('unsupported');
  const uneven = stack(); uneven.find(p => p.containerId === 'middle-3')!.origin[2] += 1;
  expect(codes(validateCargoStack(grid(), catalog(), uneven))).toContain('overlap');
  const shorter = catalog(); shorter[0].size[2] = 31;
  expect(codes(validateCargoStack(grid(), shorter, stack()))).toContain('unsupported');
  const inset = catalog(); inset[0].top[0].rect = [1, 1, 31, 31];
  expect(codes(validateCargoStack(grid(), inset, stack()))).toContain('unsupported');
});

test('patch union never double counts overlap, supports negative coordinates and preserves exact area', () => {
  expect(cargoContactUnionArea([[0, 0, 32, 32], [16, 0, 48, 32]])).toBe(48 * 32);
  expect(cargoContactUnionArea([[-32, -32, 0, 0]])).toBe(1024);
  expect(cargoContactUnionArea([[-32, -32, 0, 0], [0, -32, 32, 0]])).toBe(2048);
  expect(cargoContactUnionArea([])).toBe(0);
});

test('bridge permission is explicit even when combined support perfectly covers the footprint', () => {
  const definitions = catalog(); definitions[1].allowMultipleSupports = false;
  const result = validateCargoStack(grid(), definitions, stack());
  expect(result.diagnostics).toContainEqual({ code: 'bridging-forbidden', ids: ['top'], message: 'Interface does not permit multiple supporting containers' });
});

test('payload propagates through every layer and overloads lower container and grid ratings', () => {
  const placements = stack(); placements.find(p => p.containerId === 'top')!.payloadMassKg = 90;
  const definitions = catalog(); definitions[1].maxTopLoadKg = 100;
  const result = validateCargoStack(grid(), definitions, placements);
  expect(result.gridLoadKg).toBe(150);
  expect(result.loads.find(p => p.containerId === 'middle-0')?.transmittedMassKg).toBe(35);
  expect(result.diagnostics.filter(d => d.code === 'top-load').map(d => d.ids)).toEqual([['base']]);
  expect(codes(validateCargoStack({ ...grid(), maxLoadKg: 100 }, catalog(), placements))).toContain('grid-load');
  const patchGrid = grid(); patchGrid.bearingPatches[0].maxLoadKg = 100;
  expect(codes(validateCargoStack(patchGrid, catalog(), placements))).toContain('grid-patch-load');
});

test('top/bottom patch capacities and individual gross mass are independently checked', () => {
  const definitions = catalog(); definitions[1].top[0].maxLoadKg = 45;
  expect(codes(validateCargoStack(grid(), definitions, stack()))).toContain('top-patch-load');
  definitions[1].top[0].maxLoadKg = 1000; definitions[1].bottom[0].maxLoadKg = 55;
  expect(codes(validateCargoStack(grid(), definitions, stack()))).toContain('bottom-patch-load');
  const overloaded = stack(); overloaded[0].payloadMassKg = 1001;
  expect(codes(validateCargoStack(grid(), catalog(), overloaded))).toContain('gross-load');
});

test('native nominal boxes enforce volume collisions and roof/lid/handling clearance', () => {
  const colliding = stack(); colliding[2].origin[0] -= 1;
  expect(codes(validateCargoStack(grid(), catalog(), colliding))).toContain('overlap');
  expect(codes(validateCargoStack({ ...grid(), roofZ: 95 }, catalog(), stack()))).toContain('envelope');
  const definitions = catalog(); definitions[1].clearances = [[0, 0, 32, 64, 64, 48]];
  expect(codes(validateCargoStack(grid(), definitions, stack()))).toContain('blocked-operation');
  expect(codes(validateCargoStack({ ...grid(), roofZ: 40 }, definitions, [place('one', 'large', [0, 0, 0])]))).toContain('clearance-envelope');
  const reserved = grid(); reserved.reservedVolumes = [[0, 0, 0, 16, 16, 100]];
  expect(codes(validateCargoStack(reserved, catalog(), stack()))).toContain('reserved-volume');
});

test('removing or moving lower support rejects atomically and retains all container identities', () => {
  const original = stack(), snapshot = structuredClone(original);
  const removal = proposeCargoChanges(grid(), catalog(), original, [{ kind: 'remove', containerId: 'middle-3' }]);
  expect(removal.accepted).toBe(false); expect(removal.placements).toEqual(snapshot); expect(removal.removedContainerIds).toEqual([]);
  const movement = proposeCargoChanges(grid(), catalog(), original, [{ kind: 'move', containerId: 'base', origin: [64, 0, 0], quarterTurns: 0 }]);
  expect(movement.accepted).toBe(false); expect(movement.placements).toEqual(snapshot);
  expect(original).toEqual(snapshot);
});

test('top container move/removal preserves UUID, payload and interface; removal returns custody IDs, not deleted contents', () => {
  const original = stack(); original.at(-1)!.payloadMassKg = 75;
  const moved = proposeCargoChanges(grid(), catalog(), original, [{ kind: 'move', containerId: 'top', origin: [64, 64, 0], quarterTurns: 1 }]);
  expect(moved.accepted).toBe(true);
  expect(moved.placements.find(p => p.containerId === 'top')).toEqual({ ...original.at(-1)!, origin: [64, 64, 0], quarterTurns: 1 });
  expect(moved.placements.map(p => p.containerId).sort()).toEqual(original.map(p => p.containerId).sort());
  const removed = proposeCargoChanges(grid(), catalog(), original, [{ kind: 'remove', containerId: 'top' }]);
  expect(removed.accepted).toBe(true); expect(removed.removedContainerIds).toEqual(['top']);
  const all = proposeCargoChanges(grid(), catalog(), original, original.map(p => ({ kind: 'remove', containerId: p.containerId })));
  expect(all.accepted).toBe(true); expect(all.placements).toEqual([]); expect(all.removedContainerIds).toHaveLength(6);
});

test('unknown/duplicate containers, unsupported interfaces, unsecured equipment and repeated changes reject', () => {
  expect(codes(validateCargoStack(grid(), catalog(), [place('unknown', 'missing', [0, 0, 0])]))).toContain('admission');
  expect(codes(validateCargoStack(grid(), catalog(), [stack()[0], stack()[0]]))).toContain('admission');
  const definitions = catalog(); definitions[1].kind = 'equipment';
  expect(codes(validateCargoStack(grid(), definitions, [stack()[0]]))).toContain('cargo-only');
  expect(codes(validateCargoStack(grid(), catalog(), [{ ...stack()[0], secured: false }]))).toContain('unrestrained');
  expect(proposeCargoChanges(grid(), catalog(), stack(), [{ kind: 'remove', containerId: 'absent' }]).accepted).toBe(false);
  expect(proposeCargoChanges(grid(), catalog(), stack(), [{ kind: 'remove', containerId: 'top' }, { kind: 'remove', containerId: 'top' }]).accepted).toBe(false);
});

test('positive-height support DAG rejects floating roots and cannot admit zero-height support cycles', () => {
  const floating = [place('one', 'small', [0, 0, 32]), place('two', 'small', [0, 0, 64])];
  expect(codes(validateCargoStack(grid(), catalog(), floating))).toContain('unsupported');
  const definitions = catalog(); definitions[0].size[2] = 0;
  expect(codes(validateCargoStack(grid(), definitions, floating))).toContain('admission');
  definitions[0].size[2] = -32;
  expect(codes(validateCargoStack(grid(), definitions, floating))).toContain('admission');
});

test('bearing family mismatch and forbidden orientations reject without inferring compatibility from dimensions', () => {
  const definitions = catalog(); definitions[0].bearingFamily = 'different';
  expect(codes(validateCargoStack(grid(), definitions, stack()))).toContain('family');
  expect(codes(validateCargoStack({ ...grid(), acceptedFamilies: ['cargo-test', 'different'] }, definitions, stack()))).toContain('unsupported');
  definitions[0].quarterTurns = [0]; const rotated = place('rotated', 'small', [0, 0, 0]); rotated.quarterTurns = 1;
  expect(codes(validateCargoStack(grid(), definitions, [rotated]))).toContain('admission');
});

test('quarter-turn rotates nominal footprint, asymmetric bearing patches and clearance consistently', () => {
  const def = definition('long', 64, 32), g = grid();
  def.bottom = [{ id: 'left', rect: [0, 0, 32, 32], maxLoadKg: 1000 }];
  g.bearingPatches = [{ id: 'only-support', rect: [0, 0, 32, 32], maxLoadKg: 1000 }];
  const p = place('long-id', 'long', [0, 0, 0]); p.quarterTurns = 1;
  expect(validateCargoStack(g, [def], [p]).valid).toBe(true);
  p.quarterTurns = 2;
  expect(codes(validateCargoStack(g, [def], [p]))).toContain('unsupported');
});

test('input order does not change deterministic contacts/loads; original arrays remain unchanged', () => {
  const input = stack(), definitions = catalog(), g = grid(), snapshot = structuredClone({ input, definitions, g });
  expect(validateCargoStack(g, definitions, input)).toEqual(validateCargoStack(g, [...definitions].reverse(), [...input].reverse()));
  expect({ input, definitions, g }).toEqual(snapshot);
});

test('invalid overlapping patches cannot double-count load or support; out-of-envelope bodies reject', () => {
  const definitions = catalog(); definitions[0].top = [{ id: 'a', rect: [0, 0, 32, 32], maxLoadKg: 1 }, { id: 'b', rect: [0, 0, 16, 16], maxLoadKg: 1 }];
  expect(codes(validateCargoStack(grid(), definitions, []))).toContain('admission');
  expect(codes(validateCargoStack(grid(), catalog(), [place('outside', 'large', [96, 0, 0])]))).toContain('envelope');
  const rectangles = Array.from({ length: 257 }, () => [0, 0, 32, 32] as CargoRect);
  expect(() => cargoContactUnionArea(rectangles)).toThrow('budget');
});

test('nominal submodule and placement snapping require explicitly compatible dimensions', () => {
  expect(codes(validateCargoStack(grid(), catalog(), [place('offset', 'small', [1, 0, 0])]))).toContain('submodule');
  expect(validateCargoStack({ ...grid(), horizontalStepUnits: 16 }, [definition('half', 16)], [place('half-id', 'half', [16, 0, 0])]).valid).toBe(true);
  expect(codes(validateCargoStack({ ...grid(), horizontalStepUnits: 24 }, catalog(), []))).toContain('admission');
});
