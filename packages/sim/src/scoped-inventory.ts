import {
  validateInventory,
  type GridContainer,
  type GridDefinition,
  type GridItem,
} from "./inventory";
import {
  deckLineOfSight,
  type DeckCollisionFrame,
} from "./construction-collision";
import { inside } from "./layout-geometry";

/** First shared-storage slice: complete bounded working set, never truncated.
 * The authority adapter supplies carried inventory + complete selected root trees.
 * A 14x14 grid does not override the current inventory solver's item-work limit. */
export const SCOPED_INVENTORY_LIMITS = Object.freeze({
  items: 128,
  containers: 152,
  definitions: 256,
  grants: 64,
  receipts: 256,
  depth: 6,
  reachM: 1.8,
});
type Point3 = readonly [number, number, number];
export type InventoryRootScope =
  | { kind: "character"; characterId: string }
  | {
      kind: "instance";
      instanceId: string;
      deckId: string;
      placedObjectId: string;
      instanceRevision: bigint;
      accessPointM: Point3;
    };
export interface ScopedContainer extends GridContainer {
  name?: string;
  revision: bigint;
  /** Root-only ownership. Nested contents follow the actual containment tree. */
  scope?: InventoryRootScope;
  lifecycle: "active" | "removed";
}
export interface ScopedItem extends GridItem {
  revision: bigint;
  equippedByCharacterId?: string;
}
export interface ScopedCharacterInventory {
  characterId: string;
  pocketsId: string;
  revision: bigint;
  carryLimitKg: number;
}
export interface TransferReceipt {
  actorId: string;
  operationId: string;
  request: string;
  itemId: string;
  sourceContainerId: string;
  destinationContainerId: string;
  resultingItemRevision: bigint;
}
export interface ScopedInventoryState {
  items: readonly ScopedItem[];
  containers: readonly ScopedContainer[];
  character: ScopedCharacterInventory;
  /** Actor-scoped durable receipts, or an exact indexed receipt lookup. */
  receipts: readonly TransferReceipt[];
}
/** These are server-resolved facts, NEVER fields copied from the move request.
 * This slice uses an explicit inventory grant; owning a ship or room label is
 * not a substitute. The compiler frame includes current closed doors. */
export interface InventoryActorAccess {
  actorId: string;
  admitted: boolean;
  connected: boolean;
  supportedStanding: boolean;
  instanceId: string;
  deckId: string;
  instanceRevision: bigint;
  interactionPointM: Point3;
  nowMicros: bigint;
  /** Current exact game-owned binding, resolved only by server access adapter. */
  ownedGameVisit?: boolean;
  grants: readonly {
    actorId: string;
    instanceId: string;
    capability: "inventory.transfer";
    expiresMicros: bigint;
    revoked: boolean;
  }[];
  geometry?: { instanceRevision: bigint; frame: DeckCollisionFrame };
}
export interface ScopedTransferRequest {
  operationId: string;
  itemId: string;
  expectedItemRevision: bigint;
  sourceContainerId: string;
  expectedSourceRevision: bigint;
  destinationContainerId: string;
  expectedDestinationRevision: bigint;
  expectedCharacterRevision: bigint;
  x: number;
  y: number;
  rotated: boolean;
}
export type ScopedInventoryErrorCode =
  | "invalid-request"
  | "invalid-state"
  | "budget"
  | "not-admitted"
  | "unsupported-pose"
  | "missing-item"
  | "missing-container"
  | "removed-container"
  | "wrong-owner"
  | "wrong-instance"
  | "wrong-deck"
  | "grant-denied"
  | "geometry-stale"
  | "out-of-reach"
  | "line-of-sight"
  | "liquid-container"
  | "revision-conflict"
  | "replay-conflict"
  | "inventory-invalid";
export interface ScopedInventoryRejection {
  ok: false;
  error: { code: ScopedInventoryErrorCode; message: string };
}
export interface ScopedTransferPlan {
  ok: true;
  replay: boolean;
  receipt: TransferReceipt;
  /** Write these changes + the receipt in ONE authoritative transaction. */
  itemUpdates: readonly ScopedItem[];
  containerUpdates: readonly ScopedContainer[];
  characterUpdate?: ScopedCharacterInventory;
  /** Descendant identity list for adapter scope-index maintenance, not new IDs. */
  movedItemIds: readonly string[];
  movedContainerIds: readonly string[];
  clearHotbarItemIds: readonly string[];
  clearCombatAim: boolean;
  destinationRoot: InventoryRootScope;
}
class Reject extends Error {
  constructor(
    readonly code: ScopedInventoryErrorCode,
    message: string,
  ) {
    super(message);
  }
}
function demand(
  value: unknown,
  code: ScopedInventoryErrorCode,
  message: string,
): asserts value {
  if (!value) throw new Reject(code, message);
}
const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128;
const validRevision = (value: unknown): value is bigint =>
  typeof value === "bigint" && value >= 1n && value < (1n << 64n) - 1n;
const point = (p: Point3) =>
  p.length === 3 && p.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6);
const requestKey = (r: ScopedTransferRequest) =>
  JSON.stringify([
    "scoped-inventory-transfer-v1",
    r.operationId,
    r.itemId,
    String(r.expectedItemRevision),
    r.sourceContainerId,
    String(r.expectedSourceRevision),
    r.destinationContainerId,
    String(r.expectedDestinationRevision),
    String(r.expectedCharacterRevision),
    r.x,
    r.y,
    r.rotated,
  ]);

/** Closed segment intersection, including touching/collinear blocker edges. */
function edgesMeet(
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  d: readonly number[],
) {
  const cross = (
    p: readonly number[],
    q: readonly number[],
    r: readonly number[],
  ) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const on = (
    p: readonly number[],
    q: readonly number[],
    r: readonly number[],
  ) =>
    Math.abs(cross(p, q, r)) <= 1e-9 &&
    r[0] >= Math.min(p[0], q[0]) - 1e-9 &&
    r[0] <= Math.max(p[0], q[0]) + 1e-9 &&
    r[1] >= Math.min(p[1], q[1]) - 1e-9 &&
    r[1] <= Math.max(p[1], q[1]) + 1e-9;
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
function canSee(frame: DeckCollisionFrame, from: Point3, to: Point3) {
  const a: [number, number] = [from[0], from[1]],
    b: [number, number] = [to[0], to[1]];
  if (
    !deckLineOfSight(
      frame,
      { shipId: frame.shipId, deckId: frame.deckId, position: a },
      { shipId: frame.shipId, deckId: frame.deckId, position: b },
    )
  )
    return false;
  // Structural LOS already handles wall thickness. It only tests obstacle
  // endpoints, so explicitly reject crossing a placed-object footprint as well.
  return !frame.obstacles.some(
    (o) =>
      inside(a, o.vertices) ||
      inside(b, o.vertices) ||
      o.vertices.some((v, i) =>
        edgesMeet(a, b, v, o.vertices[(i + 1) % o.vertices.length]),
      ),
  );
}
function rootAccess(scope: InventoryRootScope, access: InventoryActorAccess) {
  if (scope.kind === "character") {
    demand(
      scope.characterId === access.actorId,
      "wrong-owner",
      "Carried storage belongs to another character",
    );
    return;
  }
  demand(
    scope.instanceId === access.instanceId,
    "wrong-instance",
    "Container is in another instance",
  );
  demand(
    scope.deckId === access.deckId,
    "wrong-deck",
    "Container is on another deck",
  );
  demand(
    access.ownedGameVisit === true ||
      access.grants.some(
        (g) =>
          g.actorId === access.actorId &&
          g.instanceId === scope.instanceId &&
          g.capability === "inventory.transfer" &&
          !g.revoked &&
          g.expiresMicros > access.nowMicros,
      ),
    "grant-denied",
    "Current instance inventory grant required",
  );
  const geometry = access.geometry;
  demand(
    geometry &&
      geometry.instanceRevision === access.instanceRevision &&
      scope.instanceRevision === access.instanceRevision &&
      geometry.frame.shipId === scope.instanceId &&
      geometry.frame.deckId === scope.deckId,
    "geometry-stale",
    "Current authoritative deck geometry required",
  );
  demand(
    point(scope.accessPointM) && point(access.interactionPointM),
    "invalid-state",
    "Invalid inventory access point",
  );
  demand(
    Math.hypot(
      ...scope.accessPointM.map((v, i) => v - access.interactionPointM[i]),
    ) <= SCOPED_INVENTORY_LIMITS.reachM,
    "out-of-reach",
    "Move within reach of the container access point",
  );
  demand(
    canSee(geometry.frame, access.interactionPointM, scope.accessPointM),
    "line-of-sight",
    "Container access is obstructed",
  );
}

/** Shared view/reducer root gate. Views must resolve these same server facts;
 * subscription filters and selection do not authorize contents. */
export function checkScopedInventoryRootAccess(
  scope: InventoryRootScope,
  access: InventoryActorAccess,
): { ok: true } | ScopedInventoryRejection {
  try {
    demand(
      access.admitted && access.connected,
      "not-admitted",
      "Current admitted character required",
    );
    demand(
      access.supportedStanding,
      "unsupported-pose",
      "Supported standing pose required",
    );
    demand(
      typeof access.nowMicros === "bigint" &&
        access.nowMicros >= 0n &&
        point(access.interactionPointM),
      "invalid-state",
      "Invalid authoritative access state",
    );
    demand(
      access.grants.length <= SCOPED_INVENTORY_LIMITS.grants,
      "budget",
      "Relevant grant budget exceeded",
    );
    rootAccess(scope, access);
    return { ok: true };
  } catch (error) {
    if (error instanceof Reject)
      return { ok: false, error: { code: error.code, message: error.message } };
    throw error;
  }
}

/** Pure validated transaction plan. Reads/authorization precede receipt replay;
 * stale grants/deck/LOS cannot make an old request an access bypass. No mutation
 * occurs on failure. Adapter must never accept a client-supplied plan/snapshot. */
export function planScopedInventoryTransfer(
  state: ScopedInventoryState,
  request: ScopedTransferRequest,
  access: InventoryActorAccess,
  definitions: readonly GridDefinition[],
  liquidDensity: Readonly<Record<string, number>>,
): ScopedTransferPlan | ScopedInventoryRejection {
  try {
    demand(
      state.items.length <= SCOPED_INVENTORY_LIMITS.items &&
        state.containers.length <= SCOPED_INVENTORY_LIMITS.containers &&
        definitions.length <= SCOPED_INVENTORY_LIMITS.definitions &&
        state.receipts.length <= SCOPED_INVENTORY_LIMITS.receipts &&
        access.grants.length <= SCOPED_INVENTORY_LIMITS.grants,
      "budget",
      "Inventory working set exceeds its admission budget",
    );
    demand(
      validId(request.operationId) &&
        validId(request.itemId) &&
        validId(request.sourceContainerId) &&
        validId(request.destinationContainerId) &&
        [
          request.expectedItemRevision,
          request.expectedSourceRevision,
          request.expectedDestinationRevision,
          request.expectedCharacterRevision,
        ].every(validRevision) &&
        Number.isInteger(request.x) &&
        Number.isInteger(request.y) &&
        typeof request.rotated === "boolean",
      "invalid-request",
      "Invalid inventory transfer request",
    );
    demand(
      access.admitted &&
        access.connected &&
        access.actorId === state.character.characterId,
      "not-admitted",
      "Current admitted character required",
    );
    demand(
      access.supportedStanding,
      "unsupported-pose",
      "Finish traversal or leave the seat before transferring items",
    );
    demand(
      typeof access.nowMicros === "bigint" &&
        access.nowMicros >= 0n &&
        point(access.interactionPointM),
      "invalid-state",
      "Invalid authoritative access state",
    );
    const items = new Map(state.items.map((i) => [i.id, i])),
      containers = new Map(state.containers.map((c) => [c.id, c]));
    demand(
      items.size === state.items.length &&
        containers.size === state.containers.length &&
        definitions.length === new Set(definitions.map((d) => d.id)).size,
      "invalid-state",
      "Duplicate inventory identity or definition",
    );
    demand(
      state.items.every((i) => validId(i.id) && validRevision(i.revision)) &&
        state.containers.every(
          (c) =>
            validId(c.id) &&
            validRevision(c.revision) &&
            Number.isFinite(c.maxMassKg) &&
            c.maxMassKg >= 0,
        ) &&
        validRevision(state.character.revision) &&
        Number.isFinite(state.character.carryLimitKg) &&
        state.character.carryLimitKg >= 0 &&
        definitions.every(
          (d) =>
            validId(d.id) &&
            Number.isInteger(d.width) &&
            d.width > 0 &&
            Number.isInteger(d.height) &&
            d.height > 0 &&
            Number.isFinite(d.massKg) &&
            d.massKg >= 0,
        ) &&
        Object.values(liquidDensity).every((v) => Number.isFinite(v) && v > 0),
      "invalid-state",
      "Invalid inventory definition or revision",
    );
    const pathToRoot = (id: string): ScopedContainer[] => {
      const result: ScopedContainer[] = [];
      while (true) {
        demand(
          result.length <= SCOPED_INVENTORY_LIMITS.depth &&
            !result.some((r) => r.id === id),
          "inventory-invalid",
          "Container cycle or nesting limit",
        );
        const c = containers.get(id);
        demand(c, "missing-container", "Container unavailable");
        demand(
          c.lifecycle === "active",
          "removed-container",
          "Container is no longer active",
        );
        result.push(c);
        if (!c.parentItemId) {
          demand(
            c.scope &&
              (c.scope.kind === "character" || c.scope.kind === "instance"),
            "invalid-state",
            "Root container scope missing",
          );
          return result;
        }
        demand(
          !c.scope,
          "invalid-state",
          "Nested container cannot override root ownership",
        );
        const parent = items.get(c.parentItemId);
        demand(parent, "invalid-state", "Container parent item missing");
        if (parent.equipmentSlot) {
          demand(
            parent.equippedByCharacterId === access.actorId,
            "wrong-owner",
            "Equipped container belongs to another character",
          );
          id = state.character.pocketsId;
        } else id = parent.containerId;
      }
    };
    const sourcePath = pathToRoot(request.sourceContainerId),
      destinationPath = pathToRoot(request.destinationContainerId);
    const source = sourcePath[0],
      destination = destinationPath[0],
      destinationRoot = destinationPath[destinationPath.length - 1].scope!;
    rootAccess(sourcePath[sourcePath.length - 1].scope!, access);
    rootAccess(destinationRoot, access);
    demand(
      source.kind === "grid" && destination.kind === "grid",
      "liquid-container",
      "Solid item transfers require non-liquid containers",
    );
    const key = requestKey(request),
      priorReceipt = state.receipts.find(
        (r) =>
          r.actorId === access.actorId && r.operationId === request.operationId,
      );
    if (priorReceipt) {
      demand(
        priorReceipt.request === key,
        "replay-conflict",
        "Operation ID was used for another request",
      );
      return {
        ok: true,
        replay: true,
        receipt: priorReceipt,
        itemUpdates: [],
        containerUpdates: [],
        movedItemIds: [],
        movedContainerIds: [],
        clearHotbarItemIds: [],
        clearCombatAim: false,
        destinationRoot,
      };
    }

    demand(
      source.revision === request.expectedSourceRevision &&
        destination.revision === request.expectedDestinationRevision &&
        state.character.revision === request.expectedCharacterRevision,
      "revision-conflict",
      "Inventory changed; refresh before retrying",
    );
    const item = items.get(request.itemId);
    demand(item, "missing-item", "Item unavailable");
    const equipped = !!item.equipmentSlot;
    demand(
      equipped
        ? item.equippedByCharacterId === access.actorId &&
            request.sourceContainerId === state.character.pocketsId
        : item.containerId === request.sourceContainerId,
      "wrong-owner",
      "Item is not in the requested source",
    );
    demand(
      item.revision === request.expectedItemRevision,
      "revision-conflict",
      "Inventory changed; refresh before retrying",
    );
    const movedItemIds: string[] = [],
      movedContainerIds: string[] = [];
    const descend = (id: string, depth: number) => {
      demand(
        depth <= SCOPED_INVENTORY_LIMITS.depth && !movedItemIds.includes(id),
        "inventory-invalid",
        "Container cycle or nesting limit",
      );
      movedItemIds.push(id);
      for (const child of state.containers.filter(
        (c) => c.parentItemId === id,
      )) {
        demand(
          child.lifecycle === "active" && !child.scope,
          "invalid-state",
          "Moved nested container is inactive or overrides root ownership",
        );
        movedContainerIds.push(child.id);
        for (const member of state.items.filter(
          (i) => i.containerId === child.id,
        ))
          descend(member.id, depth + 1);
      }
    };
    descend(item.id, 0);
    demand(
      !movedContainerIds.includes(destination.id),
      "inventory-invalid",
      "A container item cannot contain itself",
    );
    const nextItem: ScopedItem = {
      ...item,
      containerId: destination.id,
      equipmentSlot: "",
      equippedByCharacterId: undefined,
      x: request.x,
      y: request.y,
      rotated: request.rotated,
      revision: item.revision + 1n,
    };
    try {
      validateInventory(
        {
          items: state.items.map((i) => (i.id === item.id ? nextItem : i)),
          containers: state.containers,
        },
        definitions,
        liquidDensity,
        state.character.pocketsId,
        state.character.carryLimitKg,
      );
    } catch {
      throw new Reject(
        "inventory-invalid",
        "Transfer violates placement, nesting, payload or carry limits",
      );
    }
    const changedContainers = new Map(
      [
        ...sourcePath,
        ...destinationPath,
        ...movedContainerIds.map((id) => containers.get(id)!),
      ].map((c) => [c.id, c]),
    );
    const containerUpdates = [...changedContainers.values()].map((c) => ({
      ...c,
      revision: c.revision + 1n,
    }));
    const characterUpdate = {
      ...state.character,
      revision: state.character.revision + 1n,
    };
    const receipt: TransferReceipt = {
      actorId: access.actorId,
      operationId: request.operationId,
      request: key,
      itemId: item.id,
      sourceContainerId: source.id,
      destinationContainerId: destination.id,
      resultingItemRevision: nextItem.revision,
    };
    return {
      ok: true,
      replay: false,
      receipt,
      itemUpdates: [nextItem],
      containerUpdates,
      characterUpdate,
      movedItemIds,
      movedContainerIds,
      clearHotbarItemIds:
        destinationRoot.kind === "instance" ? movedItemIds : [],
      clearCombatAim: item.equipmentSlot === "hand",
      destinationRoot,
    };
  } catch (error) {
    if (error instanceof Reject)
      return { ok: false, error: { code: error.code, message: error.message } };
    return {
      ok: false,
      error: {
        code: "invalid-state",
        message: "Invalid bounded inventory state",
      },
    };
  }
}
