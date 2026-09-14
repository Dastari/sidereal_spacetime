import { planQualifiedConstructionFlight } from "./construction-flight";
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import type { PartCatalog } from "@sidereal/content/assembly";
import {
  createQualifiedWayfarerExterior,
  verifyQualifiedWayfarerExterior,
  WAYFARER_EXTERIOR_REMOVED_FILLER_IDS,
} from "./wayfarer-exterior-qualification";
import {
  WAYFARER_REBUILD_SOURCE,
  WAYFARER_REBUILD_SHA256,
} from "./wayfarer-rebuild-contract";
const catalog = JSON.parse(
  readFileSync("assets/runtime/assembly/catalog-shipyard-r005.json", "utf8"),
) as PartCatalog;
test("exact installed r005 bytes derive distinct exterior-only source and prove all eighteen bounds", () => {
  const result = createQualifiedWayfarerExterior(catalog);
  expect(result.sourceSha256).not.toBe(WAYFARER_REBUILD_SHA256);
  expect(result.bounds).toHaveLength(18);
  expect(result.document.layout.assembly!.parts).toHaveLength(74);
  for (const id of WAYFARER_EXTERIOR_REMOVED_FILLER_IDS) {
    expect(
      result.document.layout.assembly!.parts.some((p) => p.id === id),
    ).toBe(false);
    expect(result.document.wayfarerExterior.identities[id]).toBeUndefined();
    expect(
      result.sourceObjectCollisionBindings.some(
        (binding) => binding.sourceObjectId === id,
      ),
    ).toBe(false);
  }
  expect(
    result.document.layout.assembly!.parts.filter((p) =>
      p.id.startsWith("pilot-"),
    ),
  ).toEqual(
    WAYFARER_REBUILD_SOURCE.layout.assembly!.parts.filter((p) =>
      p.id.startsWith("pilot-"),
    ),
  );

  expect(
    result.bounds.every(
      (b) => b.worldBounds.min[0] >= 5 || b.worldBounds.max[0] <= -5,
    ),
  ).toBe(true);
  expect(
    result.sourceObjectCollisionBindings.filter((b) =>
      b.definitionId.startsWith("wayfarer-exterior-r005-"),
    ),
  ).toHaveLength(18);
  expect(
    result.document.layout.assembly!.parts.filter(
      (p) => p.id.startsWith("drives-") || p.id.startsWith("equipment-control"),
    ),
  ).toEqual(
    WAYFARER_REBUILD_SOURCE.layout.assembly!.parts.filter(
      (p) => p.id.startsWith("drives-") || p.id.startsWith("equipment-control"),
    ),
  );
  expect(result.document.layout.partitions).toEqual(
    WAYFARER_REBUILD_SOURCE.layout.partitions,
  );
  expect(result.document.layout.openings).toEqual(
    WAYFARER_REBUILD_SOURCE.layout.openings,
  );
  expect(
    verifyQualifiedWayfarerExterior(result.document, catalog).sourceSha256,
  ).toBe(result.sourceSha256);
});
test("transplanted source marker cannot conceal moved hull, engine, floor or changed native bytes", () => {
  const result = createQualifiedWayfarerExterior(catalog);
  for (const edit of [
    (d: typeof result.document) => {
      d.layout.assembly!.parts.find(
        (p) => p.id === result.bounds[0].placedObjectId,
      )!.position[0] = 4;
    },
    (d: typeof result.document) => {
      d.layout.assembly!.parts.find((p) =>
        p.id.startsWith("drives-"),
      )!.position[1] += 1;
    },
    (d: typeof result.document) => {
      d.layout.tiles[0].vertices[0][0] += 1;
    },
  ]) {
    const d = structuredClone(result.document);
    edit(d);
    expect(() => verifyQualifiedWayfarerExterior(d, catalog)).toThrow(
      "exact r005",
    );
  }
  const corrupt = structuredClone(catalog);
  corrupt.assets.find((a) => a.id === result.bounds[0].assetId)!.bounds.min[0] =
    -1;
  expect(() => createQualifiedWayfarerExterior(corrupt)).toThrow(
    "catalog bounds",
  );
});

import { compileConstruction } from "./construction-transactions";
import { planConstructionInstance } from "./construction-instance";
import {
  qualifiedWayfarerWalkingBindings,
  qualifiedWayfarerInstanceObstacles,
} from "./wayfarer-walking-bindings";
import {
  planWayfarerExteriorGame,
  type WayfarerExteriorDocument,
} from "./wayfarer-exterior-qualification";
test("normal compiler, UUID spawn and saved identity checks admit only the exact derivative", () => {
  const candidate = createQualifiedWayfarerExterior(catalog);
  const snapshot = compileConstruction(candidate.canonical);
  expect(snapshot.sha256).toBe(candidate.sourceSha256);
  let sequence = 1;
  const plan = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: "exterior-r005-test",
      expectedBlueprintSha256: snapshot.sha256,
      sourceDeckId: candidate.document.layout.playableDeckId,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: qualifiedWayfarerWalkingBindings(
        snapshot,
        0.3,
        1.8,
      ),
    },
    () => `30000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
  );
  const instance = {
    id: plan.instanceId,
    blueprintSha256: snapshot.sha256,
    documentJson: JSON.stringify(plan.document),
    idMapJson: JSON.stringify(plan.mappings),
  };
  const obstacles = qualifiedWayfarerInstanceObstacles(
    instance,
    plan.spawn.deckId,
  );
  expect(obstacles).toHaveLength(169);
  expect(plan.document.layout.nodes).toHaveLength(0);
  expect(plan.document.layout.routes).toHaveLength(0);
  expect(plan.document.layout.serviceConnections).toHaveLength(9);
  const flight = planQualifiedConstructionFlight(
    {
      ...instance,
      revision: 1n,
      spawnDeckId: plan.spawn.deckId,
      name: "Exterior candidate",
    },
    { systemId: "test-system", x: 0, y: 0, serverTick: 1n },
    () => `30000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
  );
  expect(flight.actuators).toHaveLength(9);
  expect(
    flight.actuators.every((a) =>
      plan.document.layout.assembly!.parts.some(
        (p) => p.id === a.placedObjectId,
      ),
    ),
  ).toBe(true);
  const game = planWayfarerExteriorGame(
    plan.document as WayfarerExteriorDocument,
  );
  expect(game.instanceFrame.shipId).toBe(plan.instanceId);
  expect(game.instanceObjectCollisionBindings).toHaveLength(74);
  for (const id of WAYFARER_EXTERIOR_REMOVED_FILLER_IDS) {
    expect(
      plan.mappings.objects.some((mapping) => mapping.sourceId === id),
    ).toBe(false);
    expect(
      game.sourceObjectCollisionBindings.some(
        (binding) => binding.sourceObjectId === id,
      ),
    ).toBe(false);
    expect(
      game.instanceObjectCollisionBindings.some(
        (binding) => binding.sourceObjectId === id,
      ),
    ).toBe(false);
  }

  expect(
    game.nativeVisualRequests.filter((r) => r.role === "wall"),
  ).toHaveLength(126);
  const broken = JSON.parse(instance.idMapJson);
  broken.objects[0].instanceId = broken.objects[1].instanceId;
  expect(() =>
    qualifiedWayfarerInstanceObstacles(
      { ...instance, idMapJson: JSON.stringify(broken) },
      plan.spawn.deckId,
    ),
  ).toThrow();
  const moved = JSON.parse(instance.documentJson);
  moved.layout.assembly.parts[0].position[0] += 0.25;
  expect(() =>
    qualifiedWayfarerInstanceObstacles(
      { ...instance, documentJson: JSON.stringify(moved) },
      plan.spawn.deckId,
    ),
  ).toThrow();
});
