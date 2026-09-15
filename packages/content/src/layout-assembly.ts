import {
  validateHullPaint,
  canPaintHullAsset,
  type HullPaint,
} from "./hull-paint";
import { classifyLegacyYaw } from "./placement-orientation";
/** Editable visual placements use the game's exact east/north/up metre frame.
 * This local document is not installed inventory, collision, damage or a control grant. */
import {
  validateAssembly,
  type AssemblyDocument,
  type PartCatalog,
  type PartPlacement,
} from "./assembly";
import {
  emptyLayout,
  type LayoutDocument,
  transformPoint,
} from "./ship-layout";
export interface LayoutAssembly {
  schema: "sidereal.layout-assembly.v1";
  source: { name: string; documentId: string } | null;
  revisions: Record<string, string>;
  parts: PartPlacement[];
}
export const visualRevision = (catalog: PartCatalog, id: string) =>
  catalog.assets.find((a) => a.id === id)?.visual?.sha256 ??
  "retained-part-library-v1";
export function importShipAssembly(
  source: unknown,
  catalog: PartCatalog,
  id: string,
  deckId: string,
): LayoutDocument {
  const assembly = validateAssembly(source, catalog),
    doc = emptyLayout(id, deckId);
  doc.name = `${assembly.name} · editable copy`;
  doc.assembly = {
    schema: "sidereal.layout-assembly.v1",
    source: { name: assembly.name, documentId: assembly.id },
    revisions: Object.fromEntries(
      assembly.parts.flatMap((p) =>
        [p.assetId, ...(p.fittingProxy ? [p.fittingProxy.assetId] : [])].map(
          (id) => [id, visualRevision(catalog, id)],
        ),
      ),
    ),
    parts: structuredClone(assembly.parts),
  };
  return doc;
}
export function assemblyMismatches(
  doc: LayoutDocument,
  catalog: PartCatalog,
): string[] {
  return (doc.assembly?.parts ?? [])
    .filter((p) =>
      [p.assetId, ...(p.fittingProxy ? [p.fittingProxy.assetId] : [])].some(
        (id) =>
          !catalog.assets.some((a) => a.id === id) ||
          doc.assembly!.revisions[id] !== visualRevision(catalog, id),
      ),
    )
    .map((p) => p.id);
}
/** Keep existing planar fittings visible/editable in Hull without a duplicate identity. */
export function layoutVisualParts(
  doc: LayoutDocument,
  catalog: PartCatalog,
): PartPlacement[] {
  return [
    ...(doc.assembly?.parts ?? []),
    ...doc.fittings.flatMap((f) => {
      const a = catalog.assets.find((a) => a.id === f.definitionId);
      if (!a) return [];
      const offset = transformPoint(
        [a.bounds.min[0], a.bounds.min[1]],
        f.quarterTurns,
        f.reflected,
      );
      const elevation =
        doc.decks.find((d) => d.id === f.deckId)?.elevation ?? 0;
      return [
        {
          id: f.id,
          assetId: f.definitionId,
          ...(f.paint ? { paint: structuredClone(f.paint) } : {}),
          position: [
            f.position[0] / 32 - offset[0],
            f.position[1] / 32 - offset[1],
            elevation / 32 - a.bounds.min[2],
          ] as [number, number, number],
          rotation: (f.quarterTurns * Math.PI) / 2,
          flipped: f.reflected,
          removedCells: [],
        },
      ];
    }),
  ];
}
export function editVisualPart(
  doc: LayoutDocument,
  part: PartPlacement,
  catalog: PartCatalog,
): LayoutDocument {
  const f = doc.fittings.find((f) => f.id === part.id);
  if (f) {
    const a = catalog.assets.find((a) => a.id === part.assetId)!;
    const angle = classifyLegacyYaw(part.rotation, String(part.rotation));
    if (angle.status !== "representable" || angle.yawStep % 18 !== 0)
      throw Error(
        "This legacy floorplan fitting requires 90° rotation; convert its placement before using finer rotation.",
      );
    const turns = angle.yawStep / 18;
    const offset = transformPoint(
      [a.bounds.min[0], a.bounds.min[1]],
      turns,
      part.flipped,
    );
    const anchor = [
      (part.position[0] + offset[0]) * 32,
      (part.position[1] + offset[1]) * 32,
    ];
    if (
      !anchor.every(
        (n) => Number.isFinite(n) && Math.abs(n - Math.round(n)) <= 1e-8,
      )
    )
      throw Error("Move this floorplan fitting on the 1/32 m grid.");
    const deck = doc.decks.find((d) => d.id === f.deckId);
    const expectedZ = (deck?.elevation ?? 0) / 32 - a.bounds.min[2];
    if (
      !Number.isFinite(part.position[2]) ||
      Math.abs(part.position[2] - expectedZ) > 1e-8
    )
      throw Error(
        "This floorplan fitting must stay on its deck; use an explicit 3D placement before changing height.",
      );
    f.position = [Math.round(anchor[0]), Math.round(anchor[1])];
    f.quarterTurns = turns;
    f.reflected = part.flipped;
    if (part.paint) f.paint = structuredClone(part.paint);
    else delete f.paint;
  } else if (doc.assembly)
    doc.assembly.parts = doc.assembly.parts.map((p) =>
      p.id === part.id ? part : p,
    );
  return doc;
}
export function assemblyDocument(
  doc: LayoutDocument,
  catalog: PartCatalog,
): AssemblyDocument {
  return {
    schema: "sidereal.assembly-draft.v1",
    id: doc.id,
    name: doc.name,
    parts: layoutVisualParts(doc, catalog),
  };
}

/** Cosmetic edits must not resolve attachments or snap a component's transform. */
export function paintVisualPart(
  current: LayoutDocument,
  id: string,
  paint: HullPaint | undefined,
  catalog: PartCatalog,
): LayoutDocument {
  validateHullPaint(paint);
  const doc = structuredClone(current);
  const target =
    doc.assembly?.parts.find((p) => p.id === id) ??
    doc.fittings.find((f) => f.id === id);
  if (!target) throw Error("Component is unavailable");
  const assetId = "assetId" in target ? target.assetId : target.definitionId;
  const asset = catalog.assets.find((a) => a.id === assetId);
  if (!asset || !canPaintHullAsset(asset))
    throw Error("This component has no hull paint controls");
  if (paint && Object.keys(paint).length) target.paint = structuredClone(paint);
  else delete target.paint;
  return doc;
}
