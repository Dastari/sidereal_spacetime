/**
 * Client projections for pinned item definitions (roadmap X-2). The game client presents each
 * instance with the revision it pins, so it needs the published item and weapon revisions (game
 * content, never drafts or publisher identities) and the explicit pins of the items it can see.
 */
import { t, type InferSchema, type ViewCtx } from "spacetimedb/server";
import type world from "./index";
import { reachableCargoItems } from "./scoped-inventory-authority";

type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;

export const publishedItemDefinitionProjection = t.row(
  "PublishedItemDefinition",
  {
    definitionRef: t.string().primaryKey(),
    kind: t.string(),
    definitionId: t.string(),
    revision: t.u64(),
    /** "published" or "retired" (retired revisions stay resolvable for instances pinned to them). */
    status: t.string(),
    payloadJson: t.string(),
    sha256: t.string(),
  },
);
export function publishedItemDefinitions(ctx: ReadContext) {
  return (["item", "weapon"] as const).flatMap((kind) =>
    [...ctx.db.contentDefinition.by_kind.filter(kind)].map((r) => ({
      definitionRef: r.definitionRef,
      kind: r.kind,
      definitionId: r.definitionId,
      revision: r.revision,
      status: r.status,
      payloadJson: r.payloadJson,
      sha256: r.sha256,
    })),
  );
}

export const itemPinProjection = t.row("VisibleItemDefinitionPin", {
  itemId: t.string().primaryKey(),
  definitionId: t.string(),
  itemRevision: t.u64(),
  weaponRevision: t.u64(),
});
/** Explicit pins of the viewer's own characters' items and of cargo they can reach. Items without
 * a row pin revision 1 (created before X-2). */
export function ownItemDefinitionPins(ctx: ReadContext) {
  const ids = new Set<string>();
  for (const character of ctx.db.character.by_owner.filter(ctx.sender))
    for (const item of ctx.db.inventoryItem.by_character.filter(character.id))
      ids.add(item.id);
  for (const item of reachableCargoItems(ctx)) ids.add(item.id);
  return [...ids].flatMap((itemId) => {
    const pin = ctx.db.inventoryItemPin.itemId.find(itemId);
    return pin
      ? [
          {
            itemId,
            definitionId: pin.definitionId,
            itemRevision: pin.itemRevision,
            weaponRevision: pin.weaponRevision,
          },
        ]
      : [];
  });
}
