import type { PartCatalog } from "@sidereal/content/assembly";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import type { CompiledLayout } from "@sidereal/sim/layout-compiler";
import { remapOpeningTreatments } from "@sidereal/sim/layout-structure";
import { deleteInternalWall, selectedInternalWall } from "./panel-deletion";
import { reconcileRoomTiles } from "./room-tiles";

/** Delete explicit draft selections and their wall dependents in one history edit.
 * Unconnected service nodes remain authored ports, never incidental garbage. */
export function deleteLayoutSelection(
  doc: LayoutDocument,
  result: CompiledLayout | undefined,
  selection: readonly string[],
  systemsCatalog?: PartCatalog,
): LayoutDocument {
  if (!selection.length) return doc;
  const ids = new Set(selection);
  let next = structuredClone(doc);
  for (const key of ids) {
    const wall = selectedInternalWall(next, result, key);
    if (wall) next = deleteInternalWall(next, wall.id);
  }
  if (next.structure)
    for (const id of ids) delete next.structure.tileStyles[id];
  if (next.structure?.schema === "sidereal.layout-structure.v2")
    for (const opening of next.openings.filter((o) => ids.has(o.id))) {
      next.structure.boundaryTreatments = remapOpeningTreatments(
        next,
        undefined,
        opening.id,
      );
      next.openings = next.openings.filter((o) => o.id !== opening.id);
    }
  next.tiles = next.tiles.filter((t) => !ids.has(t.id));
  next.openings = next.openings.filter((o) => !ids.has(o.id));
  next.rooms = next.rooms.filter((r) => !ids.has(r.id));
  next.fittings = next.fittings.filter((f) => !ids.has(f.id));
  next.routes = next.routes.filter((r) => !ids.has(r.id));
  next.decks = next.decks.map((deck) => ({
    ...deck,
    holes: deck.holes.filter((h) => !ids.has(h.id)),
  }));
  if (next.assembly && systemsCatalog) {
    // Systems footprints expose only these object categories. Unknown assets and
    // native structural context stay preserved, even if their IDs are selected.
    const objectAssets = new Set(
      systemsCatalog.assets
        .filter(
          (a) =>
            a.category === "equipment" ||
            a.category === "cargo" ||
            a.category === "engine",
        )
        .map((a) => a.id),
    );
    next.assembly.parts = next.assembly.parts.filter(
      (p) => !ids.has(p.id) || !objectAssets.has(p.assetId),
    );
  }
  if (next.serviceConnections) {
    const devices = new Set(
      [...(next.assembly?.parts ?? []), ...next.fittings].map(
        (device) => device.id,
      ),
    );
    next.serviceConnections = next.serviceConnections.filter(
      (connection) =>
        !ids.has(connection.id) &&
        devices.has(connection.fromDeviceId) &&
        devices.has(connection.toDeviceId),
    );
  }
  return reconcileRoomTiles(next);
}
