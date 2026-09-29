/**
 * Feeds the client's item presentation (X-2) from the server's published item and weapon revisions
 * and the explicit pins of the viewer's items, with the same resolution rule as the server.
 */
import {
  implicitPin,
  registryFromRows,
  resolveItemDefinition,
  resolveWeaponDefinition,
  type ItemPin,
} from "@sidereal/sim/pinned-definitions";
import {
  setItemPresentationSource,
  type ItemInstanceRef,
} from "@sidereal/content/item-presentation";
import type { DbConnection } from "./generated";

export function installItemPresentation(connection: DbConnection) {
  const reader = registryFromRows(
    connection.db.publishedItemDefinitions.iter(),
  );
  const pins = new Map<string, ItemPin & { definitionId: string }>();
  for (const p of connection.db.ownItemDefinitionPins.iter())
    pins.set(p.itemId, p);
  const pinOf = (i: ItemInstanceRef): ItemPin => {
    const p = i.id ? pins.get(i.id) : undefined;
    return p && p.definitionId === i.definitionId
      ? p
      : implicitPin(i.definitionId);
  };
  setItemPresentationSource({
    item: (i) =>
      resolveItemDefinition(reader, i.definitionId, pinOf(i).itemRevision),
    weapon: (i) =>
      resolveWeaponDefinition(reader, i.definitionId, pinOf(i).weaponRevision),
  });
}
