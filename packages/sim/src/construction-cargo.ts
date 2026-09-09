import type { Point } from '../../content/src/ship-layout';
import { canonicalPolygon, cross, inside, properCross, compareText } from './layout-geometry';

/** Pure nominal cargo mechanics. All lengths are integer 1/32 m lattice units, masses
 * are kg. Native geometry, item inventory and liquid capacity are separate adapters.
 * Definitions/ratings must be resolved from approved authority metadata, not GLB AABBs.
 */
export const CARGO_LIMITS = Object.freeze({ containers: 256, interfaces: 256, patches: 16,
  clearances: 8, gridPatches: 64, reservedVolumes: 128, contacts: 4096, contactPatchesPerBottom: 256, coordinate: 8192, massKg: 1e12 });
export type CargoRect = [number, number, number, number]; // minX,minY,maxX,maxY
export type CargoBox = [number, number, number, number, number, number]; // minXYZ,maxXYZ
export type CargoPoint = [number, number, number];
export interface CargoBearingPatch { id: string; rect: CargoRect; maxLoadKg: number }
export interface CargoInterface {
  id: string; definitionId: string; revision: string; kind: 'cargo' | 'equipment';
  size: CargoPoint; quarterTurns: readonly number[]; bearingFamily: string;
  tareMassKg: number; maxGrossMassKg: number; maxTopLoadKg: number;
  bottom: readonly CargoBearingPatch[]; top: readonly CargoBearingPatch[];
  allowMultipleSupports: boolean;
  /** Swept operating/handling volumes, including required lid/door clearance. */
  clearances: readonly CargoBox[];
}
export interface CargoGrid {
  id: string; deckId: string; footprint: Point[]; baseZ: number; roofZ: number;
  horizontalStepUnits: number; snapOrigin: Point;
  acceptedFamilies: readonly string[]; bearingPatches: readonly CargoBearingPatch[];
  maxLoadKg: number; reservedVolumes: readonly CargoBox[];
}
export interface CargoPlacement {
  containerId: string; interfaceId: string; origin: CargoPoint; quarterTurns: number;
  payloadMassKg: number; secured: boolean;
}
export interface CargoDiagnostic { code: string; ids: string[]; message: string }
export interface CargoContact {
  containerId: string; bottomPatchId: string; supportContainerId: string | null;
  supportPatchId: string; areaUnits2: number; loadKg: number;
}
export interface CargoValidation {
  valid: boolean; diagnostics: CargoDiagnostic[]; contacts: CargoContact[];
  loads: { containerId: string; grossMassKg: number; supportedMassKg: number; transmittedMassKg: number }[];
  gridLoadKg: number;
}
const integer = (n: number) => Number.isInteger(n) && Math.abs(n) <= CARGO_LIMITS.coordinate;
const mass = (n: number) => Number.isFinite(n) && n >= 0 && n <= CARGO_LIMITS.massKg;
const id = (s: string) => typeof s === 'string' && s.length > 0 && s.length <= 128;
const rectArea = (r: CargoRect) => (r[2] - r[0]) * (r[3] - r[1]);
const validRect = (r: CargoRect) => r.length === 4 && r.every(integer) && r[0] < r[2] && r[1] < r[3];
const validBox = (b: CargoBox) => b.length === 6 && b.every(integer) && b[0] < b[3] && b[1] < b[4] && b[2] < b[5];
const intersect = (a: CargoRect, b: CargoRect): CargoRect | null => {
  const r: CargoRect = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[0] < r[2] && r[1] < r[3] ? r : null;
};
const boxOverlap = (a: CargoBox, b: CargoBox) => a[0] < b[3] && b[0] < a[3] && a[1] < b[4] && b[1] < a[4] && a[2] < b[5] && b[2] < a[5];
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function patchesValid(patches: readonly CargoBearingPatch[], limit: number) {
  assert(patches.length <= limit, 'Too many bearing patches');
  const ids = new Set<string>();
  for (const patch of patches) {
    assert(id(patch.id) && !ids.has(patch.id) && validRect(patch.rect) && mass(patch.maxLoadKg), 'Invalid/duplicate bearing patch or rating');
    ids.add(patch.id);
  }
  for (let i = 0; i < patches.length; i++) for (let j = i + 1; j < patches.length; j++)
    assert(!intersect(patches[i].rect, patches[j].rect), 'Bearing patches on one surface must not overlap');
}
function rotatedRect(rect: CargoRect, size: CargoPoint, turns: number, origin: CargoPoint): CargoRect {
  const transform = (x: number, y: number): Point => {
    const p: Point = turns === 0 ? [x, y] : turns === 1 ? [size[1] - y, x] : turns === 2 ? [size[0] - x, size[1] - y] : [y, size[0] - x];
    return [p[0] + origin[0], p[1] + origin[1]];
  };
  const a = transform(rect[0], rect[1]), b = transform(rect[2], rect[3]);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}
function insideGrid(box: CargoBox, grid: CargoGrid) {
  return box[2] >= grid.baseZ && box[5] <= grid.roofZ &&
    [[box[0], box[1]], [box[3], box[1]], [box[3], box[4]], [box[0], box[4]]].every(p => inside(p as Point, grid.footprint));
}
interface WorldCargo { placement: CargoPlacement; definition: CargoInterface; box: CargoBox; clearances: CargoBox[];
  bottom: CargoBearingPatch[]; top: CargoBearingPatch[] }

/** Exact rectangular union coverage: slice at every contact boundary and merge Y spans.
 * This never counts overlapping patches twice or accepts a missing support corner.
 */
export function cargoContactUnionArea(rectangles: readonly CargoRect[]): number {
  assert(rectangles.length <= CARGO_LIMITS.contactPatchesPerBottom, 'Contact rectangle budget exceeded');
  assert(rectangles.every(validRect), 'Invalid contact rectangle');
  const xs = [...new Set(rectangles.flatMap(r => [r[0], r[2]]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < xs.length; i++) {
    const spans = rectangles.filter(r => r[0] <= xs[i - 1] && r[2] >= xs[i]).map(r => [r[1], r[3]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let lo = spans[0]?.[0] ?? 0, hi = lo, height = 0;
    for (const [a, b] of spans) { if (a > hi) { height += hi - lo; lo = a; hi = b; } else { lo = Math.min(lo, a); hi = Math.max(hi, b); } }
    height += hi - lo;
    area += (xs[i] - xs[i - 1]) * height;
  }
  return area;
}

export function validateCargoStack(grid: CargoGrid, catalog: readonly CargoInterface[], placements: readonly CargoPlacement[]): CargoValidation {
  const result: CargoValidation = { valid: false, diagnostics: [], contacts: [], loads: [], gridLoadKg: 0 };
  const issue = (code: string, ids: string[], message: string) => result.diagnostics.push({ code, ids: [...ids].sort(compareText), message });
  const finish = () => { result.diagnostics.sort((a, b) => compareText(a.code, b.code) || compareText(a.ids.join(','), b.ids.join(','))); result.valid = !result.diagnostics.length; return result; };
  const world: WorldCargo[] = [];
  try {
    assert(id(grid.id) && id(grid.deckId) && integer(grid.baseZ) && integer(grid.roofZ) && grid.baseZ < grid.roofZ && mass(grid.maxLoadKg), 'Invalid grid or rating');
    assert(integer(grid.horizontalStepUnits) && grid.horizontalStepUnits > 0 && 64 % grid.horizontalStepUnits === 0
      && grid.snapOrigin.length === 2 && grid.snapOrigin.every(integer), 'Invalid explicit horizontal cargo submodule');
    assert(grid.footprint.length >= 3 && grid.footprint.length <= 16 && grid.footprint.every(p => p.length === 2 && p.every(integer)), 'Invalid grid footprint');
    const polygon = canonicalPolygon(grid.footprint);
    assert(polygon.every((p, i) => cross(p, polygon[(i + 1) % polygon.length], polygon[(i + 2) % polygon.length]) > 0), 'Grid footprint must be strictly convex');
    for (let i = 0; i < polygon.length; i++) for (let j = i + 1; j < polygon.length; j++)
      assert(!properCross(polygon[i], polygon[(i + 1) % polygon.length], polygon[j], polygon[(j + 1) % polygon.length]), 'Self-intersecting grid');
    assert(grid.acceptedFamilies.length > 0 && grid.acceptedFamilies.length <= CARGO_LIMITS.interfaces && grid.acceptedFamilies.every(id), 'Invalid accepted cargo families');
    patchesValid(grid.bearingPatches, CARGO_LIMITS.gridPatches);
    assert(grid.reservedVolumes.length <= CARGO_LIMITS.reservedVolumes && grid.reservedVolumes.every(validBox), 'Invalid reserved volumes');
    assert(catalog.length <= CARGO_LIMITS.interfaces && placements.length <= CARGO_LIMITS.containers, 'Cargo admission budget exceeded');
    const definitions = new Map<string, CargoInterface>();
    for (const definition of catalog) {
      assert(id(definition.id) && !definitions.has(definition.id) && id(definition.definitionId) && id(definition.revision) && id(definition.bearingFamily), 'Invalid/duplicate interface identity');
      assert(['cargo', 'equipment'].includes(definition.kind) && typeof definition.allowMultipleSupports === 'boolean', 'Invalid interface policy');
      assert(definition.size.length === 3 && definition.size.every(n => integer(n) && n > 0), 'Invalid nominal size');
      assert(definition.quarterTurns.length > 0 && definition.quarterTurns.length <= 4 && new Set(definition.quarterTurns).size === definition.quarterTurns.length
        && definition.quarterTurns.every(n => Number.isInteger(n) && n >= 0 && n < 4), 'Invalid rotations');
      assert([definition.tareMassKg, definition.maxGrossMassKg, definition.maxTopLoadKg].every(mass) && definition.tareMassKg <= definition.maxGrossMassKg, 'Invalid interface mass ratings');
      assert(definition.bottom.length > 0, 'Cargo requires bottom bearing patches');
      patchesValid(definition.bottom, CARGO_LIMITS.patches); patchesValid(definition.top, CARGO_LIMITS.patches);
      for (const patch of [...definition.bottom, ...definition.top]) assert(patch.rect[0] >= 0 && patch.rect[1] >= 0 && patch.rect[2] <= definition.size[0] && patch.rect[3] <= definition.size[1], 'Bearing patch exceeds nominal footprint');
      assert(definition.clearances.length <= CARGO_LIMITS.clearances && definition.clearances.every(validBox), 'Invalid clearance volumes');
      definitions.set(definition.id, definition);
    }
    const ids = new Set<string>();
    for (const placement of [...placements].sort((a, b) => compareText(a.containerId, b.containerId))) {
      assert(id(placement.containerId) && !ids.has(placement.containerId), 'Invalid/duplicate container identity'); ids.add(placement.containerId);
      assert(placement.origin.length === 3 && placement.origin.every(integer) && mass(placement.payloadMassKg) && typeof placement.secured === 'boolean', 'Invalid placement/payload');
      const definition = definitions.get(placement.interfaceId); assert(definition, `Unknown cargo interface ${placement.interfaceId}`);
      assert(definition.quarterTurns.includes(placement.quarterTurns), 'Unsupported cargo rotation');
      const rotate = (r: CargoRect) => rotatedRect(r, definition.size, placement.quarterTurns, placement.origin);
      const footprint = rotate([0, 0, definition.size[0], definition.size[1]]);
      const box: CargoBox = [footprint[0], footprint[1], placement.origin[2], footprint[2], footprint[3], placement.origin[2] + definition.size[2]];
      assert(validBox(box), 'Transformed cargo exceeds coordinate bounds');
      const clearances = definition.clearances.map(c => { const r = rotate([c[0], c[1], c[3], c[4]]);
        const b: CargoBox = [r[0], r[1], c[2] + placement.origin[2], r[2], r[3], c[5] + placement.origin[2]]; assert(validBox(b), 'Transformed clearance exceeds bounds'); return b; });
      world.push({ placement, definition, box, clearances, bottom: definition.bottom.map(p => ({ ...p, rect: rotate(p.rect) })).sort((a, b) => compareText(a.id, b.id)),
        top: definition.top.map(p => ({ ...p, rect: rotate(p.rect) })).sort((a, b) => compareText(a.id, b.id)) });
    }
  } catch (error) { issue('admission', [], String(error)); return finish(); }
  for (const item of world) {
    const ids = [item.placement.containerId];
    if (item.definition.kind !== 'cargo') issue('cargo-only', ids, 'Cargo grids reject furniture and equipment');
    if (item.definition.size.slice(0, 2).some(n => n % grid.horizontalStepUnits !== 0)
      || item.placement.origin.slice(0, 2).some((n, i) => (n - grid.snapOrigin[i]) % grid.horizontalStepUnits !== 0))
      issue('submodule', ids, 'Nominal cargo size/placement does not match the declared grid subdivision');
    if (!grid.acceptedFamilies.includes(item.definition.bearingFamily)) issue('family', ids, 'Unsupported bearing family');
    if (!item.placement.secured) issue('unrestrained', ids, 'Cargo must have a validated restraint');
    if (!insideGrid(item.box, grid)) issue('envelope', ids, 'Cargo intersects roof or leaves the nominal cargo grid');
    if (item.clearances.some(b => !insideGrid(b, grid))) issue('clearance-envelope', ids, 'Operating clearance leaves grid or intersects roof');
    if (grid.reservedVolumes.some(b => boxOverlap(b, item.box) || item.clearances.some(c => boxOverlap(b, c)))) issue('reserved-volume', ids, 'Cargo/clearance intersects reserved handling or service space');
    if (item.definition.tareMassKg + item.placement.payloadMassKg > item.definition.maxGrossMassKg) issue('gross-load', ids, 'Container payload exceeds approved gross mass');
  }
  for (let i = 0; i < world.length; i++) for (let j = i + 1; j < world.length; j++) {
    const a = world[i], b = world[j], ids = [a.placement.containerId, b.placement.containerId];
    if (boxOverlap(a.box, b.box)) issue('overlap', ids, 'Nominal container volumes overlap');
    if (a.clearances.some(c => boxOverlap(c, b.box)) || b.clearances.some(c => boxOverlap(c, a.box))) issue('blocked-operation', ids, 'Container blocks another container lid/door/handling sweep');
  }
  if (result.diagnostics.length) return finish();
  for (const item of world) {
    const sources = item.box[2] === grid.baseZ ? [{ containerId: null, patches: [...grid.bearingPatches].sort((a, b) => compareText(a.id, b.id)) }]
      : world.filter(lower => lower.box[5] === item.box[2] && lower.definition.bearingFamily === item.definition.bearingFamily)
        .map(lower => ({ containerId: lower.placement.containerId, patches: lower.top }));
    for (const bottom of item.bottom) {
      const intersections: CargoRect[] = [];
      for (const source of sources) for (const top of source.patches) {
        const overlap = intersect(bottom.rect, top.rect); if (!overlap) continue;
        if (intersections.length >= CARGO_LIMITS.contactPatchesPerBottom || result.contacts.length >= CARGO_LIMITS.contacts) {
          issue('contact-budget', [item.placement.containerId], 'Contact graph exceeds bounded validation budget'); return finish();
        }
        intersections.push(overlap);
        result.contacts.push({ containerId: item.placement.containerId, bottomPatchId: bottom.id, supportContainerId: source.containerId,
          supportPatchId: top.id, areaUnits2: rectArea(overlap), loadKg: 0 });
      }
      if (cargoContactUnionArea(intersections) !== rectArea(bottom.rect)) issue('unsupported', [item.placement.containerId, bottom.id], 'Bottom bearing patch is not fully covered by coplanar compatible supports');
    }
    const supportingIds = new Set(result.contacts.filter(c => c.containerId === item.placement.containerId).map(c => c.supportContainerId));
    if (!item.definition.allowMultipleSupports && supportingIds.size > 1) issue('bridging-forbidden', [item.placement.containerId], 'Interface does not permit multiple supporting containers');
  }
  if (result.diagnostics.length) return finish();
  // Every edge descends by a strictly positive container height. Cycles cannot be
  // supplied or inferred; all unsupported floating roots already rejected above.
  const carried = new Map(world.map(item => [item.placement.containerId, 0]));
  const topPatchLoads = new Map<string, number>(), gridPatchLoads = new Map<string, number>();
  for (const item of [...world].sort((a, b) => b.box[2] - a.box[2] || compareText(a.placement.containerId, b.placement.containerId))) {
    const containerId = item.placement.containerId, supported = carried.get(containerId)!, gross = item.definition.tareMassKg + item.placement.payloadMassKg, transmitted = supported + gross;
    result.loads.push({ containerId, grossMassKg: gross, supportedMassKg: supported, transmittedMassKg: transmitted });
    if (supported > item.definition.maxTopLoadKg) issue('top-load', [containerId], 'Supported stack exceeds container top load rating');
    const contacts = result.contacts.filter(c => c.containerId === containerId), totalArea = contacts.reduce((sum, c) => sum + c.areaUnits2, 0);
    const bottomLoads = new Map<string, number>();
    let distributed = 0;
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i]; contact.loadKg = Math.max(0, i === contacts.length - 1 ? transmitted - distributed : Math.min(transmitted - distributed, transmitted * contact.areaUnits2 / totalArea));
      distributed += contact.loadKg;
      bottomLoads.set(contact.bottomPatchId, (bottomLoads.get(contact.bottomPatchId) ?? 0) + contact.loadKg);
      if (contact.supportContainerId === null) {
        result.gridLoadKg += contact.loadKg; gridPatchLoads.set(contact.supportPatchId, (gridPatchLoads.get(contact.supportPatchId) ?? 0) + contact.loadKg);
      } else {
        carried.set(contact.supportContainerId, carried.get(contact.supportContainerId)! + contact.loadKg);
        const key = JSON.stringify([contact.supportContainerId, contact.supportPatchId]); topPatchLoads.set(key, (topPatchLoads.get(key) ?? 0) + contact.loadKg);
      }
    }
    for (const patch of item.bottom) if ((bottomLoads.get(patch.id) ?? 0) > patch.maxLoadKg) issue('bottom-patch-load', [containerId, patch.id], 'Bottom bearing patch overloaded');
  }
  for (const item of world) for (const patch of item.top)
    if ((topPatchLoads.get(JSON.stringify([item.placement.containerId, patch.id])) ?? 0) > patch.maxLoadKg) issue('top-patch-load', [item.placement.containerId, patch.id], 'Top bearing patch overloaded');
  for (const patch of grid.bearingPatches) if ((gridPatchLoads.get(patch.id) ?? 0) > patch.maxLoadKg) issue('grid-patch-load', [grid.id, patch.id], 'Grid bearing patch overloaded');
  if (result.gridLoadKg > grid.maxLoadKg) issue('grid-load', [grid.id], 'Cargo grid total load exceeded');
  result.loads.sort((a, b) => compareText(a.containerId, b.containerId));
  return finish();
}

export type CargoChange = { kind: 'move'; containerId: string; origin: CargoPoint; quarterTurns: number }
  | { kind: 'remove'; containerId: string };
/** Atomic placement proposal only: rejected proposals return the original stack, with
 * stable container IDs, interfaces, payload and restraint values preserved. Removal
 * returns detached IDs for a custody adapter; it never deletes containers or inventory.
 */
export function proposeCargoChanges(grid: CargoGrid, catalog: readonly CargoInterface[], placements: readonly CargoPlacement[], changes: readonly CargoChange[]) {
  const before = validateCargoStack(grid, catalog, placements);
  const original = placements.map(p => ({ ...p, origin: [...p.origin] as CargoPoint }));
  const reject = (code: string, message: string) => ({ accepted: false, placements: original, removedContainerIds: [] as string[],
    validation: { ...before, valid: false, diagnostics: [...before.diagnostics, { code, ids: [], message }] } });
  if (!before.valid) return reject('invalid-start', 'Existing stack must validate before a placement proposal');
  if (changes.length > CARGO_LIMITS.containers) return reject('change-budget', 'Too many cargo changes');
  const byId = new Map(original.map(p => [p.containerId, p])), changed = new Set<string>(), removed: string[] = [];
  for (const change of changes) {
    const item = byId.get(change.containerId);
    if (!item || changed.has(change.containerId)) return reject('change-identity', 'Unknown or repeated container change');
    changed.add(change.containerId);
    if (change.kind === 'remove') { byId.delete(change.containerId); removed.push(change.containerId); }
    else if (change.kind === 'move') byId.set(change.containerId, { ...item, origin: [...change.origin] as CargoPoint, quarterTurns: change.quarterTurns });
    else return reject('change-kind', 'Unsupported cargo change');
  }
  const proposed = [...byId.values()].sort((a, b) => compareText(a.containerId, b.containerId));
  const validation = validateCargoStack(grid, catalog, proposed);
  return { accepted: validation.valid, placements: validation.valid ? proposed : original,
    removedContainerIds: validation.valid ? removed.sort(compareText) : [], validation };
}
