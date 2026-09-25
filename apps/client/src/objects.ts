import { LAB_STORAGE_FIXTURES } from "../../../packages/content/src/storage-fixtures";
import type { InventoryState } from "../../../packages/canvas-ui/src";
import { LAB_FLIGHT_ACTUATORS } from "../../../packages/content/src/flight";
import type { InteractionRow } from "@sidereal/net";
import type {
  PartAsset,
  PartPlacement,
} from "../../../packages/content/src/assembly";
import type { ObjectDetailsState } from "../../../packages/canvas-ui/src";

export type EquipmentCatalog = {
  entries: { asset: PartAsset; placements: PartPlacement[] }[];
};
export function objectDetails(
  placementId: string | undefined,
  catalog: EquipmentCatalog | undefined,
  rows: readonly InteractionRow[],
  actor?: { localX: number; localY: number },
  helm?: { seated: boolean; near: boolean; occupied: boolean },
  outputs: readonly { actuatorId: string; throttle: number }[] = [],
  containers: InventoryState["containers"] = [],
  fittings: readonly { placedObjectId: string; sourceDeviceId: string }[] = [],
): ObjectDetailsState | undefined {
  if (!placementId) return;
  const entry = catalog?.entries.find((e) =>
    e.placements.some((p) => p.id === placementId),
  );
  if (!entry) return;
  const placement = entry.placements.find((p) => p.id === placementId)!;
  const row = rows.find((r) => r.placementId === placementId),
    asset = entry.asset;
  const storage = containers.find(
    (container) => container.placementId === placementId,
  );
  const knownStorage =
    !!storage ||
    LAB_STORAGE_FIXTURES.some((fixture) => fixture.placementId === placementId);
  const sourceId =
    fittings.find((fitting) => fitting.placedObjectId === placementId)
      ?.sourceDeviceId ?? placementId;
  const isHelm =
    sourceId === "equipment-control-seat" ||
    sourceId === "equipment-control-console";
  const drive = LAB_FLIGHT_ACTUATORS.find((device) => device.id === sourceId);
  const driveName = drive
    ? sourceId.includes("-main-")
      ? "Main engine"
      : sourceId.includes("-retro-")
        ? "Retro thruster"
        : "Maneuvering thruster"
    : undefined;
  const name =
    driveName ??
    row?.name ??
    storage?.name ??
    (asset.visual?.designId.split(".").at(-1) ?? asset.label)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const bounds = asset.visual?.bounds ?? asset.bounds;
  const size = bounds.max.map((n, i) => Math.abs(n - bounds.min[i]).toFixed(2));
  return {
    placementId,
    name,
    category: asset.category,
    image: asset.thumbnail,
    stats: [
      ...(storage?.kind === "grid"
        ? [
            {
              label: "Item grid",
              value: `${storage.width} × ${storage.height}`,
            },
            { label: "Payload limit", value: `${storage.maxMassKg} kg` },
          ]
        : []),
      ...(storage?.kind === "liquid"
        ? [
            {
              label: storage.liquidType || "Liquid",
              value: `${storage.amountLitres.toFixed(1)} / ${storage.capacityLitres.toFixed(1)} L`,
            },
          ]
        : []),
      ...(drive
        ? [
            {
              label: "Rated thrust",
              value: (drive.maxThrustN / 1000).toFixed(1) + " kN",
            },
            {
              label: "Throttle",
              value:
                Math.round(
                  (outputs.find((output) => output.actuatorId === drive.id)
                    ?.throttle ?? 0) * 100,
                ) + "%",
            },
          ]
        : []),
      ...["Width", "Depth", "Height"].map((label, i) => ({
        label,
        value: size[i] + " m",
      })),
      ...(row?.kind === "light"
        ? [{ label: "Grow light", value: row.enabled ? "On" : "Off" }]
        : []),
      ...(row?.kind === "seat"
        ? [{ label: "Seat", value: row.occupied ? "Occupied" : "Available" }]
        : []),
    ],
    distance: actor
      ? Math.hypot(
          actor.localX - placement.position[0],
          actor.localY - placement.position[1],
        )
      : undefined,
    reachable:
      row?.reachable ??
      (knownStorage ? !!storage : isHelm ? helm?.near : undefined),
    status: row
      ? row.seatedByYou
        ? "You are seated here"
        : "Interact within 1.8 m"
      : knownStorage
        ? storage
          ? "Storage available"
          : "Move within 1.8 m to open storage"
        : isHelm
          ? "Control station · Tab changes camera"
          : "Inspection only",
    actions: row
      ? [
          {
            id: interactionAction(row),
            label: interactionLabel(row),
            enabled: row.reachable && (!row.occupied || row.seatedByYou),
          },
        ]
      : knownStorage
        ? storage?.kind === "liquid"
          ? []
          : [
              {
                id: "open-storage",
                label: "Open storage",
                enabled: storage?.kind === "grid",
              },
            ]
        : isHelm && helm
          ? [
              {
                id: "use-station",
                label: helm.seated ? "Leave control seat" : "Use control seat",
                enabled: helm.near && (!helm.occupied || helm.seated),
              },
            ]
          : [],
  };
}
export function interactionAction(row: InteractionRow) {
  return row.kind === "seat"
    ? row.seatedByYou
      ? "stand"
      : "sit"
    : row.enabled
      ? "set-light-off"
      : "set-light-on";
}
export function interactionLabel(row: InteractionRow) {
  return row.kind === "seat"
    ? row.seatedByYou
      ? "Stand up"
      : "Sit on sofa"
    : row.enabled
      ? "Turn grow light off"
      : "Turn grow light on";
}

