vi.mock("spacetimedb/server", () => ({ Range: class {} }));
import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import {
  PREFAB_DECK_ID,
  prefabConstructionDocument,
} from "@sidereal/sim/prefab-construction";
import { planPrefabConstructionFlight } from "@sidereal/sim/prefab-flight";
import { insertQualifiedFlightPlan } from "./construction-flight-writer";
import type { ConstructionFlightContext } from "./construction-flight-authority";
const WREN = prefabById("fed.s.wren")!;
const snapshot = compileConstruction(
  JSON.stringify(
    prefabConstructionDocument(WREN, defaultPrefabComponentCatalog()),
  ),
);
function setup() {
  let n = 1;
  const id = () =>
    `33333333-3333-4333-8333-${(n++).toString(16).padStart(12, "0")}`;
  const spawned = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: `trusted-prefab:fed.s.wren:r${WREN.revision}`,
      expectedBlueprintSha256: snapshot.sha256,
      sourceDeckId: PREFAB_DECK_ID,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: [],
    },
    id,
  );
  const instance = {
    id: spawned.instanceId,
    revision: 1n,
    blueprintSha256: spawned.blueprintSha256,
    documentJson: JSON.stringify(spawned.document),
    idMapJson: JSON.stringify(spawned.mappings),
    spawnDeckId: spawned.spawn.deckId,
    name: spawned.document.layout.name,
  };
  const flight = planPrefabConstructionFlight(
    instance,
    { systemId: "shared", x: -50, y: 0, serverTick: 2n },
    id,
  );
  const sender = Identity.fromString("01".repeat(32));
  const rows: Record<string, unknown[]> = {};
  const table = (name: string, key: string) => {
    rows[name] = [];
    return {
      by_system: {
        filter: (id: string) =>
          rows[name].filter((r: any) => r.systemId === id),
      },
      [key]: {
        find: (id: string) =>
          rows[name].find((r) => (r as Record<string, unknown>)[key] === id),
      },
      insert: (row: unknown) => {
        rows[name].push(row);
      },
    };
  };
  const db = Object.fromEntries(
    [
      ["constructionInstance", "id"],
      ["ship", "id"],
      ["shipWorldMotion", "shipId"],
      ["station", "id"],
      ["constructionFlightStation", "stationId"],
      ["constructionFlightFitting", "id"],
      ["constructionFlightBinding", "shipId"],
      ["constructionFlightDirty", "shipId"],
      ["inventoryItem", "id"],
      ["inventoryContainer", "id"],
      ["interactionObject", "id"],
    ].map(([name, key]) => [name, table(name, key)]),
  );
  rows.constructionInstance.push({ ...instance, owner: sender });
  return {
    ctx: {
      sender,
      db,
      timestamp: { microsSinceUnixEpoch: 1n },
    } as unknown as ConstructionFlightContext,
    plan: flight,
    rows,
  };
}
test("actual typed writer creates only dormant ship/motion/station/fitting bindings", () => {
  const { ctx, plan, rows } = setup();
  insertQualifiedFlightPlan(ctx, plan);
  expect(rows.ship).toHaveLength(1);
  expect(rows.shipWorldMotion).toHaveLength(1);
  // One flight computer plus every placed prefab actuator.
  expect(rows.constructionFlightFitting).toHaveLength(
    1 + plan.actuators.length,
  );
  expect(rows.station[0]).toMatchObject({
    occupantId: undefined,
    operational: false,
  });
  expect(rows.constructionFlightBinding[0]).toMatchObject({
    lifecycle: "installed-dormant",
    owner: ctx.sender,
  });
  expect(rows.inventoryItem).toEqual([]);
  expect(rows.inventoryContainer).toEqual([]);
  expect(rows.interactionObject).toEqual([]);
  expect(() => insertQualifiedFlightPlan(ctx, plan)).toThrow(
    /already installed/,
  );
  expect(rows.ship).toHaveLength(1);
});
test("tampered rating and occupied fitting UUID reject before any writes", () => {
  const f = setup();
  f.plan.ship.massKg += 1;
  expect(() => insertQualifiedFlightPlan(f.ctx, f.plan)).toThrow(/differs/);
  expect(f.rows.ship).toEqual([]);
  const g = setup();
  g.rows.inventoryItem.push({ id: g.plan.station.id });
  expect(() => insertQualifiedFlightPlan(g.ctx, g.plan)).toThrow(/allocated/);
  expect(g.rows.ship).toEqual([]);
  const h = setup();
  expect(() =>
    insertQualifiedFlightPlan(h.ctx, {
      ...h.plan,
      definitionId: "qualified-wayfarer-lab-flight-v1",
    } as never),
  ).toThrow(/Prefab flight plan required/);
  expect(h.rows.ship).toEqual([]);
});
test("storage failure propagates instead of claiming independent partial success", () => {
  const f = setup();
  f.ctx.db.constructionFlightBinding.insert = () => {
    throw Error("Storage failure");
  };
  expect(() => insertQualifiedFlightPlan(f.ctx, f.plan)).toThrow(
    /Storage failure/,
  );
  // This lightweight table double has no rollback. Real SpacetimeDB must own the transaction.
});

test("trusted explicit-at flight installation cannot bypass the existing60ship admission capacity", () => {
  const f = setup();
  for (let i = 0; i < 60; i++)
    f.rows.shipWorldMotion.push({
      shipId: `other-${i}`,
      systemId: f.plan.motion.systemId,
    });
  expect(() => insertQualifiedFlightPlan(f.ctx, f.plan)).toThrow(
    "Shared contact island is full",
  );
  expect(f.rows.ship).toHaveLength(0);
  expect(f.rows.constructionFlightBinding).toHaveLength(0);
});
