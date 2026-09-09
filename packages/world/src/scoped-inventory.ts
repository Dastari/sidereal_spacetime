import {
  SCOPED_INVENTORY_LIMITS,
  checkScopedInventoryRootAccess,
  planScopedInventoryTransfer,
  type InventoryActorAccess,
  type InventoryRootScope,
  type ScopedCharacterInventory,
  type ScopedContainer,
  type ScopedInventoryRejection,
  type ScopedItem,
  type ScopedTransferRequest,
  type TransferReceipt,
} from "@sidereal/sim/scoped-inventory";
import {
  canOccupyDeck,
  type DeckCollisionFrame,
} from "@sidereal/sim/construction-collision";

type Point3 = readonly [number, number, number];
/** Read only from the authenticated actor and current accepted construction row. */
export interface CargoActor {
  id: string;
  principal: string;
  admitted: boolean;
  connected: boolean;
  shipId: string;
  localX: number;
  localY: number;
  supportedHeightM: number;
  supportedStanding: boolean;
}
export interface CargoVisit {
  characterId: string;
  visitId: string;
  instanceId: string;
  deckId: string;
}
export interface CargoInstance {
  id: string;
  ownerPrincipal: string;
  workspaceId: string;
  revision: bigint;
}
/** A future crew admission adapter must mint this only alongside accepted physical
 * entry. Inventory capabilities alone cannot create this proof or a location. */
export interface AcceptedCrewVisit {
  visitId: string;
  characterId: string;
  instanceId: string;
  expiresMicros: bigint;
  revoked: boolean;
}
export interface CargoGrant {
  principal: string;
  resourceId: string;
  capability: "instance.spawn" | "inventory.transfer";
  expiresMicros: bigint;
  revoked: boolean;
}
export interface CargoGeometry {
  instanceRevision: bigint;
  frame: DeckCollisionFrame;
}
/** The ctx.db adapter must perform these indexed reads in the current reducer or
 * view transaction. No callback may resolve actor, position or grants from args. */
export interface CargoAccessReader {
  principal: string;
  nowMicros: bigint;
  actor(): CargoActor | undefined;
  visit(characterId: string): CargoVisit | undefined;
  instance(instanceId: string): CargoInstance | undefined;
  grants(principal: string): Iterable<CargoGrant>;
  acceptedCrewVisit(visitId: string): AcceptedCrewVisit | undefined;
  geometry(instanceId: string, deckId: string): CargoGeometry | undefined;
}
const reject = (
  code: ScopedInventoryRejection["error"]["code"],
  message: string,
): ScopedInventoryRejection => ({ ok: false, error: { code, message } });
function collect<T>(rows: Iterable<T>, limit: number): T[] | undefined {
  const result: T[] = [];
  for (const row of rows) {
    if (result.length === limit) return;
    result.push(row);
  }
  return result;
}
/** Current owner review policy retains its existing workspace instance.spawn
 * grant. Crew access additionally needs BOTH accepted entry and inventory grant.
 * There is deliberately no reducer here that fabricates crew visits. */
export function resolveCargoAccess(
  reader: CargoAccessReader,
): InventoryActorAccess | ScopedInventoryRejection {
  const actor = reader.actor();
  if (
    !actor?.admitted ||
    !actor.connected ||
    actor.principal !== reader.principal
  )
    return reject("not-admitted", "An admitted connected actor is required");
  const visit = reader.visit(actor.id);
  if (
    !visit ||
    visit.characterId !== actor.id ||
    actor.shipId !== visit.instanceId
  )
    return reject("wrong-instance", "Accepted construction entry is required");
  const instance = reader.instance(visit.instanceId);
  if (!instance) return reject("wrong-instance", "Instance unavailable");
  const grants = collect(
    reader.grants(reader.principal),
    SCOPED_INVENTORY_LIMITS.grants,
  );
  if (!grants) return reject("budget", "Relevant grant budget exceeded");
  const active = grants.filter(
    (g) =>
      g.principal === reader.principal &&
      !g.revoked &&
      g.expiresMicros > reader.nowMicros,
  );
  const ownerGrant =
    instance.ownerPrincipal === reader.principal &&
    active.find(
      (g) =>
        g.resourceId === instance.workspaceId &&
        g.capability === "instance.spawn",
    );
  const entry = reader.acceptedCrewVisit(visit.visitId);
  const crewGrant =
    entry &&
    !entry.revoked &&
    entry.expiresMicros > reader.nowMicros &&
    entry.visitId === visit.visitId &&
    entry.characterId === actor.id &&
    entry.instanceId === instance.id &&
    active.find(
      (g) =>
        g.resourceId === instance.id && g.capability === "inventory.transfer",
    );
  const grant = ownerGrant || crewGrant;
  if (!grant)
    return reject(
      "grant-denied",
      "Current review or accepted crew access required",
    );
  if (!actor.supportedStanding)
    return reject("unsupported-pose", "Supported standing pose required");
  const geometry = reader.geometry(instance.id, visit.deckId);
  if (
    !geometry ||
    geometry.instanceRevision !== instance.revision ||
    geometry.frame.shipId !== instance.id ||
    geometry.frame.deckId !== visit.deckId
  )
    return reject(
      "geometry-stale",
      "Current qualified collision frame required",
    );
  if (
    ![actor.localX, actor.localY, actor.supportedHeightM].every(
      Number.isFinite,
    ) ||
    Math.abs(actor.supportedHeightM - geometry.frame.elevationM) > 0.05 ||
    !canOccupyDeck(
      geometry.frame,
      {
        shipId: instance.id,
        deckId: visit.deckId,
        position: [actor.localX, actor.localY],
      },
      0.3,
    )
  )
    return reject(
      "unsupported-pose",
      "Actor must stand on qualified free floor",
    );
  return {
    actorId: actor.id,
    admitted: true,
    connected: true,
    supportedStanding: true,
    instanceId: instance.id,
    deckId: visit.deckId,
    instanceRevision: instance.revision,
    interactionPointM: [actor.localX, actor.localY, actor.supportedHeightM],
    nowMicros: reader.nowMicros,
    grants: [
      {
        actorId: actor.id,
        instanceId: instance.id,
        capability: "inventory.transfer",
        expiresMicros: grant.expiresMicros,
        revoked: false,
      },
    ],
    geometry,
  };
}
/** Qualify an authored approach point against real floor support and current
 * object/wall collision; visual centers and placement origins are not sockets. */
export function qualifyCargoAccessPoint(
  scope: Extract<InventoryRootScope, { kind: "instance" }>,
  geometry: CargoGeometry,
): boolean {
  const p: Point3 = scope.accessPointM;
  return (
    scope.instanceRevision === geometry.instanceRevision &&
    p.every(Number.isFinite) &&
    geometry.frame.shipId === scope.instanceId &&
    geometry.frame.deckId === scope.deckId &&
    Math.abs(p[2] - geometry.frame.elevationM) <= 0.05 &&
    canOccupyDeck(
      geometry.frame,
      {
        shipId: scope.instanceId,
        deckId: scope.deckId,
        position: [p[0], p[1]],
      },
      0.3,
    )
  );
}

/** All methods run synchronously in ONE enclosing SpacetimeDB reducer. Adapters
 * must update original payload + revision sidecar together. No partial-write
 * catch, deferred commit, UUID allocation, or client-submitted plans. */
export interface CargoInventoryReader extends CargoAccessReader {
  characterInventory(characterId: string): ScopedCharacterInventory | undefined;
  rootForContainer(containerId: string): string | undefined;
  containersForRoot(rootContainerId: string): Iterable<ScopedContainer>;
  itemsForRoot(rootContainerId: string): Iterable<ScopedItem>;
  receipt(actorId: string, operationId: string): TransferReceipt | undefined;
  definitions: Parameters<typeof planScopedInventoryTransfer>[3];
  liquidDensity: Parameters<typeof planScopedInventoryTransfer>[4];
}

export interface CargoRepository extends CargoInventoryReader {
  writeItem(item: ScopedItem): void;
  writeContainer(container: ScopedContainer): void;
  writeCharacter(character: ScopedCharacterInventory): void;
  /** Updates descendant membership sidecars and legacy character compatibility
   * indices without replacing payload/energy rows or changing physical nesting. */
  writeRootMembership(
    itemIds: readonly string[],
    containerIds: readonly string[],
    rootContainerId: string,
    scope: InventoryRootScope,
  ): void;
  clearHotbar(characterId: string, itemIds: readonly string[]): void;
  clearAim(characterId: string): void;
  insertReceipt(receipt: TransferReceipt): void;
}
export type CargoTransferResult =
  | ScopedInventoryRejection
  | { ok: true; replay: boolean; receipt: TransferReceipt };

export function transferScopedCargo(
  repo: CargoRepository,
  request: ScopedTransferRequest,
): CargoTransferResult {
  const access = resolveCargoAccess(repo);
  if ("ok" in access) return access;
  const character = repo.characterInventory(access.actorId);
  if (!character || character.characterId !== access.actorId)
    return reject("invalid-state", "Character inventory unavailable");
  const roots = new Set<string>();
  for (const id of [
    character.pocketsId,
    request.sourceContainerId,
    request.destinationContainerId,
  ]) {
    const root = repo.rootForContainer(id);
    if (!root) return reject("missing-container", "Container unavailable");
    roots.add(root);
  }
  const containers: ScopedContainer[] = [],
    items: ScopedItem[] = [];
  for (const root of roots) {
    const cs = collect(
      repo.containersForRoot(root),
      SCOPED_INVENTORY_LIMITS.containers - containers.length,
    );
    const its = collect(
      repo.itemsForRoot(root),
      SCOPED_INVENTORY_LIMITS.items - items.length,
    );
    if (!cs || !its)
      return reject("budget", "Complete inventory tree exceeds work budget");
    const rootRow = cs.find((c) => c.id === root && !c.parentItemId && c.scope);
    if (!rootRow)
      return reject("invalid-state", "Root membership is inconsistent");
    if (
      rootRow.scope!.kind === "instance" &&
      !qualifyCargoAccessPoint(
        rootRow.scope! as Extract<InventoryRootScope, { kind: "instance" }>,
        access.geometry!,
      )
    )
      return reject(
        "geometry-stale",
        "Container approach point is not qualified free floor",
      );
    containers.push(...cs);
    items.push(...its);
  }
  const receipt = repo.receipt(access.actorId, request.operationId);
  const plan = planScopedInventoryTransfer(
    { character, containers, items, receipts: receipt ? [receipt] : [] },
    request,
    access,
    repo.definitions,
    repo.liquidDensity,
  );
  if (!plan.ok) return plan;
  if (plan.replay) return { ok: true, replay: true, receipt: plan.receipt };
  const destinationRootId = repo.rootForContainer(
    request.destinationContainerId,
  )!;
  for (const row of plan.itemUpdates) repo.writeItem(row);
  for (const row of plan.containerUpdates) repo.writeContainer(row);
  if (plan.characterUpdate) repo.writeCharacter(plan.characterUpdate);
  repo.writeRootMembership(
    plan.movedItemIds,
    plan.movedContainerIds,
    destinationRootId,
    plan.destinationRoot,
  );
  if (plan.clearHotbarItemIds.length)
    repo.clearHotbar(access.actorId, plan.clearHotbarItemIds);
  if (plan.clearCombatAim) repo.clearAim(access.actorId);
  repo.insertReceipt(plan.receipt);
  return { ok: true, replay: false, receipt: plan.receipt };
}

/** Minimal keyed projections, deliberately excluding root owner/visit/grants,
 * private instance document, weapon resources, and containers beyond reach.
 * Caller wraps this in the normal gameView admission gate. This exact-root
 * helper can be driven by a private inspected-target row; not client SQL auth. */
export function inspectScopedCargo(
  repo: CargoInventoryReader,
  rootContainerId: string,
) {
  const empty = {
    containers: [] as CargoContainerProjection[],
    items: [] as CargoItemProjection[],
  };
  const access = resolveCargoAccess(repo);
  if (
    "ok" in access ||
    repo.rootForContainer(rootContainerId) !== rootContainerId
  )
    return empty;
  const containers = collect(
    repo.containersForRoot(rootContainerId),
    SCOPED_INVENTORY_LIMITS.containers,
  );
  if (!containers) return empty;
  const root = containers.find(
    (c) => c.id === rootContainerId && !c.parentItemId,
  );
  if (
    root?.scope?.kind !== "instance" ||
    root.lifecycle !== "active" ||
    !checkScopedInventoryRootAccess(root.scope, access).ok ||
    !qualifyCargoAccessPoint(root.scope, access.geometry!)
  )
    return empty;
  const items = collect(
    repo.itemsForRoot(rootContainerId),
    SCOPED_INVENTORY_LIMITS.items,
  );
  if (!items || !validInspectedTree(rootContainerId, containers, items))
    return empty;
  return {
    containers: containers.map(
      ({
        id,
        parentItemId,
        kind,
        width,
        height,
        maxMassKg,
        revision,
      }): CargoContainerProjection => ({
        id,
        parentItemId,
        kind,
        width,
        height,
        maxMassKg,
        revision,
      }),
    ),
    items: items.map(
      ({
        id,
        definitionId,
        containerId,
        x,
        y,
        rotated,
        revision,
      }): CargoItemProjection => ({
        id,
        definitionId,
        containerId,
        x,
        y,
        rotated,
        revision,
      }),
    ),
  };
}
export interface CargoContainerProjection {
  id: string;
  parentItemId: string;
  kind: string;
  width: number;
  height: number;
  maxMassKg: number;
  revision: bigint;
}
export interface CargoItemProjection {
  id: string;
  definitionId: string;
  containerId: string;
  x: number;
  y: number;
  rotated: boolean;
  revision: bigint;
}

/** Fail closed on an incomplete/stale membership migration; never expose another
 * carried tree merely because one sidecar points at a reachable root. */
function validInspectedTree(
  rootId: string,
  containers: readonly ScopedContainer[],
  items: readonly ScopedItem[],
): boolean {
  const cs = new Map(containers.map((c) => [c.id, c])),
    its = new Map(items.map((i) => [i.id, i]));
  if (cs.size !== containers.length || its.size !== items.length) return false;
  for (const container of containers) {
    if (container.lifecycle !== "active") return false;
    const seen = new Set<string>();
    let current: ScopedContainer | undefined = container;
    while (current && current.id !== rootId) {
      if (
        seen.has(current.id) ||
        seen.size >= SCOPED_INVENTORY_LIMITS.depth ||
        current.scope ||
        !current.parentItemId
      )
        return false;
      seen.add(current.id);
      const parent = its.get(current.parentItemId);
      current = parent && cs.get(parent.containerId);
    }
    if (!current || current.parentItemId) return false;
  }
  return items.every(
    (item) =>
      !item.equipmentSlot &&
      !item.equippedByCharacterId &&
      cs.has(item.containerId),
  );
}
