import { prefabById } from "@sidereal/content/prefabs";
import type { ConstructionDocument } from "@sidereal/content/construction";
import { isPrefabConstruction } from "./prefab-construction";

/** The first admitted draft chooses its class; saved drafts and registered templates retain it. */
export function assertPrefabSizeClass(
  next: ConstructionDocument,
  prior?: ConstructionDocument,
  draftId?: string,
): void {
  if (prior && isPrefabConstruction(prior)) {
    if (
      !isPrefabConstruction(next) ||
      next.prefab.document.sizeClass !== prior.prefab.document.sizeClass
    )
      throw Error("Blueprint size class is fixed at creation");
  }
  if (!isPrefabConstruction(next)) return;
  const doc = next.prefab.document;
  const registered = prefabById(doc.id);
  const draftTemplate = draftId?.startsWith("prefab.")
    ? prefabById(draftId.slice(7))
    : undefined;
  if (
    (registered && registered.sizeClass !== doc.sizeClass) ||
    (draftTemplate && draftTemplate.sizeClass !== doc.sizeClass)
  )
    throw Error("Registered template size class is fixed");
}
