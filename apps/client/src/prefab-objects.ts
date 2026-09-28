/**
 * Details panel state for a selected prefab-ship object (component, module, furniture, door).
 *
 * Inputs are only rows the client is already authorised to read: the construction document from
 * `own_construction_instances` (owned ships and accepted passenger visits), live power state from
 * `own_authored_flight_power_fittings` and throttles from `own_actuator_outputs` (owner flight
 * only). Catalog stats are public content. The owner sees full stats and live state; a passenger
 * sees what is visibly there (name, size class, category) and nothing about the owner's systems.
 * Remote ships expose no document, so nothing of theirs can be inspected.
 */
import type { ObjectDetailsState } from "@sidereal/canvas-ui";
import {
  prefabOrigin,
  readShipPrefab,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import {
  prefabComponentDefinition,
  prefabShipObjects,
  type PrefabShipObject,
} from "@sidereal/sim/prefab-deck-objects";

export const PREFAB_OBJECT_PREFIX = "prefab:";

/** The trusted prefab binding of the visited construction instance, if it is a prefab ship. */
export function prefabShipOf(
  documentJson: string | undefined,
): { doc: ShipPrefabDocumentV1; catalog: PrefabComponentCatalog } | undefined {
  if (!documentJson) return;
  try {
    const binding = (
      JSON.parse(documentJson) as {
        prefab?: { document?: unknown; catalog?: unknown };
      }
    ).prefab;
    if (!binding || typeof binding.catalog !== "string") return;
    return {
      doc: readShipPrefab(binding.document),
      catalog: prefabComponentCatalogFor(binding.catalog),
    };
  } catch {
    return;
  }
}

export type PrefabInspectAccess = "owner" | "passenger";
export interface PrefabLiveState {
  /** own_authored_flight_power_fittings rows of the actor's ship. */
  powerFittings?: readonly { sourceDeviceId: string; powered: boolean }[];
  /** Actuator throttles of the actor's ship by placed object id (`<shipId>:mount-<id>`). */
  throttles?: readonly { actuatorId: string; throttle: number }[];
  shipId?: string;
  /** own_ship_component_damage rows of the actor's ship (owner only; absent = pristine). */
  damage?: readonly {
    objectId: string;
    hp: number;
    maxHp: number;
    state: string;
    performance: number;
  }[];
}

const kw = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(2)} MW` : `${Math.round(v * 10) / 10} kW`;
const mass = (kg: number) =>
  kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${Math.round(kg)} kg`;
const metres = (m: number) => `${m.toFixed(2)} m`;
const title = (s: string) =>
  s.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const DOOR_NAMES: Record<string, string> = {
  "door.standard": "Door",
  "door.sliding": "Sliding door",
  "door.airlock": "Airlock hatch",
  "door.blast": "Blast door",
  "door.forcefield": "Forcefield door",
};

function furnitureName(designId: string) {
  const tail = designId.split(".").at(-1) ?? designId;
  if (designId.startsWith("cargo."))
    return title(designId.split(".")[1]) + " crate";
  return title(tail === "standard" ? (designId.split(".")[1] ?? tail) : tail);
}

function objectSize(o: PrefabShipObject) {
  const [w, d, h] = [0, 1, 2].map((i) => o.max[i] - o.min[i]);
  // Plan X is fore-aft: report width (across) x depth (fore-aft) x height.
  return [
    { label: "Width", value: metres(d) },
    { label: "Depth", value: metres(w) },
    { label: "Height", value: metres(h) },
  ];
}

export function prefabObjectDetails(
  selectedId: string | undefined,
  doc: ShipPrefabDocumentV1 | undefined,
  catalog: PrefabComponentCatalog | undefined,
  access: PrefabInspectAccess | undefined,
  live: PrefabLiveState = {},
  actor?: { localX: number; localY: number },
): ObjectDetailsState | undefined {
  if (
    !selectedId?.startsWith(PREFAB_OBJECT_PREFIX) ||
    !doc ||
    !catalog ||
    !access
  )
    return;
  const objectId = selectedId.slice(PREFAB_OBJECT_PREFIX.length);
  const object = prefabShipObjects(doc, catalog).find((o) => o.id === objectId);
  if (!object) return;
  const room = (id: string | null) =>
    doc.rooms.find((r) => r.id === id)?.label ?? null;
  const [ox, oy] = prefabOrigin(doc);
  const distance = actor
    ? Math.hypot(
        actor.localX + ((object.min[1] + object.max[1]) / 2 - oy),
        actor.localY - ((object.min[0] + object.max[0]) / 2 - ox),
      )
    : undefined;
  const owner = access === "owner";
  const restricted = "Crew systems are visible to the ship's owner";
  if (object.kind === "door") {
    const edge = doc.edges.find((e) => e.id === object.sourceId);
    const mount = doc.mounts.find((m) => m.id === object.sourceId);
    const type = edge?.type ?? (mount ? "door.airlock" : "door.standard");
    const sealed = !!mount || type === "door.airlock";
    return {
      placementId: selectedId,
      name: DOOR_NAMES[type] ?? "Door",
      category: sealed ? "Exterior hatch" : "Interior door",
      stats: [
        { label: "Opening", value: "1.50 m clear" },
        ...(room(object.room)
          ? [{ label: "Room", value: room(object.room)! }]
          : []),
        {
          label: "State",
          value: sealed ? "Sealed" : "Open passage",
        },
      ],
      distance,
      status: sealed
        ? "Hatch operation is not available on prefab ships yet"
        : "Walk through",
      actions: [],
    };
  }
  if (object.kind === "furniture") {
    return {
      placementId: selectedId,
      name: furnitureName(object.designId ?? "furniture"),
      category: "Furniture",
      stats: [
        ...(room(object.room)
          ? [{ label: "Room", value: room(object.room)! }]
          : []),
        ...objectSize(object),
        {
          label: "Collision",
          value: object.blocks ? "Solid" : "Walk-through seat",
        },
      ],
      distance,
      status: "Inspection only",
      actions: [],
    };
  }
  const def = prefabComponentDefinition(
    object.componentId ?? "",
    catalog.revision,
  );
  const spec = catalog.get(object.componentId ?? "");
  const name =
    def?.name ?? spec?.label ?? title(object.componentId ?? "Component");
  const sizeClass = def?.sizeClass ?? spec?.sizeClass ?? "—";
  const category = title(def?.family ?? spec?.category ?? "component");
  const where =
    object.attach === "interior"
      ? (room(object.room) ?? "Interior")
      : object.attach === "top"
        ? "Roof hardpoint"
        : object.attach === "edge"
          ? "Hull opening"
          : "Hull face";
  if (!owner || !def)
    return {
      placementId: selectedId,
      name,
      category,
      stats: [
        { label: "Size class", value: sizeClass },
        { label: "Location", value: where },
      ],
      distance,
      status: owner ? "Catalog entry unavailable" : restricted,
      actions: [],
    };
  const sourceDeviceId = `mount-${object.sourceId}`;
  const power = live.powerFittings?.find(
    (f) => f.sourceDeviceId === sourceDeviceId,
  );
  const throttle = live.throttles?.find(
    (t) =>
      t.actuatorId === `${live.shipId}:${sourceDeviceId}` ||
      t.actuatorId === sourceDeviceId,
  );
  const stats: { label: string; value: string }[] = [
    { label: "Size class", value: sizeClass },
    { label: "Location", value: where },
    { label: "Mass", value: mass(def.massKg) },
  ];
  if (def.power.generationKw > 0)
    stats.push({ label: "Power output", value: kw(def.power.generationKw) });
  if (def.power.activeKw > 0)
    stats.push({
      label: "Power draw",
      value:
        def.power.idleKw > 0 && def.power.idleKw !== def.power.activeKw
          ? `${kw(def.power.activeKw)} (idle ${kw(def.power.idleKw)})`
          : kw(def.power.activeKw),
    });
  if (def.power.storageKwh > 0)
    stats.push({ label: "Storage", value: `${def.power.storageKwh} kWh` });
  if (def.heat.activeKw > 0)
    stats.push({ label: "Heat", value: kw(def.heat.activeKw) });
  if (def.heat.rejectionKw > 0)
    stats.push({ label: "Heat rejection", value: kw(def.heat.rejectionKw) });
  if (def.propulsion)
    stats.push({
      label: def.propulsion.role === "main" ? "Thrust" : "Manoeuvre thrust",
      value: `${def.propulsion.thrustKn.toFixed(1)} kN`,
    });
  if (def.weapon)
    stats.push(
      {
        label: "Damage",
        value: `${def.weapon.damagePerShot} ${def.weapon.damageType}${def.weapon.projectilesPerShot > 1 ? ` x${def.weapon.projectilesPerShot}` : ""}`,
      },
      { label: "Rate", value: `${def.weapon.shotsPerMinute}/min` },
      { label: "Range", value: `${def.weapon.rangeM} m` },
    );
  if (def.sensor)
    stats.push({ label: "Sensor range", value: `${def.sensor.rangeM} m` });
  if (def.access)
    stats.push({
      label: "Opening",
      value: `${def.access.openingWidthM} x ${def.access.openingHeightM} m`,
    });
  if (def.crew.berths > 0)
    stats.push({ label: "Berths", value: `${def.crew.berths}` });
  if (def.crew.operators > 0 || def.crew.station)
    stats.push({
      label: "Crew",
      value: `${def.crew.operators || 0}${def.crew.station ? ` ${def.crew.station}` : ""} · ${def.crew.automation}`,
    });
  if (def.fluids.crewSupported > 0)
    stats.push({
      label: "Life support",
      value: `${def.fluids.crewSupported} crew`,
    });
  const damage = live.damage?.find((d) => d.objectId === object.id);
  const hp = damage ? Math.ceil(damage.hp) : def.integrity.hp;
  stats.push({
    label: "Integrity",
    value: `${hp} / ${def.integrity.hp} hp${def.integrity.armor ? ` · armour ${def.integrity.armor}` : ""}`,
  });
  stats.push({
    label: "Condition",
    value: damage
      ? `${title(damage.state)}${damage.performance < 1 ? ` · ${Math.round(damage.performance * 100)}% function` : ""}`
      : "Pristine",
  });
  stats.push({
    label: "State",
    value:
      damage?.state === "destroyed"
        ? "Destroyed"
        : power
          ? power.powered
            ? "Powered"
            : "Unpowered"
          : "Installed",
  });
  if (throttle)
    stats.push({
      label: "Throttle",
      value: `${Math.round(throttle.throttle * 100)}%`,
    });
  return {
    placementId: selectedId,
    name,
    category,
    stats,
    distance,
    status:
      object.station === "pilot"
        ? "Pilot station · use the helm to fly"
        : def.status === "future"
          ? "Proposed component (stats not approved)"
          : "Stats are proposals, not approved balance",
    actions: [],
  };
}

/** Display name of a placed prefab object (impact feedback). */
export function prefabObjectName(
  doc: ShipPrefabDocumentV1 | undefined,
  catalog: PrefabComponentCatalog | undefined,
  objectId: string,
): string | undefined {
  if (!doc || !catalog) return;
  const object = prefabShipObjects(doc, catalog).find((o) => o.id === objectId);
  if (!object) return;
  if (object.kind === "furniture")
    return furnitureName(object.designId ?? "furniture");
  if (object.kind === "door") return "Door";
  return (
    prefabComponentDefinition(object.componentId ?? "", catalog.revision)
      ?.name ??
    catalog.get(object.componentId ?? "")?.label ??
    title(object.componentId ?? "Component")
  );
}
