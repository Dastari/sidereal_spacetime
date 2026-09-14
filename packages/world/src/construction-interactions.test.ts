import { planQualifiedWayfarerFunctionalSeeds } from "@sidereal/sim/construction-functional-instances";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Identity } from "spacetimedb";
import { test, expect, vi } from "vitest";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    Range: class {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
vi.mock("./auth", () => ({
  requireGame: (ctx: any) => {
    if (!ctx.game) throw Error("Game admission required");
    return { kind: "oidc" };
  },
}));
vi.mock("./combat", () => ({ clearAim: vi.fn() }));
vi.mock("./input-control", () => ({
  consumeInputControl: (ctx: any) => ctx.control,
}));
import {
  installQualifiedInstanceInteractions,
  interactWithConstructionObject,
  releaseConstructionSeat,
  recoverConstructionSeats,
  requireNoOccupiedConstructionInteractions,
  constructionInteractionView,
  ownConstructionSeat,
} from "./construction-interactions";
import { WAYFARER_CONVERSION_PIN as PIN } from "@sidereal/content/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "@sidereal/sim/wayfarer-conversion-candidate";
import { qualifiedWayfarerWalkingBindings } from "@sidereal/sim/wayfarer-walking-bindings";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
function store(
  primary = "id",
  indices: Record<string, string> = {},
  unique: string[] = [],
) {
  const rows: any[] = [];
  const t: any = {
    rows,
    iter: () => rows.values(),
    insert: (r: any) => {
      if (rows.some((x) => [primary, ...unique].some((k) => x[k] === r[k])))
        throw Error("unique");
      rows.push(r);
      return r;
    },
  };
  t[primary] = {
    find: (id: any) => rows.find((r) => String(r[primary]) === String(id)),
    update: (r: any) => {
      const i = rows.findIndex((x) => x[primary] === r[primary]);
      if (i < 0) throw Error("missing");
      rows[i] = r;
    },
    delete: (id: any) => {
      const i = rows.findIndex((r) => r[primary] === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
  for (const [n, k] of Object.entries(indices))
    t[n] = {
      filter: (v: any) => rows.filter((r) => String(r[k]) === String(v)),
      find: (v: any) => rows.find((r) => String(r[k]) === String(v)),
    };
  return t;
}
let fixtureId = 0;
function fixture() {
  const c = createWayfarerConversionCandidate(
    Object.fromEntries(
      Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
    ) as WayfarerPinnedInputs,
  );
  let n = 0;
  const prefix = (++fixtureId).toString().padStart(8, "0"),
    allocate = () =>
      `${prefix}-0000-4000-8000-${(++n).toString().padStart(12, "0")}`;
  const spawn = () =>
    planConstructionInstance(
      c.snapshot,
      {
        blueprintRevisionId: "qualified",
        expectedBlueprintSha256: c.snapshot.sha256,
        sourceDeckId: PIN.deckId,
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        objectCollisionBindings: qualifiedWayfarerWalkingBindings(
          c.snapshot,
          0.3,
          1.8,
        ),
      },
      allocate,
    );
  const owner = Identity.fromString("1".repeat(64));
  const db: any = {
    constructionFlightBinding: { shipId: { find: () => undefined } },
    constructionCargoAssembly: store("containerId", {
      by_instance: "instanceId",
    }),
    wayfarerRefitAttachment: store("id", { by_instance: "instanceId" }),
    constructionPilotSeat: store("characterId", { by_owner: "owner" }),
    constructionInstance: store(),
    constructionDeck: store(),
    constructionLocation: store("characterId", { by_instance: "instanceId" }),
    constructionDoor: store("id", { by_deck: "deckId" }),
    constructionInteractionBinding: store(
      "objectId",
      {
        by_instance: "instanceId",
        by_recovery: "recoveryRequested",
        placedObjectId: "placedObjectId",
      },
      ["placedObjectId"],
    ),
    interactionObject: store("id", { by_ship: "shipId" }),
    interactionReceipt: store("id", { by_character: "characterId" }),
    character: store("id", { by_owner: "owner" }),
    couchSeat: store("characterId", { objectId: "objectId" }, ["objectId"]),
    station: store("id", { shipId: "shipId" }),
    input: store("characterId"),
    constructionStairWalk: store("characterId"),
    constructionTraversal: store("characterId"),
    constructionGrant: store("id", { by_principal: "principal" }),
  };
  const ctx: any = {
    db,
    sender: owner,
    game: true,
    control: true,
    timestamp: { microsSinceUnixEpoch: 10n },
    newUuidV4: () => ({ toString: allocate }),
  };
  const install = (
    plan: ReturnType<typeof spawn>,
    seeds?: ReturnType<typeof planQualifiedWayfarerFunctionalSeeds>,
  ) => {
    db.constructionInstance.insert({
      id: plan.instanceId,
      owner,
      workspaceId: "w",
      revision: 1n,
      blueprintSha256: plan.blueprintSha256,
      documentJson: JSON.stringify(plan.document),
      idMapJson: JSON.stringify(plan.mappings),
    });
    db.constructionDeck.insert({
      id: plan.spawn.deckId,
      instanceId: plan.instanceId,
      elevation: 0,
    });
    installQualifiedInstanceInteractions(ctx, plan, seeds);
  };
  const plan = spawn();
  install(plan);
  for (const capability of ["draft.read", "instance.spawn"])
    db.constructionGrant.insert({
      id: capability,
      principal: owner,
      workspaceId: "w",
      capability,
      expiresMicros: 1000n,
      revision: 1n,
      revoked: false,
    });
  db.character.insert({
    id: "actor",
    owner,
    shipId: plan.instanceId,
    connected: true,
    sprinting: false,
    localX: 2.25,
    localY: 3,
  });
  db.constructionLocation.insert({
    characterId: "actor",
    instanceId: plan.instanceId,
    deckId: plan.spawn.deckId,
    visitId: "visit",
  });
  db.input.insert({
    characterId: "actor",
    dx: 0,
    dy: 0,
    throttle: 0,
    turn: 0,
    sprint: false,
  });
  const sofa = db.constructionInteractionBinding.rows.find(
    (b: any) => b.sourceId === "room-lounge",
  );
  const request = (
    objectId = sofa.objectId,
    action = "sit",
    operationId = "op-" + allocate(),
  ) => ({
    objectId,
    action,
    operationId,
    expectedRevision: db.interactionObject.id.find(objectId).revision,
  });
  return { ctx, db, plan, spawn, install, sofa, request };
}

test("native installation creates four independent objects per instance and never reuses source placement IDs", () => {
  const f = fixture();
  f.install(f.spawn());
  expect(f.db.interactionObject.rows).toHaveLength(8);
  expect(new Set(f.db.interactionObject.rows.map((o: any) => o.id)).size).toBe(
    8,
  );
  expect(
    new Set(
      f.db.constructionInteractionBinding.rows.map(
        (o: any) => o.placedObjectId,
      ),
    ).size,
  ).toBe(8);
  expect(f.db.couchSeat.rows).toHaveLength(0);
  expect(() => installQualifiedInstanceInteractions(f.ctx, f.plan)).toThrow(
    "already installed",
  );
});
test("sofa sits and stands through the actual native approach; repeats are idempotent", () => {
  const f = fixture(),
    req = f.request();
  expect(interactWithConstructionObject(f.ctx, req)).toBe(true);
  expect(f.db.character.id.find("actor")).toMatchObject({
    localX: 3.3,
    localY: 3,
  });
  expect(f.db.couchSeat.rows).toHaveLength(1);
  interactWithConstructionObject(f.ctx, req);
  expect(f.db.couchSeat.rows).toHaveLength(1);
  expect(f.db.interactionReceipt.rows).toHaveLength(1);
  expect(() =>
    requireNoOccupiedConstructionInteractions(f.ctx, f.plan.instanceId),
  ).toThrow("Occupied");
  interactWithConstructionObject(f.ctx, f.request(f.sofa.objectId, "stand"));
  expect(f.db.couchSeat.rows).toHaveLength(0);
  expect(f.db.character.id.find("actor")).toMatchObject({
    localX: 2.25,
    localY: 3,
  });
  expect(() =>
    requireNoOccupiedConstructionInteractions(f.ctx, f.plan.instanceId),
  ).not.toThrow();
});
test("actual third grow-light approach is clear, toggles only its own instance and does not rewrite unchanged state", () => {
  const f = fixture();
  f.install(f.spawn());
  const b = f.db.constructionInteractionBinding.rows.find(
    (b: any) => b.sourceId === "room-hydroponics-tray--0.6",
  );
  f.db.character.id.update({
    ...f.db.character.id.find("actor"),
    localX: -2.375,
    localY: -0.875,
  });
  interactWithConstructionObject(f.ctx, f.request(b.objectId, "set-light-off"));
  expect(f.db.interactionObject.id.find(b.objectId).enabled).toBe(false);
  expect(
    f.db.interactionObject.rows.filter((o: any) => !o.enabled),
  ).toHaveLength(1);
  const update = vi.spyOn(f.db.interactionObject.id, "update");
  interactWithConstructionObject(f.ctx, f.request(b.objectId, "set-light-off"));
  expect(update).not.toHaveBeenCalled();
});
test("wrong instance/deck, distant actor, stale revision, changed operation and missing admission/control reject", () => {
  const f = fixture(),
    actor = f.db.character.id.find("actor"),
    visit = f.db.constructionLocation.characterId.find("actor");
  f.db.character.id.update({ ...actor, shipId: "other" });
  expect(() => interactWithConstructionObject(f.ctx, f.request())).toThrow(
    "location",
  );
  f.db.character.id.update(actor);
  f.db.constructionLocation.characterId.update({ ...visit, deckId: "other" });
  expect(() => interactWithConstructionObject(f.ctx, f.request())).toThrow(
    "location",
  );
  f.db.constructionLocation.characterId.update(visit);
  f.ctx.game = false;
  expect(() => interactWithConstructionObject(f.ctx, f.request())).toThrow(
    "admission",
  );
  f.ctx.game = true;
  f.ctx.control = false;
  expect(() => interactWithConstructionObject(f.ctx, f.request())).toThrow(
    "control",
  );
  f.ctx.control = true;
  expect(() =>
    interactWithConstructionObject(f.ctx, {
      ...f.request(),
      expectedRevision: 99n,
    }),
  ).toThrow("changed");
  f.db.character.id.update({ ...actor, localX: 0 });
  expect(() => interactWithConstructionObject(f.ctx, f.request())).toThrow();
  f.db.character.id.update(actor);
  const req = f.request();
  interactWithConstructionObject(f.ctx, req);
  expect(() =>
    interactWithConstructionObject(f.ctx, { ...req, action: "stand" }),
  ).toThrow("already used");
});
test("one seat has one occupant; another accepted actor cannot take it", () => {
  const f = fixture();
  interactWithConstructionObject(f.ctx, f.request());
  const owner = Identity.fromString("2".repeat(64));
  f.db.character.insert({
    id: "other",
    owner,
    shipId: f.plan.instanceId,
    connected: true,
    localX: 2.25,
    localY: 3,
    sprinting: false,
  });
  f.db.constructionLocation.insert({
    characterId: "other",
    instanceId: f.plan.instanceId,
    deckId: f.plan.spawn.deckId,
    visitId: "other-visit",
  });
  for (const capability of ["draft.read", "instance.spawn"])
    f.db.constructionGrant.insert({
      id: "other-" + capability,
      principal: owner,
      workspaceId: "w",
      capability,
      expiresMicros: 1000n,
      revision: 1n,
      revoked: false,
    });
  expect(() =>
    interactWithConstructionObject({ ...f.ctx, sender: owner }, f.request()),
  ).toThrow();
  expect(f.db.couchSeat.rows).toHaveLength(1);
  expect(f.db.couchSeat.rows[0].characterId).toBe("actor");
});
test("disconnect/grant-loss recover to supported floor; occupied exits retain seat without repeated writes then recover", () => {
  const f = fixture();
  interactWithConstructionObject(f.ctx, f.request());
  const old = f.db.character.id.find("actor");
  f.db.character.id.update({ ...old, connected: false });
  for (let n = 0; n < 3; n++) {
    const id = "blocker" + n;
    f.db.character.insert({
      id,
      owner: f.ctx.sender,
      shipId: f.plan.instanceId,
      localX: 1.75 + n * 0.25,
      localY: 3,
    });
    f.db.constructionLocation.insert({
      characterId: id,
      instanceId: f.plan.instanceId,
      deckId: f.plan.spawn.deckId,
    });
  }
  expect(releaseConstructionSeat(f.ctx, "actor", "disconnect")).toEqual({
    handled: true,
    released: false,
  });
  const bindingUpdate = vi.spyOn(
      f.db.constructionInteractionBinding.objectId,
      "update",
    ),
    actorUpdate = vi.spyOn(f.db.character.id, "update");
  for (let n = 0; n < 20; n++) recoverConstructionSeats(f.ctx);
  expect(bindingUpdate).not.toHaveBeenCalled();
  expect(actorUpdate).not.toHaveBeenCalled();
  leaveCouch(f.ctx, "actor", "disconnect");
  expect(f.db.couchSeat.rows).toHaveLength(1);
  for (let n = 0; n < 3; n++)
    f.db.constructionLocation.characterId.delete("blocker" + n);
  expect(recoverConstructionSeats(f.ctx)).toBe(1);
  expect(f.db.character.id.find("actor")).toMatchObject({
    id: "actor",
    shipId: f.plan.instanceId,
    connected: false,
    localX: 2.25,
    localY: 3,
  });
  expect(recoverConstructionSeats(f.ctx)).toBe(0);
});
test("grant revocation cannot toggle equipment, but releasing own seat cannot restore general access", () => {
  const f = fixture();
  interactWithConstructionObject(f.ctx, f.request());
  for (const g of f.db.constructionGrant.rows) g.revoked = true;
  expect(releaseConstructionSeat(f.ctx, "actor", "grant-loss").released).toBe(
    true,
  );
  expect(f.db.constructionLocation.characterId.find("actor").instanceId).toBe(
    f.plan.instanceId,
  );
  expect(() => interactWithConstructionObject(f.ctx, f.request())).toThrow(
    "grant",
  );
  expect(f.db.constructionGrant.rows.every((g: any) => g.revoked)).toBe(true);
});

test("general equipment views are scoped to the accepted instance/deck; grant loss retains only minimum own seat pose", () => {
  const f = fixture();
  f.install(f.spawn());
  expect(constructionInteractionView(f.ctx)).toHaveLength(4);
  interactWithConstructionObject(f.ctx, f.request());
  expect(
    constructionInteractionView(f.ctx).filter((r) => r.seatedByYou),
  ).toHaveLength(1);
  for (const grant of f.db.constructionGrant.rows) grant.revoked = true;
  expect(constructionInteractionView(f.ctx)).toEqual([]);
  const pose = ownConstructionSeat(f.ctx);
  expect(pose).toHaveLength(1);
  expect(Object.keys(pose[0]).sort()).toEqual(
    [
      "characterId",
      "instanceId",
      "deckId",
      "objectId",
      "localX",
      "localY",
      "standingElevationM",
      "releasePending",
    ].sort(),
  );
  expect(pose[0]).toMatchObject({
    characterId: "actor",
    instanceId: f.plan.instanceId,
    localX: 3.3,
    localY: 3,
  });
  expect(
    ownConstructionSeat({
      ...f.ctx,
      sender: Identity.fromString("2".repeat(64)),
    }),
  ).toEqual([]);
  const visit = f.db.constructionLocation.characterId.find("actor");
  f.db.constructionLocation.characterId.update({ ...visit, deckId: "other" });
  expect(ownConstructionSeat(f.ctx)).toEqual([]);
});

test("modified native source cannot reuse cached qualification for views or seat actions", () => {
  const f = fixture();
  expect(constructionInteractionView(f.ctx)).toHaveLength(4);
  const instance = f.db.constructionInstance.id.find(f.plan.instanceId),
    document = JSON.parse(instance.documentJson);
  document.layout.assembly.parts[0].position[0] += 0.1;
  f.db.constructionInstance.id.update({
    ...instance,
    documentJson: JSON.stringify(document),
  });
  expect(constructionInteractionView(f.ctx)).toEqual([]);
  expect(() => interactWithConstructionObject(f.ctx, f.request())).toThrow();
  expect(f.db.couchSeat.rows).toHaveLength(0);
});

import { expireGrants } from "./construction";
import { leaveCouch } from "./interactions";
test("actual grant expiry hook releases a seated actor and legacy leaveCouch delegates bound seats", () => {
  const f = fixture();
  interactWithConstructionObject(f.ctx, f.request());
  leaveCouch(f.ctx, "actor", "disconnect");
  expect(f.db.couchSeat.rows).toHaveLength(0);
  expect(f.db.character.id.find("actor")).toMatchObject({
    localX: 2.25,
    localY: 3,
  });
  interactWithConstructionObject(f.ctx, f.request());
  f.ctx.timestamp.microsSinceUnixEpoch = 1000n;
  f.db.constructionGrant.by_expiry = {
    filter: () => f.db.constructionGrant.rows.filter((g: any) => !g.revoked),
  };
  expireGrants(f.ctx);
  expect(f.db.couchSeat.rows).toHaveLength(0);
  expect(constructionInteractionView(f.ctx)).toEqual([]);
  expect(f.db.character.id.find("actor")).toMatchObject({
    localX: 2.25,
    localY: 3,
    shipId: f.plan.instanceId,
  });
});

test("trusted factory preserves its preallocated interaction IDs and rejects altered scope or definitions before writes", () => {
  const f = fixture(),
    plan = f.spawn(),
    seeds = planQualifiedWayfarerFunctionalSeeds(plan, randomUUID);
  const allocation = vi.spyOn(f.ctx, "newUuidV4");
  f.install(plan, seeds);
  expect(allocation).not.toHaveBeenCalled();
  expect(
    f.db.interactionObject.rows
      .filter((r: any) => r.shipId === plan.instanceId)
      .map((r: any) => r.id),
  ).toEqual(seeds.interactions.map((s) => s.id));
  for (const mutation of ["instance", "enabled", "duplicate"]) {
    const next = f.spawn(),
      bad = planQualifiedWayfarerFunctionalSeeds(next, randomUUID);
    if (mutation === "instance") bad.instanceId = plan.instanceId;
    if (mutation === "enabled") bad.interactions[0].enabled = false;
    if (mutation === "duplicate")
      bad.interactions[1].id = bad.interactions[0].id;
    const before = f.db.interactionObject.rows.length;
    expect(() => f.install(next, bad)).toThrow();
    expect(f.db.interactionObject.rows).toHaveLength(before);
  }
});
