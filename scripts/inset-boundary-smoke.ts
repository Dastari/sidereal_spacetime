/** Explicit isolated provider smoke only. Authoring this file does not run it.
 * Alpha needs a temporary construction-admin role supplied by the operator.
 * No tokens or private token file paths are written to the evidence summary.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { DbConnection } from "../packages/net/src/generated";
import { bindGameSessionProof } from "../packages/net/src/game-session-proof";
import { subscribeStairs } from "./stair-smoke";
import {
  traversalWait as wait,
  traversalIntentSender,
  walkTraversalActor,
  enterTraversalReview,
} from "./traversal-smoke";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { CONSTRUCTION_INSET_VISUAL_PIN } from "@sidereal/content/construction-inset-visuals";
import { bindConstructionLayout } from "@sidereal/sim/construction-layout";
import {
  compileConstruction,
  constructionHash,
} from "@sidereal/sim/construction-transactions";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import type { ConstructionDocument } from "@sidereal/content/construction";

const host = process.env.SIDEREAL_SMOKE_URL,
  database = process.env.SIDEREAL_SMOKE_DATABASE,
  output = process.env.SUMMARY_FILE;
if (!host || !database?.endsWith("-smoke") || !output)
  throw Error(
    "Explicit isolated -smoke database, URL and SUMMARY_FILE required",
  );
const phase = process.env.SIDEREAL_INSET_SMOKE_PHASE ?? "create";
assert(["create", "verify"].includes(phase), "Unknown smoke phase");
if (phase === "create" && existsSync(output))
  throw Error("Preserve existing summary; choose a new output or verify phase");
const tokens = [
  process.env.SIDEREAL_PROVIDER_ALPHA,
  process.env.SIDEREAL_PROVIDER_BETA,
].map((path) => {
  assert(path, "Two private token file paths required");
  const token = JSON.parse(readFileSync(path, "utf8")).id_token;
  assert(typeof token === "string", "Provider ID token required");
  return token as string;
});
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function connect(token: string, name: string) {
  let ready = false,
    error: Error | undefined;
  let subscription: Awaited<ReturnType<typeof subscribeStairs>> | undefined;
  const connection = DbConnection.builder()
    .withUri(host!)
    .withDatabaseName(database!)
    .withToken(token)
    .onConnect(async (c) => {
      try {
        await bindGameSessionProof({
          origin: host!,
          database: database!,
          connectionId: c.connectionId!.toHexString(),
          token,
          signal: AbortSignal.timeout(12000),
        });
        subscription = await subscribeStairs(c);
        await c.reducers.enterLab({ name });
        await wait(
          () => [...c.db.ownCharacters.iter()].length === 1,
          "provider character",
        );
        ready = true;
      } catch {
        error = Error(
          "Provider proof, subscription or character admission failed",
        );
      }
    })
    .onConnectError(() => {
      error = Error("Provider socket connection failed");
    })
    .build();
  try {
    await wait(() => {
      if (error) throw error;
      return ready;
    }, "provider ready");
  } catch (e) {
    connection.disconnect();
    throw e;
  }
  return {
    connection,
    close() {
      subscription?.unsubscribe();
      connection.disconnect();
    },
  };
}
const actor = (c: DbConnection) => [...c.db.ownCharacters.iter()][0]!;
function fixture() {
  const d = emptyLayout("inset-static-review", "main");
  d.name = "Pinned inward250 static review";
  d.decks[0].ceiling = 102;
  d.decks[0].roof = true;
  d.tiles = [
    [0, 0],
    [64, 0],
    [0, 64],
    [64, 64],
  ].map(([x, y], i) => {
    const t = stampTile("tile-" + i, "main", "rectangle", [0, 0]);
    t.vertices = [
      [x, y],
      [x + 64, y],
      [x + 64, y + 64],
      [x, y + 64],
    ];
    return t;
  });
  d.partitions = [
    {
      id: "divider",
      deckId: "main",
      a: [64, 0],
      b: [64, 128],
      seal: "design-sealed",
    },
  ];
  d.structure = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "review",
      name: "Static review",
      revision: "1",
      width: 128,
      length: 128,
      height: 112,
      origin: [0, 0, 0],
    },
    tileStyles: {},
    wallFaces: {},
    armor: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId: "main",
        floorThickness: 6,
        clearHeight: 96,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: 112,
      },
    ],
    boundaryTreatments: [
      {
        id: "divider-treatment",
        deckId: "main",
        source: "partition",
        sourceAnchorId: "divider",
        a: [64, 0],
        b: [64, 128],
        treatment: "auto",
        reservationSide: "center",
      },
    ],
  };
  const perimeter = compileLayout(d).walls.find(
    (w) => w.source === "perimeter",
  )!;
  d.structure.boundaryTreatments.push({
    id: "perimeter-treatment",
    deckId: "main",
    source: "perimeter",
    sourceAnchorId: perimeter.anchorId,
    a: perimeter.a,
    b: perimeter.b,
    treatment: "auto",
  });
  const doc = bindConstructionLayout(d).document;
  doc.boundaryKit = { ...CONSTRUCTION_INSET_VISUAL_PIN };
  return doc;
}
interface Evidence {
  identity: string;
  actorId: string;
  instanceId: string;
  deckId: string;
  instanceDocumentSha256: string;
  ids: string[];
  position: [number, number];
  wallStop: [number, number];
  partitionStop: [number, number];
}
interface Summary {
  schema: string;
  database: string;
  documentSha256: string;
  kit: typeof CONSTRUCTION_INSET_VISUAL_PIN;
  workspaceId: string;
  blueprintId: string;
  actors: Evidence[];
  checks: string[];
  reconnectVerified?: boolean;
  existingDataVerifiedAt?: string;
}
const sessions: Awaited<ReturnType<typeof connect>>[] = [];
try {
  sessions.push(await connect(tokens[0], "Inset Alpha"));
  sessions.push(await connect(tokens[1], "Inset Beta"));
  const [alpha, beta] = sessions.map((s) => s.connection);
  assert(alpha.identity && beta.identity);
  assert.notEqual(
    alpha.identity.toHexString(),
    beta.identity.toHexString(),
    "Accounts must be distinct",
  );
  assert.notEqual(
    actor(alpha).id,
    actor(beta).id,
    "Characters must be distinct",
  );
  let summary: Summary;
  if (phase === "verify") {
    summary = JSON.parse(readFileSync(output!, "utf8"));
    assert.equal(summary.database, database);
    assert.deepEqual(summary.kit, CONSTRUCTION_INSET_VISUAL_PIN);
  } else {
    const workspaceId = "inset-smoke-" + randomUUID(),
      draftId = workspaceId + ":draft",
      doc = fixture(),
      snapshot = compileConstruction(JSON.stringify(doc));
    for (const c of [alpha, beta])
      for (const capability of [
        "draft.read",
        "draft.write",
        "blueprint.publish",
        "instance.spawn",
      ]) {
        await alpha.reducers.setConstructionGrant({
          principal: c.identity!.toHexString(),
          workspaceId,
          capability,
          expiresMicros: BigInt(Date.now() + 3600000) * 1000n,
          revoked: false,
          expectedRevision: 0n,
          operationId: randomUUID(),
        });
      }
    await alpha.reducers.saveConstructionDraft({
      workspaceId,
      draftId,
      documentJson: snapshot.canonical,
      expectedRevision: 0n,
      operationId: randomUUID(),
    });
    await wait(
      () =>
        [...alpha.db.ownConstructionDrafts.iter()].some(
          (d) => d.id === draftId,
        ),
      "saved draft",
    );
    await alpha.reducers.publishConstructionBlueprint({
      workspaceId,
      draftId,
      expectedRevision: 1n,
      operationId: randomUUID(),
    });
    await wait(
      () =>
        [...alpha.db.ownConstructionBlueprints.iter()].some(
          (b) => b.draftId === draftId,
        ),
      "published blueprint",
    );
    const blueprint = [...alpha.db.ownConstructionBlueprints.iter()].find(
      (b) => b.draftId === draftId,
    )!;
    assert.equal(blueprint.sha256, snapshot.sha256);
    summary = {
      schema: "sidereal.inset-boundary-smoke.v1",
      database: database!,
      documentSha256: snapshot.sha256,
      kit: CONSTRUCTION_INSET_VISUAL_PIN,
      workspaceId,
      blueprintId: blueprint.id,
      actors: [],
      checks: [],
    };
    for (const c of [alpha, beta]) {
      await wait(
        () =>
          [...c.db.ownConstructionBlueprints.iter()].some(
            (b) => b.id === blueprint.id,
          ),
        "scoped blueprint visibility",
      );
      const priorIds = new Set([
        ...summary.actors.map((a) => a.instanceId),
        ...[...c.db.ownConstructionInstances.iter()].map((i) => i.id),
      ]);
      await c.reducers.spawnConstructionBlueprint({
        blueprintId: blueprint.id,
        expectedSha256: blueprint.sha256,
        sourceDeckId: "main",
        operationId: randomUUID(),
      });
      await wait(
        () =>
          [...c.db.ownConstructionInstances.iter()].some(
            (i) => i.workspaceId === workspaceId && !priorIds.has(i.id),
          ),
        "owned independent instance",
      );
      const instance = [...c.db.ownConstructionInstances.iter()].find(
        (i) => i.workspaceId === workspaceId && !priorIds.has(i.id),
      )!;
      await enterTraversalReview(c, instance.id);
      const send = traversalIntentSender(c),
        left = actor(c).localX < 2,
        x = left ? 1 : 3;
      await walkTraversalActor(c, x, 2, send);
      // Normal repeated movement intents deliberately target an impossible crossing.
      try {
        for (let n = 0; n < 30; n++) {
          await send(left ? -1 : 1, 0);
          await pause(60);
        }
      } finally {
        await send(0, 0);
      }
      await pause(100);
      const wallStop: [number, number] = [actor(c).localX, actor(c).localY];
      assert(
        (left ? wallStop[0] : 4 - wallStop[0]) >= 0.55 - 1e-5,
        "Body intruded into inward exterior wall",
      );
      assert(
        (left ? wallStop[0] : 4 - wallStop[0]) <= 0.58,
        "Movement never reached wall contact",
      );
      await walkTraversalActor(c, x, 2, send);
      try {
        for (let n = 0; n < 30; n++) {
          await send(left ? 1 : -1, 0);
          await pause(60);
        }
      } finally {
        await send(0, 0);
      }
      await pause(100);
      const partitionStop: [number, number] = [
        actor(c).localX,
        actor(c).localY,
      ];
      assert(
        left
          ? partitionStop[0] <= 1.575 + 1e-5
          : partitionStop[0] >= 2.425 - 1e-5,
        "Body crossed centered partition",
      );
      assert(
        left ? partitionStop[0] >= 1.54 : partitionStop[0] <= 2.46,
        "Movement never reached partition contact",
      );
      await walkTraversalActor(c, x, 2, send);
      const instanceDoc = JSON.parse(
        instance.documentJson,
      ) as ConstructionDocument;
      assert.deepEqual(instanceDoc.boundaryKit, CONSTRUCTION_INSET_VISUAL_PIN);
      assert(
        instanceDoc.layout.structure?.schema === "sidereal.layout-structure.v2",
      );
      const ids = [
        instance.id,
        ...instanceDoc.layout.decks.map((d) => d.id),
        ...instanceDoc.layout.tiles.map((t) => t.id),
        ...instanceDoc.layout.partitions.map((p) => p.id),
        ...instanceDoc.layout.structure.boundaryTreatments.map((t) => t.id),
      ];
      summary.actors.push({
        identity: c.identity!.toHexString(),
        actorId: actor(c).id,
        instanceId: instance.id,
        deckId: instance.spawnDeckId,
        instanceDocumentSha256: constructionHash(instance.documentJson),
        ids,
        position: [actor(c).localX, actor(c).localY],
        wallStop,
        partitionStop,
      });
    }
    assert(
      !summary.actors[0].ids.some((id) => summary.actors[1].ids.includes(id)),
      "Independent instances share placed identities",
    );
    summary.checks.push(
      "two provider-owned independent instances",
      "exact immutable kit and blueprint pins",
      "normal authority movement blocked at inward wall and centered partition",
      "no direct position writes",
      "physical pressure/flight/damage remain unqualified",
    );
    writeFileSync(output!, JSON.stringify(summary, null, 2) + "\n");
    for (const s of sessions.splice(0)) s.close();
    sessions.push(await connect(tokens[0], "Inset Alpha"));
    sessions.push(await connect(tokens[1], "Inset Beta"));
  }
  for (let i = 0; i < sessions.length; i++) {
    const c = sessions[i].connection,
      e = summary.actors[i];
    assert.equal(c.identity!.toHexString(), e.identity);
    assert.equal(actor(c).id, e.actorId);
    await wait(
      () =>
        [...c.db.ownConstructionInstances.iter()].some(
          (v) => v.id === e.instanceId,
        ),
      "persisted instance",
    );
    const instance = [...c.db.ownConstructionInstances.iter()].find(
      (v) => v.id === e.instanceId,
    )!;
    assert.equal(
      constructionHash(instance.documentJson),
      e.instanceDocumentSha256,
    );
    await wait(
      () =>
        [...c.db.ownConstructionLocation.iter()].some(
          (v) => v.instanceId === e.instanceId && v.deckId === e.deckId,
        ),
      "persisted review location",
    );
    assert(
      Math.hypot(
        actor(c).localX - e.position[0],
        actor(c).localY - e.position[1],
      ) < 0.1,
      "Persisted actor position changed",
    );
  }
  summary.reconnectVerified = true;
  if (phase === "verify")
    summary.existingDataVerifiedAt = new Date().toISOString();
  writeFileSync(output!, JSON.stringify(summary, null, 2) + "\n");
  console.log(
    JSON.stringify({
      database,
      phase,
      instances: summary.actors.map((a) => a.instanceId),
      documentSha256: summary.documentSha256,
      reconnectVerified: true,
    }),
  );
} finally {
  for (const s of sessions) s.close();
}
