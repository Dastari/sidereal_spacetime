import type { LayoutDocument } from "@sidereal/content/ship-layout";
import type { BoundaryTreatmentOverride } from "@sidereal/content/layout-boundary-treatments";
import { compileLayout, type LayoutWall } from "@sidereal/sim/layout-compiler";
import { readLayout } from "@sidereal/sim/layout-validation";

export type BoundaryTreatmentPatch = Partial<
  Pick<
    BoundaryTreatmentOverride,
    "treatment" | "heightUnits" | "reservationSide"
  >
>;

/** One ordinary draft/history edit. Existing native pins are preserved, not requalified. */
export function editBoundaryTreatment(
  doc: LayoutDocument,
  selected: LayoutWall,
  patch: BoundaryTreatmentPatch,
  newId: string,
): LayoutDocument {
  if (doc.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error("Boundary treatments require an explicit v2 draft.");
  if (
    Object.keys(patch).some(
      (key) => !["treatment", "heightUnits", "reservationSide"].includes(key),
    )
  )
    throw Error("Unsupported treatment edit.");
  const topology = compileLayout(doc);
  const wall = topology.walls.find((w) => w.key === selected.key);
  if (!wall || JSON.stringify(wall) !== JSON.stringify(selected))
    throw Error(
      "The selected boundary changed. Select its current span before editing.",
    );
  if (topology.diagnostics.some((d) => d.code === "treatment-conflict"))
    throw Error(
      "Resolve conflicting boundary attachments before editing treatments.",
    );
  const existing = doc.structure.boundaryTreatments.find(
    (o) => o.id === wall.treatment?.overrideId,
  );
  const next: BoundaryTreatmentOverride = {
    ...(existing ?? {
      id: newId,
      deckId: wall.deckId,
      source: wall.source,
      sourceAnchorId: wall.anchorId,
      a: [...wall.a],
      b: [...wall.b],
      treatment: "auto",
    }),
    ...patch,
  };
  if ("heightUnits" in patch && patch.heightUnits === undefined)
    delete next.heightUnits;
  if (!existing && doc.structure.boundaryTreatments.some((o) => o.id === newId))
    throw Error("Treatment identity is already in use.");
  const profile = doc.structure.deckProfiles.find(
    (p) => p.deckId === wall.deckId,
  );
  if (
    !profile ||
    (next.heightUnits !== undefined && next.heightUnits > profile.clearHeight)
  )
    throw Error("Treatment height must fit the deck's clear height.");
  const result: LayoutDocument = {
    ...doc,
    structure: {
      ...doc.structure,
      boundaryTreatments: existing
        ? doc.structure.boundaryTreatments.map((o) =>
            o.id === existing.id ? next : o,
          )
        : [...doc.structure.boundaryTreatments, next],
    },
  };
  // Strict normal admission checks patch values without mutating the old checkpoint.
  readLayout(result);
  return result;
}
