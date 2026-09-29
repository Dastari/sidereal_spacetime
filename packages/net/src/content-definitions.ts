import { bindGameSessionProof } from "./game-session-proof";
import { DbConnection, tables } from "./generated";
import type { GameAuthentication } from "./connection-session";

/** Server-issued development tokens (issuer `localhost`) are game sessions already. */
function developmentToken(token: string) {
  try {
    const part = token.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as { iss?: unknown }).iss === "localhost";
  } catch {
    return false;
  }
}

/**
 * Studio Definitions workspace (roadmap X-1): own grants plus the admin-scoped registry views.
 * The server filters every row by the signed-in account's `definitions:<kind>` grants.
 */
export function connectDefinitions(
  change: () => void,
  status: (state: "connecting" | "ready" | "offline", error?: string) => void,
  auth?: GameAuthentication,
) {
  if (!auth) throw Error("Sign in to edit content definitions");
  const url = new URL(location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const c = DbConnection.builder()
    .withUri(url.origin)
    .withDatabaseName(import.meta.env.VITE_DATABASE)
    .withToken(auth.token)
    .onConnect(async (c) => {
      try {
        if (!developmentToken(auth.token))
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
            tables.adminContentDefinitionHeads,
            tables.adminContentDefinitions,
            tables.adminContentDefinitionUsage,
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
    c.db.adminContentDefinitionHeads,
    c.db.adminContentDefinitions,
    c.db.adminContentDefinitionUsage,
  ]) {
    table.onInsert(change);
    table.onUpdate?.(change);
    table.onDelete(change);
  }
  return c;
}
