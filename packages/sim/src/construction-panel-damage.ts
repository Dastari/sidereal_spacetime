import {
  PRESSURE_LIMITS,
  type PressureBoundary,
} from "./construction-topology";

/** Native-proxy damage rules only. No weapon strengths, permission endpoint,
 * persistence or native clipping grant is implied. Axis 0 runs through thickness,
 * axis 1 across the panel, axis 2 upwards, in a panel-local integer lattice.
 * A qualified closed lateral frame is required: lateral seams/neighbor damage
 * must be analyzed in a combined proxy, never assumed sealed by this helper. */
export const PANEL_DAMAGE_LIMITS = Object.freeze({ cells: 262144, edit: 4096 });
export type PanelCell = readonly [number, number, number];
export interface PanelDamageProxy {
  id: string;
  cellSizeM: number;
  dimensions: PanelCell;
  /** Explicit pressure-blocking material occupancy from the native proxy.
   * Decorative/permeable material needs its own visual damage representation. */
  occupied: readonly PanelCell[];
}
export interface PanelDamageState {
  removed: readonly PanelCell[];
}
export interface PanelDamageAnalysis {
  state: "intact" | "cratered" | "breached";
  remainingCells: number;
  removedCells: number;
  removedVolumeM3: number;
  /** Diagnostic connected entrance/exit faces, not a calibrated flow area. */
  connectedNegativeFaces: number;
  connectedPositiveFaces: number;
}
const key = (p: PanelCell) => p.join(",");
function requirePanel(ok: unknown, reason: string): asserts ok {
  if (!ok) throw Error(`Panel damage: ${reason}`);
}
function checkedProxy(proxy: PanelDamageProxy) {
  const d = proxy.dimensions;
  requirePanel(
    typeof proxy.id === "string" &&
      proxy.id.length > 0 &&
      proxy.id.length <= 128,
    "proxy identity required",
  );
  requirePanel(
    d.length === 3 &&
      d.every((n) => Number.isSafeInteger(n) && n > 0) &&
      d[0] * d[1] * d[2] <= PANEL_DAMAGE_LIMITS.cells,
    "proxy exceeds bounded lattice",
  );
  requirePanel(
    Number.isFinite(proxy.cellSizeM) &&
      proxy.cellSizeM > 0 &&
      proxy.cellSizeM <= 1,
    "invalid cell size",
  );
  requirePanel(
    proxy.occupied.length <= PANEL_DAMAGE_LIMITS.cells,
    "occupancy exceeds budget",
  );
  const occupied = new Set<string>();
  for (const cell of proxy.occupied) {
    checkedCell(cell, d);
    requirePanel(!occupied.has(key(cell)), "duplicate occupied cell");
    occupied.add(key(cell));
  }
  requirePanel(occupied.size > 0, "empty pressure proxy");
  return occupied;
}
function checkedCell(cell: PanelCell, dimensions: PanelCell) {
  requirePanel(
    cell.length === 3 &&
      cell.every(
        (n, axis) => Number.isSafeInteger(n) && n >= 0 && n < dimensions[axis],
      ),
    "cell outside proxy",
  );
}
function checkedRemoved(
  proxy: PanelDamageProxy,
  occupied: Set<string>,
  state: PanelDamageState,
) {
  requirePanel(
    state.removed.length <= occupied.size,
    "removed state exceeds occupancy",
  );
  const removed = new Set<string>();
  for (const cell of state.removed) {
    checkedCell(cell, proxy.dimensions);
    const id = key(cell);
    requirePanel(occupied.has(id), "removed cell has no original material");
    requirePanel(!removed.has(id), "duplicate removed state");
    removed.add(id);
  }
  return removed;
}

/** Bounded cumulative removal. Re-hitting an empty cell costs no additional
 * material; inputs are immutable. Parent authority must validate actor, hit/tool,
 * resources, expected revision and operation receipt before storing this result. */
export function removePanelCells(
  proxy: PanelDamageProxy,
  state: PanelDamageState,
  requested: readonly PanelCell[],
): { state: PanelDamageState; newlyRemoved: number } {
  requirePanel(
    requested.length <= PANEL_DAMAGE_LIMITS.edit,
    "edit exceeds budget",
  );
  const occupied = checkedProxy(proxy),
    removed = checkedRemoved(proxy, occupied, state);
  for (const cell of requested) checkedCell(cell, proxy.dimensions);
  const originalSize = removed.size;
  for (const cell of requested)
    if (occupied.has(key(cell))) removed.add(key(cell));
  return {
    state: {
      removed: [...removed]
        .map((id) => id.split(",").map(Number) as unknown as PanelCell)
        .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]),
    },
    newlyRemoved: removed.size - originalSize,
  };
}

/** Flood empty cells with face adjacency. Merely touching at an edge/corner is
 * not a leak; offset skin perforations can connect through the same cavity.
 * The perimeter itself is not an exterior endpoint; see qualification above. */
export function analyzePanelDamage(
  proxy: PanelDamageProxy,
  state: PanelDamageState,
): PanelDamageAnalysis {
  const occupied = checkedProxy(proxy),
    removed = checkedRemoved(proxy, occupied, state);
  const [depth, width, height] = proxy.dimensions;
  const count = depth * width * height;
  const blocked = new Uint8Array(count),
    seen = new Uint8Array(count);
  const index = (x: number, y: number, z: number) =>
    x + depth * (y + width * z);
  for (const p of proxy.occupied)
    if (!removed.has(key(p))) blocked[index(...p)] = 1;
  const queue = new Int32Array(count);
  let negativeFaces = 0,
    positiveFaces = 0;
  for (let z = 0; z < height; z++)
    for (let y = 0; y < width; y++) {
      const start = index(0, y, z);
      if (blocked[start] || seen[start]) continue;
      let head = 0,
        tail = 1,
        negative = 0,
        positive = 0;
      queue[0] = start;
      seen[start] = 1;
      while (head < tail) {
        const id = queue[head++],
          x = id % depth;
        const cy = Math.floor(id / depth) % width,
          cz = Math.floor(id / (depth * width));
        if (x === 0) negative++;
        if (x === depth - 1) positive++;
        const visit = (next: number) => {
          if (!blocked[next] && !seen[next]) {
            seen[next] = 1;
            queue[tail++] = next;
          }
        };
        if (x > 0) visit(id - 1);
        if (x + 1 < depth) visit(id + 1);
        if (cy > 0) visit(id - depth);
        if (cy + 1 < width) visit(id + depth);
        if (cz > 0) visit(id - depth * width);
        if (cz + 1 < height) visit(id + depth * width);
      }
      if (positive > 0) {
        negativeFaces += negative;
        positiveFaces += positive;
      }
    }
  return {
    state:
      positiveFaces > 0 ? "breached" : removed.size > 0 ? "cratered" : "intact",
    remainingCells: occupied.size - removed.size,
    removedCells: removed.size,
    removedVolumeM3: removed.size * proxy.cellSizeM ** 3,
    connectedNegativeFaces: negativeFaces,
    connectedPositiveFaces: positiveFaces,
  };
}

/** Explicit accepted seal binding. The endpoint determines room-to-room versus
 * vacuum. No classification from model names, room labels or damage visuals.
 * Conductance is a supplied gameplay policy, not inferred physical performance. */
export function damagedPanelBoundary(
  proxy: PanelDamageProxy,
  state: PanelDamageState,
  sealed: Extract<PressureBoundary, { kind: "sealed" }>,
  policy: { id: string; conductanceMolesPerSecondPa: number },
): PressureBoundary {
  requirePanel(
    analyzePanelDamage(proxy, { removed: [] }).state === "intact",
    "original proxy is not sealed",
  );
  requirePanel(
    typeof policy.id === "string" &&
      policy.id.length > 0 &&
      policy.id.length <= 128 &&
      Number.isFinite(policy.conductanceMolesPerSecondPa) &&
      policy.conductanceMolesPerSecondPa > 0 &&
      policy.conductanceMolesPerSecondPa <= PRESSURE_LIMITS.maxConductance,
    "invalid qualified flow policy",
  );
  if (analyzePanelDamage(proxy, state).state !== "breached")
    return { ...sealed };
  return {
    id: sealed.id,
    a: { ...sealed.a },
    b: sealed.b ? { ...sealed.b } : null,
    kind: "flow",
    sourceDefinitionId: policy.id,
    conductanceMolesPerSecondPa: policy.conductanceMolesPerSecondPa,
  };
}
