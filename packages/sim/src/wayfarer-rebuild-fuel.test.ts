import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  WAYFARER_REBUILD_SOURCE,
  WAYFARER_REBUILD_SHA256,
} from "./wayfarer-rebuild-contract";
import { qualifyWayfarerRebuildFuelMount } from "./wayfarer-rebuild-fuel";
import { PRESERVED_FUEL_MOUNT } from "./wayfarer-refit-mount";
import proof from "./wayfarer-refit-fuel-proof.json";
import { CONSTRUCTION_INSET_VISUALS } from "@sidereal/content/construction-inset-visuals";
import { planWayfarerRebuildGame } from "./wayfarer-rebuild-game";

test("conserves the exact old tank and limits under a distinct new source mount", () => {
  const mount = qualifyWayfarerRebuildFuelMount();
  expect(mount.baseSha256).toBe(WAYFARER_REBUILD_SHA256);
  expect(mount.baseSha256).not.toBe(PRESERVED_FUEL_MOUNT.baseSha256);
  expect(mount.definitionId).not.toBe(PRESERVED_FUEL_MOUNT.definitionId);
  for (const key of [
    "assetId",
    "assetSha256",
    "capacityLitres",
    "maxMassKg",
    "stacking",
    "footprintM",
  ] as const)
    expect(mount[key]).toEqual(PRESERVED_FUEL_MOUNT[key]);
});
test("does not transplant the old certificate onto moved fittings, changed floors or altered new walls", () => {
  const modified = () => structuredClone(WAYFARER_REBUILD_SOURCE);
  const moved = modified();
  moved.layout.assembly!.parts[0].position[0] += 0.03125;
  const floor = modified();
  floor.layout.tiles[0].vertices[0][0] += 1;
  const wall = modified();
  wall.layout.partitions[0].a[0] += 1;
  const missing = modified();
  missing.layout.assembly!.parts.pop();
  for (const document of [moved, floor, wall, missing])
    expect(() => qualifyWayfarerRebuildFuelMount(document)).toThrow();
});
test("the exact exported roof transition really stays above the certified native tank top", () => {
  const bytes = readFileSync(
    "assets/art-library/designs/shipyard.structure.wayfarer-transition/revisions/r003/wayfarer-transition.glb",
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "cf008a583532494febff62ee58ce5cdb2e065d5095a08748efebca54d4ab8922",
  );
  const gltf = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"),
  );
  const elevations: number[] = [];
  // These exact exported nodes have only yaw rotations; renderer Y is world Z.
  // Reject other transforms rather than incorrectly applying local accessor bounds.
  for (const node of gltf.nodes) {
    expect(node.children ?? []).toEqual([]);
    expect(node.matrix).toBeUndefined();
    expect(node.scale ?? [1, 1, 1]).toEqual([1, 1, 1]);
    expect((node.rotation ?? [0, 0, 0, 1])[0]).toBe(0);
    expect((node.rotation ?? [0, 0, 0, 1])[2]).toBe(0);
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const position = gltf.accessors[primitive.attributes.POSITION];
      elevations.push(node.translation[1] + position.min[1]);
    }
  }
  expect(elevations.length).toBeGreaterThan(0);
  expect(Math.min(...elevations)).toBe(2.625);
  expect(2.625 - proof.nativeHeightRangeM[1]).toBeGreaterThan(1.57);
});
test("every requested new main roof has an exported lower bound above the conserved tank", () => {
  const roofs = planWayfarerRebuildGame(
    WAYFARER_REBUILD_SOURCE,
  ).mainRoofBindings;
  const checked = new Map<string, number>();
  for (const roof of roofs) {
    if (!checked.has(roof.key)) {
      const part = CONSTRUCTION_INSET_VISUALS.parts.find(
        (p) => p.key === roof.key,
      )!;
      const bytes = readFileSync(
        "assets/runtime/" + part.url.replace(/^\/assets\//, ""),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        part.sha256,
      );
      const gltf = JSON.parse(
        bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"),
      );
      const lows: number[] = [];
      for (const node of gltf.nodes) {
        expect(node.children ?? []).toEqual([]);
        expect(node.matrix).toBeUndefined();
        expect(node.scale ?? [1, 1, 1]).toEqual([1, 1, 1]);
        expect((node.rotation ?? [0, 0, 0, 1])[0]).toBe(0);
        expect((node.rotation ?? [0, 0, 0, 1])[2]).toBe(0);
        for (const primitive of gltf.meshes[node.mesh].primitives)
          lows.push(
            (node.translation?.[1] ?? 0) +
              gltf.accessors[primitive.attributes.POSITION].min[1],
          );
      }
      expect(lows.length).toBeGreaterThan(0);
      checked.set(roof.key, Math.min(...lows));
    }
    expect(checked.get(roof.key)!).toBeGreaterThanOrEqual(0);
    expect(
      roof.originM[2] + checked.get(roof.key)! - proof.nativeHeightRangeM[1],
    ).toBeGreaterThan(2.13);
  }
  expect(checked.size).toBeGreaterThan(0);
});
