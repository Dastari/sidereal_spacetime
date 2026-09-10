import type {
  LayoutDocument,
  Point,
  Opening,
} from "@sidereal/content/ship-layout";
import type { CompiledLayout } from "@sidereal/sim/layout-compiler";
import {
  proposeWallOpening,
  wallOpeningSlots,
} from "@sidereal/sim/layout-structure";
import type { StructuralToolSettings } from "./structural-tools";

export const DOOR_WIDTHS = [24, 32, 40, 48, 64, 96, 128] as const;
/** Select a real wall-aligned floor-edge slot; a pointer position is never the aperture geometry. */
export function placeStructuralOpening(
  doc: LayoutDocument,
  result: CompiledLayout,
  anchorId: string,
  point: Point,
  settings: StructuralToolSettings,
  id: string,
) {
  const spans =
    result.structure?.walls.filter((w) => w.anchorId === anchorId) ?? [];
  const slots = wallOpeningSlots(doc, result, anchorId)
    .map((center) => ({
      center,
      distance: (center[0] - point[0]) ** 2 + (center[1] - point[1]) ** 2,
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        a.center[0] - b.center[0] ||
        a.center[1] - b.center[1],
    );
  const slot = slots[0];
  if (!slot || !spans.length)
    throw Error("Choose a wall with a supported floor-edge door slot.");
  return proposeWallOpening(doc, {
    id,
    deckId: spans[0].deckId,
    partitionId: anchorId,
    slot: slot.center,
    width: settings.doorWidth,
    kind: settings.doorKind,
    clearance: 16,
    sill: 0,
    setback: 4,
  });
}
export function changeStructuralOpening(
  doc: LayoutDocument,
  id: string,
  change: Partial<Pick<Opening, "kind" | "clearance" | "sill" | "setback">> & {
    width?: number;
  },
) {
  const old = doc.openings.find((o) => o.id === id);
  if (!old) throw Error("Opening no longer exists.");
  const width =
    change.width ??
    Math.max(Math.abs(old.b[0] - old.a[0]), Math.abs(old.b[1] - old.a[1]));
  return proposeWallOpening(doc, {
    id,
    deckId: old.deckId,
    partitionId: old.partitionId,
    slot: [(old.a[0] + old.b[0]) / 2, (old.a[1] + old.b[1]) / 2],
    width,
    kind: change.kind ?? old.kind,
    clearance: change.clearance ?? old.clearance,
    sill: change.sill ?? old.sill,
    setback: change.setback ?? old.setback,
  });
}
