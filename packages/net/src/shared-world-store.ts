/** Client cache for authorized shared-world projections. It does not grant visibility
 * or write simulation state. Bind SDK insert/update/delete events; reset the epoch
 * on disconnect/admission replacement before accepting a new socket's callbacks. */
export interface SharedMotion {
  systemId: string;
  cellX: bigint;
  cellY: bigint;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  omega: number;
  serverTick: bigint;
}
export interface SharedShipMotion extends SharedMotion {
  shipId: string;
}
export interface SharedBodyMotion extends SharedMotion {
  bodyId: string;
}
export interface SharedShipDescription {
  shipId: string;
  publishedExteriorAssetId: string;
  appearanceRevision: bigint;
  displayName: string;
}
export interface SharedBodyDescription {
  bodyId: string;
  kind: string;
  appearance: string;
  seed: number;
  radius: number;
  height: number;
}
export interface SharedAdmission {
  characterId: string;
  shipId: string;
  systemId: string;
  revision: bigint;
}
export interface SharedWorldSnapshot {
  epoch: number;
  shipMotion: readonly SharedShipMotion[];
  bodyMotion: readonly SharedBodyMotion[];
  shipDescription: readonly SharedShipDescription[];
  bodyDescription: readonly SharedBodyDescription[];
  admission: readonly SharedAdmission[];
}
export type SharedWorldTable = Exclude<keyof SharedWorldSnapshot, "epoch">;
type Rows = {
  shipMotion: SharedShipMotion;
  bodyMotion: SharedBodyMotion;
  shipDescription: SharedShipDescription;
  bodyDescription: SharedBodyDescription;
  admission: SharedAdmission;
};
interface Sample {
  row: SharedMotion;
  receivedAtMs: number;
}
const TABLES: readonly SharedWorldTable[] = [
  "shipMotion",
  "bodyMotion",
  "shipDescription",
  "bodyDescription",
  "admission",
];
const keyOf = (table: SharedWorldTable, row: Rows[SharedWorldTable]) =>
  table === "admission"
    ? (row as SharedAdmission).characterId
    : table.startsWith("ship")
      ? (row as SharedShipDescription).shipId
      : (row as SharedBodyDescription).bodyId;
const equal = (a: object, b: object) => {
  const entries = Object.entries(a);
  return (
    entries.length === Object.keys(b).length &&
    entries.every(([k, v]) => Object.is(v, (b as Record<string, unknown>)[k]))
  );
};
function motionValid(row: SharedMotion) {
  return (
    !!row.systemId &&
    typeof row.serverTick === "bigint" &&
    row.serverTick >= 0n &&
    typeof row.cellX === "bigint" &&
    typeof row.cellY === "bigint" &&
    [row.x, row.y, row.vx, row.vy, row.heading, row.omega].every(
      Number.isFinite,
    )
  );
}
const shortAngle = (from: number, to: number, alpha: number) =>
  from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * alpha;
export class SharedWorldStore {
  private epoch = 0;
  private disposed = false;
  private depth = 0;
  private dirty = new Set<SharedWorldTable>();
  private listeners = new Set<() => void>();
  private tableListeners = new Map<SharedWorldTable, Set<() => void>>(
    TABLES.map((t) => [t, new Set()]),
  );
  private rows: { [K in SharedWorldTable]: Map<string, Rows[K]> } = {
    shipMotion: new Map(),
    bodyMotion: new Map(),
    shipDescription: new Map(),
    bodyDescription: new Map(),
    admission: new Map(),
  };
  private samples = new Map<string, Sample[]>();
  private snapshot: SharedWorldSnapshot = this.empty();
  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly limits = { ships: 64, bodies: 32, samples: 8 },
  ) {
    if (
      ![limits.ships, limits.bodies, limits.samples].every(
        (n) => Number.isInteger(n) && n > 0 && n <= 1024,
      ) ||
      limits.samples < 2
    )
      throw new Error("Invalid shared cache budget");
  }
  private empty(): SharedWorldSnapshot {
    return Object.freeze({
      epoch: this.epoch,
      shipMotion: Object.freeze([]),
      bodyMotion: Object.freeze([]),
      shipDescription: Object.freeze([]),
      bodyDescription: Object.freeze([]),
      admission: Object.freeze([]),
    });
  }
  /** Stable references support useSyncExternalStore. Per-table subscribers avoid
   * repainting inventory/character UI on unrelated remote motion changes. */
  getSnapshot = (): SharedWorldSnapshot => this.snapshot;
  getTableSnapshot = <K extends SharedWorldTable>(
    table: K,
  ): SharedWorldSnapshot[K] => this.snapshot[table];
  getEpoch = () => this.epoch;
  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  subscribeTable = (
    table: SharedWorldTable,
    listener: () => void,
  ): (() => void) => {
    if (this.disposed) return () => {};
    this.tableListeners.get(table)!.add(listener);
    return () => {
      this.tableListeners.get(table)!.delete(listener);
    };
  };
  batch(action: () => void): void {
    if (this.disposed) return;
    this.depth++;
    try {
      action();
    } finally {
      if (--this.depth === 0) this.flush();
    }
  }
  /** Late callbacks from the previous epoch are ignored, even if entity IDs recur. */
  beginEpoch(): number {
    if (this.disposed) return this.epoch;
    this.epoch++;
    for (const table of TABLES) {
      this.rows[table].clear();
      this.dirty.add(table);
    }
    this.samples.clear();
    if (this.depth === 0) this.flush();
    return this.epoch;
  }
  private flush() {
    if (this.disposed || !this.dirty.size) return;
    const changed = [...this.dirty];
    this.dirty.clear();
    const next = { ...this.snapshot, epoch: this.epoch };
    for (const table of changed) {
      (next[table] as readonly unknown[]) = Object.freeze(
        [...this.rows[table].values()].sort((a, b) => {
          const x = keyOf(table, a),
            y = keyOf(table, b);
          return x < y ? -1 : x > y ? 1 : 0;
        }),
      );
    }
    this.snapshot = Object.freeze(next);
    for (const table of changed)
      for (const listener of [...this.tableListeners.get(table)!]) listener();
    for (const listener of [...this.listeners]) listener();
  }
  upsert<K extends SharedWorldTable>(
    table: K,
    row: Rows[K],
    epoch = this.epoch,
    receivedAtMs = this.now(),
  ): boolean {
    if (this.disposed || epoch !== this.epoch) return false;
    const id = keyOf(table, row);
    if (!id || id.length > 128 || !Number.isFinite(receivedAtMs)) return false;
    const map = this.rows[table] as Map<string, Rows[K]>,
      old = map.get(id);
    const capacity =
      table === "admission"
        ? 1
        : table.startsWith("ship")
          ? this.limits.ships
          : this.limits.bodies;
    if (!old && map.size >= capacity) return false;
    if (table === "shipMotion" || table === "bodyMotion") {
      const motion = row as SharedMotion;
      if (!motionValid(motion)) return false;
      if (old && (old as SharedMotion).serverTick > motion.serverTick)
        return false;
    } else if (table === "admission") {
      const admission = row as SharedAdmission;
      if (
        !admission.shipId ||
        !admission.systemId ||
        typeof admission.revision !== "bigint" ||
        admission.revision < 0n
      )
        return false;
      if (old && (old as SharedAdmission).revision > admission.revision)
        return false;
    } else if (table === "shipDescription") {
      const description = row as SharedShipDescription;
      if (
        !description.publishedExteriorAssetId ||
        typeof description.appearanceRevision !== "bigint" ||
        description.appearanceRevision < 0n
      )
        return false;
      if (
        old &&
        (old as SharedShipDescription).appearanceRevision >
          description.appearanceRevision
      )
        return false;
    } else {
      const description = row as SharedBodyDescription;
      if (
        ![description.seed, description.radius, description.height].every(
          Number.isFinite,
        ) ||
        description.radius <= 0
      )
        return false;
    }
    if (old && equal(old, row)) return false;
    const copy = Object.assign({}, row);
    Object.freeze(copy);
    map.set(id, copy);
    if (table === "shipMotion" || table === "bodyMotion")
      this.remember(`${table}:${id}`, copy as SharedMotion, receivedAtMs);
    this.dirty.add(table);
    if (this.depth === 0) this.flush();
    return true;
  }
  remove(table: SharedWorldTable, id: string, epoch = this.epoch): boolean {
    if (this.disposed || epoch !== this.epoch || !this.rows[table].delete(id))
      return false;
    this.samples.delete(`${table}:${id}`);
    this.dirty.add(table);
    if (this.depth === 0) this.flush();
    return true;
  }
  private remember(key: string, row: SharedMotion, receivedAtMs: number) {
    let buffer = this.samples.get(key) ?? [];
    const prior = buffer.at(-1);
    if (
      prior &&
      (prior.row.systemId !== row.systemId ||
        row.serverTick - prior.row.serverTick > 1200n)
    )
      buffer = [];
    if (buffer.at(-1)?.row.serverTick === row.serverTick)
      buffer[buffer.length - 1] = { row, receivedAtMs };
    else buffer.push({ row, receivedAtMs });
    if (buffer.length > this.limits.samples)
      buffer.splice(0, buffer.length - this.limits.samples);
    this.samples.set(key, buffer);
  }
  /** Render-only delayed interpolation using synchronized50ms authoritative sample
   * stamps. Never extrapolates beyond the latest accepted pose. Long silence marks
   * a held pose stale; delete/reconnect removes it immediately. */
  sampleShip(
    id: string,
    atMs = this.now(),
    delayMs = 100,
  ): (SharedShipMotion & { stale: boolean }) | undefined {
    return this.sample("shipMotion", id, atMs, delayMs) as
      (SharedShipMotion & { stale: boolean }) | undefined;
  }
  sampleBody(
    id: string,
    atMs = this.now(),
    delayMs = 100,
  ): (SharedBodyMotion & { stale: boolean }) | undefined {
    return this.sample("bodyMotion", id, atMs, delayMs) as
      (SharedBodyMotion & { stale: boolean }) | undefined;
  }
  private sample(
    table: "shipMotion" | "bodyMotion",
    id: string,
    atMs: number,
    delayMs: number,
  ) {
    if (
      this.disposed ||
      !Number.isFinite(atMs) ||
      !Number.isFinite(delayMs) ||
      delayMs < 0 ||
      delayMs > 1000
    )
      return undefined;
    const row = this.rows[table].get(id),
      buffer = this.samples.get(`${table}:${id}`);
    if (!row || !buffer?.length) return undefined;
    const latest = buffer[buffer.length - 1],
      elapsed = Math.max(0, atMs - latest.receivedAtMs),
      target = Math.min(0, (elapsed - delayMs) / 50);
    let left = buffer[0],
      right = left;
    for (let i = 1; i < buffer.length; i++) {
      right = buffer[i];
      if (Number(right.row.serverTick - latest.row.serverTick) >= target) break;
      left = right;
    }
    const start = Number(left.row.serverTick - latest.row.serverTick),
      end = Number(right.row.serverTick - latest.row.serverTick),
      alpha =
        end > start
          ? Math.max(0, Math.min(1, (target - start) / (end - start)))
          : 0;
    return {
      ...row,
      x: left.row.x + (right.row.x - left.row.x) * alpha,
      y: left.row.y + (right.row.y - left.row.y) * alpha,
      vx: left.row.vx + (right.row.vx - left.row.vx) * alpha,
      vy: left.row.vy + (right.row.vy - left.row.vy) * alpha,
      heading: shortAngle(left.row.heading, right.row.heading, alpha),
      omega: left.row.omega + (right.row.omega - left.row.omega) * alpha,
      stale: elapsed > 1000,
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.beginEpoch();
    this.disposed = true;
    this.listeners.clear();
    for (const listeners of this.tableListeners.values()) listeners.clear();
  }
}
