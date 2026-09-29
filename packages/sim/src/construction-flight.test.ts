import { expect, test } from "vitest";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { compileConstruction } from "./construction-transactions";
import { planConstructionInstance } from "./construction-instance";
import {
  PREFAB_DECK_ID,
  prefabConstructionDocument,
} from "./prefab-construction";
import {
  PREFAB_FLIGHT_DEFINITION,
  planPrefabConstructionFlight,
  prefabFlightModel,
  prefabPlacedObjectId,
} from "./prefab-flight";
import { flightDefinitionCatalogHash } from "./flight-definition";

const WREN = prefabById("fed.s.wren")!;
const catalog = defaultPrefabComponentCatalog();
const snapshot = compileConstruction(
  JSON.stringify(prefabConstructionDocument(WREN, catalog)),
);
const model = prefabFlightModel(WREN, catalog);
const actuatorCount = model.fittings.filter(
  (f) => f.role === "actuator",
).length;

function setup() {
  let counter = 0;
  const allocate = () =>
    `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, "0")}`;
  const spawn = () => {
    const p = planConstructionInstance(
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
      allocate,
    );
    return {
      id: p.instanceId,
      revision: 1n,
      blueprintSha256: p.blueprintSha256,
      documentJson: JSON.stringify(p.document),
      spawnDeckId: p.spawn.deckId,
      name: p.document.layout.name,
    };
  };
  return { allocate, spawn };
}
const berth = { systemId: "system", x: -401, y: 0, serverTick: 123n };
test("two prefab instances get fresh flight identities each and keep instance/deck identity", () => {
  expect(actuatorCount).toBeGreaterThan(0);
  const { spawn, allocate } = setup(),
    a = spawn(),
    b = spawn();
  const before = JSON.stringify([a, b], (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  const x = planPrefabConstructionFlight(a, berth, allocate),
    y = planPrefabConstructionFlight(b, { ...berth, x: 50 }, allocate);
  const ids = [x, y].flatMap((p) => [
    p.station.id,
    p.computer.id,
    ...p.actuators.map((a) => a.id),
  ]);
  expect(new Set(ids).size).toBe(2 * (2 + actuatorCount));
  expect(ids).not.toContain(a.id);
  expect(ids).not.toContain(b.id);
  expect(x.ship.id).toBe(a.id);
  expect(x.station.deckId).toBe(a.spawnDeckId);
  expect(x.station.occupantId).toBeUndefined();
  expect(x.station.operational).toBe(false);
  expect(x.motion.cellX).toBe(-2n);
  expect(x.motion.serverTick).toBe(123n);
  expect(
    JSON.stringify([a, b], (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  ).toBe(before);
  for (const p of [x, y]) {
    expect(p.actuators).toHaveLength(actuatorCount);
    expect(p.cargoMutationRequired).toBe(false);
    expect(p.actorMutationRequired).toBe(false);
    expect(p.activation).toBe("installed-dormant");
  }
});
test("installation binds actual placed prefab definitions and pins the physical catalog", () => {
  const { spawn, allocate } = setup(),
    instance = spawn();
  const plan = planPrefabConstructionFlight(instance, berth, allocate);
  expect(plan.definitionId).toBe(PREFAB_FLIGHT_DEFINITION);
  expect(plan.definitionSha256).toBe(
    flightDefinitionCatalogHash(model.catalog),
  );
  expect(plan.ship.massKg).toBe(0); // private compatibility sentinel, never a flight rating
  const parts = new Map(model.parts.map((p) => [p.sourceId, p]));
  const definitions = new Map(model.catalog.definitions.map((d) => [d.id, d]));
  for (const a of plan.actuators) {
    const part = parts.get(a.sourceDeviceId)!;
    const d = definitions.get(part.definitionId) as {
      fittingDefinitionId: string;
      revision: number;
      maxThrustN: number;
    };
    expect(a.placedObjectId).toBe(
      prefabPlacedObjectId(instance.id, a.sourceDeviceId),
    );
    expect(a.definitionId).toBe(d.fittingDefinitionId);
    expect(a.definitionRevision).toBe(d.revision);
    expect(a.maxThrustN).toBe(d.maxThrustN);
    expect([a.x, a.y]).toEqual([part.position[0], part.position[1]]);
    expect(a.id).not.toBe(a.sourceDeviceId);
  }
  expect([plan.station.localX, plan.station.localY]).toEqual(model.station);
  expect(plan.routedPowerFuelImplemented).toBe(false);
});
test("non-positive revisions and documents that drift from the prefab derivation reject", () => {
  const { spawn, allocate } = setup(),
    instance = spawn();
  expect(() =>
    planPrefabConstructionFlight(
      { ...instance, revision: 0n },
      berth,
      allocate,
    ),
  ).toThrow("Positive prefab instance revision");
  const document = JSON.parse(instance.documentJson);
  document.layout.partitions.pop();
  expect(() =>
    planPrefabConstructionFlight(
      {
        ...instance,
        // A distinct memo key: the model cache is keyed by instance id + blueprint hash.
        blueprintSha256: "0".repeat(64),
        documentJson: JSON.stringify(document),
      },
      berth,
      allocate,
    ),
  ).toThrow();
});
test("identity collisions and unsupported world samples reject before producing a plan", () => {
  const { spawn, allocate } = setup(),
    instance = spawn();
  expect(() =>
    planPrefabConstructionFlight(instance, berth, () => instance.id),
  ).toThrow("Fresh flight");
  const id = allocate();
  expect(() =>
    planPrefabConstructionFlight(instance, berth, () => id, [id]),
  ).toThrow("Fresh flight");
  expect(() => planPrefabConstructionFlight(instance, berth, () => id)).toThrow(
    "Fresh flight",
  );
  for (const x of [Infinity, NaN, 1e9 + 1])
    expect(() =>
      planPrefabConstructionFlight(instance, { ...berth, x }, allocate),
    ).toThrow();
  expect(() =>
    planPrefabConstructionFlight(
      instance,
      { ...berth, serverTick: -1n },
      allocate,
    ),
  ).toThrow();
  expect(() =>
    planPrefabConstructionFlight(
      instance,
      berth,
      allocate,
      Array(16385).fill("id"),
    ),
  ).toThrow("budget");
});
