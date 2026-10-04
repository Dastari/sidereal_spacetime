import { LAB_STORAGE_FIXTURES } from "@sidereal/content/storage-fixtures";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import { prefabShipObjects } from "@sidereal/sim/prefab-deck-objects";
import { prefabOrigin } from "@sidereal/content/ship-prefab";
import { prefabShipOf, PREFAB_OBJECT_PREFIX } from "./prefab-objects";
import type { ObjectDetailsState } from "@sidereal/canvas-ui";

/** Visible storage stays inspectable/editable even when inventory access is not disclosed. */
export function storageObjectDetails(
  details: ObjectDetailsState | undefined,
  selection: { storage: boolean; containerId?: string },
): ObjectDetailsState | undefined {
  if (!details || !selection.storage) return details;
  return {
    ...details,
    status: selection.containerId
      ? details.status
      : `Move within reach to open inventory. ${details.status ?? ""}`.trim(),
    actions: [
      {
        id: "open-storage",
        label: "Open inventory",
        enabled: !!selection.containerId,
      },
      ...details.actions.filter((action) => action.id !== "open-storage"),
    ],
  };
}

/** Picking names geometry; cargo roots name authoritative placements. Resolve only against
 * the current admitted document and containers already disclosed by server-filtered views. */
export function containerSelection(
  selectedId: string | undefined,
  containers: readonly { id: string; placementId?: string; kind: string }[],
  visit?: {
    instanceId: string;
    deckId: string;
    documentJson: string;
    furnishingsJson?: string;
  },
): { storage: boolean; containerId?: string } {
  if (!selectedId) return { storage: false };
  const direct = containers.find(
    (c) => c.kind === "grid" && c.placementId === selectedId,
  );
  if (direct) return { storage: true, containerId: direct.id };
  if (LAB_STORAGE_FIXTURES.some((f) => f.placementId === selectedId))
    return { storage: true };
  if (!selectedId.startsWith(PREFAB_OBJECT_PREFIX) || !visit)
    return { storage: false };
  const ship = prefabShipOf(visit.documentJson, visit.furnishingsJson);
  if (!ship) return { storage: false };
  const object = prefabShipObjects(
    ship.doc,
    ship.catalog,
    ship.furnishings,
  ).find((o) => PREFAB_OBJECT_PREFIX + o.id === selectedId);
  if (!object || object.kind !== "furniture") return { storage: false };
  const [ox, oy] = prefabOrigin(ship.doc);
  const x = -((object.min[1] + object.max[1]) / 2 - oy);
  const y = (object.min[0] + object.max[0]) / 2 - ox;
  const socket = prefabCargoSockets(
    ship.doc,
    0,
    ship.catalog,
    ship.furnishings,
  ).find(
    (s) =>
      s.designId === object.designId &&
      s.room === object.room &&
      Math.hypot(s.centreM[0] - x, s.centreM[1] - y) < 1e-6,
  );
  if (!socket) return { storage: false };
  const placementId = `${visit.instanceId}:${visit.deckId}:${socket.key}`;
  return {
    storage: true,
    containerId: containers.find(
      (c) => c.kind === "grid" && c.placementId === placementId,
    )?.id,
  };
}
