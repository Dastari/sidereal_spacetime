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
    .filter(
      (p) =>
        !catalog.assets.some((a) => a.id === p.assetId) ||
        doc.assembly!.revisions[p.assetId] !==
          visualRevision(catalog, p.assetId),
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
    const turns = ((Math.round(part.rotation / (Math.PI / 2)) % 4) + 4) % 4;
    const offset = transformPoint(
      [a.bounds.min[0], a.bounds.min[1]],
      turns,
      part.flipped,
    );
    f.position = [
      Math.round((part.position[0] + offset[0]) * 32),
      Math.round((part.position[1] + offset[1]) * 32),
    ];
    f.quarterTurns = turns;
    f.reflected = part.flipped;
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
