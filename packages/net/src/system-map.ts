import { bindGameSessionProof } from "./game-session-proof";
import { DbConnection, tables } from "./generated";
import type { GameAuthentication } from "./connection-session";
export function connectSystemMap(
  change: () => void,
  status: (state: "connecting" | "ready" | "offline", error?: string) => void,
  auth?: GameAuthentication,
) {
  if (!auth) throw Error("Sign in to view the live map");
  const url = new URL(location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const c = DbConnection.builder()
    .withUri(url.origin)
    .withDatabaseName(import.meta.env.VITE_DATABASE)
    .withToken(auth.token)
    .onConnect(async (c) => {
      try {
        await bindGameSessionProof({
          origin: url.origin,
          database: import.meta.env.VITE_DATABASE,
          connectionId: c.connectionId!.toHexString(),
          token: auth.token,
          signal: AbortSignal.timeout(10000),
        });
        if (!c.isActive) return;
        c.subscriptionBuilder()
          .onApplied(() => {
            status("ready");
            change();
          })
          .onError((e) => status("offline", String(e.event)))
          .subscribe([
            tables.ownConstructionGrants,
            tables.ownSystemMaps,
            tables.ownMapShips,
          ]);
      } catch (e) {
        status("offline", String(e));
        c.disconnect();
      }
    })
    .onConnectError((_c, e) => status("offline", String(e)))
    .onDisconnect(() => status("offline"))
    .build();
  for (const table of [
    c.db.ownConstructionGrants,
    c.db.ownSystemMaps,
    c.db.ownMapShips,
  ]) {
    table.onInsert(change);
    table.onUpdate(change);
    table.onDelete(change);
  }
  return c;
}
