import physicalSource from "../../content/src/wayfarer-rebuild-r002.json";
import { wayfarerFlightInput } from "../../content/src/wayfarer-flight-definition";
import { compileFlightDefinition } from "../../sim/src/flight-definition";
import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server",()=>({Range:class{}}));
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
}));
import { setConstructionEnginePower, setConstructionComputerPower } from "./construction-device-power";
import { WAYFARER_REBUILD_SHA256 } from "../../sim/src/wayfarer-rebuild-contract";
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
    blueprintSha256: WAYFARER_REBUILD_SHA256,
  };
  const fittings = LAB_FLIGHT_ACTUATORS.map((a) => ({
    id: a.id,
    shipId: "ship",
    placedObjectId: `placed-${a.id}`,
    sourceDeviceId: a.id,
    definitionId: a.definitionId,
    definitionRevision: 1,
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
    definitionRevision: 1,
    kind: "computer",
    installed: true,
    powered: true,
    availability: 1,
    revision: 1n,
  });
  const physicalDocument=structuredClone(physicalSource);
  for (const p of physicalDocument.layout.assembly.parts) {
    const fitting=fittings.find(f=>f.sourceDeviceId===p.id);
    if(fitting) p.id=fitting.placedObjectId;
    if(p.assetId==="part-d9f37a5f7ea6e8d13254") p.id="computer";
    if(p.assetId===WAYFARER_REACTOR_ASSET_ID) p.id="reactor";
  }
  const instance = {
    id: "ship",
    owner,
    revision: 1n,
    blueprintSha256: binding.blueprintSha256,
    documentJson: JSON.stringify(physicalDocument),
    idMapJson: JSON.stringify({
      objects: [
        { sourceId: "room-engineering", instanceId: "reactor" },
        ...fittings.map((f) => ({
          sourceId: f.kind === "computer" ? "equipment-control-console" : f.sourceDeviceId,
          instanceId: f.placedObjectId,
        })),
      ],
    }),
  };
  const receipts = new Map<string, any>();
  const ctx: any = {
    sender: owner,
    timestamp:{microsSinceUnixEpoch:1n},
    live: true,
    db: {
      constructionFlightDirty:{shipId:{find:()=>undefined},insert:()=>{}},
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
test("computer power is a distinct validated circuit operation with unchanged engine gates", () => {
  const f = fixture();
  const args = {
    shipId: "ship", computerPlacedObjectId: "computer", connected: false,
    expectedRevision: 1n, operationId: "computer-off",
  };
  expect(() => setConstructionEnginePower(f.ctx, { ...f.args, enginePlacedObjectId: "computer" })).toThrow("Installed qualified engine");
  expect(() => setConstructionComputerPower(f.ctx, { ...args, computerPlacedObjectId: f.args.enginePlacedObjectId })).toThrow("Installed qualified computer");
  setConstructionComputerPower(f.ctx, args);
  expect(f.fittings.find(r => r.kind === "computer")!.powered).toBe(false);
  expect(f.fittings.filter(r => r.kind === "actuator").every(r => r.powered)).toBe(true);
  setConstructionComputerPower(f.ctx, args);
  expect(f.binding().revision).toBe(2n);
  expect(() => setConstructionComputerPower(f.ctx, { ...args, connected: true })).toThrow("payload conflict");
  setConstructionComputerPower(f.ctx, { ...args, connected: true, expectedRevision: 2n, operationId: "computer-on" });
  expect(f.fittings.every(r => r.powered)).toBe(true);
});
test("computer power rejects a device ID substituted for the authored console mapping", () => {
  const f = fixture();
  const mappings = JSON.parse(f.instance.idMapJson);
  mappings.objects.find((m: any) => m.instanceId === "computer").sourceId = LAB_FLIGHT_COMPUTER.id;
  f.instance.idMapJson = JSON.stringify(mappings);
  expect(() => setConstructionComputerPower(f.ctx, {
    shipId: "ship", computerPlacedObjectId: "computer", connected: false,
    expectedRevision: 1n, operationId: "bad-console-mapping",
  })).toThrow("Installed qualified computer");
  expect(f.binding().revision).toBe(1n);
  expect(f.fittings.every(r => r.powered)).toBe(true);
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
        dirty: () => false,
        compiled: () => {
          const input=wayfarerFlightInput(JSON.parse(f.instance.documentJson),{variant:"r002"},{fittings:f.fittings.map(({id,placedObjectId,definitionId,definitionRevision,installed,powered,availability})=>({id,placedObjectId,definitionId,definitionRevision,installed,powered,availability}))});
          const c=compileFlightDefinition(input);
          if(c.status!=="ready")throw Error(c.reason);
          return {shipId:"ship",revision:1n,inputHash:c.inputHash,definitionHash:c.definitionHash,...c.mass,envelopeJson:JSON.stringify(c.envelope),actuatorsJson:JSON.stringify(c.actuators),computersJson:JSON.stringify(c.computers),hullJson:JSON.stringify(c.hull),contributionsJson:JSON.stringify(c.contributions),status:"ready",reason:""};
        },
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
