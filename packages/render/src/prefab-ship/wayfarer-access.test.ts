import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { WAYFARER_ACCESS_SOURCE } from "@sidereal/content/wayfarer-access-profile";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  createWayfarerAccessDoors,
  wayfarerAccessDoorPlacements,
} from "./wayfarer-access-doors";
import { createWayfarerLiveView } from "./wayfarer-live-view";

describe("native profile2 access presentation", () => {
  it("rejects a forged access profile before any normal-view asset lookup", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    let reads = 0;
    try {
      const forged = structuredClone(WAYFARER_ACCESS_SOURCE);
      forged.mounts[0].at[0] += 1;
      await expect(
        createWayfarerLiveView(scene, forged, {
          catalog: defaultPrefabComponentCatalog(),
          view: "deck",
          accessResolver: async () => {
            reads++;
            return new Uint8Array();
          },
        }),
      ).rejects.toThrow(/exact registered prefab/);
      expect(reads).toBe(0);
    } finally {
      engine.dispose();
    }
  });
  it("keeps the native floor datum once, reverses only inner personnel motion and ignores legacy approach/cycle", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const root = new TransformNode("native-root", scene);
    root.position.y = 0.1875;
    try {
      const doors = await createWayfarerAccessDoors(
        scene,
        root,
        async (piece) =>
          new Uint8Array(
            readFileSync(
              new URL(
                `../../../../assets/runtime/wayfarer-access/r002/${piece.file}`,
                import.meta.url,
              ),
            ),
          ),
      );
      const logic = new Map(
        wayfarerAccessDoorPlacements().map((p) => [p.id, true]),
      );
      doors.update({ logic, dt: 0.7, nowMs: 1000, actors: [] });
      expect(doors.doors().every((d) => d.open === 1)).toBe(true);
      for (const id of ["personnel-outer", "personnel-inner"]) {
        const leaf = scene.getTransformNodeByName(`access-door:${id}:leaf`)!;
        const frame = scene.getTransformNodeByName(`access-door:${id}`)!;
        const delta = leaf
          .getAbsolutePosition()
          .subtract(frame.getAbsolutePosition());
        // Author -X fore maps game -Y / renderer +Z for both orientations.
        expect(delta.x).toBeCloseTo(0);
        expect(delta.z).toBeCloseTo(1.225);
        expect(frame.getAbsolutePosition().y).toBeCloseTo(0.1875);
        expect(frame.getWorldMatrix().determinant()).toBeCloseTo(1);
      }
      doors.update({
        dt: 0.7,
        nowMs: 2000,
        actors: [{ x: -7, y: 3 }],
        cycle: {
          airlockId: "personnel-outer",
          direction: "out",
          startedMicros: 0,
          endsMicros: 1,
        },
      });
      expect(doors.doors().every((d) => d.open === 0)).toBe(true);
      doors.setView("flight");
      for (const mesh of root.getChildMeshes())
        expect(mesh.isEnabled()).toBe(
          mesh.metadata.authoredAccessDoor.id.endsWith("-outer"),
        );
      doors.setView("deck");
      expect(root.getChildMeshes().every((m) => m.isEnabled())).toBe(true);
      doors.dispose();
      expect(root.getChildMeshes()).toEqual([]);
    } finally {
      engine.dispose();
    }
  });
});
