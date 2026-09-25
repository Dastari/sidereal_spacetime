import { expect, test, vi } from "vitest";
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
}));
import { setConstructionEnginePower } from "./construction-device-power";
import { CURRENT_WAYFARER_STARTER } from "../../content/src/wayfarer-current-starter";
import { LAB_FLIGHT_ACTUATORS } from "../../content/src/flight";
import { resolveShipFlightDefinition } from "./construction-flight-resolver";
import {
  CONSTRUCTION_FLIGHT_DEFINITION,
  CONSTRUCTION_FLIGHT_DEFINITION_SHA256,
} from "../../sim/src/construction-flight";
import { LAB_FLIGHT_COMPUTER } from "../../content/src/flight";
import { WAYFARER_REACTOR_ASSET_ID } from "../../content/src/device-services";
function fixture() {
  const owner = {
    toHexString: () => "owner",
    isEqual: (other: unknown) => other === owner,
  };
  let binding: any = {
    shipId: "ship",
    instanceId: "ship",
    stationId: "station",
    deckId: "deck",
    definitionId: CONSTRUCTION_FLIGHT_DEFINITION,
    definitionSha256: CONSTRUCTION_FLIGHT_DEFINITION_SHA256,
    owner,
    instanceRevision: 1n,
    revision: 1n,
    lifecycle: "active",
    blueprintSha256: CURRENT_WAYFARER_STARTER.sha256,
  };
  const fittings = LAB_FLIGHT_ACTUATORS.map((a) => ({
    id: a.id,
    shipId: "ship",
    placedObjectId: `placed-${a.id}`,
    sourceDeviceId: a.id,
    definitionId: a.definitionId,
    kind: "actuator",
    installed: true,
    powered: true,
    availability: 1,
    revision: 1n,
  }));
  fittings.push({
    id: "computer",
    shipId: "ship",
    placedObjectId: "computer",
    sourceDeviceId: LAB_FLIGHT_COMPUTER.id,
    definitionId: LAB_FLIGHT_COMPUTER.definitionId,
    kind: "computer",
    installed: true,
    powered: true,
    availability: 1,
    revision: 1n,
  });
  const instance = {
    id: "ship",
    owner,
    revision: 1n,
    blueprintSha256: binding.blueprintSha256,
    documentJson: JSON.stringify({
      layout: {
        assembly: {
          parts: [
            { id: "reactor", assetId: WAYFARER_REACTOR_ASSET_ID },
            ...fittings.map((f) => ({ id: f.placedObjectId })),
          ],
        },
      },
    }),
    idMapJson: JSON.stringify({
      objects: [
        { sourceId: "room-engineering", instanceId: "reactor" },
        ...fittings.map((f) => ({
          sourceId: f.sourceDeviceId,
          instanceId: f.placedObjectId,
        })),
      ],
    }),
  };
  const receipts = new Map<string, any>();
  const ctx: any = {
    sender: owner,
    live: true,
    db: {
      constructionFlightBinding: {
        shipId: {
          find: () => binding,
          update: (r: any) => {
            binding = r;
          },
        },
      },
      constructionInstance: { id: { find: () => instance } },
      constructionFlightFitting: {
        by_ship: { filter: () => fittings },
        id: {
          update: (r: any) => {
            fittings[fittings.findIndex((f) => f.id === r.id)] = r;
          },
        },
      },
      constructionFlightReceipt: {
        id: { find: (id: string) => receipts.get(id) },
        insert: (r: any) => receipts.set(r.id, r),
      },
    },
  };
  const args = {
    shipId: "ship",
    enginePlacedObjectId: fittings[0].placedObjectId,
    connected: false,
    expectedRevision: 1n,
    operationId: "disconnect",
  };
  return { ctx, args, fittings, instance, receipts, binding: () => binding };
}
test("owned circuit changes only target engine; exact replay and reconnect preserve identity", () => {
  const f = fixture(),
    original = f.fittings.map((r) => r.id);
  setConstructionEnginePower(f.ctx, f.args);
  expect(f.fittings[0].powered).toBe(false);
  expect(f.fittings.slice(1).every((r) => r.powered)).toBe(true);
  expect(f.binding().revision).toBe(2n);
  setConstructionEnginePower(f.ctx, f.args);
  expect(f.binding().revision).toBe(2n);
  setConstructionEnginePower(f.ctx, {
    ...f.args,
    connected: true,
    expectedRevision: 2n,
    operationId: "reconnect",
  });
  expect(f.fittings[0].powered).toBe(true);
  expect(f.fittings.map((r) => r.id)).toEqual(original);
});
test("foreign owner, stale operation, missing reactor and unknown engine reject before writes", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.ctx.sender = {};
    },
    (f: ReturnType<typeof fixture>) => {
      f.args.expectedRevision = 2n;
    },
    (f: ReturnType<typeof fixture>) => {
      f.instance.documentJson = JSON.stringify({
        layout: { assembly: { parts: [] } },
      });
    },
    (f: ReturnType<typeof fixture>) => {
      f.args.enginePlacedObjectId = "foreign";
    },
    (f: ReturnType<typeof fixture>) => {
      f.ctx.live = false;
    },
  ]) {
    const f = fixture();
    change(f);
    expect(() => setConstructionEnginePower(f.ctx, f.args)).toThrow();
    expect(f.fittings.every((r) => r.powered)).toBe(true);
    expect(f.receipts.size).toBe(0);
  }
});

test("the normal flight resolver consumes the authoritative circuit gate", () => {
  const f = fixture();
  const read = () =>
    resolveShipFlightDefinition(
      {
        binding: () => f.binding(),
        constructionInstanceExists: () => true,
        currentInstanceRevision: () => 1n,
        fittings: () => f.fittings,
      },
      "ship",
    );
  const before = read();
  expect(before.status).toBe("ready");
  setConstructionEnginePower(f.ctx, f.args);
  const after = read();
  if (after.status !== "ready") throw Error("Expected live qualified flight");
  expect(after.actuators[0].availability).toBe(0);
  expect(after.actuators.slice(1).every((a) => a.availability === 1)).toBe(
    true,
  );
  setConstructionEnginePower(f.ctx, {
    ...f.args,
    connected: true,
    operationId: "restore",
    expectedRevision: 2n,
  });
  const restored = read();
  if (restored.status !== "ready")
    throw Error("Expected live qualified flight");
  expect(restored.actuators[0].availability).toBe(1);
});
