import { expect, test } from "vitest";
import { Identity } from "spacetimedb";
import { planWayfarerStarter } from "@sidereal/sim/wayfarer-starter";
import { insertQualifiedFlightPlan } from "./construction-flight-writer";
import type { ConstructionFlightContext } from "./construction-flight-authority";
function setup() {
  let n = 1;
  const id = () =>
    `33333333-3333-4333-8333-${(n++).toString(16).padStart(12, "0")}`;
  const plan = planWayfarerStarter({
    characterId: id(),
    berth: { systemId: "shared", x: -50, y: 0, serverTick: 2n },
    allocateUuid: id,
    identityExists: () => false,
  });
  const sender = Identity.fromString("01".repeat(32));
  const rows: Record<string, unknown[]> = {};
  const table = (name: string, key: string) => {
    rows[name] = [];
    return {
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
      ["inventoryItem", "id"],
      ["inventoryContainer", "id"],
      ["interactionObject", "id"],
    ].map(([name, key]) => [name, table(name, key)]),
  );
  rows.constructionInstance.push({
    id: plan.instance.instanceId,
    owner: sender,
    revision: 1n,
    blueprintSha256: plan.instance.blueprintSha256,
    documentJson: JSON.stringify(plan.instance.document),
    idMapJson: JSON.stringify(plan.instance.mappings),
    spawnDeckId: plan.instance.spawn.deckId,
    name: plan.instance.document.layout.name,
  });
  return {
    ctx: { sender, db } as unknown as ConstructionFlightContext,
    plan: plan.flight,
    rows,
  };
}
test("actual typed writer creates only dormant ship/motion/station/fitting bindings", () => {
  const { ctx, plan, rows } = setup();
  insertQualifiedFlightPlan(ctx, plan);
  expect(rows.ship).toHaveLength(1);
  expect(rows.shipWorldMotion).toHaveLength(1);
  expect(rows.constructionFlightFitting).toHaveLength(10);
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
