import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import { readLayout } from "@sidereal/sim/layout-validation";
import { recoveryKey, writeCheckpoint, type Checkpoint } from "./state";
export const WAYFARER_TEMPLATE_HASH =
  "362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340";
export const WAYFARER_TEMPLATE_ID = "wayfarer-semantic-candidate-r001";
/** Fork a pinned authored source. A local draft is not a qualified live instance. */
export function createWayfarerTemplateDraft(
  raw: unknown,
  draftId: string,
): LayoutDocument {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      draftId,
    )
  )
    throw Error("A fresh local draft UUID is required");
  const snapshot = compileConstruction(JSON.stringify(raw));
  if (snapshot.sha256 !== WAYFARER_TEMPLATE_HASH)
    throw Error("Wayfarer template revision differs from the qualified source");
  const doc = readLayout(JSON.parse(snapshot.canonical).layout);
  if (
    doc.id !== WAYFARER_TEMPLATE_ID ||
    doc.tiles.length !== 51 ||
    doc.assembly?.parts.length !== 211 ||
    doc.decks.length !== 1
  )
    throw Error("Unexpected Wayfarer template structure");
  doc.id = draftId;
  doc.name = "Wayfarer · editable draft";
  doc.source = null;
  doc.dependencies.push({
    id: "template-origin:" + WAYFARER_TEMPLATE_ID,
    revision: WAYFARER_TEMPLATE_HASH,
  });
  readLayout(doc);
  return doc;
}
/** Saving the current in-memory proposal is a precondition to switching drafts.
 * CAS protects a concurrent editor; blocked recovery is never cleared here. */
export function preserveBeforeTemplate(
  storage: Pick<Storage, "getItem" | "setItem">,
  identity: string,
  expected: string | null,
  checkpoint: Checkpoint,
  blocked: boolean,
): string {
  if (blocked)
    throw Error(
      "Resolve or export the conflicting/recovery draft before loading a template",
    );
  return writeCheckpoint(
    storage,
    recoveryKey(identity, checkpoint.history.present),
    expected,
    checkpoint,
  );
}
