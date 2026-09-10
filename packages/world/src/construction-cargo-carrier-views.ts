/** Private keyed presentation projection. Read admission is separate from
 * manipulation: an accepted seated pilot may still see their cargo geometry. */
import { t } from "spacetimedb/server";
import { readableInstances } from "./construction-instances";
import {
  cargoAssembly,
  cargoCarrierPayloadMass,
  type CargoCarrierReadContext,
} from "./construction-cargo-carriers";
import { CARGO_CARRIER_SOURCE } from "@sidereal/content/cargo-carriers";
import { carrierInterface } from "@sidereal/sim/cargo-carrier-assembly";

export const cargoCarrierProjection = t.row("CargoCarrierProjection", {
  carrierId: t.string().primaryKey(),
  containerId: t.string(),
  placedObjectId: t.string(),
  instanceId: t.string(),
  deckId: t.string(),
  gridId: t.string(),
  carrierSize: t.string(),
  payloadAssetId: t.string(),
  carrierGlbSha256: t.string(),
  receiverGlbSha256: t.string(),
  payloadGlbSha256: t.string(),
  originX: t.i32(),
  originY: t.i32(),
  originZ: t.i32(),
  quarterTurns: t.u8(),
  placementRevision: t.u64(),
  assemblyRevision: t.u64(),
  inventoryRevision: t.u64(),
  gridRevision: t.u64(),
  secured: t.bool(),
  payloadMassKg: t.f64(),
  maxGrossMassKg: t.f64(),
});
function acceptedLocation(ctx: CargoCarrierReadContext) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)].find(
    (a) => a.connected,
  );
  if (!actor) return [];
  const location = ctx.db.constructionLocation.characterId.find(actor.id);
  if (!location || actor.shipId !== location.instanceId) return [];
  const instance = readableInstances(ctx).find(
    (i) => i.id === location.instanceId,
  );
  if (!instance || instance.revision !== location.revision) return [];
  return { instance, location };
}
export function ownCargoCarriers(ctx: CargoCarrierReadContext) {
  const accepted = acceptedLocation(ctx);
  if (Array.isArray(accepted)) return [];
  const { instance, location } = accepted;
  const rows = [];
  let scanned = 0;
  for (const raw of ctx.db.constructionCargoAssembly.by_instance.filter(
    instance.id,
  )) {
    if (++scanned > 256) throw Error("Carrier projection budget exceeded");
    if (raw.deckId !== location.deckId) continue;
    const assembly = cargoAssembly(raw),
      p = ctx.db.constructionCargoPlacement.containerId.find(
        assembly.containerId,
      ),
      scope = ctx.db.inventoryContainerScope.containerId.find(
        assembly.containerId,
      );
    if (
      !p ||
      !scope ||
      p.instanceId !== instance.id ||
      p.deckId !== location.deckId ||
      scope.lifecycle !== "active" ||
      scope.rootKind !== "instance" ||
      scope.instanceId !== instance.id ||
      scope.deckId !== location.deckId ||
      scope.placedObjectId !== assembly.placedObjectId
    )
      continue;
    const grid = p.gridId
      ? ctx.db.constructionCargoGrid.id.find(p.gridId)
      : undefined;
    if (
      p.gridId &&
      (!grid ||
        grid.instanceId !== instance.id ||
        grid.deckId !== location.deckId)
    )
      continue;
    rows.push({
      carrierId: assembly.carrierId,
      containerId: assembly.containerId,
      placedObjectId: assembly.placedObjectId,
      instanceId: instance.id,
      deckId: location.deckId,
      gridId: p.gridId,
      carrierSize: assembly.carrierSize,
      payloadAssetId: assembly.payloadAssetId,
      carrierGlbSha256: CARGO_CARRIER_SOURCE[assembly.carrierSize].glbSha256,
      receiverGlbSha256: CARGO_CARRIER_SOURCE.receiver.glbSha256,
      payloadGlbSha256: assembly.payloadGlbSha256,
      originX: p.originX,
      originY: p.originY,
      originZ: p.originZ,
      quarterTurns: p.quarterTurns,
      placementRevision: p.revision,
      assemblyRevision: assembly.revision,
      inventoryRevision: scope.revision,
      gridRevision: grid?.revision ?? 0n,
      secured: assembly.upperFrameLocked,
      payloadMassKg: cargoCarrierPayloadMass(ctx, assembly.containerId),
      maxGrossMassKg: carrierInterface(assembly.carrierSize).maxGrossMassKg,
    });
  }
  return rows;
}

export const cargoGridProjection = t.row("CargoGridProjection", {
  gridId: t.string().primaryKey(),
  instanceId: t.string(),
  deckId: t.string(),
  definitionSha256: t.string(),
  footprintUnitsJson: t.string(),
  baseZ: t.i32(),
  roofZ: t.i32(),
  horizontalStepUnits: t.i32(),
  snapOriginX: t.i32(),
  snapOriginY: t.i32(),
  maxLoadKg: t.f64(),
  revision: t.u64(),
});
export function ownCargoGrids(ctx: CargoCarrierReadContext) {
  const accepted = acceptedLocation(ctx);
  if (Array.isArray(accepted)) return [];
  const ids = new Set<string>();
  let scanned = 0;
  for (const a of ctx.db.constructionCargoAssembly.by_instance.filter(
    accepted.instance.id,
  )) {
    if (++scanned > 256) throw Error("Carrier grid projection budget exceeded");
    if (a.deckId !== accepted.location.deckId) continue;
    const p = ctx.db.constructionCargoPlacement.containerId.find(a.containerId);
    if (p?.gridId) ids.add(p.gridId);
  }
  return [...ids].sort().flatMap((id) => {
    const row = ctx.db.constructionCargoGrid.id.find(id);
    if (
      !row ||
      row.instanceId !== accepted.instance.id ||
      row.deckId !== accepted.location.deckId
    )
      return [];
    if (row.gridJson.length > 131072)
      throw Error("Carrier grid projection byte budget exceeded");
    const grid = JSON.parse(
      row.gridJson,
    ) as import("@sidereal/sim/construction-cargo").CargoGrid;
    return [
      {
        gridId: id,
        instanceId: row.instanceId,
        deckId: row.deckId,
        definitionSha256: row.definitionSha256,
        footprintUnitsJson: JSON.stringify(grid.footprint),
        baseZ: grid.baseZ,
        roofZ: grid.roofZ,
        horizontalStepUnits: grid.horizontalStepUnits,
        snapOriginX: grid.snapOrigin[0],
        snapOriginY: grid.snapOrigin[1],
        maxLoadKg: grid.maxLoadKg,
        revision: row.revision,
      },
    ];
  });
}
