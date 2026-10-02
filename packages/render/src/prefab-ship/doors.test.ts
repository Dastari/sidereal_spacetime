import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { bindPrefabDoorCameraHistory } from "../prefab-ship-presentation";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PREFAB_SHIPS, prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  DOOR_TRAVEL_S,
  DOOR_DECK_HEIGHT_M,
  DOOR_FLOOR_M,
  AIRLOCK_FLIGHT_HEIGHT_M,
  AIRLOCK_LEAF_M,
  AIRLOCK_LEAF_OFFSET_M,
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
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

function authoredLeaf(file = "door-leaf.glb"): GlbGeometry {
  const bytes = readFileSync(
    new URL(
      `../../../../assets/runtime/ship-visual/r002/${file}`,
      import.meta.url,
    ),
  );
  if (file === "door-leaf-r019.glb")
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "77369dfdac6e29fa3b6dc666e607287c5ab19897c13a474f24bdf879f62d0047",
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
  const bounds = [
    Infinity,
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
    -Infinity,
  ];
  for (const p of primitives)
    for (let i = 0; i < p.positions.length; i++) {
      bounds[i % 3] = Math.min(bounds[i % 3], p.positions[i]);
      bounds[(i % 3) + 3] = Math.max(bounds[(i % 3) + 3], p.positions[i]);
    }
  return {
    url: `/assets/ship-visual/r002/${file}`,
    primitives,
    triangles: primitives.reduce(
      (n: number, p: { triangles: number }) => n + p.triangles,
      0,
    ),
    bounds,
  } as GlbGeometry;
}

const catalog = defaultPrefabComponentCatalog();
const wren = prefabById("fed.s.wren")!;

it("cuts the real authored leaf without squeezing its retained shape, preserves the same stroke and restores full flight leaves", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("cut-test", scene);
  const full = createPrefabDoors(
    scene,
    root,
    wren,
    catalog,
    wren.theme,
    "r002",
    authoredLeaf("door-leaf-r019.glb"),
  );
  const cut = createPrefabDoors(
    scene,
    root,
    wren,
    catalog,
    wren.theme,
    "r002",
    authoredLeaf("door-leaf-r019.glb"),
  );
  const ids = new Set(
    prefabDoorSpecs(wren, catalog)
      .filter((d) => !d.exterior)
      .map((d) => d.id),
  );
  expect(ids.size).toBeGreaterThan(0);
  expect(cut.cutawaySupported()).toBe(true);
  cut.setCutaway(ids);
  const geometry = cut
    .meshes()
    .filter((m) => m.name.includes(":cut:") && m.isEnabled());
  expect(geometry.length).toBeGreaterThan(0);
  for (const mesh of geometry) {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const maxY = Math.max(...positions.filter((_, i) => i % 3 === 1));
    expect(maxY).toBeCloseTo(-0.18, 6);
    // The original height and vertical origin remain unchanged; local geometry is genuinely cut.
    for (const matrix of mesh.thinInstanceGetWorldMatrices()) {
      expect(matrix.m[5]).toBe(1.5625);
      expect(matrix.m[13]).toBe(0.1875 + 1.5625 / 2);
      expect(maxY * matrix.m[5] + matrix.m[13]).toBeCloseTo(0.6875, 6);
    }
  }
  const logic = new Map([...ids].map((id) => [id, true]));
  for (const view of [full, cut])
    view.update({ nowMs: 1, dt: DOOR_TRAVEL_S / 2, actors: [], logic });
  expect(cut.doors()).toEqual(full.doors());
  for (const mesh of geometry) {
    const source = full
      .meshes()
      .find((m) => m.name.endsWith(mesh.name.split(":").at(-1)!))!;
    for (const matrix of mesh.thinInstanceGetWorldMatrices())
      expect(
        source.thinInstanceGetWorldMatrices().some((m) => m.equals(matrix)),
      ).toBe(true);
  }
  cut.setCutaway(new Set());
  expect(
    cut
      .meshes()
      .filter((m) => m.isEnabled())
      .map((m) => m.name.split(":").at(-1)),
  ).toEqual(
    full
      .meshes()
      .filter((m) => m.isEnabled())
      .map((m) => m.name.split(":").at(-1)),
  );
  for (const view of [full, cut]) view.setView("flight");
  expect(cut.doors()).toEqual(full.doors());
  expect(
    cut
      .meshes()
      .filter((m) => m.isEnabled())
      .every((m) => m.name.includes(":full:")),
  ).toBe(true);
  full.dispose();
  cut.dispose();
  root.dispose();
  expect(scene.meshes).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});

function assertDoorMatrixCache(mesh: Mesh) {
  const worlds = mesh.thinInstanceGetWorldMatrices();
  const cpu = mesh._thinInstanceDataStorage.matrixData!;
  expect(worlds).toHaveLength(mesh.thinInstanceCount);
  expect(new Set(worlds).size).toBe(mesh.thinInstanceCount);
  for (let i = 0; i < worlds.length; i++)
    expect(Array.from(worlds[i].m)).toEqual(
      Array.from(cpu.subarray(i * 16, i * 16 + 16)),
    );
}

function matrixBufferWitness(mesh: Mesh) {
  return {
    cpu: mesh._thinInstanceDataStorage.matrixData!,
    gpu: mesh.getVertexBuffer("world0")!.getBuffer(),
    attributes: Array.from({ length: 4 }, (_, i) =>
      mesh.getVertexBuffer(`world${i}`)!,
    ),
  };
}
function assertDoorMatrixBuffer(
  mesh: Mesh,
  witness: ReturnType<typeof matrixBufferWitness>,
) {
  expect(mesh._thinInstanceDataStorage.matrixData).toBe(witness.cpu);
  for (let i = 0; i < 4; i++) {
    expect(mesh.getVertexBuffer(`world${i}`)).toBe(witness.attributes[i]);
    expect(witness.attributes[i].getBuffer()).toBe(witness.gpu);
  }
}

it("detects real buffer replacement and naive direct-update stale public matrices independently", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("causal-buffer-witness", scene);
  const source = authoredLeaf("door-leaf-r019.glb");
  const allocation = createPrefabDoors(
    scene,
    root,
    wren,
    catalog,
    wren.theme,
    "r002",
    source,
  );
  const stale = createPrefabDoors(
    scene,
    root,
    wren,
    catalog,
    wren.theme,
    "r002",
    source,
  );
  try {
    const mesh = allocation.meshes()[0],
      witness = matrixBufferWitness(mesh);
    assertDoorMatrixBuffer(mesh, witness);
    // This is the installed API used by the original defect, even with the SAME CPU array.
    mesh.thinInstanceSetBuffer("matrix", witness.cpu, 16, false);
    expect(() => assertDoorMatrixBuffer(mesh, witness)).toThrow();
    const other = stale.meshes()[0];
    assertDoorMatrixCache(other);
    const cpu = other._thinInstanceDataStorage.matrixData!;
    cpu[12] += 0.25;
    other.thinInstanceBufferUpdated("matrix");
    // A naive array+upload-only fix leaves the getter's cached pose unchanged.
    expect(() => assertDoorMatrixCache(other)).toThrow();
  } finally {
    allocation.dispose();
    stale.dispose();
    root.dispose();
    scene.dispose();
    engine.dispose();
  }
});

it.each(["fed.s.wren", "fed.m.crest"])(
  "reuses prepared door matrix buffers through masks, motion, view changes and independent generations (%s)",
  (prefab) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode("matrix-capacity", scene);
    const doc = prefabById(prefab)!;
    const source = authoredLeaf("door-leaf-r019.glb");
    const specs = prefabDoorSpecs(doc, catalog);
    const interior = specs.filter((d) => !d.exterior).map((d) => d.id);
    const handle = createPrefabDoors(
      scene,
      root,
      doc,
      catalog,
      doc.theme,
      "r002",
      source,
    );
    const peer = createPrefabDoors(
      scene,
      root,
      doc,
      catalog,
      doc.theme,
      "r002",
      source,
    );
    const meshes = handle.meshes();
    expect(handle.cutawaySupported()).toBe(true);
    // Real clipped geometry has only primary/dark, prepared even while inactive.
    expect(
      meshes
        .filter((m) => m.name.includes(":cut:"))
        .map((m) => m.name.split(":").at(-1)),
    ).toEqual(["primary", "dark"]);
    const buffers = meshes.map((mesh) => ({
      mesh,
      cpu: mesh._thinInstanceDataStorage.matrixData!, // Read-only installed API identity witness.
      gpu: mesh.getVertexBuffer("world0")!.getBuffer(),
      attributes: Array.from({ length: 4 }, (_, i) =>
        mesh.getVertexBuffer(`world${i}`)!,
      ),
      geometry: mesh.geometry,
      indices: mesh.getIndices(),
      positions: Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!),
      normals: Array.from(mesh.getVerticesData(VertexBuffer.NormalKind)!),
      uv: Array.from(mesh.getVerticesData(VertexBuffer.UVKind)!),
    }));
    for (const b of buffers) {
      expect(b.cpu.length).toBeGreaterThan(0);
      expect(b.cpu.length % 16).toBe(0);
      expect(b.gpu).not.toBeNull();
      expect(new Set(b.attributes.map((v) => v.getBuffer())).size).toBe(1);
    }
    const peerPrefix = peer
      .meshes()
      .map((m) => Array.from(m._thinInstanceDataStorage.matrixData!));
    expect(
      peer
        .meshes()
        .every((m) =>
          buffers.every(
            (b) => b.gpu !== m.getVertexBuffer("world0")!.getBuffer(),
          ),
        ),
    ).toBe(true);
    const preparedMeshes = [...scene.meshes],
      preparedGeometries = [...scene.geometries];
    const dynamicAlloc = vi.spyOn(engine, "createDynamicVertexBuffer");
    const staticAlloc = vi.spyOn(engine, "createVertexBuffer");
    const indexAlloc = vi.spyOn(engine, "createIndexBuffer");
    const release = vi.spyOn(engine, "_releaseBuffer");
    const upload = vi.spyOn(engine, "updateDynamicVertexBuffer");
    const resetBuffer = meshes.map((m) => vi.spyOn(m, "thinInstanceSetBuffer"));
    let view: "deck" | "flight" = "deck";
    let mask = new Set<string>();
    const assertState = (changed = true) => {
      const opens = new Map(handle.doors().map((d) => [d.id, d.open]));
      for (const b of buffers) {
        const cut = b.mesh.name.includes(":cut:");
        const expected = specs
          .filter(
            (spec) =>
              (view === "deck" || spec.airlock) &&
              cut === (view === "deck" && !spec.exterior && mask.has(spec.id)),
          )
          .flatMap((spec) =>
            [-1, 1].map((side) => {
              const height =
                view === "flight" && spec.airlock
                  ? AIRLOCK_FLIGHT_HEIGHT_M
                  : DOOR_DECK_HEIGHT_M;
              const width = spec.airlock
                ? AIRLOCK_LEAF_M
                : Math.max(0.3, (spec.span - 0.75) / 2);
              const offset = spec.exterior ? AIRLOCK_LEAF_OFFSET_M : 0;
              const u =
                side * (width / 2 + 0.005 + opens.get(spec.id)! * width * 0.95);
              const [ax, ay] = spec.along;
              return Float32Array.from([
                ax * width,
                0,
                -ay * width,
                0,
                0,
                height,
                0,
                0,
                ay,
                0,
                ax,
                0,
                spec.center[0] + spec.normal[0] * offset + ax * u,
                DOOR_FLOOR_M + height / 2,
                -(spec.center[1] + spec.normal[1] * offset) - ay * u,
                1,
              ]);
            }),
          );
        const count = expected.length;
        expect(b.mesh.thinInstanceCount).toBe(count);
        expect(b.mesh.isEnabled()).toBe(count > 0);
        assertDoorMatrixBuffer(b.mesh, b);
        expect(b.mesh.geometry).toBe(b.geometry);
        expect(b.mesh.getIndices()).toBe(b.indices);
        assertDoorMatrixCache(b.mesh);
        const worlds = b.mesh.thinInstanceGetWorldMatrices();
        for (let i = 0; i < count; i++) {
          expect(Array.from(b.cpu.subarray(i * 16, i * 16 + 16))).toEqual(
            Array.from(expected[i]),
          );
        }
        expect(
          Array.from(b.mesh.getVerticesData(VertexBuffer.PositionKind)!),
        ).toEqual(b.positions);
        expect(
          Array.from(b.mesh.getVerticesData(VertexBuffer.NormalKind)!),
        ).toEqual(b.normals);
        expect(
          Array.from(b.mesh.getVerticesData(VertexBuffer.UVKind)!),
        ).toEqual(b.uv);
        const bounds = b.mesh.getBoundingInfo().boundingBox;
        expect(
          [...bounds.minimum.asArray(), ...bounds.maximum.asArray()].every(
            Number.isFinite,
          ),
        ).toBe(true);
        // Independently retain EVERY actual vertex. Aggregate outside Vitest's
        // matcher machinery so a large authored ship does not run millions of assertions.
        if (count) {
          const sourcePoint = new Vector3(),
            transformed = new Vector3();
          const low = new Vector3(Infinity, Infinity, Infinity);
          const high = new Vector3(-Infinity, -Infinity, -Infinity);
          for (const matrix of worlds)
            for (let i = 0; i < b.positions.length; i += 3) {
              Vector3.FromArrayToRef(b.positions, i, sourcePoint);
              Vector3.TransformCoordinatesToRef(
                sourcePoint,
                matrix,
                transformed,
              );
              low.minimizeInPlace(transformed);
              high.maximizeInPlace(transformed);
            }
          for (const axis of ["x", "y", "z"] as const) {
            expect(low[axis]).toBeGreaterThanOrEqual(
              bounds.minimum[axis] - 1e-6,
            );
            expect(high[axis]).toBeLessThanOrEqual(bounds.maximum[axis] + 1e-6);
          }
        }
        const writes = upload.mock.calls.filter((call) => call[0] === b.gpu);
        if (count) {
          expect(writes).toHaveLength(changed ? 1 : 0);
          for (const call of writes) {
            expect(call[1]).toBe(b.cpu);
            expect(call[2]).toBe(0);
            expect(call[3]).toBe(count * 16 * Float32Array.BYTES_PER_ELEMENT);
          }
        } else expect(writes).toHaveLength(0);
      }
      expect(handle.instances()).toBe(
        meshes.reduce((n, m) => n + m.thinInstanceCount, 0),
      );
      expect(scene.meshes).toEqual(preparedMeshes);
      expect(scene.geometries).toEqual(preparedGeometries);
      expect(dynamicAlloc).not.toHaveBeenCalled();
      expect(staticAlloc).not.toHaveBeenCalled();
      expect(indexAlloc).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
      for (const reset of resetBuffer) expect(reset).not.toHaveBeenCalled();
      expect(
        peer
          .meshes()
          .map((m) => Array.from(m._thinInstanceDataStorage.matrixData!)),
      ).toEqual(peerPrefix);
      upload.mockClear();
    };
    try {
      assertState(false);
      // Four distinct subsets plus all/none exercise mixed buckets and zero->nonzero.
      for (const next of [
        ...Array.from(
          { length: 4 },
          (_, sector) => new Set(interior.filter((_, i) => i % 4 === sector)),
        ),
        new Set(interior),
        new Set<string>(),
      ]) {
        mask = next;
        handle.setCutaway(mask);
        assertState();
        handle.setCutaway(mask);
        expect(upload).not.toHaveBeenCalled();
        const logic = new Map(specs.map((d) => [d.id, true]));
        handle.update({ nowMs: 1, dt: DOOR_TRAVEL_S / 2, actors: [], logic });
        assertState();
        handle.update({ nowMs: 2, dt: DOOR_TRAVEL_S, actors: [], logic });
        assertState();
        handle.update({
          nowMs: 3,
          dt: DOOR_TRAVEL_S,
          actors: [],
          logic: new Map(specs.map((d) => [d.id, false])),
        });
        assertState();
      }
      view = "flight";
      handle.setView(view);
      assertState();
      handle.update({
        nowMs: 4,
        dt: DOOR_TRAVEL_S / 2,
        actors: [],
        cyclingBodies: specs
          .filter((d) => d.airlock)
          .map((d) => ({ x: d.center[0], y: d.center[1] })),
      });
      assertState();
      view = "deck";
      handle.setView(view);
      assertState();
      handle.dispose();
      expect(meshes.every((m) => m.isDisposed())).toBe(true);
      for (const b of buffers)
        expect(
          release.mock.calls.filter((call) => call[0] === b.gpu),
        ).toHaveLength(1);
      for (const m of peer.meshes())
        expect(
          release.mock.calls.filter(
            (call) => call[0] === m.getVertexBuffer("world0")!.getBuffer(),
          ),
        ).toHaveLength(0);
      const peerData = peer
        .meshes()
        .map((m) => Array.from(m._thinInstanceDataStorage.matrixData!));
      const replacement = createPrefabDoors(
        scene,
        root,
        doc,
        catalog,
        doc.theme,
        "r002",
        source,
      );
      try {
        expect(
          replacement
            .meshes()
            .every((m) =>
              buffers.every(
                (b) => b.gpu !== m.getVertexBuffer("world0")!.getBuffer(),
              ),
            ),
        ).toBe(true);
        dynamicAlloc.mockClear();
        staticAlloc.mockClear();
        indexAlloc.mockClear();
        release.mockClear();
        handle.update({ nowMs: 10, dt: 1, actors: [] });
        handle.setCutaway(new Set(interior));
        handle.setView("flight");
        handle.dispose();
        expect(handle.meshes()).toHaveLength(0);
        expect(handle.instances()).toBe(0);
        expect(dynamicAlloc).not.toHaveBeenCalled();
        expect(staticAlloc).not.toHaveBeenCalled();
        expect(indexAlloc).not.toHaveBeenCalled();
        expect(release).not.toHaveBeenCalled();
        expect(
          peer
            .meshes()
            .map((m) => Array.from(m._thinInstanceDataStorage.matrixData!)),
        ).toEqual(peerData);
        expect(replacement.meshes().some((m) => m.isEnabled())).toBe(true);
      } finally {
        replacement.dispose();
      }
    } finally {
      handle.dispose();
      peer.dispose();
      vi.restoreAllMocks();
      root.dispose();
      scene.dispose();
      engine.dispose();
    }
  },
);

it("owns eager indexed-leaf histories and preserves last genuine main-camera poses through rebucketing", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("actual-temporal-leaf", scene);
  const camera = new FreeCamera("main", new Vector3(0, 9, -20), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  const auxiliary = new FreeCamera("auxiliary", camera.position.clone(), scene);
  auxiliary.setTarget(Vector3.Zero());
  const handle = createPrefabDoors(
    scene,
    root,
    wren,
    catalog,
    wren.theme,
    "r002",
    authoredLeaf("door-leaf-r019.glb"),
  );
  const peer = createPrefabDoors(
    scene,
    root,
    wren,
    catalog,
    wren.theme,
    "r002",
    authoredLeaf("door-leaf-r019.glb"),
  );
  for (const mesh of peer.meshes()) mesh.setEnabled(false);
  const material = new StandardMaterial("actual-history-draw", scene);
  material.disableLighting = true;
  for (const mesh of handle.meshes()) mesh.material = material;
  const specs = prefabDoorSpecs(wren, catalog);
  const interior = specs.filter((d) => !d.exterior);
  expect(interior.length).toBeGreaterThan(1);
  const resources = handle.meshes().map((mesh) => ({
    mesh,
    current: matrixBufferWitness(mesh),
    previous: mesh._thinInstanceDataStorage.previousMatrixData!,
    gpu: mesh.getVertexBuffer("previousWorld0")!.getBuffer(),
    attributes: Array.from({ length: 4 }, (_, i) =>
      mesh.getVertexBuffer(`previousWorld${i}`)!,
    ),
  }));
  expect(
    resources.filter((r) => r.mesh.name.includes(":cut:")).length,
  ).toBeGreaterThan(0);
  for (const r of resources) {
    expect(r.previous).toBeInstanceOf(Float32Array);
    expect(r.previous.byteLength).toBe(r.current.cpu.byteLength);
    expect(r.previous.buffer).not.toBe(r.current.cpu.buffer);
    expect(r.gpu).not.toBe(r.current.gpu);
    expect(r.attributes.every((a) => a.getBuffer() === r.gpu)).toBe(true);
  }
  const memory = handle.temporalMemory();
  expect(memory.currentCpuBytes).toBe(
    resources.reduce((n, r) => n + r.current.cpu.byteLength, 0),
  );
  expect(memory.previousCpuBytes).toBe(
    resources.reduce((n, r) => n + r.previous.byteLength, 0),
  );
  expect(memory.renderedPoseCpuBytes).toBe(
    (specs.length * 2 * 5 +
      interior.length * 2 * 2 +
      specs.filter((s) => s.airlock).length * 2 * 5) *
      64,
  );
  let mask = new Set<string>(),
    desired = mask;
  const reset = vi.fn();
  const binding = bindPrefabDoorCameraHistory(
    scene,
    handle,
    () => {
      if (mask === desired) return false;
      mask = desired;
      handle.setCutaway(mask);
      return true;
    },
    reset,
  );
  const upload = vi.spyOn(engine, "updateDynamicVertexBuffer");
  const release = vi.spyOn(engine, "_releaseBuffer");
  const afterStart = scene.onAfterCameraRenderObservable.add(
    () => {
      if (scene.activeCamera === camera)
        uploadsAtEnd = upload.mock.calls.length;
    },
    -1,
    true,
  );
  let uploadsAtEnd = 0;
  const afterEnd = scene.onAfterCameraRenderObservable.add(() => {
    if (scene.activeCamera === camera)
      expect(upload.mock.calls.length).toBe(uploadsAtEnd);
  });
  const primary = (cut: boolean) =>
    handle
      .meshes()
      .find((m) => m.name.endsWith(`${cut ? "cut" : "full"}:primary`))!;
  const rows = (cut: boolean, previous = false) => {
    const mesh = primary(cut);
    const data = previous
      ? mesh._thinInstanceDataStorage.previousMatrixData!
      : mesh._thinInstanceDataStorage.matrixData!;
    const selected = specs.filter(
      (spec) => cut === (!spec.exterior && mask.has(spec.id)),
    );
    const result = new Map<string, number[]>();
    let index = 0;
    for (const spec of selected)
      for (const side of [-1, 1]) {
        result.set(
          `${spec.id}:${side}`,
          Array.from(data.subarray(index * 16, ++index * 16)),
        );
      }
    expect(index).toBe(mesh.thinInstanceCount);
    return result;
  };
  const move = (dt: number) =>
    handle.update({
      nowMs: 1,
      dt,
      actors: [],
      logic: new Map(specs.map((d) => [d.id, true])),
    });
  try {
    await scene.whenReadyAsync();
    const dynamic = vi.spyOn(engine, "createDynamicVertexBuffer");
    const vertex = vi.spyOn(engine, "createVertexBuffer");
    const draw = vi.spyOn(engine, "drawElementsType");
    // Eager histories exist even in MSAA. A later cold history switch changes no buffers.
    scene.needsPreviousWorldMatrices = false;
    scene.render();
    expect(draw).toHaveBeenCalled();
    const first = rows(false);
    scene.needsPreviousWorldMatrices = true;
    move(0.05);
    move(0.1); // Neither update is a rendered frame.
    scene.render();
    expect(rows(false, true)).toEqual(first);
    const moved = rows(false);
    expect(
      [...moved].some(([id, m]) => m.some((v, i) => v !== first.get(id)![i])),
    ).toBe(true);
    move(0.08);
    desired = new Set([interior[0].id]);
    scene.render();
    expect(reset).toHaveBeenCalledTimes(1);
    for (const [id, previous] of rows(false, true))
      expect(previous).toEqual(moved.get(id));
    // A new topology has no rendered history: seed its own current pose, not another leaf's row.
    expect(rows(true, true)).toEqual(rows(true));
    const beforeAuxiliary = rows(false);
    move(0.06);
    const beforeAuxCount = draw.mock.calls.length;
    scene._renderForCamera(auxiliary);
    expect(draw.mock.calls.length).toBeGreaterThan(beforeAuxCount);
    scene.activeCamera = camera;
    scene.render();
    expect(rows(false, true)).toEqual(beforeAuxiliary);
    const beforeReturn = rows(false);
    desired = new Set();
    move(0.06);
    scene.render();
    expect(reset).toHaveBeenCalledTimes(2);
    const returned = rows(false),
      returnedPrevious = rows(false, true);
    for (const [id, previous] of returnedPrevious)
      expect(previous).toEqual(beforeReturn.get(id) ?? returned.get(id));
    for (const next of ["flight", "deck"] as const) {
      handle.setView(next);
      scene.render();
      for (const r of resources) {
        assertDoorMatrixBuffer(r.mesh, r.current);
        expect(r.mesh._thinInstanceDataStorage.previousMatrixData).toBe(
          r.previous,
        );
        expect(r.attributes.every((a) => a.getBuffer() === r.gpu)).toBe(true);
      }
    }
    expect(
      upload.mock.calls.some((call) =>
        resources.some((r) => call[0] === r.gpu),
      ),
    ).toBe(true);
    // No-op masks and disabled prefixes neither recreate nor upload histories.
    upload.mockClear();
    handle.setCutaway(desired);
    expect(upload).not.toHaveBeenCalled();
    scene.render();
    for (const r of resources.filter((r) => !r.mesh.thinInstanceCount))
      expect(upload.mock.calls.some((c) => c[0] === r.gpu)).toBe(false);
    expect(dynamic).not.toHaveBeenCalled();
    expect(vertex).not.toHaveBeenCalled();
    handle.dispose();
    handle.dispose();
    expect(handle.temporalMemory()).toEqual({
      currentCpuBytes: 0,
      previousCpuBytes: 0,
      renderedPoseCpuBytes: 0,
    });
    for (const r of resources)
      for (const gpu of [r.current.gpu, r.gpu])
        expect(release.mock.calls.filter((c) => c[0] === gpu)).toHaveLength(1);
    for (const mesh of peer.meshes())
      for (const kind of ["world0", "previousWorld0"])
        expect(
          release.mock.calls.some(
            (c) => c[0] === mesh.getVertexBuffer(kind)!.getBuffer(),
          ),
        ).toBe(false);
  } finally {
    scene.onAfterCameraRenderObservable.remove(afterStart);
    scene.onAfterCameraRenderObservable.remove(afterEnd);
    binding.dispose();
    handle.dispose();
    peer.dispose();
    vi.restoreAllMocks();
    root.dispose();
    scene.dispose();
    engine.dispose();
  }
});

describe("prefab door specs", () => {
  it("accepts the two authored core finishes and rejects missing, duplicate or ambiguous backing groups", () => {
    const old = authoredLeaf();
    const current = authoredLeaf("door-leaf-r017.glb");
    expect(() => validateReferenceDoorLeaf(old)).not.toThrow();
    expect(() => validateReferenceDoorLeaf(current)).not.toThrow();
    const core = current.primitives.find((p) => p.material === "slot5_dark")!;
    const altered = (material: string) => ({
      ...current,
      primitives: current.primitives.map((p) =>
        p === core ? { ...p, material } : p,
      ),
    });
    for (const material of ["slot4_metal", "slot2_accent", "slot6_emit_a"])
      expect(() => validateReferenceDoorLeaf(altered(material))).toThrow(
        "Invalid authored leaf semantic primitives",
      );
    expect(() =>
      validateReferenceDoorLeaf({
        ...current,
        primitives: [
          ...current.primitives,
          { ...core, material: "slot1_secondary" },
        ],
      }),
    ).toThrow("Invalid authored leaf semantic primitives");
  });

  it("retains geometry rejection for the new dark-core authored leaf", () => {
    const current = authoredLeaf("door-leaf-r017.glb");
    const malformed = {
      ...current,
      primitives: current.primitives.map((p, i) =>
        i === 0 ? { ...p, normals: Float32Array.of(NaN) } : p,
      ),
    };
    expect(() => validateReferenceDoorLeaf(malformed)).toThrow(
      "Invalid authored leaf geometry",
    );
    const oversized = {
      ...current,
      primitives: current.primitives.map((p) => {
        const positions = p.positions.slice();
        for (let i = 2; i < positions.length; i += 3) positions[i] *= 2;
        return { ...p, positions };
      }),
    };
    expect(() => validateReferenceDoorLeaf(oversized)).toThrow(
      "Authored leaf outside normalized envelope",
    );
  });

  it.each([
    "door-leaf.glb",
    "door-leaf-r017.glb",
    "door-leaf-r018.glb",
    "door-leaf-r019.glb",
  ])(
    "validates %s before allocation and preserves legacy motion and authored normals",
    (file) => {
      const engine = new NullEngine();
      engine.getCaps().instancedArrays = true;
      const scene = new Scene(engine);
      const root = new TransformNode("root", scene);
      const geom = authoredLeaf(file);
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
          createPrefabDoors(
            scene,
            root,
            wren,
            catalog,
            wren.theme,
            "r002",
            bad,
          ),
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
      expect(proposed.meshes().filter((m) => m.isEnabled())).toHaveLength(5);
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
    },
  );
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
