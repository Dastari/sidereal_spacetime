import type { LayoutDocument } from "@sidereal/content/ship-layout";
import type { CompiledLayout } from "@sidereal/sim/layout-compiler";

/** Resolve semantic IDs as well as compiled edge keys; never parse IDs by prefix. */
export function selectedInternalWall(
  doc: LayoutDocument,
  result: CompiledLayout | undefined,
  key: string | undefined,
) {
  const anchor =
    result?.structure?.walls.find((w) => w.id === key || w.anchorId === key)
      ?.anchorId ??
    result?.walls.find((w) => w.key === key || w.anchorId === key)?.anchorId ??
    key;
  return doc.partitions.find((p) => p.id === anchor);
}

export function deleteInternalWall(
  doc: LayoutDocument,
  id: string,
): LayoutDocument {
  if (!doc.partitions.some((p) => p.id === id))
    throw new Error(
      "Select an internal wall. Exterior walls change with the floor plan.",
    );
  const next = structuredClone(doc);
  next.partitions = next.partitions.filter((p) => p.id !== id);
  next.openings = next.openings.filter((o) => o.partitionId !== id);
  next.rooms = next.rooms.map((r) => ({
    ...r,
    boundaryIds: r.boundaryIds.filter((b) => b !== id),
  }));
  if (next.structure) delete next.structure.wallFaces[id];
  if (next.structure?.schema === "sidereal.layout-structure.v2")
    next.structure.boundaryTreatments =
      next.structure.boundaryTreatments.filter(
        (t) => t.source !== "partition" || t.sourceAnchorId !== id,
      );
  return next;
}

export function deleteRoomLabel(
  doc: LayoutDocument,
  id: string,
): LayoutDocument {
  if (!doc.rooms.some((r) => r.id === id))
    throw new Error("Select a room label to delete.");
  return { ...doc, rooms: doc.rooms.filter((r) => r.id !== id) };
}
