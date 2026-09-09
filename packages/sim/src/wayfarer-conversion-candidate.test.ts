import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { WAYFARER_CONVERSION_PIN as PIN } from "../../content/src/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  planWayfarerCandidateSpawn,
  type WayfarerPinnedInputs,
} from "./wayfarer-conversion-candidate";
import {
  compileConstruction,
  readConstructionDraft,
} from "./construction-transactions";

const input = Object.fromEntries(
  Object.keys(PIN.sources).map((path) => [path, readFileSync(path, "utf8")]),
) as WayfarerPinnedInputs;
const candidate = () => createWayfarerConversionCandidate(input);

test("current pinned native Wayfarer becomes a deterministic compiled floor document", () => {
  const a = candidate(),
    b = candidate();
  expect(a.snapshot.sha256).toBe(b.snapshot.sha256);
  expect(readConstructionDraft(a.snapshot.canonical).sha256).toBe(
    a.snapshot.sha256,
  );
  expect(compileConstruction(a.snapshot.canonical).sha256).toBe(
    a.snapshot.sha256,
  );
  expect(a.document.layout.tiles).toHaveLength(51);
  expect(a.document.floors).toHaveLength(51);
  expect(
    a.document.layout.tiles.filter((t) => t.vertices.length === 3),
  ).toHaveLength(2);
  expect(a.document.layout.assembly!.parts).toHaveLength(211);
});

test("all 262 source identities and exact transforms survive without duplicate floors", () => {
  const a = candidate(),
    source = JSON.parse(input["assets/runtime/assembly/wayfarer.json"]);
  expect(a.placements.map((p) => p.originalPlacement)).toEqual(source.parts);
  expect(
    a.placements.every((p) => p.sourcePlacedId === p.templatePlacedId),
  ).toBe(true);
  const ids = [
    ...a.document.layout.tiles.map((t) => t.id),
    ...a.document.layout.assembly!.parts.map((p) => p.id),
  ];
  expect(new Set(ids).size).toBe(262);
  expect([...ids].sort()).toEqual(
    source.parts.map((p: { id: string }) => p.id).sort(),
  );
  expect(a.liveMigration.transformChanges).toEqual([]);
});

test("R006 legacy placed IDs and exact current r004 roof visuals remain distinct from future door and seal behavior", () => {
  const a = candidate();
  expect(
    a.placements.filter((p) => p.sourcePlacedId.startsWith("pilot-r005-")),
  ).toHaveLength(7);
  expect(
    a.placements.some(
      (p) => p.sourcePlacedId === "pilot-r004-airlock-frame-22",
    ),
  ).toBe(true);
  for (const id of [
    "pilot-r004-airlock-frame-21",
    "pilot-r004-vestibule-wall-19",
    "pilot-r004-vestibule-wall-20",
  ])
    expect(a.placements.some((p) => p.sourcePlacedId === id)).toBe(false);
  expect(a.placements.filter((p) => p.role === "roof-visual")).toHaveLength(73);
  expect(a.document.roofKit).toBeUndefined();
  expect(a.document.layout.decks[0].roof).toBe(false);
  expect(a.document.layout.openings).toEqual([]);
  expect(a.document.layout.rooms).toEqual([]);
});

test("source drift fails closed rather than consuming whichever asset revision is newest", () => {
  for (const key of Object.keys(PIN.sources) as (keyof WayfarerPinnedInputs)[])
    expect(() =>
      createWayfarerConversionCandidate({ ...input, [key]: input[key] + "\n" }),
    ).toThrow("source hash mismatch");
});

test("collision omissions reject fresh spawn before UUID allocation; live item state is not an input", () => {
  const a = candidate(),
    allocate = vi.fn(() => "00000000-0000-4000-8000-000000000001");
  expect(() =>
    planWayfarerCandidateSpawn(
      a,
      {
        blueprintRevisionId: "unpublished-candidate",
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0.05,
        partitionHalfWidthM: 0.05,
        objectCollisionBindings: [],
      },
      allocate,
    ),
  ).toThrow(/collision/i);
  expect(allocate).not.toHaveBeenCalled();
  expect(a.readiness.spawnableWithCurrentAuthority).toBe(false);
  expect(a.readiness.liveMigrationReady).toBe(false);
  expect(a.liveMigration.preserve).toContain("containerIds");
  expect(a.liveMigration.preserve).toContain("contents");
  expect(
    a.gaps.find((g) => g.code === "OBJECT_COLLISION_BINDINGS_REQUIRED")!
      .placedIds,
  ).toHaveLength(211);
});

test("interior cargo and equipment require health adapters, not implicit voxel deformation or invented ratings", () => {
  const a = candidate(),
    entities = a.placements.filter((p) =>
      ["cargo-container", "interior-equipment"].includes(p.role),
    );
  expect(entities).toHaveLength(21);
  expect(entities.every((p) => p.damageRule === "entity-health-required")).toBe(
    true,
  );
  expect(a.snapshot.readiness).toMatchObject({
    pressure: false,
    services: false,
    nativeDamage: false,
    flight: false,
  });
  expect(a.document.layout.fittings).toEqual([]);
  expect(a.document.layout.routes).toEqual([]);
});
