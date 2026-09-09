import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { WAYFARER_CONVERSION_PIN as PIN } from "../../content/src/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "./wayfarer-conversion-candidate";
import { qualifiedWayfarerWalkingBindings } from "./wayfarer-walking-bindings";
import { planConstructionInstance } from "./construction-instance";
import { planQualifiedConstructionFlight } from "./construction-flight";
import {
  LAB_FLIGHT_ACTUATORS,
  LAB_FLIGHT_MASS,
} from "@sidereal/content/flight";
const candidate = createWayfarerConversionCandidate(
  Object.fromEntries(
    Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
  ) as WayfarerPinnedInputs,
);
function setup() {
  let counter = 0;
  const allocate = () =>
    `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, "0")}`;
  const spawn = () => {
    const p = planConstructionInstance(
      candidate.snapshot,
      {
        blueprintRevisionId: "qualified",
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
      allocate,
    );
    return {
      id: p.instanceId,
      revision: 1n,
      blueprintSha256: p.blueprintSha256,
      documentJson: JSON.stringify(p.document),
      idMapJson: JSON.stringify(p.mappings),
      spawnDeckId: p.spawn.deckId,
      name: p.document.layout.name,
    };
  };
  return { allocate, spawn };
}
const berth = { systemId: "system", x: -401, y: 0, serverTick: 123n };
test("two native instances get eleven fresh flight identities each and keep instance/deck/placement identity", () => {
  const { spawn, allocate } = setup(),
    a = spawn(),
    b = spawn();
  const before = JSON.stringify([a, b], (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  const x = planQualifiedConstructionFlight(a, berth, allocate),
    y = planQualifiedConstructionFlight(b, { ...berth, x: 50 }, allocate);
  const ids = [x, y].flatMap((p) => [
    p.station.id,
    p.computer.id,
    ...p.actuators.map((a) => a.id),
  ]);
  expect(new Set(ids).size).toBe(22);
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
    expect(p.actuators).toHaveLength(9);
    expect(p.cargoMutationRequired).toBe(false);
    expect(p.actorMutationRequired).toBe(false);
    expect(p.activation).toBe("installed-dormant");
  }
});
test("ratings and force application remain authored flight definitions, not Blender origins", () => {
  const { spawn, allocate } = setup(),
    instance = spawn(),
    plan = planQualifiedConstructionFlight(instance, berth, allocate);
  expect(plan.flight.mass).toEqual(LAB_FLIGHT_MASS);
  for (const [i, a] of plan.actuators.entries()) {
    const { id, shipId, placedObjectId, sourceDeviceId, ...physical } = a;
    const { id: source, ...expected } = LAB_FLIGHT_ACTUATORS[i];
    expect(sourceDeviceId).toBe(source);
    expect(physical).toEqual(expected);
    expect(id).not.toBe(source);
    const document = JSON.parse(instance.documentJson);
    const visual = document.layout.assembly.parts.find(
      (p: { id: string }) => p.id === placedObjectId,
    );
    expect(visual).toBeDefined();
    if (i === 0) expect(a.y).not.toBe(visual.position[1]);
  }
  expect(plan.physicalMassCompiled).toBe(false);
  expect(plan.routedPowerFuelImplemented).toBe(false);
});
test("source hash cannot be transplanted onto changed geometry or source mappings", () => {
  const { spawn, allocate } = setup(),
    instance = spawn();
  expect(() =>
    planQualifiedConstructionFlight(
      { ...instance, blueprintSha256: "0".repeat(64) },
      berth,
      allocate,
    ),
  ).toThrow();
  expect(() =>
    planQualifiedConstructionFlight(
      { ...instance, revision: 2n },
      berth,
      allocate,
    ),
  ).toThrow();
  const document = JSON.parse(instance.documentJson);
  document.layout.assembly.parts[0].position[0] += 1;
  expect(() =>
    planQualifiedConstructionFlight(
      { ...instance, documentJson: JSON.stringify(document) },
      berth,
      allocate,
    ),
  ).toThrow();
  const mapping = JSON.parse(instance.idMapJson);
  mapping.objects[0].instanceId = mapping.objects[1].instanceId;
  expect(() =>
    planQualifiedConstructionFlight(
      { ...instance, idMapJson: JSON.stringify(mapping) },
      berth,
      allocate,
    ),
  ).toThrow();
});
test("identity collisions and unsupported world samples reject before producing a plan", () => {
  const { spawn, allocate } = setup(),
    instance = spawn();
  expect(() =>
    planQualifiedConstructionFlight(instance, berth, () => instance.id),
  ).toThrow("Fresh flight");
  const id = allocate();
  expect(() =>
    planQualifiedConstructionFlight(instance, berth, () => id, [id]),
  ).toThrow("Fresh flight");
  expect(() =>
    planQualifiedConstructionFlight(instance, berth, () => id),
  ).toThrow("Fresh flight");
  for (const x of [Infinity, NaN, 1e9 + 1])
    expect(() =>
      planQualifiedConstructionFlight(instance, { ...berth, x }, allocate),
    ).toThrow();
  expect(() =>
    planQualifiedConstructionFlight(
      instance,
      { ...berth, serverTick: -1n },
      allocate,
    ),
  ).toThrow();
  expect(() =>
    planQualifiedConstructionFlight(
      instance,
      berth,
      allocate,
      Array(16385).fill("id"),
    ),
  ).toThrow("budget");
});
