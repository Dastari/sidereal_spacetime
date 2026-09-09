import { SenderError } from "spacetimedb/server";
import type { Identity } from "spacetimedb";

export interface InputControlLease {
  characterId: string;
  owner: Identity;
  connectionId: string;
  sequence: bigint;
}
interface Actor {
  id: string;
  owner: Identity;
  connected: boolean;
  sprinting: boolean;
}
interface Motion {
  characterId: string;
  sequence: bigint;
  throttle: number;
  turn: number;
  dx: number;
  dy: number;
  sprint: boolean;
  updatedMicros: bigint;
}
interface Index<K, R> {
  find(key: K): R | null | undefined;
  update(row: R): unknown;
  delete(key: K): unknown;
}
/** Structural context keeps this adapter independent of shared schema registration. */
export interface InputControlContext {
  sender: Identity;
  connectionId: { toHexString(): string } | null;
  timestamp: { microsSinceUnixEpoch: bigint };
  db: {
    inputControl: {
      characterId: Index<string, InputControlLease>;
      by_connection: { filter(id: string): Iterable<InputControlLease> };
      insert(row: InputControlLease): unknown;
    };
    inputControlCursor: {
      connectionId: Index<string, InputControlLease>;
      insert(row: InputControlLease): unknown;
    };
    character: {
      id: Pick<Index<string, Actor>, "find" | "update">;
      by_owner: { filter(owner: Identity): Iterable<Actor> };
    };
    input: { characterId: Pick<Index<string, Motion>, "find" | "update"> };
    connectionPresence: {
      connectionId: {
        find(id: string): { owner: Identity } | null | undefined;
      };
    };
    authSession: {
      connectionId: {
        find(
          id: string,
        ):
          | { owner: Identity; game: boolean; expiresMicros: bigint }
          | null
          | undefined;
      };
    };
    retiredIdentity: { source: { find(owner: Identity): unknown } };
  };
}
const same = (a: Identity, b: Identity) => a.isEqual(b);
function live(ctx: InputControlContext, owner: Identity, connectionId: string) {
  const presence = ctx.db.connectionPresence.connectionId.find(connectionId);
  const session = ctx.db.authSession.connectionId.find(connectionId);
  return !!(
    presence &&
    same(presence.owner, owner) &&
    session &&
    same(session.owner, owner) &&
    session.game &&
    session.expiresMicros > ctx.timestamp.microsSinceUnixEpoch &&
    !ctx.db.retiredIdentity.source.find(owner)
  );
}
function caller(ctx: InputControlContext): Actor | null {
  const connectionId = ctx.connectionId?.toHexString();
  if (!connectionId || !live(ctx, ctx.sender, connectionId)) return null;
  const actor = ctx.db.character.by_owner
    .filter(ctx.sender)
    [Symbol.iterator]()
    .next().value;
  return actor?.connected && same(actor.owner, ctx.sender) ? actor : null;
}
function clearMotion(
  ctx: InputControlContext,
  characterId: string,
  sequence?: bigint,
) {
  const motion = ctx.db.input.characterId.find(characterId);
  if (
    motion &&
    (sequence !== undefined ||
      motion.throttle ||
      motion.turn ||
      motion.dx ||
      motion.dy ||
      motion.sprint)
  )
    ctx.db.input.characterId.update({
      ...motion,
      sequence: sequence ?? motion.sequence,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
      updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  const actor = ctx.db.character.id.find(characterId);
  if (actor?.sprinting)
    ctx.db.character.id.update({ ...actor, sprinting: false });
}
/** Explicit focus/user intent only; idle setIntent must never call this. */
export function claimInputControl(ctx: InputControlContext): InputControlLease {
  const actor = caller(ctx);
  if (!actor) throw new SenderError("Connected game character required");
  const connectionId = ctx.connectionId!.toHexString();
  const prior = ctx.db.inputControl.characterId.find(actor.id);
  if (
    prior &&
    same(prior.owner, ctx.sender) &&
    prior.connectionId === connectionId
  )
    return prior;
  const cursor = ctx.db.inputControlCursor.connectionId.find(connectionId);
  if (
    cursor &&
    (!same(cursor.owner, ctx.sender) || cursor.characterId !== actor.id)
  )
    throw new SenderError("Connection character changed; reconnect required");
  const lease: InputControlLease = {
    characterId: actor.id,
    owner: ctx.sender,
    connectionId,
    sequence: cursor?.sequence ?? 0n,
  };
  if (!cursor) ctx.db.inputControlCursor.insert(lease);
  clearMotion(ctx, actor.id, lease.sequence);
  if (prior) ctx.db.inputControl.characterId.update(lease);
  else ctx.db.inputControl.insert(lease);
  return lease;
}
/** Check before expensive gameplay guards; background/stale packets are no-ops. */
export function canRecordInput(
  ctx: InputControlContext,
  characterId: string,
  sequence: bigint,
): boolean {
  if (
    typeof sequence !== "bigint" ||
    sequence <= 0n ||
    sequence > 18446744073709551615n
  )
    return false;
  const connectionId = ctx.connectionId?.toHexString();
  const lease = ctx.db.inputControl.characterId.find(characterId);
  const actor = ctx.db.character.id.find(characterId);
  return !!(
    connectionId &&
    lease &&
    actor?.connected &&
    same(actor.owner, ctx.sender) &&
    same(lease.owner, ctx.sender) &&
    lease.connectionId === connectionId &&
    sequence > lease.sequence &&
    live(ctx, ctx.sender, connectionId)
  );
}
/** Call after station/traversal/couch validation in the same reducer transaction.
 * A later exception rolls back both this sequence and the motion update. */
export function recordInput(
  ctx: InputControlContext,
  characterId: string,
  sequence: bigint,
): boolean {
  if (!canRecordInput(ctx, characterId, sequence)) return false;
  const updated = {
    ...ctx.db.inputControl.characterId.find(characterId)!,
    sequence,
  };
  ctx.db.inputControl.characterId.update(updated);
  ctx.db.inputControlCursor.connectionId.update(updated);
  return true;
}
/** Explicit release or disconnect. Old sockets cannot clear the new holder. */
export function releaseInputControl(ctx: InputControlContext): number {
  const connectionId = ctx.connectionId?.toHexString();
  if (!connectionId) return 0;
  let released = 0;
  for (const lease of ctx.db.inputControl.by_connection.filter(connectionId)) {
    if (!same(lease.owner, ctx.sender)) continue;
    ctx.db.inputControl.characterId.delete(lease.characterId);
    clearMotion(ctx, lease.characterId);
    released++;
  }
  return released;
}
/** Call on actual socket disconnect, before or after deleting presence/session. */
export function disconnectInputControl(ctx: InputControlContext): number {
  const released = releaseInputControl(ctx);
  const connectionId = ctx.connectionId?.toHexString();
  if (connectionId) {
    const cursor = ctx.db.inputControlCursor.connectionId.find(connectionId);
    if (cursor && same(cursor.owner, ctx.sender))
      ctx.db.inputControlCursor.connectionId.delete(connectionId);
  }
  return released;
}
/** Tick consumption checks the exact holder, even if another tab remains admitted.
 * Returns false and clears only invalid existing leases; never grants a lease. */
export function consumeInputControl(
  ctx: InputControlContext,
  characterId: string,
): boolean {
  const lease = ctx.db.inputControl.characterId.find(characterId);
  if (!lease) return false;
  const actor = ctx.db.character.id.find(characterId);
  if (
    actor?.connected &&
    same(actor.owner, lease.owner) &&
    live(ctx, lease.owner, lease.connectionId)
  )
    return true;
  ctx.db.inputControl.characterId.delete(characterId);
  clearMotion(ctx, characterId);
  return false;
}
