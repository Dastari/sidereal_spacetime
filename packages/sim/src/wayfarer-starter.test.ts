import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { compileConstruction } from "./construction-transactions";
import { planWayfarerStarter } from "./wayfarer-starter";
let sequence = 1;
const fresh = () =>
  `11111111-1111-4111-8111-${(sequence++).toString(16).padStart(12, "0")}`;
const build = () =>
  planWayfarerStarter({
    characterId: fresh(),
    berth: { systemId: "shared", x: -50, y: 50, serverTick: 1n },
    allocateUuid: fresh,
    identityExists: () => false,
  });

test("server pin matches the independently qualified editable template exactly", () => {
  expect(compileConstruction(WAYFARER_STARTER.documentJson).sha256).toBe(
    WAYFARER_STARTER.sha256,
  );
  expect(
    compileConstruction(
      readFileSync(
        "apps/dashboard/src/shipyard/layout/templates/wayfarer-r001.json",
        "utf8",
      ),
    ).canonical,
  ).toBe(compileConstruction(WAYFARER_STARTER.documentJson).canonical);
});
test("two first-character plans allocate independent geometry, cargo, interactions and flight devices", () => {
  const a = build(),
    b = build();
  expect(new Set([...a.allocatedIds, ...b.allocatedIds]).size).toBe(
    a.allocatedIds.length + b.allocatedIds.length,
  );
  for (const p of [a, b]) {
    expect(p.instance.document.layout.tiles).toHaveLength(51);
    expect(p.instance.document.layout.assembly!.parts).toHaveLength(211);
    expect(p.functional.containers).toHaveLength(4);
    expect(p.functional.interactions).toHaveLength(4);
    expect(p.functional.containers.every((c) => c.contents.length === 0)).toBe(
      true,
    );
    expect(p.flight.actuators).toHaveLength(9);
    expect(p.flight.station.occupantId).toBeUndefined();
    expect(p.flight.station.operational).toBe(false);
    expect(p.authoringGrants).toEqual([]);
    expect(p.flight.ship.id).toBe(p.instance.instanceId);
    expect(p.flight.station.deckId).toBe(p.instance.spawn.deckId);
  }
});
test("global collisions, repeated allocator values and invalid IDs fail before installation", () => {
  const characterId = fresh(),
    id = fresh();
  const args = {
    characterId,
    berth: { systemId: "shared", x: 0, y: 0, serverTick: 1n },
    allocateUuid: () => id,
    identityExists: () => false,
  };
  expect(() => planWayfarerStarter(args)).toThrow(/allocated/);
  expect(() =>
    planWayfarerStarter({ ...args, identityExists: () => true }),
  ).toThrow(/allocated/);
  expect(() =>
    planWayfarerStarter({ ...args, characterId: "client-id" }),
  ).toThrow(/UUID/);
});
