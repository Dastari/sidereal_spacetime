/**
 * Server adapter for the content definition registry (roadmap X-1). Rules live in
 * `@sidereal/sim/content-definitions`; this file only reads grants, applies the operation
 * discipline and writes rows. Nothing here changes runtime behaviour: inventory and combat keep
 * reading the code catalogues until X-2, and every existing instance pins revision 1 implicitly.
 */
import {
  SenderError,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import { Identity } from "spacetimedb";
import type world from "./index";
import {
  DEFINITION_LIMITS,
  currentRevisionOf,
  definitionKey,
  definitionKindOfWorkspace,
  definitionOperation,
  definitionRef,
  definitionWorkspace,
  formatIssues,
  grantAllows,
  isDefinitionCapability,
  isDefinitionKind,
  publishBlocker,
  retireBlocker,
  revisionIssues,
  validateDefinition,
  type DefinitionCapability,
  type DefinitionKind,
} from "@sidereal/sim/content-definitions";
import {
  CONTENT_DEFINITION_SEED,
  CONTENT_DEFINITION_SEED_ID,
  SEEDED_DEFINITION_KINDS,
} from "@sidereal/content/content-definition-seed";
import { LAB_WEAPONS } from "@sidereal/content/weapons";
import { INVENTORY_DEFINITIONS } from "@sidereal/content/inventory";
import {
  archiveJson,
  priorOperation,
  requireShipOperator,
} from "./ship-operator";
import { itemDefinitions } from "./item-definitions";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
const forever = 18446744073709551615n;
/** Same per-principal bound the construction grant reducer enforces. */
const GRANTS_PER_PRINCIPAL = 64;

function fail(e: unknown): never {
  throw new SenderError(e instanceof Error ? e.message : String(e));
}
function requireKind(kind: string): DefinitionKind {
  if (!isDefinitionKind(kind)) throw new SenderError("Unknown definition kind");
  return kind;
}

// ---------------------------------------------------------------------------------------------
// Grants: construction_grant rows on workspace `definitions:<kind>`.

function heldCapabilities(
  ctx: ReadContext,
  kind: DefinitionKind,
  nowMicros: bigint | null,
): DefinitionCapability[] {
  const workspace = definitionWorkspace(kind);
  const held: DefinitionCapability[] = [];
  for (const g of ctx.db.constructionGrant.by_principal.filter(ctx.sender))
    if (
      g.workspaceId === workspace &&
      !g.revoked &&
      isDefinitionCapability(g.capability) &&
      (nowMicros === null ||
        g.expiresMicros === forever ||
        g.expiresMicros > nowMicros)
    )
      held.push(g.capability);
  return held;
}
/** Reducers check the exact time; views rely on the tick marking expired grants revoked. */
export function requireDefinitionGrant(
  ctx: Context,
  kind: DefinitionKind,
  needed: DefinitionCapability,
) {
  const held = heldCapabilities(ctx, kind, ctx.timestamp.microsSinceUnixEpoch);
  if (!held.some((c) => grantAllows(c, needed)))
    throw new SenderError(
      `Explicit active ${needed} grant required for ${definitionWorkspace(kind)}`,
    );
}
export function readableKinds(ctx: ReadContext): DefinitionKind[] {
  const kinds = new Set<DefinitionKind>();
  for (const g of ctx.db.constructionGrant.by_principal.filter(ctx.sender)) {
    if (g.revoked || !isDefinitionCapability(g.capability)) continue;
    const kind = definitionKindOfWorkspace(g.workspaceId);
    if (kind) kinds.add(kind);
  }
  return [...kinds].sort();
}

// ---------------------------------------------------------------------------------------------
// Operation receipts

function operation(
  ctx: Context,
  operationId: string,
  request: unknown,
  expectedRevision: bigint,
  currentRevision: bigint,
) {
  const id = `${ctx.sender.toHexString()}:${operationId}`;
  const prior = ctx.db.contentDefinitionReceipt.id.find(id);
  try {
    return {
      id,
      ...definitionOperation(
        operationId,
        request,
        prior,
        expectedRevision,
        currentRevision,
      ),
    };
  } catch (e) {
    fail(e);
  }
}
function recordReceipt(
  ctx: Context,
  op: { id: string; request: string },
  kind: DefinitionKind,
  resultRef: string,
  revision: bigint,
) {
  // Permanent bounded ledger: pruning must never silently permit a duplicate publication.
  let count = 0;
  for (const _ of ctx.db.contentDefinitionReceipt.by_principal.filter(
    ctx.sender,
  ))
    if (++count >= DEFINITION_LIMITS.receiptsPerPrincipal)
      throw new SenderError(
        "Definition operation ledger full; operator archival required",
      );
  ctx.db.contentDefinitionReceipt.insert({
    id: op.id,
    principal: ctx.sender,
    kind,
    request: op.request,
    resultRef,
    revision,
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
function countHeads(ctx: Context, kind: DefinitionKind) {
  let n = 0;
  for (const _ of ctx.db.contentDefinitionHead.by_kind.filter(kind)) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------
// Studio reducers

export function saveDefinitionDraft(
  ctx: Context,
  args: {
    kind: string;
    definitionId: string;
    payloadJson: string;
    expectedRevision: bigint;
    operationId: string;
  },
) {
  const kind = requireKind(args.kind);
  requireDefinitionGrant(ctx, kind, "definition.write");
  const checked = validateDefinition(kind, args.definitionId, args.payloadJson);
  if (!checked.ok)
    throw new SenderError(
      `Invalid ${kind} definition: ${formatIssues(checked.issues)}`,
    );
  const key = definitionKey(kind, args.definitionId);
  const head = ctx.db.contentDefinitionHead.definitionKey.find(key);
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "save",
      definition: key,
      sha256: checked.sha256,
      expected: args.expectedRevision.toString(),
    },
    args.expectedRevision,
    head?.revision ?? 0n,
  );
  if (op.replay) return;
  if (!head && countHeads(ctx, kind) >= DEFINITION_LIMITS.definitionsPerKind)
    throw new SenderError("Definition limit reached for this kind");
  const next = {
    definitionKey: key,
    kind,
    definitionId: args.definitionId,
    revision: args.expectedRevision + 1n,
    draftJson: checked.canonical,
    draftSha256: checked.sha256,
    draftBaseRevision: head?.currentRevision ?? 0n,
    latestRevision: head?.latestRevision ?? 0n,
    currentRevision: head?.currentRevision ?? 0n,
    updatedBy: ctx.sender,
    updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
  };
  if (head) ctx.db.contentDefinitionHead.definitionKey.update(next);
  else ctx.db.contentDefinitionHead.insert(next);
  recordReceipt(ctx, op, kind, key, next.revision);
}

export function discardDefinitionDraft(
  ctx: Context,
  args: {
    kind: string;
    definitionId: string;
    expectedRevision: bigint;
    operationId: string;
  },
) {
  const kind = requireKind(args.kind);
  requireDefinitionGrant(ctx, kind, "definition.write");
  const key = definitionKey(kind, args.definitionId);
  const head = ctx.db.contentDefinitionHead.definitionKey.find(key);
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "discard",
      definition: key,
      expected: args.expectedRevision.toString(),
    },
    args.expectedRevision,
    head?.revision ?? 0n,
  );
  if (op.replay) return;
  if (!head?.draftJson) throw new SenderError("No draft to discard");
  if (head.latestRevision === 0n)
    ctx.db.contentDefinitionHead.definitionKey.delete(key);
  else
    ctx.db.contentDefinitionHead.definitionKey.update({
      ...head,
      revision: head.revision + 1n,
      draftJson: "",
      draftSha256: "",
      draftBaseRevision: 0n,
      updatedBy: ctx.sender,
      updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  recordReceipt(ctx, op, kind, key, head.revision + 1n);
}

export function publishDefinition(
  ctx: Context,
  args: {
    kind: string;
    definitionId: string;
    expectedRevision: bigint;
    expectedDraftSha256: string;
    operationId: string;
  },
) {
  const kind = requireKind(args.kind);
  requireDefinitionGrant(ctx, kind, "definition.publish");
  const key = definitionKey(kind, args.definitionId);
  const head = ctx.db.contentDefinitionHead.definitionKey.find(key);
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "publish",
      definition: key,
      sha256: args.expectedDraftSha256,
      expected: args.expectedRevision.toString(),
    },
    args.expectedRevision,
    head?.revision ?? 0n,
  );
  if (op.replay) return;
  const blocked = publishBlocker(kind);
  if (blocked) throw new SenderError(blocked);
  if (!head?.draftJson) throw new SenderError("Save a draft before publishing");
  if (head.draftSha256 !== args.expectedDraftSha256)
    throw new SenderError(
      "The draft changed since you reviewed it; reload and review again",
    );
  // Re-validate: the validator may be newer than the draft.
  const checked = validateDefinition(kind, args.definitionId, head.draftJson);
  if (!checked.ok)
    throw new SenderError(
      `Invalid ${kind} definition: ${formatIssues(checked.issues)}`,
    );
  const previous =
    head.latestRevision > 0n
      ? ctx.db.contentDefinition.definitionRef.find(
          definitionRef(kind, args.definitionId, head.latestRevision),
        )
      : null;
  if (previous && previous.sha256 === checked.sha256)
    throw new SenderError(
      `No change from revision ${head.latestRevision}; nothing to publish`,
    );
  const grows = revisionIssues(
    kind,
    previous?.payloadJson ?? null,
    checked.canonical,
  );
  if (grows.length)
    throw new SenderError(`Revision rule failed: ${formatIssues(grows)}`);
  const revision = head.latestRevision + 1n;
  if (revision > BigInt(DEFINITION_LIMITS.revisionsPerDefinition))
    throw new SenderError("Revision limit reached for this definition");
  const ref = definitionRef(kind, args.definitionId, revision);
  ctx.db.contentDefinition.insert({
    definitionRef: ref,
    definitionKey: key,
    kind,
    definitionId: args.definitionId,
    revision,
    status: "published",
    payloadJson: checked.canonical,
    sha256: checked.sha256,
    validator: checked.validator,
    source: "studio",
    operationId: args.operationId,
    publishedBy: ctx.sender,
    publishedMicros: ctx.timestamp.microsSinceUnixEpoch,
    retiredMicros: 0n,
  });
  ctx.db.contentDefinitionHead.definitionKey.update({
    ...head,
    revision: head.revision + 1n,
    draftJson: "",
    draftSha256: "",
    draftBaseRevision: 0n,
    latestRevision: revision,
    currentRevision: revision,
    updatedBy: ctx.sender,
    updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  recordReceipt(ctx, op, kind, ref, revision);
}

export function retireDefinition(
  ctx: Context,
  args: {
    kind: string;
    definitionId: string;
    revision: bigint;
    expectedRevision: bigint;
    operationId: string;
  },
) {
  const kind = requireKind(args.kind);
  requireDefinitionGrant(ctx, kind, "definition.publish");
  const key = definitionKey(kind, args.definitionId);
  const head = ctx.db.contentDefinitionHead.definitionKey.find(key);
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "retire",
      definition: key,
      revision: args.revision.toString(),
      expected: args.expectedRevision.toString(),
    },
    args.expectedRevision,
    head?.revision ?? 0n,
  );
  if (op.replay) return;
  const ref = definitionRef(kind, args.definitionId, args.revision);
  const row = ctx.db.contentDefinition.definitionRef.find(ref);
  if (!head || !row) throw new SenderError("Published revision not found");
  if (row.status !== "published")
    throw new SenderError("That revision is already retired");
  const blocked = retireBlocker(
    kind,
    args.definitionId,
    [...ctx.db.contentDefinition.by_key.filter(key)],
    args.revision,
  );
  if (blocked) throw new SenderError(blocked);
  ctx.db.contentDefinition.definitionRef.update({
    ...row,
    status: "retired",
    retiredMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  const revisions = [...ctx.db.contentDefinition.by_key.filter(key)].map((r) =>
    r.definitionRef === ref ? { ...r, status: "retired" } : r,
  );
  ctx.db.contentDefinitionHead.definitionKey.update({
    ...head,
    revision: head.revision + 1n,
    currentRevision: currentRevisionOf(revisions),
    updatedBy: ctx.sender,
    updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  recordReceipt(ctx, op, kind, ref, head.revision + 1n);
}

/**
 * Where-used snapshot. Items: `inventory_item` rows by definition ID, counted by pinned item
 * revision. Weapons: instances of the item with the same ID, counted by pinned weapon revision
 * (instances without weapon rules are not counted). Instances created before X-2 pin revision 1.
 * Planned kinds have no instances yet, so their snapshot is empty.
 */
export function refreshDefinitionUsage(ctx: Context, args: { kind: string }) {
  const kind = requireKind(args.kind);
  requireDefinitionGrant(ctx, kind, "definition.read");
  for (const row of [...ctx.db.contentDefinitionUsage.by_kind.filter(kind)])
    ctx.db.contentDefinitionUsage.definitionKey.delete(row.definitionKey);
  if (kind !== "item" && kind !== "weapon") return;
  const counts = new Map<string, number>(),
    pins = new Map<string, Record<string, number>>(),
    defs = itemDefinitions(ctx);
  let scanned = 0;
  for (const item of ctx.db.inventoryItem.iter()) {
    if (++scanned > DEFINITION_LIMITS.usageScanRows)
      throw new SenderError("Too many item instances to count in one refresh");
    const pin = defs.pin(item),
      revision = kind === "item" ? pin.itemRevision : pin.weaponRevision;
    if (revision === 0n) continue;
    counts.set(item.definitionId, (counts.get(item.definitionId) ?? 0) + 1);
    const byRevision = pins.get(item.definitionId) ?? {};
    byRevision[revision.toString()] =
      (byRevision[revision.toString()] ?? 0) + 1;
    pins.set(item.definitionId, byRevision);
  }
  const heads = (k: DefinitionKind) =>
    new Set(
      [...ctx.db.contentDefinitionHead.by_kind.filter(k)].map(
        (h) => h.definitionId,
      ),
    );
  const itemIds = new Set([
    ...heads("item"),
    ...INVENTORY_DEFINITIONS.map((d) => d.id),
  ]);
  const weaponIds = new Set([...heads("weapon"), ...Object.keys(LAB_WEAPONS)]);
  const ids =
    kind === "item"
      ? new Set([...heads("item"), ...counts.keys()])
      : new Set([...heads("weapon"), ...counts.keys()]);
  for (const definitionId of [...ids].sort()) {
    const instanceCount = counts.get(definitionId) ?? 0;
    const referencedBy =
      kind === "item"
        ? weaponIds.has(definitionId)
          ? [definitionKey("weapon", definitionId)]
          : []
        : itemIds.has(definitionId)
          ? [definitionKey("item", definitionId)]
          : [];
    ctx.db.contentDefinitionUsage.insert({
      definitionKey: definitionKey(kind, definitionId),
      kind,
      definitionId,
      instanceCount: BigInt(instanceCount),
      pinsJson: JSON.stringify(pins.get(definitionId) ?? {}),
      referencedByJson: JSON.stringify(referencedBy),
      computedMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Operator reducers (deployment identity, audited in ship_operator_operation)

/**
 * Writes the code catalogue for one seeded kind as revision 1. Idempotent by operation ID and by
 * content: an existing identical revision 1 is `unchanged`; a different one is `diverged` and is
 * never overwritten. `dryRun` records the same summary without writing definitions.
 */
export function importContentSeed(
  ctx: Context,
  args: { operationId: string; kind: string; dryRun: boolean },
) {
  requireShipOperator(ctx);
  const kind = requireKind(args.kind);
  if (!(SEEDED_DEFINITION_KINDS as readonly string[]).includes(kind))
    throw new SenderError(
      `No seed for ${kind} in ${CONTENT_DEFINITION_SEED_ID}`,
    );
  const request = JSON.stringify({
    seed: CONTENT_DEFINITION_SEED_ID,
    kind,
    dryRun: args.dryRun,
  });
  const ledgerKind = args.dryRun
    ? "definition-seed-dry-run"
    : "definition-seed";
  if (priorOperation(ctx.db, ctx.sender, args.operationId, ledgerKind, request))
    return;
  const created: string[] = [],
    unchanged: string[] = [],
    diverged: string[] = [];
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const entry of CONTENT_DEFINITION_SEED) {
    if (entry.kind !== kind) continue;
    const checked = validateDefinition(kind, entry.definitionId, entry.payload);
    if (!checked.ok)
      throw new SenderError(
        `Seed entry ${entry.definitionId} is invalid: ${formatIssues(checked.issues)}`,
      );
    const key = definitionKey(kind, entry.definitionId);
    const ref = definitionRef(kind, entry.definitionId, 1n);
    const existing = ctx.db.contentDefinition.definitionRef.find(ref);
    const head = ctx.db.contentDefinitionHead.definitionKey.find(key);
    if (existing) {
      (existing.sha256 === checked.sha256 ? unchanged : diverged).push(
        entry.definitionId,
      );
      continue;
    }
    if (head && head.latestRevision > 0n) {
      diverged.push(entry.definitionId);
      continue;
    }
    created.push(entry.definitionId);
    if (args.dryRun) continue;
    ctx.db.contentDefinition.insert({
      definitionRef: ref,
      definitionKey: key,
      kind,
      definitionId: entry.definitionId,
      revision: 1n,
      status: "published",
      payloadJson: checked.canonical,
      sha256: checked.sha256,
      validator: checked.validator,
      source: "seed:" + CONTENT_DEFINITION_SEED_ID,
      operationId: args.operationId,
      publishedBy: ctx.sender,
      publishedMicros: now,
      retiredMicros: 0n,
    });
    const next = {
      definitionKey: key,
      kind,
      definitionId: entry.definitionId,
      revision: (head?.revision ?? 0n) + 1n,
      draftJson: head?.draftJson ?? "",
      draftSha256: head?.draftSha256 ?? "",
      draftBaseRevision: head?.draftBaseRevision ?? 0n,
      latestRevision: 1n,
      currentRevision: 1n,
      updatedBy: ctx.sender,
      updatedMicros: now,
    };
    if (head) ctx.db.contentDefinitionHead.definitionKey.update(next);
    else ctx.db.contentDefinitionHead.insert(next);
  }
  ctx.db.shipOperatorOperation.insert({
    operationId: args.operationId,
    principal: ctx.sender,
    kind: ledgerKind,
    request,
    summaryJson: archiveJson({
      seed: CONTENT_DEFINITION_SEED_ID,
      kind,
      dryRun: args.dryRun,
      created: created.length,
      unchanged: unchanged.length,
      diverged,
    }),
    createdMicros: now,
  });
}

/** Bootstraps per-kind definition grants (the live owner path until the ST-1 grant UI). */
export function operatorSetDefinitionGrant(
  ctx: Context,
  args: {
    operationId: string;
    principal: string;
    kind: string;
    capability: string;
    expiresMicros: bigint;
    revoked: boolean;
  },
) {
  requireShipOperator(ctx);
  const kind = requireKind(args.kind);
  if (!isDefinitionCapability(args.capability))
    throw new SenderError("Unknown definition capability");
  if (
    args.expiresMicros !== forever &&
    args.expiresMicros <= ctx.timestamp.microsSinceUnixEpoch
  )
    throw new SenderError("Grant expiry must be in the future");
  let principal: Identity;
  try {
    principal = Identity.fromString(args.principal);
  } catch {
    throw new SenderError("Invalid principal");
  }
  const workspaceId = definitionWorkspace(kind);
  const request = JSON.stringify({
    principal: principal.toHexString(),
    workspaceId,
    capability: args.capability,
    expiresMicros: args.expiresMicros.toString(),
    revoked: args.revoked,
  });
  if (
    priorOperation(
      ctx.db,
      ctx.sender,
      args.operationId,
      "definition-grant",
      request,
    )
  )
    return;
  const id = JSON.stringify([
    principal.toHexString(),
    workspaceId,
    args.capability,
  ]);
  const prior = ctx.db.constructionGrant.id.find(id);
  if (
    !prior &&
    [...ctx.db.constructionGrant.by_principal.filter(principal)].length >=
      GRANTS_PER_PRINCIPAL
  )
    throw new SenderError("Principal grant limit reached");
  const next = {
    id,
    principal,
    workspaceId,
    capability: args.capability,
    expiresMicros: args.expiresMicros,
    nextCheckMicros: args.revoked ? forever : args.expiresMicros,
    revoked: args.revoked,
    revision: (prior?.revision ?? 0n) + 1n,
    issuedBy: ctx.sender,
  };
  if (prior) ctx.db.constructionGrant.id.update(next);
  else ctx.db.constructionGrant.insert(next);
  ctx.db.shipOperatorOperation.insert({
    operationId: args.operationId,
    principal: ctx.sender,
    kind: "definition-grant",
    request,
    summaryJson: archiveJson({ grant: id, revision: next.revision }),
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}

// ---------------------------------------------------------------------------------------------
// Admin-scoped views: only kinds the sender holds a definition grant for.

export function adminHeads(ctx: ReadContext) {
  return readableKinds(ctx).flatMap((k) => [
    ...ctx.db.contentDefinitionHead.by_kind.filter(k),
  ]);
}
export function adminRevisions(ctx: ReadContext) {
  return readableKinds(ctx).flatMap((k) => [
    ...ctx.db.contentDefinition.by_kind.filter(k),
  ]);
}
export function adminUsage(ctx: ReadContext) {
  return readableKinds(ctx).flatMap((k) => [
    ...ctx.db.contentDefinitionUsage.by_kind.filter(k),
  ]);
}
