import type { LayoutDocument, ServiceChannel } from "./ship-layout";
import type { PartCatalog } from "./assembly";
import { WAYFARER_ACTUATOR_DEFINITIONS } from "./physical-definitions";

/** Connection semantics only. No electrical/fuel ratings have been approved. */
export interface DeviceServicePortDefinition {
  id: string;
  channel: ServiceChannel;
  direction: "in" | "out" | "both";
  capacityPerSecond: number | null;
}
export interface PlacedDeviceServices {
  placedObjectId: string;
  definitionId: string;
  label: string;
  deckId: string;
  position: [number, number, number];
  ports: DeviceServicePortDefinition[];
}
export const WAYFARER_REACTOR_SOURCE_ID = "room-engineering";
export const WAYFARER_REACTOR_ASSET_ID = "part-77728ecc8ad36b0ff45f";
const engineAssets = new Set([
  "part-e8b51ac6443c73becfcb",
  "part-4d754a140cc642ded990",
  "part-e15ef10ca93701b58ccb",
  "part-a9dcbf6707ca20039a5c",
  "part-a06cfaab58b430855803",
  "part-393498d8c8af6149ef28",
]);
const engineDefinitions = new Set(
  WAYFARER_ACTUATOR_DEFINITIONS.map((a) => a.fittingDefinitionId),
);
export const deviceServicePortId = (placedObjectId: string, portId: string) =>
  `${placedObjectId}:${portId}`;
export function deviceServiceDefinitions(
  definitionId: string,
): DeviceServicePortDefinition[] {
  if (definitionId === WAYFARER_REACTOR_ASSET_ID)
    return [
      {
        id: "power-out",
        channel: "power",
        direction: "out",
        capacityPerSecond: null,
      },
    ];
  if (engineAssets.has(definitionId) || engineDefinitions.has(definitionId))
    return [
      {
        id: "power-in",
        channel: "power",
        direction: "in",
        capacityPerSecond: null,
      },
    ];
  return [];
}
/** Both placement representations retain their own identity. Positions use metres.
 * Channels without an authored device port remain unsupported, not fabricated. */
export function placedDeviceServices(
  layout: LayoutDocument,
  catalog?: PartCatalog,
): PlacedDeviceServices[] {
  const names = new Map(catalog?.assets.map((a) => [a.id, a.label]) ?? []);
  const result: PlacedDeviceServices[] = [];
  for (const part of layout.assembly?.parts ?? []) {
    const ports = deviceServiceDefinitions(part.assetId);
    if (!ports.length) continue;
    const deck = [...layout.decks].sort(
      (a, b) =>
        Math.abs(a.elevation / 32 - part.position[2]) -
        Math.abs(b.elevation / 32 - part.position[2]),
    )[0];
    result.push({
      placedObjectId: part.id,
      definitionId: part.assetId,
      label: names.get(part.assetId) ?? part.id,
      deckId: deck?.id ?? "",
      position: [...part.position],
      ports,
    });
  }
  for (const fitting of layout.fittings) {
    const ports = deviceServiceDefinitions(fitting.definitionId);
    if (!ports.length) continue;
    result.push({
      placedObjectId: fitting.id,
      definitionId: fitting.definitionId,
      label: names.get(fitting.definitionId) ?? fitting.definitionId,
      deckId: fitting.deckId,
      position: [
        fitting.position[0] / 32,
        fitting.position[1] / 32,
        (layout.decks.find((d) => d.id === fitting.deckId)?.elevation ?? 0) /
          32,
      ],
      ports,
    });
  }
  return result;
}

/** Opt-in unrated logical circuits. Never creates physical routes or feedthroughs. */
export function withDefaultDevicePower(
  layout: LayoutDocument,
  catalog?: PartCatalog,
): LayoutDocument {
  const devices = placedDeviceServices(layout, catalog);
  const reactor = devices.find(
    (d) => d.definitionId === WAYFARER_REACTOR_ASSET_ID,
  );
  if (!reactor) return layout;
  const next = JSON.parse(JSON.stringify(layout)) as LayoutDocument;
  next.serviceConnections ??= [];
  for (const engine of devices.filter(
    (d) =>
      d.ports.some((p) => p.id === "power-in") && d.deckId === reactor.deckId,
  )) {
    if (
      next.serviceConnections.some(
        (connection) =>
          connection.toDeviceId === engine.placedObjectId &&
          connection.toPortId === "power-in" &&
          connection.channel === "power",
      )
    )
      continue;
    next.serviceConnections.push({
      id: `power:${engine.placedObjectId}`,
      channel: "power",
      fromDeviceId: reactor.placedObjectId,
      fromPortId: "power-out",
      toDeviceId: engine.placedObjectId,
      toPortId: "power-in",
    });
  }
  return next;
}

export function connectDevicePower(
  layout: LayoutDocument,
  fromPortId: string | null,
  toPortId: string,
): LayoutDocument {
  const devices = placedDeviceServices(layout);
  const toDevice = devices.find((d) =>
    d.ports.some(
      (p) =>
        p.direction === "in" &&
        p.channel === "power" &&
        deviceServicePortId(d.placedObjectId, p.id) === toPortId,
    ),
  );
  const fromDevice = devices.find((d) =>
    d.ports.some(
      (p) =>
        p.direction === "out" &&
        p.channel === "power" &&
        deviceServicePortId(d.placedObjectId, p.id) === fromPortId,
    ),
  );
  if (
    !toDevice ||
    (fromPortId !== null &&
      (!fromDevice || fromDevice.deckId !== toDevice.deckId))
  )
    throw Error("Compatible same-deck power ports required");
  const next = JSON.parse(JSON.stringify(layout)) as LayoutDocument;
  const previous = next.serviceConnections?.find(
    (connection) =>
      connection.channel === "power" &&
      connection.toDeviceId === toDevice.placedObjectId &&
      connection.toPortId === "power-in",
  );
  next.serviceConnections = (next.serviceConnections ?? []).filter(
    (connection) => connection !== previous,
  );
  if (fromPortId === null) return next;
  next.serviceConnections.push({
    id: previous?.id ?? `power:${toDevice.placedObjectId}`,
    channel: "power",
    fromDeviceId: fromDevice!.placedObjectId,
    fromPortId: "power-out",
    toDeviceId: toDevice.placedObjectId,
    toPortId: "power-in",
  });
  return next;
}
