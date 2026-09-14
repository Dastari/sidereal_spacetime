import rebuild from "../../content/src/construction-wayfarer-rebuild-visuals.json";
import { CONSTRUCTION_INSET_VISUALS } from "@sidereal/content/construction-inset-visuals";
import supplement from "@sidereal/content/construction-complex-visuals.json";

/** Additive authoring-preview assets. The authority's immutable r000 pin is unchanged. */
export const INSET_VISUAL_PARTS = [
  ...CONSTRUCTION_INSET_VISUALS.parts,
  ...supplement.parts,
  ...rebuild.parts,
];
