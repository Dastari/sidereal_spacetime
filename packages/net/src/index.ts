import { DbConnection, tables } from "./generated";
export { DbConnection, tables };
export type {
  Ship as ShipRow,
  Character as CharacterRow,
  Station as StationRow,
  EditReceipt as ReceiptRow,
} from "./generated/types";
export type NetworkState = "connecting" | "ready" | "offline";
export function connect(
  onChange: () => void,
  onStatus: (status: NetworkState, error?: string) => void,
): DbConnection {
  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const builder = DbConnection.builder()
    .withUri(url.origin)
    .withDatabaseName(import.meta.env.VITE_DATABASE)
    .withToken(localStorage.getItem("sidereal.lab.token") ?? undefined)
    .onConnect((connection, _identity, token) => {
      localStorage.setItem("sidereal.lab.token", token);
      connection
        .subscriptionBuilder()
        .onApplied(() => {
          onStatus("ready");
          onChange();
        })
        .onError((e) => onStatus("offline", String(e.event)))
        .subscribe([
          tables.ownCharacters,
          tables.ownShips,
          tables.ownStations,
          tables.ownEditReceipts,
        ]);
    })
    .onConnectError((_context, error) => onStatus("offline", String(error)))
    .onDisconnect(() => onStatus("offline"));
  const connection = builder.build();
  for (const table of [
    connection.db.ownCharacters,
    connection.db.ownShips,
    connection.db.ownStations,
    connection.db.ownEditReceipts,
  ]) {
    table.onInsert(onChange);
    table.onUpdate(onChange);
    table.onDelete(onChange);
  }
  return connection;
}
