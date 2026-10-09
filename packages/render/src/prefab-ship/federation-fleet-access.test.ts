import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  FEDERATION_FLEET,
  fleetAccessAuthorPoint,
  fleetAccessPhysicalGeometry,
} from "@sidereal/content/prefabs";
import { prefabOrigin } from "@sidereal/content/ship-prefab";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { createFederationFleetAccessDoors } from "./federation-fleet-access";
import { prefabDoorSpecs } from "./doors";
import {
  accessDoorMatrix,
  accessDoorPlacements,
} from "./authored-access-doors";
import { prefabToShipLocal } from "./frames";

describe("fleet native exterior doors", () => {
  it("matches shared frame and pocket polygons to the actual GLB placement basis on every ship", () => {
    const catalog = defaultPrefabComponentCatalog();
    for (const doc of FEDERATION_FLEET) {
      const placements = accessDoorPlacements(prefabDoorSpecs(doc, catalog));
      for (const geometry of fleetAccessPhysicalGeometry(doc)) {
        const placement = placements.find((p) => p.id === geometry.id)!;
        const matrix = accessDoorMatrix(placement);
        expect(geometry.frame.length).toBeGreaterThan(0);
        expect(geometry.pockets.length).toBeGreaterThan(0);
        expect(geometry.clearWidthM).toBe(
          geometry.port.id === "cargo" ? 3.75 : 1.2,
        );
        for (const [span, depth, height] of [
          [-1.825, -0.38, 0],
          [0.6, 0.071, 2.2],
          [-3.775, -0.27, 0],
        ]) {
          const render = Vector3.TransformCoordinates(
            new Vector3(span, height, -depth),
            matrix,
          );
          const point = fleetAccessAuthorPoint(geometry.port, span, depth);
          const expected = prefabToShipLocal(
            [point[0], point[1], height + 0.1875],
            prefabOrigin(doc),
          );
          expect(render.x).toBeCloseTo(expected[0], 8);
          expect(render.y).toBeCloseTo(expected[1], 8);
          expect(render.z).toBeCloseTo(expected[2], 8);
        }
      }
    }
  });
  it("isolates the two real ship instances, omits interior leaves, and closes on revoked input", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const rootA = new TransformNode("ship-a", scene);
    const rootB = new TransformNode("ship-b", scene);
    rootB.position.x = 100;
    const doc = FEDERATION_FLEET.find((d) => d.name === "Wayfarer")!;
    const catalog = defaultPrefabComponentCatalog();
    const read = async (piece: { file: string }) =>
      new Uint8Array(
        readFileSync(
          new URL(
            `../../../../assets/runtime/wayfarer-access/r002/${piece.file}`,
            import.meta.url,
          ),
        ),
      );
    const handles = [];
    try {
      const a = await createFederationFleetAccessDoors(
        scene,
        rootA,
        doc,
        catalog,
        read,
        { exteriorOnly: true },
      );
      const b = await createFederationFleetAccessDoors(
        scene,
        rootB,
        doc,
        catalog,
        read,
        { exteriorOnly: true },
      );
      handles.push(a, b);
      a.setView("deck");
      const navy = (h: typeof a) =>
        h
          .meshes()
          .filter(
            (m) =>
              m.metadata?.authoredAccessDoor?.part === "frame" &&
              m.material?.name.startsWith("access.navy"),
          );
      expect(navy(a).length).toBeGreaterThan(0);
      // An exterior-only handle cannot acquire a cabin cutaway, even if a
      // coordinator supplies a deck toggle. No per-instance material clone.
      expect(navy(a).every((m) => !m.material!.clipPlane)).toBe(true);
      expect(navy(a).every((m) => !m.material!.name.includes("cutaway"))).toBe(
        true,
      );
      expect(navy(b).every((m) => !m.material!.clipPlane)).toBe(true);
      const deckRoot = new TransformNode("occupied", scene);
      const deck = await createFederationFleetAccessDoors(
        scene,
        deckRoot,
        doc,
        catalog,
        read,
      );
      handles.push(deck);
      deck.setView("deck");
      expect(navy(deck).every((m) => m.material!.clipPlane != null)).toBe(true);
      expect(
        navy(deck).every((m) => m.material!.name.includes("cutaway")),
      ).toBe(true);
      expect(navy(a).every((m) => !m.material!.clipPlane)).toBe(true);
      expect(navy(b).every((m) => !m.material!.clipPlane)).toBe(true);
      deck.setView("flight");
      expect(navy(deck).every((m) => !m.material!.clipPlane)).toBe(true);
      deck.dispose();
      handles.pop();
      a.setView("flight");
      expect(navy(a).every((m) => !m.material!.clipPlane)).toBe(true);
      for (const h of handles) {
        h.setView("flight");
        expect(
          h
            .doors()
            .map((d) => d.id)
            .sort(),
        ).toEqual(["cargo-outer", "personnel-outer"]);
        expect(h.doors().every((d) => d.open === 0)).toBe(true);
        expect(h.meshes().every((m) => !m.name.includes("inner"))).toBe(true);
      }
      a.update({
        actors: [],
        nowMs: 1,
        dt: 1,
        logic: new Map([
          ["personnel-outer", true],
          ["cargo-outer", false],
        ]),
      });
      b.update({
        actors: [],
        nowMs: 1,
        dt: 1,
        logic: new Map([
          ["personnel-outer", false],
          ["cargo-outer", true],
        ]),
      });
      expect(a.doors().find((d) => d.id === "personnel-outer")!.open).toBe(1);
      expect(a.doors().find((d) => d.id === "cargo-outer")!.open).toBe(0);
      expect(b.doors().find((d) => d.id === "personnel-outer")!.open).toBe(0);
      expect(b.doors().find((d) => d.id === "cargo-outer")!.open).toBe(1);
      a.update({ actors: [], nowMs: 2, dt: 0 });
      expect(a.doors().every((d) => d.open === 0)).toBe(true);
      expect(b.doors().find((d) => d.id === "cargo-outer")!.open).toBe(1);
    } finally {
      handles.forEach((h) => h.dispose());
      engine.dispose();
    }
  });
});
