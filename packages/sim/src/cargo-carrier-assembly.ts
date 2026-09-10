import {
  CARGO_CARRIER_SOURCE,
  CARGO_CARRIER_REVISION,
  CARGO_CARRIER_FAMILY,
  CARGO_CARRIER_RETENTION,
  SECURED_CARGO_PAYLOADS,
  type CargoCarrierSize,
} from "@sidereal/content/cargo-carriers";
import type {
  CargoInterface,
  CargoPoint,
  CargoRect,
} from "./construction-cargo";

export interface SecuredCargoAssembly {
  id: string;
  carrierId: string;
  containerId: string;
  placedObjectId: string;
  instanceId: string;
  deckId: string;
  carrierSize: CargoCarrierSize;
  payloadAssetId: string;
  payloadGlbSha256: string;
  interfaceRevision: string;
  retentionRevision: string;
  upperFrameLocked: boolean;
  lifecycle: "active" | "detached";
  revision: bigint;
}

export function carrierInterface(size: CargoCarrierSize): CargoInterface {
  const source = CARGO_CARRIER_SOURCE[size];
  if (!source) throw Error("Unsupported carrier size");
  const patches = [];
  for (let x = 0; x < source.widthUnits; x += 32)
    for (let y = 0; y < source.widthUnits; y += 32)
      patches.push({
        id: `cell-${x / 32}-${y / 32}`,
        rect: [x + 4, y + 4, x + 28, y + 28] as CargoRect,
        maxLoadKg: CARGO_CARRIER_RETENTION.patchLoadKg,
      });
  return {
    id: source.id,
    definitionId: source.id,
    revision: CARGO_CARRIER_REVISION,
    kind: "cargo",
    size: [source.widthUnits, source.widthUnits, source.heightUnits],
    quarterTurns: [0, 1, 2, 3],
    bearingFamily: CARGO_CARRIER_FAMILY,
    tareMassKg: source.tareMassKg,
    maxGrossMassKg: source.maxGrossMassKg,
    maxTopLoadKg: source.maxTopLoadKg,
    bottom: patches,
    top: patches,
    allowMultipleSupports: true,
    clearances: [],
  };
}

/** No footprint-based admission: exact paired cargo and securing revisions only. */
export function requireSecuredCargoAssembly(assembly: SecuredCargoAssembly) {
  const payload = SECURED_CARGO_PAYLOADS.find(
    (p) =>
      p.installedAssetId === assembly.payloadAssetId &&
      p.glbSha256 === assembly.payloadGlbSha256,
  );
  if (
    !payload ||
    assembly.interfaceRevision !== CARGO_CARRIER_REVISION ||
    assembly.retentionRevision !== CARGO_CARRIER_RETENTION.revision ||
    !assembly.upperFrameLocked ||
    !["active", "detached"].includes(assembly.lifecycle) ||
    assembly.revision < 1n ||
    ![
      assembly.id,
      assembly.carrierId,
      assembly.containerId,
      assembly.placedObjectId,
      assembly.instanceId,
      assembly.deckId,
    ].every(
      (id) => typeof id === "string" && id.length > 0 && id.length <= 160,
    ) ||
    new Set([assembly.carrierId, assembly.containerId, assembly.placedObjectId])
      .size !== 3
  )
    throw Error("Exact locked standard-small/red carrier assembly required");
  return { payload, interface: carrierInterface(assembly.carrierSize) };
}

/** Preserves the independent carrier, payload placed-object and inventory IDs.
 * Transform is authoritative placement input, never a renderer-authored state. */
export function cargoAssemblyTransforms(
  assembly: SecuredCargoAssembly,
  origin: CargoPoint,
  turns: number,
) {
  requireSecuredCargoAssembly(assembly);
  if (
    origin.length !== 3 ||
    !origin.every((n) => Number.isInteger(n) && Math.abs(n) <= 8192) ||
    !Number.isInteger(turns) ||
    turns < 0 ||
    turns > 3
  )
    throw Error("Bounded nominal assembly transform required");
  const width = CARGO_CARRIER_SOURCE[assembly.carrierSize].widthUnits / 32;
  const offset = CARGO_CARRIER_RETENTION.payloadTranslationM;
  const rotate = (x: number, y: number): [number, number] =>
    turns === 0
      ? [x, y]
      : turns === 1
        ? [width - y, x]
        : turns === 2
          ? [width - x, width - y]
          : [y, width - x];
  const p = rotate(offset[0], offset[1]);
  return {
    carrierId: assembly.carrierId,
    payloadPlacedObjectId: assembly.placedObjectId,
    containerId: assembly.containerId,
    carrierOriginM: origin.map((n) => n / 32) as CargoPoint,
    quarterTurns: turns,
    payloadOriginM: [
      origin[0] / 32 + p[0],
      origin[1] / 32 + p[1],
      origin[2] / 32 + offset[2],
    ] as CargoPoint,
    receiverOffsetM: [0, 0, 0] as CargoPoint,
    payloadRelativeQuarterTurns: 0,
  };
}
