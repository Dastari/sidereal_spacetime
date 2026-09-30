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
import { readFileSync } from "node:fs";
import { validateReferenceDoorLeaf } from "./doors";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Constants } from "@babylonjs/core/Engines/constants";

function authoredLeaf(): GlbGeometry {
  const bytes = readFileSync(
    new URL(
      "../../../../assets/runtime/ship-visual/r002/door-leaf.glb",
      import.meta.url,
    ),
  );
  const jsonLength = bytes.readUInt32LE(12),
    gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const bin = bytes.subarray(28 + jsonLength);
  const read = (id: number) => {
    const a = gltf.accessors[id],
      v = gltf.bufferViews[a.bufferView],
      width = a.type === "VEC3" ? 3 : a.type === "VEC2" ? 2 : 1;
    const size = a.componentType === 5126 || a.componentType === 5125 ? 4 : 2;
    return Array.from({ length: a.count * width }, (_, i) => {
      const o =
        (v.byteOffset ?? 0) +
        (a.byteOffset ?? 0) +
        Math.floor(i / width) * (v.byteStride ?? width * size) +
        (i % width) * size;
      return a.componentType === 5126
        ? bin.readFloatLE(o)
        : size === 4
          ? bin.readUInt32LE(o)
          : bin.readUInt16LE(o);
    });
  };
  const primitives = gltf.meshes[0].primitives.map(
    (p: {
      attributes: { POSITION: number; NORMAL: number; TEXCOORD_0: number };
      indices: number;
      material: number;
    }) => {
      const positions = Float32Array.from(read(p.attributes.POSITION)),
        indices = Uint32Array.from(read(p.indices));
      return {
        material: gltf.materials[p.material].name,
        positions,
        normals: Float32Array.from(read(p.attributes.NORMAL)),
        uvs: Float32Array.from(read(p.attributes.TEXCOORD_0)),
        indices,
        triangles: indices.length / 3,
        bounds: [-0.5, -0.5, -0.0455, 0.5, 0.5, 0.0455],
      };
    },
  );
  return {
    url: "/assets/ship-visual/r002/door-leaf.glb",
    primitives,
    bounds: [-0.5, -0.5, -0.0455, 0.5, 0.5, 0.0455],
  } as GlbGeometry;
}

const catalog = defaultPrefabComponentCatalog();
const wren = prefabById("fed.s.wren")!;

describe("prefab door specs", () => {
  it("validates authored finite geometry before allocation and preserves legacy motion and authored normals", () => {
    const engine = new NullEngine();
    engine.getCaps().instancedArrays = true;
    const scene = new Scene(engine);
    const root = new TransformNode("root", scene);
    const geom = authoredLeaf();
    validateReferenceDoorLeaf(geom);
    let front = 0,
      back = 0;
    for (const p of geom.primitives)
      for (let t = 0; t < p.indices.length; t += 3) {
        const ids = [
          p.indices[t] * 3,
          p.indices[t + 1] * 3,
          p.indices[t + 2] * 3,
        ];
        const a = [0, 1, 2].map(
          (i) => p.positions[ids[1] + i] - p.positions[ids[0] + i],
        );
        const b = [0, 1, 2].map(
          (i) => p.positions[ids[2] + i] - p.positions[ids[0] + i],
        );
        const cross = [
          a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0],
        ];
        expect(
          cross.reduce((n, v, i) => n + v * p.normals[ids[0] + i], 0),
        ).toBeGreaterThanOrEqual(-1e-9);
        if (p.normals[ids[0] + 2] > 0.9) front++;
        if (p.normals[ids[0] + 2] < -0.9) back++;
      }
    expect(front).toBeGreaterThan(10);
    expect(back).toBeGreaterThan(10);
    const before = scene.meshes.length;
    for (const bad of [
      { ...geom, primitives: [...geom.primitives, geom.primitives[0]] },
      { ...geom, bounds: [NaN, ...geom.bounds.slice(1)] } as GlbGeometry,
      { ...geom, bounds: geom.bounds.slice(0, 5) } as GlbGeometry,
      {
        ...geom,
        primitives: geom.primitives.map((p, i) =>
          i ? p : { ...p, indices: new Uint32Array() },
        ),
      },
      {
        ...geom,
        bounds: [-0.6, -0.5, -0.0455, 0.5, 0.5, 0.0455],
      } as GlbGeometry,
    ]) {
      expect(() =>
        createPrefabDoors(scene, root, wren, catalog, wren.theme, "r002", bad),
      ).toThrow("leaf");
      expect(scene.meshes.length).toBe(before);
    }
    const legacy = createPrefabDoors(
      scene,
      root,
      wren,
      catalog,
      wren.theme,
      true,
    );
    const oldString = createPrefabDoors(
      scene,
      root,
      wren,
      catalog,
      wren.theme,
      "r001",
    );
    expect(oldString.instances()).toBe(legacy.instances());
    oldString.meshes().forEach((m, i) =>
      expect(
        m.thinInstanceGetWorldMatrices().map((m) => Array.from(m.m)),
      ).toEqual(
        legacy
          .meshes()
          [i].thinInstanceGetWorldMatrices()
          .map((m) => Array.from(m.m)),
      ),
    );
    const proposed = createPrefabDoors(
      scene,
      root,
      wren,
      catalog,
      wren.theme,
      "r002",
      geom,
    );
    expect(proposed.meshes()).toHaveLength(5);
    const mesh = proposed.meshes().find((m) => m.name.endsWith(":primary"))!;
    expect(mesh.sideOrientation).toBe(
      Constants.MATERIAL_CounterClockWiseSideOrientation,
    );
    expect(mesh.getVerticesData(VertexBuffer.NormalKind)).toEqual(
      geom.primitives[0].normals,
    );
    expect(mesh.material?.metadata?.shipReferenceFinish).toMatchObject({
      revision: "r002",
      role: "wall",
    });
    const previous = mesh
      .thinInstanceGetWorldMatrices()
      .map((m) => Array.from(m.m));
    const logic = new Map(
      prefabDoorSpecs(wren, catalog).map((d) => [d.id, true]),
    );
    for (const d of [legacy, oldString, proposed])
      d.update({ nowMs: 1, dt: DOOR_TRAVEL_S / 2, actors: [], logic });
    expect(proposed.doors()).toEqual(legacy.doors());
    expect(oldString.doors()).toEqual(legacy.doors());
    const next = mesh
      .thinInstanceGetWorldMatrices()
      .map((m) => Array.from(m.m));
    next.forEach((m, i) => {
      expect(m[13]).toBe(previous[i][13]);
      expect(
        Math.hypot(m[12] - previous[i][12], m[14] - previous[i][14]),
      ).toBeCloseTo((i < 2 ? 0.6 : 0.625) * 0.95 * 0.5, 5);
    });
    for (const d of [legacy, oldString, proposed]) d.dispose();
    scene.dispose();
    engine.dispose();
  });
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

  it("gives every prefab's exterior airlock a closed door", () => {
    for (const doc of PREFAB_SHIPS) {
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
