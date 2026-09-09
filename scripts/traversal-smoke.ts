import { DbConnection, tables } from "../packages/net/src/generated";
import {
  createNativeTraversalRoomDocument,
  validateNativeTraversalRoomDocument,
} from "@sidereal/sim/construction-traversal-document";

/** Imported helpers only: this module never connects, publishes, grants, starts a
 * process or edits actor state on import. All movement below sends normal intent.
 * Root owns the isolated connection/provider role and any process restart. */
export const TRAVERSAL_REVIEW_DATABASE =
  "sidereal-spacetime-dev-review-traversal-r000";
export const TRAVERSAL_REVIEW_WORKSPACE = "native-traversal-review-r000";
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
export function reviewAssert(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error("Traversal review: " + message);
}
export async function traversalWait(
  predicate: () => boolean,
  message: string,
  timeout = 20000,
) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await sleep(40);
  }
  throw Error("Traversal review timeout: " + message);
}
export const traversalJson = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v)),
  );
const sorted = <T>(rows: Iterable<T>) =>
  [...rows]
    .map(traversalJson)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
export function traversalInventorySnapshot(c: DbConnection) {
  return {
    characters: [...c.db.ownCharacters.iter()]
      .map((a) => ({ id: a.id, name: a.name }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    appearance: sorted(c.db.ownAppearance.iter()),
    state: sorted(c.db.ownInventoryState.iter()),
    items: sorted(c.db.ownInventoryItems.iter()),
    containers: sorted(c.db.ownInventoryContainers.iter()),
    hotbar: sorted(c.db.ownInventoryHotbar.iter()),
  };
}
export function requireTraversalInventoryUnchanged(
  c: DbConnection,
  before: ReturnType<typeof traversalInventorySnapshot>,
) {
  reviewAssert(
    JSON.stringify(traversalInventorySnapshot(c)) === JSON.stringify(before),
    "character identity, appearance or inventory changed",
  );
}
export function traversalSnapshot(c: DbConnection) {
  return traversalJson({
    characters: [...c.db.ownCharacters.iter()].map((a) => ({
      id: a.id,
      shipId: a.shipId,
      x: a.localX,
      y: a.localY,
      connected: a.connected,
    })),
    visits: [...c.db.ownConstructionLocation.iter()],
    links: [...c.db.ownConstructionTraversalLinks.iter()],
    traversals: [...c.db.ownConstructionTraversals.iter()],
  });
}
export async function subscribeTraversalSmoke(c: DbConnection) {
  await new Promise<void>((resolve, reject) =>
    c
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((e) => reject(Error(String(e.event))))
      .subscribe([
        tables.ownCharacters,
        tables.ownAppearance,
        tables.ownStations,
        tables.ownInventoryState,
        tables.ownInventoryItems,
        tables.ownInventoryContainers,
        tables.ownInventoryHotbar,
        tables.ownConstructionGrants,
        tables.ownConstructionDrafts,
        tables.ownConstructionBlueprints,
        tables.ownConstructionInstances,
        tables.ownConstructionDecks,
        tables.ownConstructionLocation,
        tables.ownConstructionTraversals,
        tables.ownConstructionTraversalLinks,
      ]),
  );
}
async function denied(action: () => Promise<unknown>, message: string) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  reviewAssert(rejected, message);
}

/** Ungranted isolated-smoke clients require no administrator role or fixtures. */
export async function traversalDenialSmoke(a: DbConnection, b: DbConnection) {
  for (const c of [a, b]) {
    await subscribeTraversalSmoke(c);
    reviewAssert(
      [...c.db.ownConstructionTraversals.iter()].length === 0 &&
        [...c.db.ownConstructionTraversalLinks.iter()].length === 0,
      "ungranted traversal views not empty",
    );
    await denied(
      () =>
        c.reducers.beginConstructionTraversal({
          linkId: "missing",
          expectedVisitId: "missing",
          expectedLocationRevision: 1n,
          expectedInstanceRevision: 1n,
          expectedLinkRevision: 1n,
          operationId: crypto.randomUUID(),
        }),
      "ungranted begin accepted",
    );
    await denied(
      () =>
        c.reducers.cancelConstructionTraversal({
          traversalId: "missing",
          expectedVisitId: "missing",
          expectedRevision: 1n,
          operationId: crypto.randomUUID(),
        }),
      "ungranted cancel accepted",
    );
    for (const name of [
      "construction_traversal_link",
      "construction_traversal",
      "construction_traversal_reservation",
      "construction_traversal_clock",
      "construction_traversal_audit",
    ]) {
      let rejected = false;
      const handle = c
        .subscriptionBuilder()
        .onError(() => {
          rejected = true;
        })
        .subscribe("SELECT * FROM " + name);
      await traversalWait(() => rejected, "private base " + name, 5000);
      try {
        handle.unsubscribe();
      } catch {
        /* Failed subscription already closed. */
      }
    }
  }
  return {
    beginDenied: true,
    cancelDenied: true,
    privateProjectionsEmpty: true,
    fivePrivateBasesRejected: true,
  };
}

/** Requires a root-granted short-lived provider-admin authoring connection. */
export async function publishTraversalReview(c: DbConnection) {
  reviewAssert(c.identity, "authenticated authoring identity missing");
  const document = createNativeTraversalRoomDocument();
  validateNativeTraversalRoomDocument(document);
  const workspaceId = TRAVERSAL_REVIEW_WORKSPACE,
    draftId = workspaceId + "-draft";
  reviewAssert(
    ![...c.db.ownConstructionInstances.iter()].some(
      (i) => i.workspaceId === workspaceId,
    ),
    "review namespace already contains instances; inspect before retry",
  );
  for (const capability of [
    "draft.read",
    "draft.write",
    "blueprint.publish",
    "instance.spawn",
  ]) {
    const prior = [...c.db.ownConstructionGrants.iter()].find(
      (g) => g.workspaceId === workspaceId && g.capability === capability,
    );
    await c.reducers.setConstructionGrant({
      principal: c.identity.toHexString(),
      workspaceId,
      capability,
      expiresMicros: BigInt(Date.now() + 3600000) * 1000n,
      revoked: false,
      expectedRevision: prior?.revision ?? 0n,
      operationId: crypto.randomUUID(),
    });
  }
  const prior = [...c.db.ownConstructionDrafts.iter()].find(
    (d) => d.id === draftId,
  );
  await c.reducers.saveConstructionDraft({
    workspaceId,
    draftId,
    documentJson: JSON.stringify(document),
    expectedRevision: prior?.revision ?? 0n,
    operationId: crypto.randomUUID(),
  });
  await traversalWait(
    () =>
      [...c.db.ownConstructionDrafts.iter()].some(
        (d) => d.id === draftId && d.revision === (prior?.revision ?? 0n) + 1n,
      ),
    "saved native draft",
  );
  const draft = [...c.db.ownConstructionDrafts.iter()].find(
    (d) => d.id === draftId,
  )!;
  await c.reducers.publishConstructionBlueprint({
    workspaceId,
    draftId,
    expectedRevision: draft.revision,
    operationId: crypto.randomUUID(),
  });
  await traversalWait(
    () =>
      [...c.db.ownConstructionBlueprints.iter()].some(
        (b) => b.draftId === draftId && b.sourceRevision === draft.revision,
      ),
    "published native blueprint",
  );
  const blueprint = [...c.db.ownConstructionBlueprints.iter()].find(
    (b) => b.draftId === draftId && b.sourceRevision === draft.revision,
  )!;
  for (let n = 1; n <= 2; n++) {
    await c.reducers.spawnConstructionBlueprint({
      blueprintId: blueprint.id,
      expectedSha256: blueprint.sha256,
      sourceDeckId: document.traversalRoom!.lowerDeckId,
      operationId: crypto.randomUUID(),
    });
    await traversalWait(
      () =>
        [...c.db.ownConstructionInstances.iter()].filter(
          (i) => i.workspaceId === workspaceId,
        ).length === n,
      "independent native spawn",
    );
  }
  const instances = [...c.db.ownConstructionInstances.iter()]
    .filter((i) => i.workspaceId === workspaceId)
    .map((i) => {
      const d = JSON.parse(i.documentJson) as ReturnType<
        typeof createNativeTraversalRoomDocument
      >;
      validateNativeTraversalRoomDocument(d);
      return {
        id: i.id,
        lowerDeckId: d.traversalRoom!.lowerDeckId,
        upperDeckId: d.traversalRoom!.upperDeckId,
        linkId: d.traversalRoom!.linkId,
        nativePartIds: d.traversalRoom!.parts.map((p) => p.id),
        apertureIds: d.traversalRoom!.apertures.map((p) => p.id),
      };
    });
  const ids = instances.flatMap((i) => [
    i.id,
    i.lowerDeckId,
    i.upperDeckId,
    i.linkId,
    ...i.nativePartIds,
    ...i.apertureIds,
  ]);
  reviewAssert(
    new Set(ids).size === ids.length,
    "spawned native identities overlap",
  );
  return {
    database: TRAVERSAL_REVIEW_DATABASE,
    workspaceId,
    blueprint: { id: blueprint.id, sha256: blueprint.sha256 },
    instances,
  };
}
const actor = (c: DbConnection) => {
  const a = [...c.db.ownCharacters.iter()][0];
  reviewAssert(a, "existing admitted review character required");
  return a;
};
const visit = (c: DbConnection) => {
  const a = actor(c),
    v = [...c.db.ownConstructionLocation.iter()].find(
      (v) => v.characterId === a.id,
    );
  reviewAssert(v, "review visit required");
  return v;
};
const active = (c: DbConnection) =>
  [...c.db.ownConstructionTraversals.iter()].find(
    (s) => s.characterId === actor(c).id,
  );
export const currentTraversalLink = (c: DbConnection) => {
  const v = visit(c),
    l = [...c.db.ownConstructionTraversalLinks.iter()].find(
      (l) =>
        l.characterId === v.characterId &&
        l.instanceId === v.instanceId &&
        l.sourceDeckId === v.deckId,
    );
  reviewAssert(l, "current deck's qualified native link missing");
  return l;
};
export function traversalBeginIntent(c: DbConnection) {
  const l = currentTraversalLink(c);
  return {
    linkId: l.linkId,
    expectedVisitId: l.visitId,
    expectedLocationRevision: l.locationRevision,
    expectedInstanceRevision: l.instanceRevision,
    expectedLinkRevision: l.linkRevision,
    operationId: crypto.randomUUID(),
  };
}
export async function enterTraversalReview(
  c: DbConnection,
  instanceId: string,
) {
  const before = actor(c);
  await c.reducers.enterConstructionReview({
    instanceId,
    expectedShipId: before.shipId,
    operationId: crypto.randomUUID(),
  });
  await traversalWait(
    () =>
      [...c.db.ownConstructionLocation.iter()].some(
        (v) => v.characterId === before.id && v.instanceId === instanceId,
      ),
    "native review entry",
  );
  return {
    returnShipId: before.shipId,
    returnX: before.localX,
    returnY: before.localY,
    visit: traversalJson(visit(c)),
  };
}
export async function leaveTraversalReview(c: DbConnection) {
  const v = visit(c);
  await c.reducers.leaveConstructionReview({
    expectedVisitId: v.visitId,
    expectedRevision: v.revision,
    operationId: crypto.randomUUID(),
  });
  await traversalWait(
    () =>
      ![...c.db.ownConstructionLocation.iter()].some(
        (row) => row.characterId === v.characterId && row.visitId === v.visitId,
      ),
    "review return",
  );
}
export type ReviewIntentSender = (dx: number, dy: number) => Promise<unknown>;
/** Use on a dedicated authority connection. In the visible browser use keyboard
 * motion instead, so the app's own periodic keyboard sender retains its sequence. */
const traversalSenders = new WeakMap<DbConnection, ReviewIntentSender>();
export function traversalIntentSender(c: DbConnection): ReviewIntentSender {
  const existing = traversalSenders.get(c);
  if (existing) return existing;
  let sequence = 0n;
  let claimed: Promise<unknown> | undefined;
  const send: ReviewIntentSender = async (dx, dy) => {
    // One dedicated control acquisition, not a takeover before every command.
    claimed ??= c.reducers.claimInputControl({});
    await claimed;
    return c.reducers.setIntent({
      sequence: ++sequence,
      dx,
      dy,
      throttle: 0,
      turn: 0,
      sprint: false,
    });
  };
  traversalSenders.set(c, send);
  return send;
}

export async function walkTraversalActor(
  c: DbConnection,
  x: number,
  y: number,
  send: ReviewIntentSender,
) {
  const deadline = Date.now() + 12000;
  try {
    while (Math.hypot(actor(c).localX - x, actor(c).localY - y) > 0.07) {
      reviewAssert(
        Date.now() < deadline,
        "normal walk blocked toward " +
          x +
          "," +
          y +
          " at " +
          actor(c).localX +
          "," +
          actor(c).localY,
      );
      const dx = x - actor(c).localX,
        dy = y - actor(c).localY,
        scale = Math.max(1, Math.hypot(dx, dy));
      await send(dx / scale, dy / scale);
      await sleep(55);
    }
  } finally {
    await send(0, 0);
  }
}
export async function collectTraversal(
  c: DbConnection,
  expectedDeck: string,
  timeout = 25000,
) {
  const samples: unknown[] = [];
  let revision = -1n;
  await traversalWait(
    () => {
      const s = active(c);
      if (s && s.revision !== revision) {
        revision = s.revision;
        reviewAssert(
          [s.x, s.y, s.z].every(Number.isFinite),
          "nonfinite accepted placement",
        );
        reviewAssert(
          visit(c).deckId === s.sourceDeckId,
          "effective deck changed in transit",
        );
        samples.push(traversalJson({ ...s, effectiveDeck: visit(c).deckId }));
      }
      return !s && visit(c).deckId === expectedDeck;
    },
    "traversal terminal " + expectedDeck,
    timeout,
  );
  return samples;
}
export async function beginTraversalReview(c: DbConnection) {
  const args = traversalBeginIntent(c);
  await c.reducers.beginConstructionTraversal(args);
  await traversalWait(() => !!active(c), "accepted native traversal");
  return args;
}
export async function cancelTraversalReview(c: DbConnection) {
  const s = active(c);
  reviewAssert(s, "active traversal missing");
  await c.reducers.cancelConstructionTraversal({
    traversalId: s.traversalId,
    expectedVisitId: visit(c).visitId,
    expectedRevision: s.revision,
    operationId: crypto.randomUUID(),
  });
}
/** Full ordinary authority journey, separate from visible keyboard/browser proof. */
export async function traversalAuthorityJourney(
  c: DbConnection,
  instanceIds: [string, string],
  send = traversalIntentSender(c),
) {
  const inventory = traversalInventorySnapshot(c),
    original = actor(c),
    events: unknown[] = [];
  reviewAssert(
    original.connected,
    "review character must already be entered normally",
  );
  for (const instanceId of instanceIds) {
    events.push(await enterTraversalReview(c, instanceId));
    const l = currentTraversalLink(c);
    await walkTraversalActor(c, l.x, l.y, send);
    const args = await beginTraversalReview(c);
    await c.reducers.beginConstructionTraversal(args);
    await denied(
      () =>
        c.reducers.leaveConstructionReview({
          expectedVisitId: visit(c).visitId,
          expectedRevision: visit(c).revision,
          operationId: crypto.randomUUID(),
        }),
      "active review exit accepted",
    );
    events.push({
      instanceId,
      direction: "up",
      samples: await collectTraversal(c, l.destinationDeckId),
    });
    await walkTraversalActor(c, 1, 1.25, send);
    await walkTraversalActor(c, l.x, l.y, send);
    const down = currentTraversalLink(c);
    await beginTraversalReview(c);
    events.push({
      instanceId,
      direction: "down",
      samples: await collectTraversal(c, down.destinationDeckId),
    });
    await beginTraversalReview(c);
    await traversalWait(
      () => !!active(c) && active(c)!.z > 0.7,
      "midway cancellation height",
    );
    const cancelled = active(c)!;
    await cancelTraversalReview(c);
    events.push({
      instanceId,
      cancelledAt: traversalJson(cancelled),
      samples: await collectTraversal(c, l.sourceDeckId),
    });
    await leaveTraversalReview(c);
    reviewAssert(
      actor(c).shipId === original.shipId &&
        actor(c).localX === original.localX &&
        actor(c).localY === original.localY,
      "stock ship/return anchor changed",
    );
    requireTraversalInventoryUnchanged(c, inventory);
  }
  return {
    events,
    inventoryUnchanged: true,
    stockShipId: original.shipId,
    characterId: original.id,
  };
}

/** Save only nonsecret state before a root-managed process restart or last socket
 * close. The driver retains authentication in its own private memory/storage. */
export function traversalRestartCheckpoint(c: DbConnection) {
  reviewAssert(active(c), "active traversal required for restart checkpoint");
  return {
    capturedAt: new Date().toISOString(),
    snapshot: traversalSnapshot(c),
    inventory: traversalInventorySnapshot(c),
    traversalId: active(c)?.traversalId,
    visitId: visit(c).visitId,
    sourceDeckId: visit(c).deckId,
  };
}
export async function verifyTraversalReconnect(
  c: DbConnection,
  before: ReturnType<typeof traversalRestartCheckpoint>,
) {
  requireTraversalInventoryUnchanged(c, before.inventory);
  reviewAssert(
    visit(c).visitId === before.visitId,
    "visit identity changed on reconnect",
  );
  const s = active(c);
  if (s) {
    reviewAssert(
      s.traversalId === before.traversalId,
      "traversal identity reallocated on reconnect",
    );
    reviewAssert(
      s.phase === "returning" || s.phase === "blocked",
      "last disconnect did not persist return",
    );
  }
  const samples = await collectTraversal(c, before.sourceDeckId);
  return {
    snapshot: traversalSnapshot(c),
    samples,
    inventoryUnchanged: true,
    visitPreserved: true,
  };
}
