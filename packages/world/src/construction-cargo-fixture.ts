/** Explicit owner-review installation. Does not alter normal Wayfarer rooms,
 * existing inventories, actor positions, control stations or template documents. */
import { SenderError } from "spacetimedb/server";
import { CARGO_HANDLING_FIXTURE as FIXTURE } from "@sidereal/content/cargo-handling-fixture";
import {
  CARGO_CARRIER_RETENTION,
  CARGO_CARRIER_REVISION,
  SECURED_CARGO_PAYLOADS,
} from "@sidereal/content/cargo-carriers";
import { LAB_STORAGE_FIXTURES } from "@sidereal/content/storage-fixtures";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { stableStringify } from "@sidereal/sim/layout-geometry";
import {
  carrierInterface,
  cargoAssemblyTransforms,
  type SecuredCargoAssembly,
} from "@sidereal/sim/cargo-carrier-assembly";
import {
  applyCargoCarrierCollision,
  qualifyCargoRectangle,
  CARGO_STRUCTURE_CLEARANCE_M,
} from "@sidereal/sim/cargo-carrier-collision";
import {
  validateCargoStack,
  type CargoGrid,
  type CargoPlacement,
  type CargoPoint,
} from "@sidereal/sim/construction-cargo";
import { constructionCollision } from "./construction-doors";
import { requireGame } from "./auth";
import { operation, receipt, requireGrant } from "./construction";
import {
  cargoCarrierAccessPoint,
  type CargoCarrierContext,
} from "./construction-cargo-carriers";

export function installCargoHandlingFixture(
  ctx: CargoCarrierContext,
  args: {
    instanceId: string;
    expectedInstanceRevision: bigint;
    operationId: string;
  },
) {
  requireGame(ctx);
  const instance = ctx.db.constructionInstance.id.find(args.instanceId);
  if (
    !instance ||
    !instance.owner.isEqual(ctx.sender) ||
    instance.blueprintSha256 !== FIXTURE.sha256
  )
    throw new SenderError("Exact owned cargo handling fixture required");
  requireGrant(ctx, instance.workspaceId, "instance.spawn");
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "install-cargo-handling-fixture-r001",
      ...args,
      expectedInstanceRevision: String(args.expectedInstanceRevision),
    },
    args.expectedInstanceRevision,
    instance.revision,
  );
  if (op.replay) return op.replay.resultId;
  if (
    [...ctx.db.constructionCargoGrid.by_instance.filter(instance.id)].length ||
    [...ctx.db.constructionCargoAssembly.by_instance.filter(instance.id)].length
  )
    throw new SenderError(
      "Cargo fixture already installed; use its retained identities",
    );
  const source = LAB_STORAGE_FIXTURES.find(
    (f) => f.placementId === "room-storage-container-2.15-0.25",
  );
  if (!source)
    throw new SenderError("Qualified inventory definition unavailable");
  const mapping = JSON.parse(instance.idMapJson) as {
    decks: { sourceId: string; instanceId: string }[];
  };
  const deckId = mapping.decks.find(
    (d) => d.sourceId === FIXTURE.sourceDeckId,
  )?.instanceId;
  if (!deckId)
    throw new SenderError("Qualified fixture deck mapping unavailable");
  const allocated = new Set<string>(),
    allocate = () => {
      const id = ctx.newUuidV4().toString();
      if (
        allocated.has(id) ||
        ctx.db.inventoryContainer.id.find(id) ||
        ctx.db.inventoryItem.id.find(id) ||
        ctx.db.instanceInventoryBinding.placedObjectId.find(id) ||
        ctx.db.constructionCargoAssembly.containerId.find(id) ||
        ctx.db.constructionCargoGrid.id.find(id)
      )
        throw new SenderError("Fresh cargo identity required");
      allocated.add(id);
      return id;
    };
  const gridId = allocate(),
    grid: CargoGrid = {
      ...JSON.parse(JSON.stringify(FIXTURE.grid)),
      id: gridId,
      deckId,
    } as CargoGrid;
  if (
    constructionHash(stableStringify(FIXTURE.grid)) !==
    FIXTURE.gridDefinitionSha256
  )
    throw new SenderError("Cargo grid source pin mismatch");
  const frame = constructionCollision(ctx, instance, deckId);
  if (!qualifyCargoRectangle(frame, [0, 0, 6, 4], CARGO_STRUCTURE_CLEARANCE_M))
    throw new SenderError("Cargo floor/staging space has changed");
  const coordinates: readonly (readonly [
    "oneMetre" | "twoMetre",
    CargoPoint,
  ])[] = [
    ["twoMetre", [0, 0, 6]],
    ["oneMetre", [0, 0, 28]],
    ["oneMetre", [32, 0, 28]],
    ["oneMetre", [0, 32, 28]],
    ["oneMetre", [32, 32, 28]],
    ["twoMetre", [0, 0, 50]],
  ];
  const rows = coordinates.map(([size, origin], i) => {
    const payload = SECURED_CARGO_PAYLOADS[i % 2]!;
    const assembly: SecuredCargoAssembly = {
      id: allocate(),
      carrierId: allocate(),
      containerId: allocate(),
      placedObjectId: allocate(),
      instanceId: instance.id,
      deckId,
      carrierSize: size,
      payloadAssetId: payload.installedAssetId,
      payloadGlbSha256: payload.glbSha256,
      interfaceRevision: CARGO_CARRIER_REVISION,
      retentionRevision: CARGO_CARRIER_RETENTION.revision,
      upperFrameLocked: true,
      lifecycle: "active",
      revision: 1n,
    };
    const placement: CargoPlacement = {
      containerId: assembly.containerId,
      interfaceId: carrierInterface(size).id,
      origin,
      quarterTurns: 0,
      payloadMassKg: 0,
      secured: true,
    };
    return { assembly, placement };
  });
  if (
    !validateCargoStack(
      grid,
      [carrierInterface("oneMetre"), carrierInterface("twoMetre")],
      rows.map((r) => r.placement),
    ).valid
  )
    throw new SenderError("Cargo stack qualification failed");
  const finalFrame = applyCargoCarrierCollision(
    frame,
    rows.map((r) => ({ ...r, revision: 1n })),
  );
  const ready = rows.map((row) => ({
    ...row,
    point: cargoCarrierAccessPoint(
      row.assembly,
      row.placement.origin,
      0,
      finalFrame,
    ),
    transform: cargoAssemblyTransforms(row.assembly, row.placement.origin, 0),
  }));
  for (const location of ctx.db.constructionLocation.by_instance.filter(
    instance.id,
  )) {
    if (location.deckId !== deckId) continue;
    const a = ctx.db.character.id.find(location.characterId);
    if (
      a &&
      Math.hypot(
        Math.max(-a.localX, 0, a.localX - 2),
        Math.max(-a.localY, 0, a.localY - 2),
      ) < 0.3
    )
      throw new SenderError("Move occupants clear of cargo installation");
  }
  // Every validation above precedes the first write. A database error propagates
  // through the enclosing reducer and rolls back all rows, including the receipt.
  ctx.db.constructionCargoGrid.insert({
    id: gridId,
    instanceId: instance.id,
    deckId,
    definitionSha256: FIXTURE.gridDefinitionSha256,
    gridJson: JSON.stringify(grid),
    revision: 1n,
  });
  for (const { assembly: a, placement: p, point, transform } of ready) {
    ctx.db.constructionCargoAssembly.insert(a);
    ctx.db.constructionCargoPlacement.insert({
      containerId: a.containerId,
      instanceId: instance.id,
      deckId,
      gridId,
      interfaceId: p.interfaceId,
      interfaceRevision: CARGO_CARRIER_REVISION,
      originX: p.origin[0],
      originY: p.origin[1],
      originZ: p.origin[2],
      quarterTurns: 0,
      secured: true,
      custodyAnchorId: "",
      revision: 1n,
    });
    ctx.db.inventoryContainer.insert({
      id: a.containerId,
      characterId: "",
      parentItemId: "",
      kind: "grid",
      name: "Carrier cargo",
      width: source.width,
      height: source.height,
      maxMassKg: source.maxMassKg,
      capacityLitres: 0,
      amountLitres: 0,
      liquidType: "",
      shipId: instance.id,
      localX: transform.payloadOriginM[0],
      localY: transform.payloadOriginM[1],
      carried: false,
    });
    ctx.db.inventoryContainerScope.insert({
      containerId: a.containerId,
      rootContainerId: a.containerId,
      rootKind: "instance",
      rootCharacterId: "",
      instanceId: instance.id,
      deckId,
      placedObjectId: a.placedObjectId,
      revision: 1n,
      instanceRevision: instance.revision,
      definitionRevision: CARGO_CARRIER_REVISION,
      accessX: point[0],
      accessY: point[1],
      accessZ: point[2],
      lifecycle: "active",
    });
    ctx.db.instanceInventoryBinding.insert({
      placedObjectId: a.placedObjectId,
      containerId: a.containerId,
      instanceId: instance.id,
      deckId,
      definitionRevision: CARGO_CARRIER_REVISION,
    });
  }
  receipt(ctx, op.key, op.request, gridId, instance.revision);
  return gridId;
}
