import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { WAYFARER_CONVERSION_PIN as PIN } from "@sidereal/content/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "./wayfarer-conversion-candidate";
import { qualifiedWayfarerWalkingBindings } from "./wayfarer-walking-bindings";
import { planConstructionInstance } from "./construction-instance";
import { planQualifiedConstructionFlight } from "./construction-flight";
import { WAYFARER_ACTUATOR_DEFINITIONS } from "@sidereal/content/physical-definitions";
import { transformFlightVector } from "./flight-definition";
import { CONSTRUCTION_FLIGHT_DEFINITION_SHA256 } from "./construction-flight";
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
test("installation binds actual placed definitions while retaining the deployed protocol pin", () => {
  const { spawn, allocate } = setup(),
    instance = spawn();
  const plan = planQualifiedConstructionFlight(instance, berth, allocate);
  expect(CONSTRUCTION_FLIGHT_DEFINITION_SHA256).toBe(
    "8aee8337485375adcea4b3408ffc4589f08da8391057d9ef407fd8d002c311d0",
  );
  expect(plan.ship.massKg).toBe(0); // private compatibility sentinel, never a flight rating
  const document = JSON.parse(instance.documentJson);
  for (const a of plan.actuators) {
    const part = document.layout.assembly.parts.find(
      (p: { id: string }) => p.id === a.placedObjectId,
    );
    const d = WAYFARER_ACTUATOR_DEFINITIONS.find(
      (d) => d.id === "physical:" + part.assetId,
    )!;
    const mount = transformFlightVector(
      d.mountOffset,
      part.rotation,
      part.flipped,
    );
    const axis = transformFlightVector(
      d.forceAxis,
      part.rotation,
      part.flipped,
    );
    expect(a.definitionId).toBe(d.fittingDefinitionId);
    expect(a.definitionRevision).toBe(d.revision);
    expect(a.maxThrustN).toBe(d.maxThrustN);
    expect([a.x, a.y]).toEqual([
      part.position[0] + mount[0],
      part.position[1] + mount[1],
    ]);
    expect(a.rotation).toBe(Math.atan2(-axis[0], axis[1]));
    expect(a.id).not.toBe(a.sourceDeviceId);
  }
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
