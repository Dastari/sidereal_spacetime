import {
  createConnectionResources,
  subscriptionErrorMessage,
} from "./connection-resources";
import { DbConnection, tables } from "./generated";
export { DbConnection, tables };
export type {
  VisibleIdentityLink as IdentityLinkRow,
  CharacterAppearanceStatus as AppearanceRow,
  CombatStatus as CombatRow,
  Ship as ShipRow,
  Character as CharacterRow,
  Station as StationRow,
  EditReceipt as ReceiptRow,
  SpaceBody as SpaceBodyRow,
  ActuatorOutput as ActuatorOutputRow,
  VisibleInteraction as InteractionRow,
  InventoryStatus as InventoryStatusRow,
  VisibleInventoryItem as InventoryItemRow,
  VisibleInventoryContainer as InventoryContainerRow,
  VisibleInventoryHotbar as InventoryHotbarRow,
} from "./generated/types";
export type NetworkState = "connecting" | "ready" | "offline";
export function connect(
  onChange: () => void,
  onStatus: (status: NetworkState, error?: string) => void,
  auth?: { token: string; kind: "oidc" },
): DbConnection {
  const resources = createConnectionResources();
  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const builder = DbConnection.builder()
    .withUri(url.origin)
    .withDatabaseName(import.meta.env.VITE_DATABASE)
    .withToken(
      auth?.token ?? localStorage.getItem("sidereal.lab.token") ?? undefined,
    )
    .onConnect((connection, _identity, token) => {
      if (!auth) localStorage.setItem("sidereal.lab.token", token);
      const subscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          if (!resources.applied(subscription)) return;
          onStatus("ready");
          onChange();
        })
        .onError((e) => onStatus("offline", subscriptionErrorMessage(e)))
        .subscribe([
          ...(new URLSearchParams(location.search).has("constructionReview")
            ? [
                tables.ownConstructionGrants,
                tables.ownConstructionInstances,
                tables.ownConstructionDecks,
                tables.ownConstructionLocation,
                tables.ownConstructionDoors,
                tables.ownConstructionNativePressure,
                tables.ownConstructionTraversals,
                tables.ownConstructionTraversalLinks,
              ]
            : []),
          tables.ownIdentityLinks,
          tables.ownAppearance,
          tables.ownCharacters,
          tables.ownShips,
          tables.ownStations,
          tables.ownEditReceipts,
          tables.ownSpaceBodies,
          tables.ownActuatorOutputs,
          tables.ownInteractions,
          tables.ownCombat,
          tables.ownGroundItems,
          tables.ownInventoryState,
          tables.ownInventoryItems,
          tables.ownInventoryContainers,
          tables.ownInventoryHotbar,
        ]);
      resources.retain("game", subscription);
    })
    .onConnectError((_context, error) => onStatus("offline", String(error)))
    .onDisconnect(() => onStatus("offline"));
  const connection = builder.build();
  for (const table of [
    ...(new URLSearchParams(location.search).has("constructionReview")
      ? [
          connection.db.ownConstructionGrants,
          connection.db.ownConstructionInstances,
          connection.db.ownConstructionDecks,
          connection.db.ownConstructionLocation,
          connection.db.ownConstructionDoors,
          connection.db.ownConstructionNativePressure,
          connection.db.ownConstructionTraversals,
          connection.db.ownConstructionTraversalLinks,
        ]
      : []),
    connection.db.ownIdentityLinks,
    connection.db.ownAppearance,
    connection.db.ownCharacters,
    connection.db.ownShips,
    connection.db.ownStations,
    connection.db.ownEditReceipts,
    connection.db.ownSpaceBodies,
    connection.db.ownActuatorOutputs,
    connection.db.ownInteractions,
    connection.db.ownCombat,
    connection.db.ownGroundItems,
    connection.db.ownInventoryState,
    connection.db.ownInventoryItems,
    connection.db.ownInventoryContainers,
    connection.db.ownInventoryHotbar,
  ]) {
    table.onInsert(onChange);
    table.onUpdate(onChange);
    table.onDelete(onChange);
    resources.listen(() => {
      table.removeOnInsert(onChange);
      table.removeOnUpdate(onChange);
      table.removeOnDelete(onChange);
    });
  }
  const disconnect = connection.disconnect.bind(connection);
  connection.disconnect = () => {
    try {
      resources.dispose();
    } finally {
      disconnect();
    }
  };
  return connection;
}
