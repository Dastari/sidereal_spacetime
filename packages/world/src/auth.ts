import {
  SenderError,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
  t,
} from "spacetimedb/server";
import { Identity } from "spacetimedb";
import type world from "./index";
import { GAME_AUTH_POLICY } from "../../content/src/auth-policy";
import { classifyVerifiedClaims } from "../../sim/src/auth-policy";
import * as combat from "./combat";
import * as interactions from "./interactions";
type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
const forever = 18446744073709551615n;
function classify(ctx: Context, admittedExpiresSeconds?: number) {
  const jwt = ctx.senderAuth.jwt;
  try {
    return classifyVerifiedClaims(
      jwt
        ? {
            issuer: jwt.issuer,
            subject: jwt.subject,
            audience: jwt.audience,
            expiresSeconds:
              admittedExpiresSeconds ??
              (typeof jwt.fullPayload.exp === "number"
                ? jwt.fullPayload.exp
                : undefined),
          }
        : null,
      Number(ctx.timestamp.microsSinceUnixEpoch) / 1e6,
      GAME_AUTH_POLICY,
    );
  } catch (error) {
    throw new SenderError(
      error instanceof Error ? error.message : "Authentication rejected",
    );
  }
}
export function registerSession(ctx: Context) {
  const kind = classify(ctx);
  // Views identify the principal, not the requesting socket: admitting a dashboard
  // token here could inherit a simultaneous game token's owner-scoped projection.
  if (!kind.game)
    throw new SenderError("Game audience required for this database");
  if (!ctx.connectionId) throw new SenderError("WebSocket connection required");
  if (ctx.db.retiredIdentity.source.find(ctx.sender))
    throw new SenderError(
      "Development identity has been linked; sign in with OIDC",
    );
  const row = {
    connectionId: ctx.connectionId.toHexString(),
    owner: ctx.sender,
    kind: kind.kind,
    // Host WebSocket tickets replace the original provider expiry. OIDC
    // connections stay pending until an original verified provider proof binds.
    game: kind.kind === "development" && kind.game,
    expiresMicros:
      kind.expiresSeconds === undefined
        ? forever
        : BigInt(Math.floor(kind.expiresSeconds * 1e6)),
  };
  if (ctx.db.authSession.connectionId.find(row.connectionId))
    ctx.db.authSession.connectionId.update(row);
  else ctx.db.authSession.insert(row);
}
/** HTTP calls carry the original provider JWT in Authorization. The host verifies
 * that JWT; the module never accepts client-parsed claims or a requested expiry.
 * Browser WebSocket tickets instead expose a host-shortened 60-second exp. */
export function bindGameSession(ctx: Context, args: { connectionId: string }) {
  // Pinned host HTTP calls also run a transient connected/disconnected lifecycle.
  // Transport/connectionId is not a proof discriminator. Every host re-signed
  // token serializes hex_identity; original Dastari provider JWTs do not.
  if (
    ctx.senderAuth.jwt &&
    Object.hasOwn(ctx.senderAuth.jwt.fullPayload, "hex_identity")
  )
    throw new SenderError(
      "Original provider token required for session binding",
    );
  const kind = classify(ctx);
  if (kind.kind !== "oidc" || !kind.game || kind.expiresSeconds === undefined)
    throw new SenderError("OIDC game audience required for session binding");
  if (!/^[a-f0-9]{32}$/.test(args.connectionId))
    throw new SenderError("Invalid target connection");
  if (ctx.db.retiredIdentity.source.find(ctx.sender))
    throw new SenderError("Retired identity cannot bind a session");
  const presence = ctx.db.connectionPresence.connectionId.find(
    args.connectionId,
  );
  if (!presence || !presence.owner.isEqual(ctx.sender))
    throw new SenderError("An owned live game connection is required");
  const previous = ctx.db.authSession.connectionId.find(args.connectionId);
  if (
    previous &&
    (!previous.owner.isEqual(ctx.sender) || previous.kind !== "oidc")
  )
    throw new SenderError("Target connection admission does not match");
  const expiresMicros = BigInt(Math.floor(kind.expiresSeconds * 1e6));
  // The initial host ticket may outlive a nearly-expired provider token.
  // Always apply this proof's exact verified expiry, even when it is shorter.
  if (previous?.game && previous.expiresMicros === expiresMicros) return;
  const row = {
    connectionId: args.connectionId,
    owner: ctx.sender,
    kind: "oidc",
    game: true,
    expiresMicros,
  };
  if (previous) ctx.db.authSession.connectionId.update(row);
  else ctx.db.authSession.insert(row);
}
export function canReadGame(ctx: ReadContext): boolean {
  return (
    !ctx.db.retiredIdentity.source.find(ctx.sender) &&
    [...ctx.db.authSession.by_owner.filter(ctx.sender)].some((s) => s.game)
  );
}
export function canConsume(ctx: Context, owner: Identity): boolean {
  return (
    !ctx.db.retiredIdentity.source.find(owner) &&
    [...ctx.db.authSession.by_owner.filter(owner)].some(
      (s) => s.game && s.expiresMicros > ctx.timestamp.microsSinceUnixEpoch,
    )
  );
}
export function requireGame(ctx: Context) {
  if (!ctx.connectionId || !canConsume(ctx, ctx.sender))
    throw new SenderError("Active game authentication required");
  const session = ctx.db.authSession.connectionId.find(
    ctx.connectionId.toHexString(),
  );
  if (
    !session?.game ||
    !session.owner.isEqual(ctx.sender) ||
    session.expiresMicros <= ctx.timestamp.microsSinceUnixEpoch
  )
    throw new SenderError("Game session expired");
  // Preserve issuer/audience validation for the immutable socket claims, but
  // use the server-verified provider expiry bound to this exact connection.
  const kind = classify(
    ctx,
    session.kind === "oidc" ? Number(session.expiresMicros) / 1e6 : undefined,
  );
  if (!kind.game || kind.kind !== session.kind)
    throw new SenderError("Game session authentication does not match");
  return kind;
}
export function gameAction<A>(
  action: (ctx: Context, args: A) => void,
  requireStanding = false,
) {
  return (ctx: Context, args: A) => {
    requireGame(ctx);
    if (
      requireStanding &&
      (ctx.db.constructionTraversal.by_owner.filter(ctx.sender).next().value ||
        ctx.db.constructionStairWalk.by_owner.filter(ctx.sender).next().value)
    )
      throw new SenderError(
        "Finish active stair movement or finish/cancel the deck traversal before this action",
      );
    action(ctx, args);
  };
}
export function gameView<R>(view: (ctx: ReadContext) => R[]) {
  return (ctx: ReadContext): R[] => (canReadGame(ctx) ? view(ctx) : []);
}
export function clearOwner(ctx: Context, owner: Identity) {
  for (const actor of ctx.db.character.by_owner.filter(owner)) {
    combat.clearAim(ctx, actor.id);
    interactions.leaveCouch(ctx, actor.id);
    if (actor.connected || actor.sprinting)
      ctx.db.character.id.update({
        ...ctx.db.character.id.find(actor.id)!,
        connected: false,
        sprinting: false,
      });
    const seat = ctx.db.station.shipId.find(actor.shipId);
    if (seat?.occupantId === actor.id)
      ctx.db.station.id.update({ ...seat, occupantId: undefined });
    const input = ctx.db.input.characterId.find(actor.id);
    if (input)
      ctx.db.input.characterId.update({
        ...input,
        throttle: 0,
        turn: 0,
        dx: 0,
        dy: 0,
        sprint: false,
      });
  }
}
export function expireSessions(ctx: Context) {
  const affected: Identity[] = [];
  for (const session of ctx.db.authSession.iter())
    if (
      session.expiresMicros <= ctx.timestamp.microsSinceUnixEpoch ||
      ctx.db.retiredIdentity.source.find(session.owner)
    ) {
      ctx.db.authSession.connectionId.delete(session.connectionId);
      affected.push(session.owner);
    }
  for (const owner of affected)
    if (!canConsume(ctx, owner)) clearOwner(ctx, owner);
}
const opValid = (id: string) => /^[a-zA-Z0-9:_-]{1,80}$/.test(id);
export const identityLinkProjection = t.row("VisibleIdentityLink", {
  id: t.string().primaryKey(),
  characterId: t.string(),
  characterName: t.string(),
  sourceIdentity: t.string(),
  targetIdentity: t.string(),
  expiresMicros: t.u64(),
  status: t.string(),
  side: t.string(),
});
export function ownIdentityLinks(ctx: ReadContext) {
  if (!canReadGame(ctx)) return [];
  return [
    ...ctx.db.identityLink.by_source.filter(ctx.sender),
    ...ctx.db.identityLink.by_target.filter(ctx.sender),
  ].map((row) => ({
    id: row.id,
    characterId: row.characterId,
    characterName: row.characterName,
    sourceIdentity: row.source.toHexString(),
    targetIdentity: row.target.toHexString(),
    expiresMicros: row.expiresMicros,
    status: row.accepted ? "accepted" : "pending",
    side: row.source.isEqual(ctx.sender) ? "source" : "target",
  }));
}
export function requestIdentityLink(
  ctx: Context,
  args: {
    targetIdentity: string;
    expectedCharacterId: string;
    operationId: string;
  },
) {
  if (requireGame(ctx).kind !== "development")
    throw new SenderError("Only a development identity can request migration");
  if (
    !opValid(args.operationId) ||
    !/^[a-fA-F0-9]{64}$/.test(args.targetIdentity)
  )
    throw new SenderError("Invalid identity-link request");
  const target = Identity.fromString(args.targetIdentity),
    operationKey = `${ctx.sender.toHexString()}:${args.operationId}`;
  const previous = ctx.db.identityLink.operationKey.find(operationKey);
  if (previous) {
    if (
      !previous.target.isEqual(target) ||
      previous.characterId !== args.expectedCharacterId
    )
      throw new SenderError("Link operation reused");
    return;
  }
  if ([...ctx.db.worldAdmission.by_owner.filter(ctx.sender)].length)
    throw new SenderError("Shared-world membership requires explicit identity migration review");
  if (
    [...ctx.db.constructionInstance.by_owner.filter(ctx.sender)].length ||
    [...ctx.db.constructionGrant.by_principal.filter(ctx.sender)].length ||
    [...ctx.db.constructionReceipt.by_principal.filter(ctx.sender)].length
  )
    throw new SenderError(
      "Construction authoring state requires explicit migration review",
    );
  const characters = [...ctx.db.character.by_owner.filter(ctx.sender)],
    ships = [...ctx.db.ship.by_owner.filter(ctx.sender)];
  if (
    characters.length !== 1 ||
    ships.length !== 1 ||
    characters[0].id !== args.expectedCharacterId ||
    characters[0].shipId !== ships[0].id ||
    !characters[0].connected
  )
    throw new SenderError(
      "Existing character requires explicit migration review",
    );
  if (
    ![...ctx.db.authSession.by_owner.filter(target)].some(
      (s) =>
        s.kind === "oidc" &&
        s.game &&
        s.expiresMicros > ctx.timestamp.microsSinceUnixEpoch,
    )
  )
    throw new SenderError("Target must have an active OIDC game session");
  if (
    [...ctx.db.character.by_owner.filter(target)].length ||
    [...ctx.db.constructionInstance.by_owner.filter(target)].length ||
    ctx.db.retiredIdentity.source.find(target)
  )
    throw new SenderError(
      "Target identity already owns a character or is retired",
    );
  const existing = [...ctx.db.identityLink.by_source.filter(ctx.sender)];
  for (const row of existing)
    if (
      !row.accepted &&
      row.expiresMicros <= ctx.timestamp.microsSinceUnixEpoch
    )
      ctx.db.identityLink.id.delete(row.id);
  if (
    existing.filter(
      (row) =>
        row.accepted || row.expiresMicros > ctx.timestamp.microsSinceUnixEpoch,
    ).length >= 8
  )
    throw new SenderError("Too many pending identity links");
  ctx.db.identityLink.insert({
    id: ctx.newUuidV4().toString(),
    operationKey,
    source: ctx.sender,
    target,
    characterId: characters[0].id,
    characterName: characters[0].name,
    shipId: ships[0].id,
    expiresMicros: ctx.timestamp.microsSinceUnixEpoch + 300000000n,
    accepted: false,
    acceptOperationId: "",
    receiptIdsJson: "[]",
  });
}
export function acceptIdentityLink(
  ctx: Context,
  args: { requestId: string; operationId: string },
) {
  if (requireGame(ctx).kind !== "oidc" || !opValid(args.operationId))
    throw new SenderError("OIDC game authentication required");
  const row = ctx.db.identityLink.id.find(args.requestId);
  if (!row || !row.target.isEqual(ctx.sender))
    throw new SenderError("Identity link unavailable");
  if (row.accepted) {
    if (row.acceptOperationId !== args.operationId)
      throw new SenderError("Link already accepted with another operation");
    return;
  }
  if (
    row.expiresMicros <= ctx.timestamp.microsSinceUnixEpoch ||
    !canConsume(ctx, row.source)
  )
    throw new SenderError("Identity link expired or source disconnected");
  if (
    [...ctx.db.character.by_owner.filter(ctx.sender)].length ||
    [...ctx.db.ship.by_owner.filter(ctx.sender)].length ||
    [...ctx.db.constructionInstance.by_owner.filter(ctx.sender)].length
  )
    throw new SenderError(
      "Target already has world state; merge requires review",
    );
  if ([...ctx.db.worldAdmission.by_owner.filter(row.source)].length ||
      [...ctx.db.worldAdmission.by_owner.filter(ctx.sender)].length)
    throw new SenderError("Shared-world membership requires explicit identity migration review");
  if (
    [...ctx.db.constructionInstance.by_owner.filter(row.source)].length ||
    [...ctx.db.constructionGrant.by_principal.filter(row.source)].length ||
    [...ctx.db.constructionReceipt.by_principal.filter(row.source)].length
  )
    throw new SenderError(
      "Construction authoring state requires explicit migration review",
    );
  const actor = ctx.db.character.id.find(row.characterId),
    ship = ctx.db.ship.id.find(row.shipId);
  if (
    !actor ||
    !ship ||
    !actor.owner.isEqual(row.source) ||
    !ship.owner.isEqual(row.source) ||
    actor.shipId !== ship.id
  )
    throw new SenderError("Source ownership changed");
  const receipts = [...ctx.db.editReceipt.by_owner.filter(row.source)];
  if (receipts.length > 512 || receipts.some((r) => r.shipId !== ship.id))
    throw new SenderError("Source audit requires explicit migration review");
  clearOwner(ctx, row.source);
  ctx.db.character.id.update({
    ...ctx.db.character.id.find(actor.id)!,
    owner: ctx.sender,
    connected: true,
  });
  ctx.db.ship.id.update({ ...ship, owner: ctx.sender });
  for (const receipt of receipts)
    ctx.db.editReceipt.id.update({ ...receipt, owner: ctx.sender });
  ctx.db.retiredIdentity.insert({
    source: row.source,
    target: ctx.sender,
    characterId: actor.id,
    linkedMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  ctx.db.identityLink.id.update({
    ...row,
    accepted: true,
    acceptOperationId: args.operationId,
    receiptIdsJson: JSON.stringify(receipts.map((r) => r.id)),
  });
  // Revoke old sockets immediately; their stale reducers and views lose access.
  for (const session of ctx.db.authSession.by_owner.filter(row.source))
    ctx.db.authSession.connectionId.delete(session.connectionId);
}
export function previousReceipt(ctx: Context, operationId: string) {
  for (const linked of ctx.db.retiredIdentity.by_target.filter(ctx.sender)) {
    const row = ctx.db.editReceipt.id.find(
      `${linked.source.toHexString()}:${operationId}`,
    );
    if (row?.owner.isEqual(ctx.sender)) return row;
  }
}
