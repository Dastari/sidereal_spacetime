import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ Range: class {} }));
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
}));
import {
  setConstructionEnginePower,
  setConstructionComputerPower,
} from "./construction-device-power";
import { PREFAB_FLIGHT_DEFINITION } from "@sidereal/sim/prefab-flight";

/** An active trusted prefab flight installation (engine + computer fittings). Device power
 * circuits were qualified only for the retired Wayfarer, so they fail closed for it. */
function fixture() {
  const owner = {
    toHexString: () => "owner",
    isEqual: (other: unknown) => other === owner,
  };
  const binding = {
    shipId: "ship",
    instanceId: "ship",
    stationId: "station",
    deckId: "deck",
    definitionId: PREFAB_FLIGHT_DEFINITION,
    definitionSha256: "c".repeat(64),
    owner,
    instanceRevision: 1n,
    revision: 1n,
    lifecycle: "active",
    blueprintSha256: "b".repeat(64),
  };
  const fitting = (id: string, kind: "actuator" | "computer") => ({
    id,
    shipId: "ship",
    placedObjectId: `ship:${id}`,
    sourceDeviceId: id,
    definitionId: `prefab-fitting:${id}`,
    definitionRevision: 1,
    kind,
    installed: true,
    powered: true,
    availability: 1,
    revision: 1n,
  });
  const fittings = [fitting("drive", "actuator"), fitting("core", "computer")];
  const instance = {
    id: "ship",
    owner,
    revision: 1n,
    blueprintSha256: binding.blueprintSha256,
    documentJson: "{}",
    idMapJson: "{}",
  };
  const writes: string[] = [];
  const ctx: any = {
    sender: owner,
    timestamp: { microsSinceUnixEpoch: 1n },
    live: true,
    db: {
      constructionFlightDirty: {
        shipId: { find: () => undefined },
        insert: () => writes.push("dirty"),
      },
      constructionFlightBinding: {
        shipId: { find: () => binding, update: () => writes.push("binding") },
      },
      constructionInstance: { id: { find: () => instance } },
      constructionFlightFitting: {
        by_ship: { filter: () => fittings },
        id: { update: () => writes.push("fitting") },
      },
      constructionFlightReceipt: {
        id: { find: () => undefined },
        insert: () => writes.push("receipt"),
      },
    },
  };
  return { ctx, fittings, writes };
}

test("engine and computer power circuits fail closed for unqualified prefab ships", () => {
  const f = fixture(),
    before = structuredClone(f.fittings);
  for (const connected of [false, true]) {
    expect(() =>
      setConstructionEnginePower(f.ctx, {
        shipId: "ship",
        enginePlacedObjectId: "ship:drive",
        connected,
        expectedRevision: 1n,
        operationId: `engine-${connected}`,
      }),
    ).toThrow("Current active qualified power installation required");
    expect(() =>
      setConstructionComputerPower(f.ctx, {
        shipId: "ship",
        computerPlacedObjectId: "ship:core",
        connected,
        expectedRevision: 1n,
        operationId: `computer-${connected}`,
      }),
    ).toThrow("Current active qualified power installation required");
  }
  expect(f.fittings).toEqual(before);
  expect(f.writes).toEqual([]);
  // Ownership is still checked first.
  f.ctx.sender = { toHexString: () => "other", isEqual: () => false };
  expect(() =>
    setConstructionEnginePower(f.ctx, {
      shipId: "ship",
      enginePlacedObjectId: "ship:drive",
      connected: false,
      expectedRevision: 1n,
      operationId: "foreign",
    }),
  ).toThrow("Owned power installation required");
});
