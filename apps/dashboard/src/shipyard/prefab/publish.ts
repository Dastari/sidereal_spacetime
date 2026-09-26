/**
 * The one seam between the prefab editor and construction authority.
 *
 * Publication wraps a prefab into the existing `ConstructionDocument` with
 * `prefabConstructionDocument(doc, catalog)` from `@sidereal/sim/prefab-construction`, so the
 * existing reducers apply unchanged: saveConstructionDraft -> publishConstructionBlueprint ->
 * spawnConstructionBlueprint. The adapter is loaded on demand so the editor bundle does not
 * pull the construction compiler until the publish dialog opens.
 */
import { readShipPrefab, validateShipPrefab, type PrefabComponentCatalog, type PrefabIssue, type ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";

type Doc = ShipPrefabDocumentV1;

export interface PrefabPublication {
  /** Construction document JSON for `saveConstructionDraft`. */
  documentJson: string;
  /** Construction draft id: the derived layout id (`prefab.<prefab id>`). */
  draftId: string;
  /** Deck the review instance spawns from. */
  deckId: string;
}

export type PublicationAdapter =
  | { available: true; build(doc: Doc): PrefabPublication }
  | { available: false; reason: string };

type AdapterModule = Pick<typeof import("@sidereal/sim/prefab-construction"), "prefabConstructionDocument">;

/** Pure wrapper, exported for tests: the exact bytes the dialog would save. */
export function buildPublication(mod: AdapterModule, doc: Doc, catalog: PrefabComponentCatalog): PrefabPublication {
  const construction = mod.prefabConstructionDocument(readShipPrefab(doc), catalog);
  return {
    documentJson: JSON.stringify(construction),
    draftId: construction.layout.id,
    deckId: construction.layout.playableDeckId,
  };
}

export async function loadPublicationAdapter(catalog: PrefabComponentCatalog): Promise<PublicationAdapter> {
  let mod: AdapterModule;
  try {
    mod = await import("@sidereal/sim/prefab-construction");
  } catch (e) {
    return { available: false, reason: `The prefab construction adapter failed to load: ${String(e instanceof Error ? e.message : e)}` };
  }
  if (typeof mod.prefabConstructionDocument !== "function")
    return { available: false, reason: "Construction authority for prefab ships is not installed in this build. Export the JSON to hand it over." };
  return { available: true, build: (doc) => buildPublication(mod, doc, catalog) };
}

export interface PublicationGate {
  ok: boolean;
  errors: PrefabIssue[];
  warnings: PrefabIssue[];
}

/** Pre-publication gate: strict admission plus zero grammar errors. */
export function publicationGate(doc: Doc, catalog: PrefabComponentCatalog): PublicationGate {
  try {
    readShipPrefab(doc);
  } catch (e) {
    const issue: PrefabIssue = { severity: "error", code: "document.admission", message: String(e instanceof Error ? e.message : e), ref: { kind: "document" } };
    return { ok: false, errors: [issue], warnings: [] };
  }
  const issues = validateShipPrefab(doc, catalog);
  const errors = issues.filter((i) => i.severity === "error");
  return { ok: errors.length === 0, errors, warnings: issues.filter((i) => i.severity === "warning") };
}
