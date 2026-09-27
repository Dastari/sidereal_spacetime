import { reconcileEditedFloorModels } from "./tile-geometry-edits";
import { reconcileRoomTiles } from "./room-tiles";
import { type FloorStamp, stampFloor } from "./floor-stamps";
import {
  type LayoutDocument,
  type Point,
  transformPoint,
} from "@sidereal/content/ship-layout";
import { positiveOverlap } from "@sidereal/sim/layout-geometry";
import { readLayout } from "@sidereal/sim/layout-validation";
import {
  readStructuralTools,
  type StructuralToolSettings,
} from "./structural-tools";
export interface History {
  past: LayoutDocument[];
  present: LayoutDocument;
  future: LayoutDocument[];
}
export interface ViewState {
  structuralTools?: StructuralToolSettings;
  deckId: string;
  mode: "Structure" | "Objects" | "Hull" | "Systems";
  projection: "Top" | "Side" | "Front" | "3D";
  camera: { x: number; y: number; scale: number };
  grid: number;
  layers: {
    floor: boolean;
    walls: boolean;
    roof: boolean;
    labels: boolean;
    routes: boolean;
    objects: boolean;
    exteriorHull?: boolean;
    pressure?: boolean;
  };
  leftWidth: number;
  rightWidth: number;
}
export interface Checkpoint {
  schema: "sidereal.layout-recovery.v1";
  sequence: number;
  writer: string;
  history: History;
  view: ViewState;
}
export const DEFAULT_VIEW: ViewState = {
  deckId: "deck-a",
  mode: "Structure",
  projection: "Top",
  camera: { x: 288, y: 0, scale: 1 },
  grid: 32,
  layers: {
    floor: true,
    walls: true,
    roof: false,
    labels: true,
    routes: true,
    objects: true,
    exteriorHull: true,
    pressure: true,
  },
  leftWidth: 248,
  rightWidth: 280,
};
export function push(history: History, doc: LayoutDocument): History {
  readLayout(doc);
  if (JSON.stringify(doc) === JSON.stringify(history.present)) return history;
  const past = [...history.past, history.present].slice(-40);
  while (past.length && JSON.stringify(past).length > 3 * 1024 * 1024)
    past.shift();
  return { past, present: doc, future: [] };
}
export function undo(h: History): History {
  return h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past.at(-1)!,
        future: [h.present, ...h.future],
      }
    : h;
}
export function redo(h: History): History {
  return h.future.length
    ? {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      }
    : h;
}
export function recoveryKey(identity: string, doc: LayoutDocument): string {
  return `sidereal.layout.recovery.v1:${encodeURIComponent(identity)}:${encodeURIComponent(doc.id)}:${encodeURIComponent(doc.source?.liveId ?? "local")}`;
}
export function readCheckpoint(raw: string): Checkpoint {
  if (raw.length > 12 * 1024 * 1024)
    throw new Error(
      "Recovery exceeds its bounded history budget. Export the original bytes.",
    );
  const v = JSON.parse(raw) as Checkpoint;
  if (
    v?.schema !== "sidereal.layout-recovery.v1" ||
    !Number.isSafeInteger(v.sequence) ||
    v.sequence < 0 ||
    typeof v.writer !== "string" ||
    !v.history ||
    !Array.isArray(v.history.past) ||
    !Array.isArray(v.history.future) ||
    v.history.past.length + v.history.future.length > 40
  )
    throw new Error("Unsupported recovery envelope");
  const docs = [...v.history.past, v.history.present, ...v.history.future];
  docs.forEach(readLayout);
  if (
    docs.some(
      (d) =>
        d.id !== v.history.present.id ||
        JSON.stringify(d.source) !== JSON.stringify(v.history.present.source),
    )
  )
    throw new Error(
      "Recovery history crosses document or live-reference identities",
    );
  const view = v.view;
  if (view?.structuralTools !== undefined)
    readStructuralTools(view.structuralTools);
  if (
    !view ||
    !["Structure", "Rooms", "Objects", "Hull", "Systems"].includes(view.mode) ||
    !["Top", "Side", "Front", "3D"].includes(view.projection) ||
    !view.camera ||
    ![
      view.camera.x,
      view.camera.y,
      view.camera.scale,
      view.leftWidth,
      view.rightWidth,
    ].every(Number.isFinite) ||
    view.camera.scale < 0.025 ||
    view.camera.scale > 8 ||
    ![1, 16, 32, 64].includes(view.grid) ||
    !view.layers ||
    (view.layers.pressure !== undefined &&
      typeof view.layers.pressure !== "boolean") ||
    (view.layers.exteriorHull !== undefined &&
      typeof view.layers.exteriorHull !== "boolean") ||
    ["floor", "walls", "roof", "labels", "routes", "objects"].some(
      (k) => typeof view.layers[k as keyof ViewState["layers"]] !== "boolean",
    )
  )
    throw new Error("Unsupported saved camera/layers");
  return {
    ...v,
    view: {
      ...view,
      mode: (view.mode as string) === "Rooms" ? "Structure" : view.mode,
      projection: ["Structure", "Rooms"].includes(view.mode)
        ? "Top"
        : view.projection,
      layers: {
        ...view.layers,
        exteriorHull: view.layers.exteriorHull ?? true,
        pressure: view.layers.pressure ?? true,
      },
    },
  };
}
export function writeCheckpoint(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  expected: string | null,
  value: Checkpoint,
): string {
  if (storage.getItem(key) !== expected)
    throw new Error(
      "Another editor saved this draft. Your proposal is preserved; export or fork before continuing.",
    );
  const raw = JSON.stringify(value);
  storage.setItem(key, raw);
  return raw;
}
export function transformTiles(
  doc: LayoutDocument,
  ids: string[],
  action: "rotate" | "mirror-x" | "mirror-y" | "move" | "copy",
  delta: Point = [0, 0],
  newId: () => string = () => crypto.randomUUID(),
): LayoutDocument {
  const selected = doc.tiles.filter((t) => ids.includes(t.id));
  if (!selected.length) return doc;
  const points = selected.flatMap((t) => t.vertices),
    pivot: Point = [
      Math.min(...points.map((p) => p[0])),
      Math.min(...points.map((p) => p[1])),
    ];
  const changed = selected.map((t) => ({
    ...t,
    id: action === "copy" ? newId() : t.id,
    vertices: t.vertices.map((p) => {
      if (action === "move" || action === "copy")
        return [p[0] + delta[0], p[1] + delta[1]] as Point;
      const local: Point = [p[0] - pivot[0], p[1] - pivot[1]],
        q =
          action === "mirror-y"
            ? ([local[0], -local[1]] as Point)
            : transformPoint(
                local,
                action === "rotate" ? 1 : 0,
                action === "mirror-x",
              );
      return [q[0] + pivot[0], q[1] + pivot[1]] as Point;
    }),
  }));
  return reconcileRoomTiles(
    reconcileEditedFloorModels(
      {
        ...doc,
        tiles:
          action === "copy"
            ? [...doc.tiles, ...changed]
            : doc.tiles.map((t) => changed.find((q) => q.id === t.id) ?? t),
      },
      changed.map((t) => t.id),
    ),
  );
}
export function placeTiles(
  doc: LayoutDocument,
  at: Point[],
  shape: FloorStamp,
  deckId: string,
  turns: number,
  mirrorX: boolean,
  mirrorY: boolean,
  newId: () => string,
): LayoutDocument {
  const stamps = at.flatMap((p) => {
    const base = stampFloor(newId(), deckId, shape, p, turns),
      variants = [base];
    if (mirrorX)
      variants.push({
        ...base,
        id: newId(),
        vertices: base.vertices.map(([x, y]) => [-x, y]),
      });
    if (mirrorY)
      variants.push(
        ...variants.map((t) => ({
          ...t,
          id: newId(),
          vertices: t.vertices.map(([x, y]) => [x, -y] as Point),
        })),
      );
    return variants;
  });
  // Never stamp over existing floor: the compiler would only flag the overlap
  // and hide the native walls. Skipped stamps let the caller explain instead.
  const existing = doc.tiles.filter((t) => t.deckId === deckId);
  const accepted = stamps.filter(
    (s) => !existing.some((t) => positiveOverlap(t.vertices, s.vertices)),
  );
  return { ...doc, tiles: [...doc.tiles, ...accepted] };
}
