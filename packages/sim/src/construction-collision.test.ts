import { expect, test } from 'vitest';
import { emptyLayout, stampTile, type Point } from '../../content/src/ship-layout';
import { compileDeckCollision, resolveDeckCollision, sweepDeckCircle, canOccupyDeck, deckLineOfSight, canReachOnDeck,
  type DeckLocation, type DeckObstacle } from './construction-collision';

const location = (x: number, y: number, deckId = 'lower', shipId = 'ship-test'): DeckLocation => ({ shipId, deckId, position: [x, y] });
const options = { shipId: 'ship-test', perimeterHalfWidthM: 0.05, partitionHalfWidthM: 0.05 };
function document(withDoor = false) {
  const doc = emptyLayout('collision-test', 'lower');
  doc.tiles = [stampTile('a', 'lower', 'rectangle', [0, 0]), stampTile('b', 'lower', 'rectangle', [64, 0])];
  if (withDoor) {
    doc.partitions = [{ id: 'wall', deckId: 'lower', a: [64, 0], b: [64, 64], seal: 'design-sealed' }];
    doc.openings = [{ id: 'door', deckId: 'lower', partitionId: 'wall', a: [64, 16], b: [64, 48], kind: 'door', clearance: 16, sill: 0 }];
  }
  return doc;
}

test('floor support uses polygon union; a shared floor seam is not a collision wall', () => {
  const frame = resolveDeckCollision(compileDeckCollision(document(), 'lower', options), []);
  expect(canOccupyDeck(frame, location(2, 1), 0.25)).toBe(true);
  expect(canOccupyDeck(frame, location(0.1, 1), 0.25)).toBe(false);
  expect(canOccupyDeck(frame, location(2, -1), 0.25)).toBe(false);
  expect(sweepDeckCircle(frame, location(1, 1), [2, 0], 0.25)).toEqual({ position: [3, 1], contacts: [], exhausted: false });
});

test('analytic sweep cannot tunnel through a perimeter on a large displacement', () => {
  const frame = resolveDeckCollision(compileDeckCollision(document(), 'lower', options), []);
  const result = sweepDeckCircle(frame, location(1, 1), [1000, 0], 0.25);
  expect(result.position[0]).toBeCloseTo(3.7, 5);
  expect(result.position[1]).toBe(1);
  expect(result.contacts.length).toBeGreaterThan(0);
  expect(canOccupyDeck(frame, { ...location(0, 0), position: result.position }, 0.25)).toBe(true);
});

test('sliding along a wall preserves tangential motion and stops safely at a corner', () => {
  const frame = resolveDeckCollision(compileDeckCollision(document(), 'lower', options), []);
  const result = sweepDeckCircle(frame, location(1, 1), [2, -2], 0.25);
  expect(result.position[0]).toBeCloseTo(3, 5);
  expect(result.position[1]).toBeCloseTo(0.3, 5);
  const corner = sweepDeckCircle(frame, location(1, 1), [100, -100], 0.25);
  expect(corner.position[0]).toBeCloseTo(3.7, 5);
  expect(corner.position[1]).toBeCloseTo(0.3, 5);
  expect(corner.exhausted).toBe(false);
});

test('closed and unknown doors block walking and LOS; open doors retain jamb collision', () => {
  const base = compileDeckCollision(document(true), 'lower', options);
  const closed = resolveDeckCollision(base, []), open = resolveDeckCollision(base, [{ openingId: 'door', passable: true }]);
  const from = location(1, 1), to = location(3, 1);
  expect(sweepDeckCircle(closed, from, [10, 0], 0.25).position[0]).toBeCloseTo(1.7, 5);
  expect(deckLineOfSight(closed, from, to)).toBe(false);
  expect(sweepDeckCircle(open, from, [2, 0], 0.25).position).toEqual([3, 1]);
  expect(deckLineOfSight(open, from, to)).toBe(true);
  const jamb = sweepDeckCircle(open, location(1, 0.4), [2, 0], 0.25);
  expect(jamb.position[0]).toBeLessThan(2);
  expect(sweepDeckCircle(open, from, [2, 0], 0.51).position[0]).toBeLessThan(2);
});

test('passage defaults open, explicit obstruction and unimplemented nonzero sill fail closed', () => {
  const doc = document(true); doc.openings[0].kind = 'passage';
  const base = compileDeckCollision(doc, 'lower', options);
  expect(deckLineOfSight(resolveDeckCollision(base, []), location(1, 1), location(3, 1))).toBe(true);
  expect(deckLineOfSight(resolveDeckCollision(base, [{ openingId: 'door', passable: false }]), location(1, 1), location(3, 1))).toBe(false);
  doc.openings[0].sill = 8;
  const raised = resolveDeckCollision(compileDeckCollision(doc, 'lower', options), [{ openingId: 'door', passable: true }]);
  expect(sweepDeckCircle(raised, location(1, 1), [2, 0], 0.25).position[0]).toBeLessThan(2);
});

test('triangular floor boundaries support and slide the circle along the actual diagonal', () => {
  const doc = emptyLayout('triangle-test', 'lower');
  doc.tiles = [stampTile('triangle', 'lower', 'triangle', [0, 0])];
  const frame = resolveDeckCollision(compileDeckCollision(doc, 'lower', options), []);
  expect(canOccupyDeck(frame, location(0.4, 1.2), 0.1)).toBe(false);
  const result = sweepDeckCircle(frame, location(1.2, 0.4), [-0.8, 0.8], 0.1);
  expect(result.position[0] - result.position[1]).toBeCloseTo(Math.SQRT2 * 0.15, 5);
  expect(canOccupyDeck(frame, { ...location(0, 0), position: result.position }, 0.1)).toBe(true);
});

test('hole boundaries stop motion and LOS across unsupported enclosed voids', () => {
  const doc = emptyLayout('ring', 'lower');
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) if (x !== 1 || y !== 1)
    doc.tiles.push(stampTile(`tile-${x}-${y}`, 'lower', 'rectangle', [x * 64, y * 64]));
  doc.decks[0].holes = [{ id: 'shaft', seed: [96, 96] }];
  const frame = resolveDeckCollision(compileDeckCollision(doc, 'lower', options), []);
  expect(canOccupyDeck(frame, location(3, 3), 0.25)).toBe(false);
  expect(deckLineOfSight(frame, location(1, 3), location(5, 3))).toBe(false);
  expect(sweepDeckCircle(frame, location(1, 3), [4, 0], 0.25).position[0]).toBeCloseTo(1.7, 5);
});

test('same XY on another deck or ship cannot move through or interact with this frame', () => {
  const doc = document();
  doc.decks.push({ ...doc.decks[0], id: 'upper', name: 'Upper', elevation: 128, order: 1 });
  doc.tiles.push(stampTile('upper-a', 'upper', 'rectangle', [0, 0]));
  const upper = resolveDeckCollision(compileDeckCollision(doc, 'upper', options), []);
  expect(upper.elevationM).toBe(4);
  expect(canOccupyDeck(upper, location(1, 1), 0.25)).toBe(false);
  expect(canOccupyDeck(upper, location(1, 1, 'upper'), 0.25)).toBe(true);
  expect(canReachOnDeck(upper, location(1, 1, 'upper'), location(1, 1), 10)).toBe(false);
  expect(canReachOnDeck(upper, location(1, 1, 'upper'), location(1, 1, 'upper', 'another-ship'), 10)).toBe(false);
  expect(() => sweepDeckCircle(upper, location(1, 1), [1, 0], 0.25)).toThrow('wrong ship/deck');
});

test('reach requires distance and unoccluded same-frame endpoints', () => {
  const frame = resolveDeckCollision(compileDeckCollision(document(true), 'lower', options), [{ openingId: 'door', passable: true }]);
  expect(canReachOnDeck(frame, location(1, 1), location(3, 1), 2)).toBe(true);
  expect(canReachOnDeck(frame, location(1, 1), location(3, 1), 1.9)).toBe(false);
  expect(canReachOnDeck(frame, location(1, 0.3), location(3, 0.3), 3)).toBe(false);
  expect(canReachOnDeck(frame, location(1, 1), location(10, 1), 30)).toBe(false);
});

test('explicit convex equipment colliders block centre occupancy, swept motion and LOS', () => {
  const obstacle: DeckObstacle = { id: 'equipment', definitionId: 'approved-test-collider', vertices: [[1.5, 0.5], [2.5, 0.5], [2.5, 1.5], [1.5, 1.5]] };
  const frame = resolveDeckCollision(compileDeckCollision(document(), 'lower', { ...options, obstacles: [obstacle] }), []);
  expect(canOccupyDeck(frame, location(2, 1), 0.1)).toBe(false);
  expect(sweepDeckCircle(frame, location(0.5, 1), [3, 0], 0.25).position[0]).toBeCloseTo(1.25, 5);
  expect(deckLineOfSight(frame, location(0.5, 1), location(3.5, 1))).toBe(false);
});

test('fails closed for invalid layouts, missing decks, stale states and unsupported starts', () => {
  const doc = document(true), base = compileDeckCollision(doc, 'lower', options), frame = resolveDeckCollision(base, []);
  expect(() => compileDeckCollision(doc, 'missing', options)).toThrow('unknown deck');
  expect(() => compileDeckCollision({ ...doc, tiles: [...doc.tiles, doc.tiles[0]] }, 'lower', options)).toThrow('invalid layout');
  expect(() => compileDeckCollision(doc, 'lower', { ...options, perimeterHalfWidthM: NaN })).toThrow('wall half-width');
  expect(() => resolveDeckCollision(base, [{ openingId: 'wrong', passable: true }])).toThrow('opening state');
  expect(() => sweepDeckCircle(frame, location(2, 1), [1, 0], 0.25)).toThrow('penetrating');
  expect(() => sweepDeckCircle(frame, location(1, 1), [Infinity, 0], 0.25)).toThrow('displacement');
  expect(() => sweepDeckCircle(frame, location(1, 1), [0, 0], 0)).toThrow('radius');
});

test('reordered geometry produces identical collision results and caller inputs remain unchanged', () => {
  const doc = document(true), snapshot = structuredClone(doc), start = location(1, 1), delta: Point = [10, 3];
  const a = resolveDeckCollision(compileDeckCollision(doc, 'lower', options), []);
  const b = resolveDeckCollision(compileDeckCollision({ ...doc, tiles: [...doc.tiles].reverse() }, 'lower', options), []);
  expect(sweepDeckCircle(a, start, delta, 0.25)).toEqual(sweepDeckCircle(b, start, delta, 0.25));
  expect(doc).toEqual(snapshot); expect(start).toEqual(location(1, 1)); expect(delta).toEqual([10, 3]);
});
