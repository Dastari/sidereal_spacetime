import { registerSession, canConsume } from "./auth";
import {
  table,
  t,
  SenderError,
  type ReducerCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
export const connectionPresence = table(
  {
    name: "connection_presence",
    indexes: [{ accessor: "by_owner", algorithm: "btree", columns: ["owner"] }],
  },
  { connectionId: t.string().primaryKey(), owner: t.identity() },
);
type Context = ReducerCtx<InferSchema<typeof world>>;
export function connected(ctx: Context) {
  if (!ctx.connectionId) throw new SenderError("WebSocket connection required");
  registerSession(ctx);
  const connectionId = ctx.connectionId.toHexString();
  if (ctx.db.connectionPresence.connectionId.find(connectionId)) return;
  if ([...ctx.db.connectionPresence.by_owner.filter(ctx.sender)].length >= 16)
    throw new SenderError("Too many active account connections");
  ctx.db.connectionPresence.insert({ connectionId, owner: ctx.sender });
}
/** Presence is account-scoped. Tabs share a character; only the final socket
 * loss revokes character occupancy. Per-command freshness limits still apply. */
export function lastDisconnected(ctx: Context): boolean {
  if (ctx.connectionId) {
    ctx.db.connectionPresence.connectionId.delete(
      ctx.connectionId.toHexString(),
    );
    ctx.db.authSession.connectionId.delete(ctx.connectionId.toHexString());
  }
  return !canConsume(ctx, ctx.sender);
}
