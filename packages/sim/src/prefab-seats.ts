import {
  isWayfarerGameplay,
  WAYFARER_GAMEPLAY_OBJECTS,
  WAYFARER_BED_OBJECTS,
} from "@sidereal/content/wayfarer-authored-gameplay";
import {
  deriveInterior,
  readShipPrefab,
  type ShipPrefabDocumentV1,
  type PrefabComponentCatalog,
} from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "./prefab-catalog";
import {
  prefabShipObjects,
  prefabComponentDefinition,
} from "./prefab-deck-objects";
import { prefabToShipMetres } from "./prefab-construction";
import {
  canOccupyDeck,
  sweepDeckCircle,
  type DeckCollisionFrame,
} from "./construction-collision";

export interface PrefabSeatDefinition {
  placementId: string;
  assetId: string;
  name: string;
  kind: "seat";
  x: number;
  y: number;
  approachX: number;
  approachY: number;
  seatX: number;
  seatY: number;
  obstacleId: string;
  facing: number;
  /** Lower mattress top relative to its authored floor. */
  supportHeight: number;
}
const normals = {
  fore: [1, 0],
  aft: [-1, 0],
  port: [0, 1],
  starboard: [0, -1],
} as const;
/** Actual lower bed edge: sit facing into the aisle. No authority or mutable state. */
export function prefabBedSeats(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): PrefabSeatDefinition[] {
  if (isWayfarerGameplay(doc))
    return WAYFARER_BED_OBJECTS.map((id) => {
      const o = WAYFARER_GAMEPLAY_OBJECTS.find((row) => row.object === id)!;
      const cx = (o.min[0] + o.max[0]) / 2,
        cy = (o.min[1] + o.max[1]) / 2;
      return {
        placementId: `prefab:socket:${id}`,
        assetId: "shipyard.equipment.crew-bunk",
        name: id.includes("single") ? "Crew bed" : "Crew bunk",
        kind: "seat" as const,
        x: -cy,
        y: cx,
        seatX: -(o.max[1] - 0.1),
        seatY: cx,
        approachX: -(o.max[1] + 0.45),
        approachY: cx,
        obstacleId: `prefab-socket:${id}`,
        facing: Math.PI / 2,
        supportHeight: id.includes("single") ? 0.48 : 0.465,
      };
    });
  const sockets = deriveInterior(doc, 0, catalog).sockets;
  const toShip = prefabToShipMetres(doc);
  return prefabShipObjects(doc, catalog).flatMap((o) => {
    const def = o.componentId
      ? prefabComponentDefinition(o.componentId, catalog.revision)
      : undefined;
    const bed =
      o.designId === "shipyard.equipment.crew-bunk" ||
      o.designId === "shipyard.equipment.medical-bed" ||
      def?.kind === "crew-bunk";
    if (!bed) return [];
    const cx = (o.min[0] + o.max[0]) / 2,
      cy = (o.min[1] + o.max[1]) / 2;
    const socket = sockets.find(
      (s) =>
        s.designId === o.designId &&
        Math.hypot(s.at[0] + s.size[0] / 2 - cx, s.at[1] + s.size[1] / 2 - cy) <
          1e-6,
    );
    const mount = doc.mounts.find((m) => `mount:${m.id}` === o.id);
    // Mounted interior bunk access side is component +Y (plan +X), rotated with its mount.
    const n = normals[socket?.facing ?? mount?.normal ?? "fore"];
    const half =
      (Math.abs(n[0]) * (o.max[0] - o.min[0])) / 2 +
      (Math.abs(n[1]) * (o.max[1] - o.min[1])) / 2;
    const [x, y] = toShip([cx, cy]);
    const [seatX, seatY] = toShip([
      cx + n[0] * (half + 0.1875),
      cy + n[1] * (half + 0.1875),
    ]);
    const [approachX, approachY] = toShip([
      cx + n[0] * (half + 0.45),
      cy + n[1] * (half + 0.45),
    ]);
    return [
      {
        placementId: `prefab:${o.id}`,
        assetId: o.designId ?? o.componentId!,
        name:
          def?.name ??
          (o.designId?.endsWith("medical-bed") ? "Medical bed" : "Crew bunk"),
        kind: "seat" as const,
        x,
        y,
        seatX,
        seatY,
        approachX,
        approachY,
        obstacleId: `prefab-${o.id}`,
        facing: Math.atan2(n[1], n[0]),
        supportHeight: o.designId?.endsWith("medical-bed") ? 0.5 : 0.375,
      },
    ];
  });
}
export function prefabBedsOfDocument(json: string): PrefabSeatDefinition[] {
  const binding = (
    JSON.parse(json) as { prefab?: { document?: unknown; catalog?: string } }
  ).prefab;
  if (!binding?.catalog) return [];
  return prefabBedSeats(
    readShipPrefab(binding.document),
    prefabComponentCatalogFor(binding.catalog),
  );
}
/** Only the exact own bed collider is exempt for seat transitions. Other geometry stays solid. */
export function prefabBedTransitionFrame(
  frame: DeckCollisionFrame,
  obstacleId: string,
): DeckCollisionFrame {
  const own = frame.obstacles.filter((o) => o.id === obstacleId);
  if (own.length !== 1) throw Error("Exact current bed collider required");
  const segments = new Set(
    own.flatMap((o) =>
      o.vertices.map((_, i) => `obstacle:${JSON.stringify([o.id, i])}`),
    ),
  );
  return {
    ...frame,
    obstacles: frame.obstacles.filter((o) => o.id !== obstacleId),
    segments: frame.segments.filter((s) => !segments.has(s.id)),
  };
}
export function qualifyPrefabBed(
  frame: DeckCollisionFrame,
  bed: PrefabSeatDefinition,
): boolean {
  const loc = (x: number, y: number) => ({
    shipId: frame.shipId,
    deckId: frame.deckId,
    position: [x, y] as [number, number],
  });
  if (!canOccupyDeck(frame, loc(bed.approachX, bed.approachY), 0.3))
    return false;
  try {
    const transition = prefabBedTransitionFrame(frame, bed.obstacleId);
    if (!canOccupyDeck(transition, loc(bed.seatX, bed.seatY), 0.3))
      return false;
    const swept = sweepDeckCircle(
      transition,
      loc(bed.approachX, bed.approachY),
      [bed.seatX - bed.approachX, bed.seatY - bed.approachY],
      0.3,
    );
    return (
      Math.hypot(swept.position[0] - bed.seatX, swept.position[1] - bed.seatY) <
      1e-5
    );
  } catch {
    return false;
  }
}
