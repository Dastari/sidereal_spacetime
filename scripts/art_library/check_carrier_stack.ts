/** Exact exported interfaces exercise the existing authoritative pure solver.
 * Ratings are explicit sandbox proposals; this does not approve load strength.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCargoStack, proposeCargoChanges, type CargoGrid, type CargoInterface, type CargoPlacement, type CargoRect } from '../../packages/sim/src/construction-cargo';

const directory = resolve(process.argv[2] ?? 'assets/art-library/designs/cargo.carrier.grid-support/revisions/r000/a003');
interface NativeInterface { assetId: string; nominalSizeUnits: [number, number, number]; bearingFamily: string; bearingPatches: { id: string; rectM: CargoRect }[] }
const proposed = {
  status: 'proposed-sandbox-gameplay-only', ownerApproved: false,
  basis: 'Explicit game-balance proposal for deterministic mechanics testing. Not calculated from appearance, material properties, or engineering certification.',
  definitions: [
    { id: 'carrier-1m', tareMassKg: 20, maxGrossMassKg: 250, maxTopLoadKg: 1000, patchLoadKg: 1000 },
    { id: 'carrier-2m', tareMassKg: 60, maxGrossMassKg: 1000, maxTopLoadKg: 2000, patchLoadKg: 1000 },
  ], gridMaxLoadKg: 5000,
};
const catalog: CargoInterface[] = proposed.definitions.map(rating => {
  const native = JSON.parse(readFileSync(resolve(directory, `${rating.id}-interface.json`), 'utf8')) as NativeInterface;
  const patches = native.bearingPatches.map(patch => ({ id: patch.id, rect: patch.rectM.map(n => n * 32) as CargoRect, maxLoadKg: rating.patchLoadKg }));
  return { id: native.assetId, definitionId: native.assetId, revision: 'r000-a003-proposed', kind: 'cargo', size: native.nominalSizeUnits,
    quarterTurns: [0, 1, 2, 3], bearingFamily: native.bearingFamily, tareMassKg: rating.tareMassKg,
    maxGrossMassKg: rating.maxGrossMassKg, maxTopLoadKg: rating.maxTopLoadKg, bottom: patches, top: patches,
    allowMultipleSupports: true, clearances: [] };
});
const grid: CargoGrid = { id: 'review-cargo-only', deckId: 'review-deck', footprint: [[0, 0], [64, 0], [64, 64], [0, 64]],
  baseZ: 6, roofZ: 82, horizontalStepUnits: 32, snapOrigin: [0, 0], acceptedFamilies: [catalog[0]!.bearingFamily],
  bearingPatches: [{ id: 'qualified-review-floor', rect: [0, 0, 64, 64], maxLoadKg: proposed.gridMaxLoadKg }], maxLoadKg: proposed.gridMaxLoadKg, reservedVolumes: [] };
const placements: CargoPlacement[] = [
  { containerId: 'retained-base-container', interfaceId: 'carrier-2m', origin: [0, 0, 6], quarterTurns: 0, payloadMassKg: 100, secured: true },
  ...[0, 1].flatMap(x => [0, 1].map(y => ({ containerId: `retained-middle-${x}-${y}`, interfaceId: 'carrier-1m', origin: [x * 32, y * 32, 28] as [number, number, number], quarterTurns: 0, payloadMassKg: 100, secured: true }))),
  { containerId: 'retained-top-container', interfaceId: 'carrier-2m', origin: [0, 0, 50], quarterTurns: 0, payloadMassKg: 100, secured: true },
];
const payloadSnapshot = placements.map(p => ({ id: p.containerId, mass: p.payloadMassKg }));
let assertions = 0;
const valid = validateCargoStack(grid, catalog, placements);
assert.equal(valid.valid, true, JSON.stringify(valid.diagnostics)); assertions++;
assert.equal(valid.gridLoadKg, 800); assertions++;
assert.equal(valid.contacts.filter(c => c.containerId === 'retained-top-container').length, 4); assertions++;
for (let base = 0; base < 4; base++) for (let middle = 0; middle < 4; middle++) for (let top = 0; top < 4; top++) {
  const rotated = placements.map((p, i) => ({ ...p, quarterTurns: i === 0 ? base : i === 5 ? top : (middle + i) % 4 }));
  assert.equal(validateCargoStack(grid, catalog, rotated).valid, true); assertions++;
}
for (const p of placements.slice(0, 5)) {
  const removed = proposeCargoChanges(grid, catalog, placements, [{ kind: 'remove', containerId: p.containerId }]);
  assert.equal(removed.accepted, false); assert.deepEqual(removed.placements, placements); assert.deepEqual(removed.removedContainerIds, []); assertions += 3;
  const moved = proposeCargoChanges(grid, catalog, placements, [{ kind: 'move', containerId: p.containerId, origin: [32, 32, p.origin[2]], quarterTurns: 1 }]);
  if (p.origin[0] !== 32 || p.origin[1] !== 32) { assert.equal(moved.accepted, false); assert.deepEqual(moved.placements, placements); assertions += 2; }
}
assert.equal(proposeCargoChanges(grid, catalog, placements, [{ kind: 'remove', containerId: 'retained-top-container' }]).accepted, true); assertions++;
assert.equal(validateCargoStack({ ...grid, roofZ: 71 }, catalog, placements).valid, false); assertions++;
assert.equal(validateCargoStack(grid, catalog, placements.map((p, i) => i === 5 ? { ...p, origin: [0, 0, 51] } : p)).valid, false); assertions++;
assert.equal(validateCargoStack(grid, catalog, placements.map((p, i) => i === 2 ? { ...p, origin: [0, 0, 28] } : p)).valid, false); assertions++;
assert.equal(validateCargoStack(grid, catalog.map(c => ({ ...c, kind: 'equipment' })), placements).valid, false); assertions++;
assert.equal(validateCargoStack(grid, catalog, placements.map(p => ({ ...p, secured: false }))).valid, false); assertions++;
assert.equal(validateCargoStack(grid, catalog, placements.map(p => ({ ...p, payloadMassKg: 10000 }))).valid, false); assertions++;
assert.deepEqual(placements.map(p => ({ id: p.containerId, mass: p.payloadMassKg })), payloadSnapshot); assertions++;
writeFileSync(resolve(directory, 'proposed-gameplay.json'), `${JSON.stringify(proposed, null, 2)}\n`);
writeFileSync(resolve(directory, 'stack-validation.json'), `${JSON.stringify({ status: 'passed', assertions, actualNativeInterfaces: true, proposedRatingsOnly: true,
  rootLoadKg: valid.gridLoadKg, contacts: valid.contacts, loads: valid.loads, grid, catalog, placements,
  limitations: ['Inventory objects are not instantiated by this pure fixture; runtime UUID/content preservation requires the staged world adapter.', 'Restraint qualification and gameplay rating approval remain separate gates.'] }, null, 2)}\n`);
console.log(JSON.stringify({ assertions, rootLoadKg: valid.gridLoadKg, status: 'passed', gameplayRatingApproval: false }));
