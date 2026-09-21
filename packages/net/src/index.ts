export type { SharedWorldReadiness } from "./bind-shared-world";
import { bindSharedWorld } from "./bind-shared-world";
export { SharedWorldStore } from "./shared-world-store";
export type {
  SharedAdmission,
  SharedShipDescription,
  SharedBodyDescription,
} from "./shared-world-store";
export { createSharedWorldPresentation } from "./shared-world-presentation";
const sharedBindings = new WeakMap<
  DbConnection,
  ReturnType<typeof bindSharedWorld>
>();
export const getSharedWorldBinding = (connection: DbConnection | null) =>
  connection ? sharedBindings.get(connection) : undefined;
import { bindGameSessionProof } from "./game-session-proof";
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
  const proofAbort = new AbortController();
  resources.listen(() => proofAbort.abort());
  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const builder = DbConnection.builder()
    .withUri(url.origin)
    .withDatabaseName(import.meta.env.VITE_DATABASE)
    .withToken(
      auth?.token ?? localStorage.getItem("sidereal.lab.token") ?? undefined,
    )
    .onConnect(async (connection, _identity, token) => {
      // Preserve the original development credential: browser reconnects may
      // return only a short-lived host WebSocket ticket.
      if (!auth && !localStorage.getItem("sidereal.lab.token"))
        localStorage.setItem("sidereal.lab.token", token);
      if (auth) {
        const timeout = setTimeout(() => proofAbort.abort(), 10_000);
        try {
          await bindGameSessionProof({
            origin: url.origin,
            database: import.meta.env.VITE_DATABASE,
            connectionId: connection.connectionId!.toHexString(),
            token: auth.token,
            signal: proofAbort.signal,
          });
        } catch (error) {
          if (connection.isActive)
            onStatus(
              "offline",
              error instanceof Error
                ? error.message
                : "Game session verification failed",
            );
          connection.disconnect();
          return;
        } finally {
          clearTimeout(timeout);
        }
      }
      if (proofAbort.signal.aborted || !connection.isActive) return;
      {
        sharedBindings.set(
          connection,
          bindSharedWorld({
            connection,
            resources,
            onError: (message) => onStatus("offline", message),
          }),
        );
      }
      const subscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          if (!resources.applied(subscription)) return;
          onStatus("ready");
          onChange();
        })
        .onError((e) => onStatus("offline", subscriptionErrorMessage(e)))
        .subscribe([
          // Gameplay reads are server-filtered for accepted owned ships and reviews.
          tables.ownGameShipAccess,
          tables.ownConstructionInstances,
          tables.ownConstructionDecks,
          tables.ownConstructionLocation,
          tables.ownConstructionSeat,
          tables.ownAuthoredFlights,
          tables.ownAuthoredFlightFittings,
          tables.ownConstructionDoors,
          tables.ownConstructionNativePressure,
          tables.ownNativeAirlocks,
          tables.ownWayfarerRefitOffer,
          tables.ownWayfarerRefitAttachments,
          tables.ownConstructionTraversals,
          tables.ownConstructionTraversalLinks,
          tables.ownConstructionStairWalks,
          tables.ownConstructionStairEgressGeometry,
          ...(new URLSearchParams(location.search).has("constructionReview")
            ? [tables.ownConstructionGrants]
            : []),
          tables.ownIdentityLinks,
          tables.ownAppearance,
          tables.ownCharacters,
          tables.ownShips,
          tables.ownStations,
          tables.ownEditReceipts,
          tables.ownSpaceBodies,
          tables.admittedSystemScapes,
          tables.ownShipZones,
          tables.nearbyFieldAsteroids,
          tables.ownActuatorOutputs,
          tables.ownInteractions,
          tables.ownCombat,
          tables.ownGroundItems,
          tables.ownInventoryState,
          tables.ownInventoryItems,
          tables.ownInventoryContainers,
          tables.ownInventoryHotbar,
          tables.ownReachableCargoContainers,
          tables.ownReachableCargoItems,
          tables.ownCarriedInventoryRevisions,
        ]);
      resources.retain("game", subscription);
    })
    .onConnectError((_context, error) => onStatus("offline", String(error)))
    .onDisconnect(() => onStatus("offline"));
  const connection = builder.build();
  for (const table of [
    // Gameplay reads are server-filtered for accepted owned ships and reviews.
    connection.db.ownGameShipAccess,
    connection.db.ownConstructionInstances,
    connection.db.ownConstructionDecks,
    connection.db.ownConstructionLocation,
    connection.db.ownConstructionSeat,
    connection.db.ownAuthoredFlights,
    connection.db.ownAuthoredFlightFittings,
    connection.db.ownConstructionDoors,
    connection.db.ownConstructionNativePressure,
    connection.db.ownNativeAirlocks,
    connection.db.ownWayfarerRefitOffer,
    connection.db.ownWayfarerRefitAttachments,
    connection.db.ownConstructionTraversals,
    connection.db.ownConstructionTraversalLinks,
    connection.db.ownConstructionStairWalks,
    connection.db.ownConstructionStairEgressGeometry,
    ...(new URLSearchParams(location.search).has("constructionReview")
      ? [connection.db.ownConstructionGrants]
      : []),
    connection.db.ownIdentityLinks,
    connection.db.ownAppearance,
    connection.db.ownCharacters,
    connection.db.ownShips,
    connection.db.ownStations,
    connection.db.ownEditReceipts,
    connection.db.ownSpaceBodies,
    connection.db.admittedSystemScapes,
    connection.db.ownShipZones,
    connection.db.nearbyFieldAsteroids,
    connection.db.ownActuatorOutputs,
    connection.db.ownInteractions,
    connection.db.ownCombat,
    connection.db.ownGroundItems,
    connection.db.ownInventoryState,
    connection.db.ownInventoryItems,
    connection.db.ownInventoryContainers,
    connection.db.ownInventoryHotbar,
    connection.db.ownReachableCargoContainers,
    connection.db.ownReachableCargoItems,
    connection.db.ownCarriedInventoryRevisions,
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
