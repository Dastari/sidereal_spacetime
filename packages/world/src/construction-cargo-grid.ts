/** Staged cargo placement authority. Private tables and ctx.db writes are real;
 * root registration waits for approved physical interfaces and inventory-mass
 * compatibility hooks. No native visual is silently treated as a rated pallet. */
import type { Identity } from "spacetimedb";
import {
  validateCargoStack,
  CARGO_LIMITS,
  type CargoGrid,
  type CargoInterface,
  type CargoPlacement,
  type CargoPoint,
} from "../../sim/src/construction-cargo";

export interface CargoGridRow {
  id: string;
  instanceId: string;
  deckId: string;
  definitionSha256: string;
  gridJson: string;
  revision: bigint;
}
export interface CargoPlacementRow {
  containerId: string;
  instanceId: string;
  deckId: string;
  gridId: string;
  interfaceId: string;
  interfaceRevision: string;
  originX: number;
  originY: number;
  originZ: number;
  quarterTurns: number;
  secured: boolean;
  custodyAnchorId: string;
  revision: bigint;
}
interface Receipt {
  id: string;
  principal: Identity;
  requestJson: string;
  resultJson: string;
}
interface Primary<Row> {
  find(id: string): Row | null | undefined;
  update(row: Row): unknown;
}
export interface CargoGridDatabase {
  constructionCargoGrid: { id: Primary<CargoGridRow> };
  constructionCargoPlacement: {
    containerId: Primary<CargoPlacementRow>;
    insert(row: CargoPlacementRow): unknown;
    by_grid: { filter(id: string): Iterable<CargoPlacementRow> };
  };
  constructionCargoOperation: {
    id: { find(id: string): Receipt | null | undefined };
    insert(row: Receipt): unknown;
    by_principal: { filter(principal: Identity): Iterable<Receipt> };
  };
}
export interface CargoGridContext {
  sender: Identity;
  db: CargoGridDatabase;
}
/** Everything here is resolved by the server in the same reducer transaction.
 * No request field may supply payload mass, secured state, ratings or an asset. */
export interface QualifiedCargoRoot {
  containerId: string;
  instanceId: string;
  deckId: string;
  inventoryRevision: bigint;
  assetId: string;
  assetSha256: string;
  interfaceId: string;
  interfaceRevision: string;
  payloadMassKg: number;
  secured: boolean;
  kind: "cargo" | "equipment";
  availableForPlacement: boolean;
}
export interface QualifiedCargoInterface {
  assetId: string;
  assetSha256: string;
  ratingApprovalId: string;
  interface: CargoInterface;
}
export interface CargoStagingAnchor {
  id: string;
  instanceId: string;
  deckId: string;
  interfaceId: string;
  origin: CargoPoint;
  quarterTurns: number;
}
export interface CargoGridHooks {
  requireLiveGame(ctx: CargoGridContext): void;
  /** Require current accepted instance/deck, manipulate permission, proximity,
   * LOS, no occupied seat/traversal, and complete motion-safe construction policy. */
  requireAccess(
    ctx: CargoGridContext,
    grid: CargoGridRow,
    containerIds: readonly string[],
  ): void;
  /** Source hash must match an installed published cargo-only zone, with current
   * roof/door/traversal reservations and approved deck bearing ratings. */
  requireQualifiedGrid(ctx: CargoGridContext, row: CargoGridRow): void;
  container(ctx: CargoGridContext, id: string): QualifiedCargoRoot | undefined;
  interface(
    ctx: CargoGridContext,
    id: string,
  ): QualifiedCargoInterface | undefined;
  /** Validated free supported destination outside this grid. Returning an anchor
   * requires full envelope/doorway/other-cargo clearance and capacity checks. */
  stagingAnchor(
    ctx: CargoGridContext,
    id: string,
    root: QualifiedCargoRoot,
  ): CargoStagingAnchor | undefined;
}
type EditBase = {
  containerId: string;
  expectedPlacementRevision: bigint;
  expectedInventoryRevision: bigint;
};
export type CargoGridEdit = EditBase &
  (
    | { kind: "place" | "move"; origin: CargoPoint; quarterTurns: number }
    | { kind: "remove"; destinationAnchorId: string }
  );
export interface CargoGridRequest {
  gridId: string;
  expectedGridRevision: bigint;
  operationId: string;
  edits: readonly CargoGridEdit[];
}
export interface CargoGridResult {
  gridId: string;
  revision: string;
  changedContainerIds: string[];
  detachedContainerIds: string[];
}
function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
function bounded<T>(rows: Iterable<T>, limit: number): T[] {
  const result: T[] = [];
  for (const r of rows) {
    check(result.length < limit, "Cargo authority work budget exceeded");
    result.push(r);
  }
  return result;
}
const validId = (id: string) =>
  typeof id === "string" && id.length > 0 && id.length <= 160;
const point = (row: CargoPlacementRow): CargoPoint => [
  row.originX,
  row.originY,
  row.originZ,
];
const json = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const samePose = (a: CargoPlacementRow, b: CargoPlacementRow) =>
  a.gridId === b.gridId &&
  a.custodyAnchorId === b.custodyAnchorId &&
  a.originX === b.originX &&
  a.originY === b.originY &&
  a.originZ === b.originZ &&
  a.quarterTurns === b.quarterTurns &&
  a.secured === b.secured;

/** Synchronous only: validation completes before the first write. Exceptions
 * from any database write propagate to SpacetimeDB's whole-transaction rollback. */
export function editConstructionCargoGrid(
  ctx: CargoGridContext,
  hooks: CargoGridHooks,
  request: CargoGridRequest,
): CargoGridResult {
  hooks.requireLiveGame(ctx);
  check(
    validId(request.operationId) && validId(request.gridId),
    "Bounded cargo operation/grid identity required",
  );
  check(
    request.edits.length > 0 && request.edits.length <= CARGO_LIMITS.containers,
    "Bounded nonempty cargo batch required",
  );
  const ids = request.edits.map((e) => e.containerId);
  check(
    ids.every(validId) && new Set(ids).size === ids.length,
    "Unique cargo container identities required",
  );
  const row = ctx.db.constructionCargoGrid.id.find(request.gridId);
  check(row, "Cargo grid not found");
  hooks.requireAccess(ctx, row, ids);
  hooks.requireQualifiedGrid(ctx, row);
  const requestJson = json(request),
    receiptId = JSON.stringify([ctx.sender.toHexString(), request.operationId]);
  const receipt = ctx.db.constructionCargoOperation.id.find(receiptId);
  if (receipt) {
    check(
      receipt.requestJson === requestJson,
      "Cargo operation reused with different payload",
    );
    return JSON.parse(receipt.resultJson) as CargoGridResult;
  }
  check(
    row.revision === request.expectedGridRevision,
    "Cargo grid revision conflict",
  );
  check(
    row.gridJson.length <= 131072,
    "Cargo grid document byte budget exceeded",
  );
  check(
    new TextEncoder().encode(row.gridJson).length <= 131072,
    "Cargo grid document byte budget exceeded",
  );
  const grid = JSON.parse(row.gridJson) as CargoGrid;
  check(
    grid.id === row.id && grid.deckId === row.deckId,
    "Published cargo grid identity mismatch",
  );
  const old = bounded(
    ctx.db.constructionCargoPlacement.by_grid.filter(row.id),
    CARGO_LIMITS.containers,
  );
  const planned = new Map(old.map((p) => [p.containerId, { ...p }])),
    writes = new Map<string, CargoPlacementRow>();
  const roots = new Map<string, QualifiedCargoRoot>(),
    catalog = new Map<string, CargoInterface>();
  const resolve = (id: string) => {
    const prior = roots.get(id);
    if (prior) return prior;
    const root = hooks.container(ctx, id);
    check(
      root &&
        root.containerId === id &&
        root.instanceId === row.instanceId &&
        root.deckId === row.deckId,
      "Cargo container is not on the accepted instance/deck",
    );
    check(root.kind === "cargo", "Cargo-only zone rejects equipment");
    check(
      Number.isFinite(root.payloadMassKg) && root.payloadMassKg >= 0,
      "Finite authoritative cargo payload required",
    );
    const approved = hooks.interface(ctx, root.interfaceId);
    check(
      approved &&
        validId(approved.ratingApprovalId) &&
        approved.assetId === root.assetId &&
        approved.assetSha256 === root.assetSha256 &&
        approved.interface.id === root.interfaceId &&
        approved.interface.revision === root.interfaceRevision,
      "Exact qualified cargo interface and ratings required",
    );
    check(approved.interface.kind === "cargo", "Cargo-only interface required");
    roots.set(id, root);
    catalog.set(root.interfaceId, approved.interface);
    return root;
  };
  const asPlacement = (p: CargoPlacementRow): CargoPlacement => {
    const root = resolve(p.containerId);
    check(
      p.instanceId === row.instanceId &&
        p.deckId === row.deckId &&
        p.interfaceId === root.interfaceId &&
        p.interfaceRevision === root.interfaceRevision,
      "Cargo placement binding mismatch",
    );
    return {
      containerId: p.containerId,
      interfaceId: p.interfaceId,
      origin: point(p),
      quarterTurns: p.quarterTurns,
      payloadMassKg: root.payloadMassKg,
      secured: root.secured,
    };
  };
  const before = old.map(asPlacement);
  check(
    validateCargoStack(grid, [...catalog.values()], before).valid,
    "Existing cargo stack is invalid; explicit recovery required",
  );
  const detached: string[] = [];
  const usedAnchors = new Set<string>();
  const detachedBoxes: number[][] = [];
  for (const edit of request.edits) {
    const root = resolve(edit.containerId),
      current = ctx.db.constructionCargoPlacement.containerId.find(
        edit.containerId,
      );
    check(
      root.inventoryRevision === edit.expectedInventoryRevision,
      "Cargo inventory revision conflict",
    );
    check(
      (current?.revision ?? 0n) === edit.expectedPlacementRevision,
      "Cargo placement revision conflict",
    );
    if (edit.kind === "place")
      check(
        root.availableForPlacement &&
          (!current || (!current.gridId && current.custodyAnchorId)),
        "Cargo is already installed; use move/validated cross-grid transfer",
      );
    else check(current?.gridId === row.id, "Cargo is not placed in this grid");
    check(
      !current ||
        (current.instanceId === row.instanceId &&
          current.deckId === row.deckId),
      "Cargo placement belongs to a different instance/deck",
    );
    let origin: CargoPoint,
      quarterTurns: number,
      gridId = row.id,
      custodyAnchorId = "";
    if (edit.kind === "remove") {
      check(
        !usedAnchors.has(edit.destinationAnchorId),
        "Removal anchor cannot hold multiple containers",
      );
      usedAnchors.add(edit.destinationAnchorId);
      check(
        validId(edit.destinationAnchorId),
        "Supported removal destination required",
      );
      const anchor = hooks.stagingAnchor(ctx, edit.destinationAnchorId, root);
      check(
        anchor &&
          anchor.id === edit.destinationAnchorId &&
          anchor.instanceId === row.instanceId &&
          anchor.deckId === row.deckId &&
          anchor.interfaceId === root.interfaceId,
        "Qualified supported removal anchor required",
      );
      origin = anchor.origin;
      quarterTurns = anchor.quarterTurns;
      const dimensions = catalog.get(root.interfaceId)!.size;
      const width = quarterTurns % 2 ? dimensions[1] : dimensions[0];
      const depth = quarterTurns % 2 ? dimensions[0] : dimensions[1];
      const box = [
        ...origin,
        origin[0] + width,
        origin[1] + depth,
        origin[2] + dimensions[2],
      ];
      check(
        !detachedBoxes.some(
          (other) =>
            box[0] < other[3] &&
            box[3] > other[0] &&
            box[1] < other[4] &&
            box[4] > other[1] &&
            box[2] < other[5] &&
            box[5] > other[2],
        ),
        "Removal destinations overlap within this batch",
      );
      detachedBoxes.push(box);
      gridId = "";
      custodyAnchorId = anchor.id;
      planned.delete(edit.containerId);
      detached.push(edit.containerId);
    } else {
      check(
        edit.kind === "move" || edit.kind === "place",
        "Unknown cargo operation",
      );
      origin = edit.origin;
      quarterTurns = edit.quarterTurns;
    }
    check(
      origin.length === 3 &&
        origin.every(
          (n) => Number.isInteger(n) && Math.abs(n) <= CARGO_LIMITS.coordinate,
        ) &&
        Number.isInteger(quarterTurns) &&
        quarterTurns >= 0 &&
        quarterTurns <= 3,
      "Cargo transform must use bounded nominal lattice/quarter turns",
    );
    const next: CargoPlacementRow = {
      containerId: root.containerId,
      instanceId: row.instanceId,
      deckId: row.deckId,
      gridId,
      interfaceId: root.interfaceId,
      interfaceRevision: root.interfaceRevision,
      originX: origin[0],
      originY: origin[1],
      originZ: origin[2],
      quarterTurns,
      secured: root.secured,
      custodyAnchorId,
      revision: (current?.revision ?? 0n) + 1n,
    };
    if (gridId) planned.set(edit.containerId, next);
    if (!current || !samePose(current, next))
      writes.set(edit.containerId, next);
  }
  check(
    planned.size <= CARGO_LIMITS.containers,
    "Cargo grid placement budget exceeded",
  );
  const placements = [...planned.values()].map(asPlacement),
    validation = validateCargoStack(grid, [...catalog.values()], placements);
  check(
    validation.valid,
    "Invalid cargo placement: " +
      validation.diagnostics.map((d) => d.code).join(", "),
  );
  // Do not evict receipts and allow an old operation ID to perform another edit.
  // First slice has an explicit per-principal durable operation quota.
  check(
    bounded(
      ctx.db.constructionCargoOperation.by_principal.filter(ctx.sender),
      4096,
    ).length < 4096,
    "Cargo operation quota reached",
  );
  const result: CargoGridResult = {
    gridId: row.id,
    revision: String(row.revision + (writes.size ? 1n : 0n)),
    changedContainerIds: [...writes.keys()].sort(),
    detachedContainerIds: detached.sort(),
  };
  for (const next of writes.values()) {
    if (ctx.db.constructionCargoPlacement.containerId.find(next.containerId))
      ctx.db.constructionCargoPlacement.containerId.update(next);
    else ctx.db.constructionCargoPlacement.insert(next);
  }
  if (writes.size)
    ctx.db.constructionCargoGrid.id.update({
      ...row,
      revision: row.revision + 1n,
    });
  ctx.db.constructionCargoOperation.insert({
    id: receiptId,
    principal: ctx.sender,
    requestJson,
    resultJson: JSON.stringify(result),
  });
  return result;
}
