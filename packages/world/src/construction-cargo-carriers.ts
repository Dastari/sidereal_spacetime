import { SenderError } from "spacetimedb/server";
import {
  CARGO_CARRIER_GAMEPLAY,
  CARGO_CARRIER_REVISION,
  CARGO_CARRIER_SOURCE,
} from "@sidereal/content/cargo-carriers";
import { inventoryMass } from "@sidereal/sim/inventory";
import { checkScopedInventoryRootAccess } from "@sidereal/sim/scoped-inventory";
import {
  carrierInterface,
  cargoAssemblyTransforms,
  requireSecuredCargoAssembly,
  type SecuredCargoAssembly,
} from "@sidereal/sim/cargo-carrier-assembly";
import {
  applyCargoCarrierCollision,
  withoutAdoptedCargo,
  type CargoCollisionBinding,
} from "@sidereal/sim/cargo-carrier-collision";
import { planCargoCarrierHandling } from "@sidereal/sim/cargo-carrier-handling";
import {
  validateCargoStack,
  type CargoGrid,
  type CargoPlacement,
  type CargoPoint,
} from "@sidereal/sim/construction-cargo";
import { readCargo, type moveScopedCargo } from "./scoped-inventory-authority";
import {
  inspectScopedCargo,
  qualifyCargoAccessPoint,
  resolveCargoAccess,
} from "./scoped-inventory";
import {
  editConstructionCargoGrid,
  type CargoGridDatabase,
  type CargoGridHooks,
  type CargoGridRequest,
  type CargoGridRow,
  type CargoPlacementRow,
} from "./construction-cargo-grid";
import type { DeckCollisionFrame } from "@sidereal/sim/construction-collision";
import { cargoCarrierAccessPoint } from "@sidereal/sim/cargo-carrier-access";
export { cargoCarrierAccessPoint } from "@sidereal/sim/cargo-carrier-access";
import { withCargoCarrierApproaches } from "./construction-cargo-access";
import { requireGame } from "./auth";
import { CARGO_HANDLING_FIXTURE } from "@sidereal/content/cargo-handling-fixture";
import { stableStringify } from "@sidereal/sim/layout-geometry";

type BaseContext = Parameters<typeof moveScopedCargo>[0];
type AssemblyRow = Omit<SecuredCargoAssembly, "carrierSize" | "lifecycle"> & {
  carrierSize: string;
  lifecycle: string;
};
interface AssemblyTable {
  containerId: {
    find(id: string): AssemblyRow | undefined | null;
    update(row: AssemblyRow): unknown;
  };
  insert(row: AssemblyRow): unknown;
  by_instance: { filter(id: string): Iterable<AssemblyRow> };
}
export type CargoCarrierContext = Omit<BaseContext, "db"> & {
  db: BaseContext["db"] &
    CargoGridDatabase & {
      constructionCargoAssembly: AssemblyTable;
      constructionCargoGrid: CargoGridDatabase["constructionCargoGrid"] & {
        insert(row: CargoGridRow): unknown;
        by_instance: { filter(id: string): Iterable<CargoGridRow> };
      };
    };
};
type InventoryReadContext = Parameters<typeof readCargo>[0];
export type CargoCarrierReadContext = Omit<InventoryReadContext, "db"> & {
  db: InventoryReadContext["db"] & {
    constructionCargoAssembly: {
      containerId: Pick<AssemblyTable["containerId"], "find">;
      by_instance: AssemblyTable["by_instance"];
    };
    constructionCargoPlacement: {
      containerId: Pick<
        CargoGridDatabase["constructionCargoPlacement"]["containerId"],
        "find"
      >;
      by_grid: CargoGridDatabase["constructionCargoPlacement"]["by_grid"];
    };
    constructionCargoGrid: {
      id: Pick<CargoGridDatabase["constructionCargoGrid"]["id"], "find">;
    };
  };
};
function fail(message: string): never {
  throw new SenderError(message);
}
const bounded = <T>(rows: Iterable<T>, limit: number): T[] => {
  const out: T[] = [];
  for (const row of rows) {
    if (out.length >= limit) fail("Cargo carrier work budget exceeded");
    out.push(row);
  }
  return out;
};
export function cargoAssembly(row: AssemblyRow): SecuredCargoAssembly {
  if (
    !["oneMetre", "twoMetre"].includes(row.carrierSize) ||
    !["active", "detached"].includes(row.lifecycle)
  )
    fail("Unsupported persisted carrier assembly");
  const value = row as SecuredCargoAssembly;
  requireSecuredCargoAssembly(value);
  return value;
}
function source(ctx: CargoCarrierReadContext, containerId: string) {
  const raw = ctx.db.constructionCargoAssembly.containerId.find(containerId);
  if (!raw) return;
  const assembly = cargoAssembly(raw),
    root = ctx.db.inventoryContainer.id.find(containerId),
    membership = ctx.db.inventoryContainerScope.containerId.find(containerId);
  if (
    !root ||
    root.parentItemId ||
    root.kind !== "grid" ||
    root.carried ||
    !membership ||
    membership.rootKind !== "instance" ||
    membership.rootContainerId !== containerId ||
    membership.lifecycle !== "active" ||
    membership.instanceId !== assembly.instanceId ||
    membership.deckId !== assembly.deckId ||
    membership.placedObjectId !== assembly.placedObjectId
  )
    fail("Cargo carrier root binding mismatch");
  return { assembly, root, membership };
}
/** Indexed bounded inventory read, including nested bags and liquid mass. */
export function cargoCarrierPayloadMass(
  ctx: CargoCarrierReadContext,
  containerId: string,
) {
  const reader = readCargo(ctx),
    containers = bounded(reader.containersForRoot(containerId), 152),
    items = bounded(reader.itemsForRoot(containerId), 128);
  if (!containers.some((c) => c.id === containerId && !c.parentItemId))
    fail("Cargo root is unavailable");
  for (const container of containers) {
    if (container.kind !== "liquid") continue;
    const density = reader.liquidDensity[container.liquidType];
    if (
      !Number.isFinite(container.capacityLitres) ||
      container.capacityLitres < 0 ||
      !Number.isFinite(container.amountLitres) ||
      container.amountLitres < 0 ||
      container.amountLitres > container.capacityLitres ||
      (container.amountLitres > 0 &&
        (!Number.isFinite(density) || density! <= 0))
    )
      fail("Invalid authoritative liquid mass");
  }
  const mass = inventoryMass(
    { containers, items },
    reader.definitions,
    reader.liquidDensity,
  ).containerMass(containerId);
  if (!Number.isFinite(mass) || mass < 0)
    fail("Invalid authoritative cargo mass");
  return mass;
}
function placement(
  ctx: CargoCarrierReadContext,
  p: CargoPlacementRow,
): CargoPlacement {
  const s = source(ctx, p.containerId);
  if (
    !s ||
    s.assembly.instanceId !== p.instanceId ||
    s.assembly.deckId !== p.deckId ||
    carrierInterface(s.assembly.carrierSize).id !== p.interfaceId ||
    p.interfaceRevision !== CARGO_CARRIER_REVISION
  )
    fail("Cargo placement binding is stale");
  return {
    containerId: p.containerId,
    interfaceId: p.interfaceId,
    origin: [p.originX, p.originY, p.originZ],
    quarterTurns: p.quarterTurns,
    payloadMassKg: cargoCarrierPayloadMass(ctx, p.containerId),
    secured: s.assembly.upperFrameLocked,
  };
}
/** Call after a scoped transfer inside its reducer transaction. A failure must
 * propagate so inventory, revisions and the receipt all roll back together. */
export function assertCargoStackMass(
  ctx: CargoCarrierReadContext,
  rootContainerIds: readonly string[],
) {
  const grids = new Set<string>();
  for (const id of rootContainerIds) {
    const p = ctx.db.constructionCargoPlacement.containerId.find(id);
    if (p?.gridId) grids.add(p.gridId);
    else if (p) {
      const s = source(ctx, id);
      if (!s) fail("Detached cargo assembly missing");
      const d = carrierInterface(s.assembly.carrierSize);
      if (cargoCarrierPayloadMass(ctx, id) + d.tareMassKg > d.maxGrossMassKg)
        fail("Detached cargo assembly gross load exceeded");
    }
  }
  for (const id of grids) {
    const gridRow = ctx.db.constructionCargoGrid.id.find(id);
    if (!gridRow) fail("Carrier cargo grid missing");
    const rows = bounded(
      ctx.db.constructionCargoPlacement.by_grid.filter(id),
      256,
    );
    const result = validateCargoStack(
      JSON.parse(gridRow.gridJson) as CargoGrid,
      [carrierInterface("oneMetre"), carrierInterface("twoMetre")],
      rows.map((p) => placement(ctx, p)),
    );
    if (!result.valid)
      fail(
        "Cargo stack mass/support rejected: " +
          result.diagnostics.map((d) => d.code).join(","),
      );
  }
}

/** Actual dynamic physics overlay; caller appends it after native doors/refit
 * attachments. No cache can ignore these independent placement revisions. */
export function cargoCarrierCollision(
  ctx: Pick<CargoCarrierReadContext, "db">,
  frame: DeckCollisionFrame,
): DeckCollisionFrame {
  const assemblies = bounded(
    ctx.db.constructionCargoAssembly.by_instance.filter(frame.shipId),
    256,
  ).filter((a) => a.deckId === frame.deckId);
  const bindings: CargoCollisionBinding[] = assemblies.flatMap((raw) => {
    const a = cargoAssembly(raw),
      p = ctx.db.constructionCargoPlacement.containerId.find(a.containerId);
    return p
      ? [
          {
            assembly: a,
            placement: {
              containerId: p.containerId,
              interfaceId: p.interfaceId,
              origin: [p.originX, p.originY, p.originZ] as CargoPoint,
              quarterTurns: p.quarterTurns,
              payloadMassKg: 0,
              secured: a.upperFrameLocked,
            },
            revision: p.revision,
          },
        ]
      : [];
  });
  return applyCargoCarrierCollision(frame, bindings);
}

/** No disposal/removal reducer yet: moving between qualified cells preserves the
 * same locked payload+carrier assembly and every inventory row. */
export function moveCargoCarriers(
  ctx: CargoCarrierContext,
  request: CargoGridRequest,
) {
  requireGame(ctx);
  if (request.edits.length !== 1)
    fail(
      "Move one secured carrier at a time; unload its supported cargo first",
    );
  const reader = withCargoCarrierApproaches(
      ctx,
      readCargo(ctx, ctx.timestamp.microsSinceUnixEpoch),
    ),
    access = resolveCargoAccess(reader);
  if ("ok" in access) fail(access.error.message);
  const actor = ctx.db.character.id.find(access.actorId),
    motion = actor && ctx.db.shipWorldMotion.shipId.find(actor.shipId);
  const staticFixture =
    actor &&
    ctx.db.constructionInstance.id.find(actor.shipId)?.blueprintSha256 ===
      CARGO_HANDLING_FIXTURE.sha256;
  if (
    (!motion && !staticFixture) ||
    (motion &&
      (Math.hypot(motion.vx, motion.vy) > 0.0001 ||
        Math.abs(motion.omega) > 0.0001))
  )
    fail("Cargo rearrangement requires a stationary ship");
  const hooks: CargoGridHooks = {
    requireLiveGame: () => {
      if (!ctx.connectionId) fail("Active game connection required");
    },
    requireAccess: (_c, row, ids) => {
      if (row.instanceId !== access.instanceId || row.deckId !== access.deckId)
        fail("Cargo belongs to another accepted deck");
      for (const id of ids)
        if (!inspectScopedCargo(reader, id).containers.some((c) => c.id === id))
          fail("Cargo source requires current reach, line of sight and access");
      for (const edit of request.edits) {
        if (edit.kind === "remove")
          fail(
            "Use a qualified staging transfer; deletion is not a cargo destination",
          );
        const s = source(ctx, edit.containerId);
        if (!s) fail("Secured carrier missing");
        const point = cargoCarrierAccessPoint(
          s.assembly,
          edit.origin,
          edit.quarterTurns,
          access.geometry?.frame,
          [access.interactionPointM[0], access.interactionPointM[1]],
        );
        const scope = {
          kind: "instance" as const,
          instanceId: row.instanceId,
          deckId: row.deckId,
          placedObjectId: s.assembly.placedObjectId,
          instanceRevision: access.instanceRevision,
          accessPointM: point,
        };
        const admission = checkScopedInventoryRootAccess(scope, access);
        if (
          !admission.ok ||
          !access.geometry ||
          !qualifyCargoAccessPoint(scope, access.geometry)
        )
          fail("Cargo destination requires supported reach and line of sight");
      }
    },
    requireQualifiedGrid: (_c, row) => {
      if (row.definitionSha256 !== CARGO_GRID_DEFINITION)
        fail("Qualified cargo grid revision required");
      const { id, deckId, ...definition } = JSON.parse(
        row.gridJson,
      ) as CargoGrid;
      if (
        id !== row.id ||
        deckId !== row.deckId ||
        stableStringify(definition) !==
          stableStringify(CARGO_HANDLING_FIXTURE.grid)
      )
        fail("Cargo grid definition differs from its qualified source");
    },
    container: (_c, id) => {
      const s = source(ctx, id);
      if (!s) return;
      return {
        containerId: id,
        instanceId: s.assembly.instanceId,
        deckId: s.assembly.deckId,
        inventoryRevision: s.membership.revision,
        assetId: CARGO_CARRIER_SOURCE[s.assembly.carrierSize].id,
        assetSha256: CARGO_CARRIER_SOURCE[s.assembly.carrierSize].glbSha256,
        interfaceId: carrierInterface(s.assembly.carrierSize).id,
        interfaceRevision: CARGO_CARRIER_REVISION,
        payloadMassKg: cargoCarrierPayloadMass(ctx, id),
        secured: s.assembly.upperFrameLocked,
        kind: "cargo",
        availableForPlacement: s.assembly.lifecycle === "detached",
      };
    },
    interface: (_c, id) => {
      const size =
        id === "carrier-1m"
          ? "oneMetre"
          : id === "carrier-2m"
            ? "twoMetre"
            : undefined;
      if (!size) return;
      const s = CARGO_CARRIER_SOURCE[size];
      return {
        assetId: s.id,
        assetSha256: s.glbSha256,
        ratingApprovalId: CARGO_CARRIER_GAMEPLAY,
        interface: carrierInterface(size),
      };
    },
    stagingAnchor: () => undefined,
    beforeCommit: (_c, row, planned) => {
      if (!access.geometry) fail("Current cargo collision frame required");
      const installed = bounded(
        ctx.db.constructionCargoAssembly.by_instance.filter(row.instanceId),
        256,
      ).filter((a) => a.deckId === row.deckId);
      const structure = withoutAdoptedCargo(
        access.geometry.frame,
        installed.flatMap((a) => [
          a.placedObjectId,
          `cargo-carrier:${a.carrierId}`,
        ]),
      );
      const previous = bounded(
        ctx.db.constructionCargoPlacement.by_grid.filter(row.id),
        256,
      );
      const edit = request.edits[0]!,
        next = planned.find((p) => p.containerId === edit.containerId),
        old = previous.find((p) => p.containerId === edit.containerId);
      if (!old || !next)
        fail(
          "Carrier requires an installed source and destination; no unqualified staging teleport",
        );
      if (
        old.originX !== next.originX ||
        old.originY !== next.originY ||
        old.originZ !== next.originZ ||
        old.quarterTurns !== next.quarterTurns
      )
        planCargoCarrierHandling({
          grid: JSON.parse(row.gridJson) as CargoGrid,
          interfaces: [
            carrierInterface("oneMetre"),
            carrierInterface("twoMetre"),
          ],
          placements: previous.map((p) => placement(ctx, p)),
          containerId: edit.containerId,
          target: placement(ctx, next),
          structure,
        });
      const finalFrame = applyCargoCarrierCollision(
        structure,
        planned.map((p) => ({
          assembly: source(ctx, p.containerId)!.assembly,
          placement: placement(ctx, p),
          revision: p.revision,
        })),
      );
      const targetAssembly = source(ctx, next.containerId)!.assembly,
        targetPoint = cargoCarrierAccessPoint(
          targetAssembly,
          [next.originX, next.originY, next.originZ],
          next.quarterTurns,
          finalFrame,
          [access.interactionPointM[0], access.interactionPointM[1]],
        );
      const targetScope = {
        kind: "instance" as const,
        instanceId: row.instanceId,
        deckId: row.deckId,
        placedObjectId: targetAssembly.placedObjectId,
        instanceRevision: access.instanceRevision,
        accessPointM: targetPoint,
      };
      if (
        !checkScopedInventoryRootAccess(targetScope, {
          ...access,
          geometry: { ...access.geometry, frame: finalFrame },
        }).ok ||
        !qualifyCargoAccessPoint(targetScope, {
          ...access.geometry,
          frame: finalFrame,
        })
      )
        fail("Cargo destination blocks its supported access point");
      const actors = bounded(
        ctx.db.constructionLocation.by_instance.filter(row.instanceId),
        256,
      )
        .filter((l) => l.deckId === row.deckId)
        .map((l) => ctx.db.character.id.find(l.characterId))
        .filter((a) => !!a);
      for (const p of planned) {
        const s = source(ctx, p.containerId);
        if (!s) fail("Carrier payload missing");
        const width = carrierInterface(s.assembly.carrierSize).size[0] / 32,
          x = p.originX / 32,
          y = p.originY / 32;
        for (const a of actors) {
          const dx = Math.max(x - a.localX, 0, a.localX - x - width),
            dy = Math.max(y - a.localY, 0, a.localY - y - width);
          if (Math.hypot(dx, dy) < 0.3)
            fail("Cargo placement would intersect an occupant");
        }
      }
    },
  };
  const replay = !!ctx.db.constructionCargoOperation.id.find(
    JSON.stringify([ctx.sender.toHexString(), request.operationId]),
  );
  const result = editConstructionCargoGrid(ctx, hooks, request);
  if (replay) return result;
  for (const id of result.changedContainerIds) {
    const s = source(ctx, id)!,
      p = ctx.db.constructionCargoPlacement.containerId.find(id)!;
    const transform = cargoAssemblyTransforms(
      s.assembly,
      [p.originX, p.originY, p.originZ],
      p.quarterTurns,
    );
    const point = cargoCarrierAccessPoint(
      s.assembly,
      [p.originX, p.originY, p.originZ],
      p.quarterTurns,
      cargoCarrierCollision(ctx, access.geometry!.frame),
    );
    ctx.db.inventoryContainer.id.update({
      ...s.root,
      localX: transform.payloadOriginM[0],
      localY: transform.payloadOriginM[1],
    });
    ctx.db.inventoryContainerScope.containerId.update({
      ...s.membership,
      revision: s.membership.revision + 1n,
      accessX: point[0],
      accessY: point[1],
      accessZ: point[2],
    });
  }
  assertCargoStackMass(ctx, result.changedContainerIds);
  return result;
}
export const CARGO_GRID_DEFINITION =
  CARGO_HANDLING_FIXTURE.gridDefinitionSha256;
