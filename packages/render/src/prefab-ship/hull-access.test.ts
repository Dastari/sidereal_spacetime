import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HULL_ACCESS_SOURCE } from "@sidereal/content/hull-access-profile";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { createWayfarerHullAccessDoors } from "./wayfarer-access-doors";

it("drives both hull leaves and traversable fields only from accepted door state", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const root = new TransformNode("ship", scene);
  root.position.y = 0.1875;
  try {
    const doors = await createWayfarerHullAccessDoors(
      scene,
      root,
      HULL_ACCESS_SOURCE,
      defaultPrefabComponentCatalog(),
      async (p) =>
        new Uint8Array(
          readFileSync(
            new URL(
              `../../../../assets/runtime/hull-access/r001/${p.file}`,
              import.meta.url,
            ),
          ),
        ),
    );
    doors.update({ actors: [{ x: -6.5, y: 3 }], dt: 1, nowMs: 0 });
    expect(doors.fields().every((f) => !f.active)).toBe(true);
    doors.update({
      actors: [],
      dt: 0.1,
      nowMs: 100,
      logic: new Map([
        ["personnel-outer", true],
        ["cargo-outer", true],
      ]),
    });
    expect(
      doors.fields().every((f) => f.active && f.open > 0 && f.open < 1),
    ).toBe(true);
    doors.update({
      actors: [],
      dt: 1,
      nowMs: 1000,
      logic: new Map([
        ["personnel-outer", true],
        ["cargo-outer", true],
      ]),
    });
    expect(
      doors.fields().every((f) => f.active && f.open === 1 && !f.blocksBodies),
    ).toBe(true);
    for (const mesh of root
      .getChildMeshes()
      .filter((m) => m.metadata?.airRetentionField)) {
      expect(mesh.isPickable).toBe(false);
      expect(mesh.material?.disableDepthWrite).toBe(true);
    }
    doors.setView("flight");
    expect(doors.fields().every((f) => f.active)).toBe(true);
    doors.update({ actors: [], dt: 1, nowMs: 2000 });
    expect(doors.fields().every((f) => !f.active)).toBe(true);
    doors.dispose();
    expect(root.getChildMeshes()).toEqual([]);
  } finally {
    engine.dispose();
  }
});
