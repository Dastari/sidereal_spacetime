import { expect, test, vi } from "vitest";
import type { CargoInventoryReader } from "./scoped-inventory";
const mock = vi.hoisted(() => ({
  reader: undefined as unknown as CargoInventoryReader,
  now: 0n,
}));
vi.mock("./scoped-inventory-authority", () => ({
  readCargo: (_ctx: unknown, now: bigint) => {
    mock.now = now;
    return { ...mock.reader, nowMicros: now };
  },
}));
import { createGroundAccess } from "./inventory-ground-access";
import {
  retargetGroundPlacement,
  writeGroundPlacement,
  readGroundPlacement,
} from "@sidereal/sim/ground-placement";
import type { DeckCollisionFrame } from "@sidereal/sim/construction-collision";
import { readFileSync } from "node:fs";
import { WAYFARER_CONVERSION_PIN as PIN } from "@sidereal/content/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "@sidereal/sim/wayfarer-conversion-candidate";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import {
  qualifiedWayfarerWalkingBindings,
  qualifiedWayfarerInstanceObstacles,
} from "@sidereal/sim/wayfarer-walking-bindings";
import {
  compileDeckCollision,
  resolveDeckCollision,
} from "@sidereal/sim/construction-collision";
import { createConstructionStandingSupport } from "./construction-standing-support";

function fixture() {
  mock.now = -1n;
  const actor = { id: "actor", shipId: "ship", localX: 0, localY: 0 };
  const visit = {
    characterId: actor.id,
    visitId: "visit",
    instanceId: actor.shipId,
    deckId: "deck",
  };
  const instance = {
    id: "ship",
    revision: 1n,
    workspaceId: "review",
    blueprintSha256: "test",
    documentJson: JSON.stringify({
      layout: { decks: [{ id: "deck", elevation: 0 }] },
    }),
    idMapJson: "{}",
  };
  const deck = { id: "deck", instanceId: "ship", elevation: 0 };
  const frame: DeckCollisionFrame = {
    shipId: "ship",
    deckId: "deck",
    fingerprint: "test",
    elevationM: 0,
    floors: [
      [
        [-4, -4],
        [4, -4],
        [4, 4],
        [-4, 4],
      ],
    ],
    segments: [],
    obstacles: [],
  };
  const geometry = {
    instanceRevision: 1n,
    frame,
    supportHeightAt: (_x: number, y: number) => 0.1875 + Math.max(0, y) * 0.02,
  };
  const conditions = {
    standing: true,
    revoked: false,
    visit: true,
    native: true,
  };
  const item = {
    id: "item:1",
    characterId: actor.id,
    containerId: "ground",
    equipmentSlot: "",
  };
  const container = {
    id: "ground",
    shipId: actor.shipId,
    parentItemId: "",
    carried: false,
    localX: 1,
    localY: 0,
  };
  const binding = () => ({
    placementId: writeGroundPlacement({
      version: 2,
      itemId: item.id,
      instanceId: actor.shipId,
      deckId: "deck",
      elevationM: geometry.supportHeightAt(container.localX, container.localY),
    }),
  });
  const find = <T>(value: () => T | undefined) => ({ find: value });
  const raw = {
    db: {
      constructionLocation: {
        characterId: find(() => (conditions.visit ? visit : undefined)),
      },
      constructionInstance: {
        id: find(() => (conditions.native ? instance : undefined)),
      },
      constructionDeck: { id: find(() => deck) },
      constructionPilotSeat: { characterId: find(() => undefined) },
      gameShipAccess: { shipId: find(() => undefined) },
      inventoryItem: {
        id: { find: (id: string) => (id === item.id ? item : undefined) },
      },
    },
  };
  mock.reader = {
    principal: "owner",
    nowMicros: 0n,
    actor: () => ({
      ...actor,
      principal: "owner",
      admitted: true,
      connected: true,
      supportedHeightM: geometry.supportHeightAt(actor.localX, actor.localY),
      supportedStanding: conditions.standing,
    }),
    visit: () => (conditions.visit ? visit : undefined),
    instance: () => ({ ...instance, ownerPrincipal: "owner" }),
    grants: () => [
      {
        principal: "owner",
        resourceId: "review",
        capability: "instance.spawn",
        expiresMicros: 100n,
        revoked: conditions.revoked,
      },
    ],
    acceptedCrewVisit: () => undefined,
    geometry: () => geometry,
  } as unknown as CargoInventoryReader;
  const ctx = raw as unknown as Parameters<typeof createGroundAccess>[0];
  return {
    actor,
    visit,
    instance,
    deck,
    frame,
    geometry,
    conditions,
    container,
    binding,
    item,
    ctx,
    raw,
    access: (now = 1n) => createGroundAccess(ctx, actor, now),
  };
}

test("native discovery uses stored target coordinates and fresh support height; pickup retains its shorter range", () => {
  const f = fixture();
  f.container.localY = 2;
  expect(f.access().position(f.container, f.binding(), 12)).toEqual({
    instanceId: "ship",
    deckId: "deck",
    elevationM: 0.2275,
  });
  expect(f.access().position(f.container, f.binding(), 1.8)).toBeUndefined();
  f.actor.localY = 1;
  expect(f.access().position(f.container, f.binding(), 1.8)?.elevationM).toBe(
    0.2275,
  );
});
test("new native drop records its exact accepted deck and source height; source exchange preserves qualification", () => {
  const f = fixture();
  f.actor.localY = 2;
  const source = f.access().drop(f.item.id);
  expect(readGroundPlacement(source)).toEqual({
    version: 2,
    itemId: f.item.id,
    instanceId: "ship",
    deckId: "deck",
    elevationM: 0.2275,
  });
  expect(
    readGroundPlacement(retargetGroundPlacement(source, "old:pack")),
  ).toEqual({
    version: 2,
    itemId: "old:pack",
    instanceId: "ship",
    deckId: "deck",
    elevationM: 0.2275,
  });
});
test.each([
  "other-deck",
  "other-instance",
  "missing-visit",
  "grant-revoked",
  "grant-expired",
  "traversal",
  "wrong-item",
  "removed-floor",
  "changed-support",
])("native %s cannot project or authorize a dropped pack", (reason) => {
  const f = fixture(),
    binding = f.binding();
  let now = 1n;
  if (reason === "other-deck")
    f.visit.deckId = f.frame.deckId = f.deck.id = "other";
  if (reason === "other-instance") f.container.shipId = "other";
  if (reason === "missing-visit") f.conditions.visit = false;
  if (reason === "grant-revoked") f.conditions.revoked = true;
  if (reason === "grant-expired") now = 100n;
  if (reason === "traversal") f.conditions.standing = false;
  if (reason === "wrong-item") f.item.containerId = "elsewhere";
  if (reason === "removed-floor")
    f.frame.floors = [
      [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ],
    ];
  if (reason === "changed-support") f.geometry.supportHeightAt = () => 2;
  expect(f.access(now).position(f.container, binding, 12)).toBeUndefined();
  expect(f.access(now).position(f.container, binding, 1.8)).toBeUndefined();
  if (reason === "grant-expired") expect(mock.now).toBe(now);
});
test("closed and partly open native door geometry blocks ground reach; removing the accepted blocker permits it", () => {
  const f = fixture();
  f.frame.segments = [
    { id: "closed-door", a: [0.5, -1], b: [0.5, 1], halfWidthM: 0.02 },
  ];
  expect(f.access().position(f.container, f.binding(), 12)).toBeUndefined();
  f.frame.segments = [
    { id: "partial-door-leaf", a: [0.5, -0.4], b: [1, 0.4], halfWidthM: 0.02 },
  ];
  expect(f.access().position(f.container, f.binding(), 12)).toBeUndefined();
  f.frame.segments = [];
  expect(f.access().position(f.container, f.binding(), 1.8)?.deckId).toBe(
    "deck",
  );
});
test("unqualified native drops never infer an arbitrary one-deck or multi-deck scene", () => {
  const f = fixture(),
    binding = { placementId: "ground:" + f.item.id };
  expect(f.access().position(f.container, binding, 12)).toBeUndefined();
  f.instance.documentJson = JSON.stringify({
    layout: {
      decks: [
        { id: "deck", elevation: 0 },
        { id: "upper", elevation: 3 },
      ],
    },
  });
  expect(f.access().position(f.container, binding, 12)).toBeUndefined();
});
test("exact qualified historical Wayfarer drop at the reviewed position retains visibility and pickup without rewriting it", () => {
  const f = fixture();
  const candidate = createWayfarerConversionCandidate(
    Object.fromEntries(
      Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
    ) as WayfarerPinnedInputs,
  );
  let sequence = 0;
  const plan = planConstructionInstance(
    candidate.snapshot,
    {
      blueprintRevisionId: "ground-test",
      expectedBlueprintSha256: candidate.snapshot.sha256,
      sourceDeckId: PIN.deckId,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: qualifiedWayfarerWalkingBindings(
        candidate.snapshot,
        0.3,
        1.8,
      ),
    },
    () =>
      `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, "0")}`,
  );
  Object.assign(f.instance, {
    id: plan.instanceId,
    blueprintSha256: plan.blueprintSha256,
    documentJson: JSON.stringify(plan.document),
    idMapJson: JSON.stringify(plan.mappings),
  });
  f.actor.shipId =
    f.container.shipId =
    f.visit.instanceId =
    f.deck.instanceId =
      plan.instanceId;
  f.visit.deckId = f.deck.id = plan.spawn.deckId;
  f.actor.localX = f.container.localX = 0.4247476097478585;
  f.actor.localY = f.container.localY = 5.216286276553653;
  Object.assign(
    f.frame,
    resolveDeckCollision(
      compileDeckCollision(plan.document.layout, plan.spawn.deckId, {
        shipId: plan.instanceId,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        obstacles: qualifiedWayfarerInstanceObstacles(
          f.instance,
          plan.spawn.deckId,
        ),
      }),
      [],
    ),
  );
  const support = createConstructionStandingSupport();
  f.geometry.supportHeightAt = (x, y) =>
    support({
      actor: { ...f.actor, localX: x, localY: y },
      location: f.visit,
      instance: f.instance,
      deck: f.deck,
    });
  const binding = { placementId: "ground:" + f.item.id },
    before = JSON.stringify(binding);
  expect(f.access().position(f.container, binding, 1.8)).toEqual({
    instanceId: plan.instanceId,
    deckId: plan.spawn.deckId,
    elevationM: 0.1875,
  });
  expect(JSON.stringify(binding)).toBe(before);
  f.instance.documentJson = f.instance.documentJson.replace(
    '"ceiling":82',
    '"ceiling":83',
  );
  expect(f.access().position(f.container, binding, 12)).toBeUndefined();
});
test("legacy drops keep their legacy frame, while malformed native metadata cannot grant legacy access", () => {
  const f = fixture();
  f.conditions.visit = f.conditions.native = false;
  expect(
    f
      .access()
      .position(f.container, { placementId: "ground:" + f.item.id }, 1.8),
  ).toEqual({ instanceId: "", deckId: "", elevationM: 0.16 });
  expect(
    f
      .access()
      .position(f.container, { placementId: 'ground:v2:{"broken":true}' }, 12),
  ).toBeUndefined();
});
