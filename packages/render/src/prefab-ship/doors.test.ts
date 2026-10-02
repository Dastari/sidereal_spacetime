import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PREFAB_SHIPS, prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  DOOR_TRAVEL_S,
  airlockOuterTarget,
  createPrefabDoors,
  prefabDoorSpecs,
  stepDoor,
  withoutAirlockLeaves,
} from "./doors";
import type { GlbGeometry } from "./glb-library";

const catalog = defaultPrefabComponentCatalog();
const wren = prefabById("fed.s.wren")!;

describe("prefab door specs", () => {
  it("finds the Wren's exterior airlock at its EVA hatch and its interior doors", () => {
    const specs = prefabDoorSpecs(wren, catalog);
    const airlock = specs.find((d) => d.airlock)!;
    expect(airlock).toMatchObject({
      id: "airlock",
      exterior: true,
      center: [3.5, 0],
      normal: [1, 0],
      span: 2,
    });
    expect(specs.filter((d) => !d.exterior).length).toBeGreaterThanOrEqual(3);
  });

  it("gives every airlock-equipped prefab a closed exterior door", () => {
    for (const doc of PREFAB_SHIPS.filter((doc) =>
      doc.mounts.some((mount) => mount.component.startsWith("airlock.")),
    )) {
      const specs = prefabDoorSpecs(doc, catalog);
      expect(
        specs.some((d) => d.airlock),
        doc.id,
      ).toBe(true);
      for (const d of specs) {
        expect(Math.hypot(...d.along)).toBeCloseTo(1, 6);
        expect(Math.hypot(...d.normal)).toBeCloseTo(1, 6);
      }
    }
  });

  it("does not invent an exterior hatch for the authored Wayfarer cutaway", () => {
    expect(prefabDoorSpecs(prefabById("fed.m.wayfarer")!, catalog)).toEqual([]);
  });
});

describe("airlock outer door timing", () => {
  const cycle = (direction: string) => ({
    airlockId: "airlock",
    direction,
    startedMicros: 0n,
    endsMicros: 6_000_000n,
  });
  it("stays closed without a cycle", () => {
    expect(airlockOuterTarget(null, 0)).toBe(0);
  });
  it("cycling out: sealed while depressurising, open at the end, then closes", () => {
    expect(airlockOuterTarget(cycle("out"), 1_000_000)).toBe(0);
    expect(airlockOuterTarget(cycle("out"), 3_000_000)).toBe(0);
    expect(airlockOuterTarget(cycle("out"), 4_000_000)).toBe(1);
    expect(airlockOuterTarget(cycle("out"), 6_500_000)).toBe(1);
    expect(airlockOuterTarget(cycle("out"), 8_000_000)).toBe(0);
  });
  it("cycling in: open while the spacewalker steps in, then sealed", () => {
    expect(airlockOuterTarget(cycle("in"), 500_000)).toBe(1);
    expect(airlockOuterTarget(cycle("in"), 3_000_000)).toBe(0);
    expect(airlockOuterTarget(cycle("in"), 6_000_000)).toBe(0);
  });
  it("eases at a fixed stroke time", () => {
    expect(stepDoor(0, 1, DOOR_TRAVEL_S / 2)).toBeCloseTo(0.5, 6);
    expect(stepDoor(0.5, 0, 10)).toBe(0);
    expect(stepDoor(1, 1, 0.1)).toBe(1);
  });
});

describe("airlock GLB leaf strip", () => {
  const tri = (x: number, y: number, z: number) => [
    x,
    y,
    z,
    x + 0.01,
    y,
    z,
    x,
    y + 0.01,
    z,
  ];
  const prim = (material: string, ...tris: number[][]) => {
    const positions = Float32Array.from(tris.flat());
    return {
      material,
      positions,
      normals: new Float32Array(positions.length),
      indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i),
      triangles: tris.length,
      bounds: [0, 0, 0, 0, 0, 0] as [
        number,
        number,
        number,
        number,
        number,
        number,
      ],
    };
  };
  const geom = (url: string): GlbGeometry => ({
    url,
    bounds: [-1, -1.2, 0, 1, 1.2, 0.4],
    triangles: 5,
    primitives: [
      // leaf front (z 0.125) and a jamb seam outside the opening
      prim("slot1_secondary", tri(0.2, 0, 0.125), tri(0.8, 0, 0.125)),
      prim("slot8_glass", tri(-0.3, 0.3, 0.19), tri(0.85, 0.3, 0.19)),
      // the dark recess stays whatever its depth
      prim("slot5_dark", tri(0.1, 0, 0.0625)),
    ],
  });
  it("removes only the leaf-plane secondary/glass/metal triangles of the exterior airlock", () => {
    const out = withoutAirlockLeaves(
      geom("/assets/ship-components/r004/airlock.exterior.md.glb"),
    );
    expect(out.primitives.map((p) => p.triangles)).toEqual([1, 1, 1]);
    expect(out.triangles).toBe(3);
  });
  it("leaves every other component untouched", () => {
    const g = geom("/assets/ship-components/r004/cargo-door.2m.glb");
    expect(withoutAirlockLeaves(g)).toBe(g);
  });
});

describe("door leaves", () => {
  it("draws closed leaves in the deck view, only airlock leaves in flight, and slides them", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const root = new TransformNode("root", scene);
    const doors = createPrefabDoors(scene, root, wren, catalog);
    const count = () => doors.instances();
    // all leaves share one box mesh per material slot
    expect(doors.meshes().length).toBeLessThanOrEqual(5);
    const deck = count();
    // two leaves per door, at least the leaf body per leaf
    expect(deck).toBeGreaterThanOrEqual(
      prefabDoorSpecs(wren, catalog).length * 2,
    );
    expect(doors.doors().every((d) => d.open === 0)).toBe(true);
    // a character at the bunks door opens it; nobody opens the airlock
    for (let i = 0; i < 20; i++)
      doors.update({ nowMs: 0, dt: 0.1, actors: [{ x: -0.5, y: 0.2 }] });
    const state = Object.fromEntries(doors.doors().map((d) => [d.id, d.open]));
    expect(state["d-bunks"]).toBe(1);
    expect(state.airlock).toBe(0);
    // the own cycle out opens the outer door near its end
    const now = 10_000;
    for (let i = 0; i < 20; i++)
      doors.update({
        nowMs: now,
        dt: 0.1,
        actors: [],
        cycle: {
          airlockId: "airlock",
          direction: "out",
          startedMicros: now * 1000 - 5_000_000,
          endsMicros: now * 1000 + 1_000_000,
        },
      });
    expect(doors.doors().find((d) => d.id === "airlock")!.open).toBe(1);
    doors.setView("flight");
    expect(count()).toBe(6); // airlock: 2 leaves x (body, window, kick rail)
    doors.dispose();
    scene.dispose();
    engine.dispose();
  });
});
