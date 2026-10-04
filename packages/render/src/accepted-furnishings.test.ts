import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { prefabOrigin } from "@sidereal/content/ship-prefab";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import {
  FURNISHING_DEFAULT,
  transformFurnishingPoint,
  type FurnishingOverride,
} from "@sidereal/content/wayfarer-furnishings";
import { createAcceptedFurnishings } from "./accepted-furnishings";
import { createFurnishingPreview } from "./furnishing-preview";
import { prefabBeamModel } from "@sidereal/sim/prefab-beam";
import { prefabDeckObstacles } from "@sidereal/sim/prefab-deck-objects";
import {
  createPrefabObjectPicker,
  invalidatePrefabShipTriangles,
} from "./prefab-ship-interaction";

test("accepted move/rotate/delete updates loaded batch geometry and source lights without world/camera/asset reload, including an outstanding drag", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("ship", scene);
  root.position.set(41, 2, -30);
  root.rotation.y = 0.72;
  const doc = PREFAB_SHIPS.find((p) => p.id === "fed.m.wayfarer")!;
  const origin = prefabOrigin(doc);
  const source = WAYFARER_GAMEPLAY_OBJECTS.find(
    (s) => s.object === "Lounge_coffee_table",
  )!;
  const initial = { ...FURNISHING_DEFAULT, dx: 0.25, dy: -0.5, yaw: 0.2 };
  const binding = {
    doc,
    catalog: defaultPrefabComponentCatalog(),
    furnishings: { [source.object]: initial },
  };
  const authored = new TransformNode(`prefab-ship:${doc.id}`, scene);
  authored.parent = root;
  authored.position.y = 0.1875;
  const batch = new Mesh("authored-material-batch", scene);
  batch.parent = authored;
  const cx = (source.min[0] + source.max[0]) / 2,
    cy = (source.min[1] + source.max[1]) / 2;
  const points = [
    [cx - 0.1, cy - 0.1],
    [cx + 0.1, cy - 0.1],
    [cx, cy + 0.1],
  ];
  const localPoint = (point: number[], pose: FurnishingOverride) => {
    const [x, y] = transformFurnishingPoint(source, point, pose);
    return [-y + origin[1], 0.5, -x + origin[0]];
  };
  const data = new VertexData();
  data.positions = [
    ...points.flatMap((p) => localPoint(p, initial)),
    50,
    0,
    0,
    51,
    0,
    0,
    50,
    1,
    0,
  ];
  data.normals = Array.from({ length: 6 }, () => [
    Math.cos(initial.yaw),
    0,
    -Math.sin(initial.yaw),
  ]).flat();
  data.tangents = Array.from({ length: 6 }, () => [
    Math.sin(initial.yaw),
    0,
    Math.cos(initial.yaw),
    -1,
  ]).flat();
  data.indices = [0, 1, 2, 3, 4, 5];
  data.applyToMesh(batch);
  batch.metadata = {
    authoredStudy: {
      placementRanges: [
        { object: source.object, indexStart: 0, indexCount: 3 },
        { object: "unrelated", indexStart: 3, indexCount: 3 },
      ],
    },
  };
  const lightRoot = new TransformNode(
    `asset-lighting:fixture:deck:${source.object}`,
    scene,
  );
  lightRoot.parent = authored;
  lightRoot.position.copyFrom(
    Vector3.FromArray(localPoint(points[0], initial)),
  );
  lightRoot.rotation.y = initial.yaw;
  const light = new PointLight(
    "source-socket",
    new Vector3(0.05, 0.2, 0),
    scene,
  );
  light.parent = lightRoot;
  light.includedOnlyMeshes = [batch];
  const camera = new ArcRotateCamera(
    "camera",
    1.17,
    0.82,
    11,
    Vector3.Zero(),
    scene,
  );
  scene.activeCamera = camera;
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 512, height: 512 }),
    addEventListener() {},
    removeEventListener() {},
    dataset: {},
  } as unknown as HTMLCanvasElement;
  const preview = createFurnishingPreview(
    scene,
    canvas,
    root,
    binding,
    () => {},
  );
  const fetch = vi.fn(() => {
    throw Error("accepted overlay must reuse loaded assets");
  });
  vi.stubGlobal("fetch", fetch);
  const invalidate = vi.fn(invalidatePrefabShipTriangles);
  const accepted = createAcceptedFurnishings(
    scene,
    root,
    binding,
    {
      instanceId: "fixture",
      revision: 5n,
      json: JSON.stringify(binding.furnishings),
    },
    () => preview.clear(),
    invalidate,
  );
  const update = (
    revision: bigint,
    pose: FurnishingOverride,
    instanceId = "fixture",
  ) =>
    accepted.apply({
      instanceId,
      revision,
      json: JSON.stringify({ [source.object]: pose }),
    });
  let picker = createPrefabObjectPicker(
    scene,
    canvas,
    root,
    binding,
    () => true,
  );
  picker.select(`prefab:socket:${source.object}`); // Populate the triangle cache before moving.
  const assertPose = (pose: FurnishingOverride) => {
    const values = batch.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < 3; i++)
      for (let a = 0; a < 3; a++)
        expect(values[i * 3 + a]).toBeCloseTo(
          localPoint(points[i], pose)[a],
          5,
        );
    expect(Array.from(values.slice(9))).toEqual(data.positions!.slice(9));
    for (let a = 0; a < 3; a++)
      expect(lightRoot.position.asArray()[a]).toBeCloseTo(
        localPoint(points[0], pose)[a],
        5,
      );
    const normals = batch.getVerticesData(VertexBuffer.NormalKind)!;
    expect(normals[0]).toBeCloseTo(Math.cos(pose.yaw), 5);
    expect(normals[2]).toBeCloseTo(-Math.sin(pose.yaw), 5);
    const tangents = batch.getVerticesData(VertexBuffer.TangentKind)!;
    expect(tangents[0]).toBeCloseTo(Math.sin(pose.yaw), 5);
    expect(tangents[3]).toBe(-1);
  };
  try {
    const moved = { ...initial, dx: 0.75, dy: 0.5, yaw: Math.PI / 2 };
    expect(preview.show(source.object, { ...initial, dy: 2 }, true)).toBe(true);
    expect(update(6n, moved)).toBe(true);
    expect(preview.active).toBe(false);
    preview.clear(); // Late component cleanup must not put stale indices/lights back.
    assertPose(moved);
    const footprint = source.footprint.map((p) => {
      const [x, y] = transformFurnishingPoint(source, p, moved);
      return [-y + origin[1] + 0, x - origin[0] + 0];
    });
    expect(
      prefabBeamModel(doc, binding.catalog, binding.furnishings).objects.find(
        (o) => o.id === `socket:${source.object}`,
      )!.polygon,
    ).toEqual(footprint);
    expect(
      prefabDeckObstacles(doc, binding.catalog, binding.furnishings).find(
        (o) => o.id === `prefab-socket:${source.object}`,
      )!.vertices,
    ).toEqual(footprint);
    expect(Array.from(batch.getIndices()!)).toEqual(data.indices);
    picker.dispose();
    picker = createPrefabObjectPicker(scene, canvas, root, binding, () => true);
    picker.select(`prefab:socket:${source.object}`);
    const proxy = scene.getMeshByName("prefab-object-selected")!;
    // Selection must extract the newly placed triangle, not a fallback box/stale cached soup.
    expect(proxy.getTotalVertices()).toBe(3);
    expect(proxy.getVerticesData(VertexBuffer.PositionKind)![0]).toBeCloseTo(
      localPoint(points[0], moved)[0],
      5,
    );
    expect(update(5n, initial)).toBe(false);
    expect(update(7n, initial, "wrong-source")).toBe(false);
    assertPose(moved);
    for (let i = 7; i < 15; i++) update(BigInt(i), { ...initial, yaw: i / 10 });
    update(15n, initial);
    assertPose(initial); // Returning to the loaded pose does not accumulate rotation drift.
    expect(update(16n, { ...initial, deleted: true })).toBe(true);
    expect(Array.from(batch.getIndices()!)).toEqual([0, 0, 0, 3, 4, 5]);
    expect(lightRoot.isEnabled()).toBe(false);
    picker.dispose();
    picker = createPrefabObjectPicker(scene, canvas, root, binding, () => true);
    expect(picker.objectIds()).not.toContain(`prefab:socket:${source.object}`);
    expect(
      prefabBeamModel(doc, binding.catalog, binding.furnishings).objects.some(
        (o) => o.id === `socket:${source.object}`,
      ),
    ).toBe(false);
    expect(
      prefabDeckObstacles(doc, binding.catalog, binding.furnishings).some(
        (o) => o.id === `prefab-socket:${source.object}`,
      ),
    ).toBe(false);
    expect(scene.getEngine()).toBe(engine);
    expect(scene.activeCamera).toBe(camera);
    expect([camera.alpha, camera.beta, camera.radius]).toEqual([
      1.17, 0.82, 11,
    ]);
    expect(scene.getMeshByName(batch.name)).toBe(batch);
    expect(light.parent).toBe(lightRoot);
    expect(light.includedOnlyMeshes).toHaveLength(1);
    expect(light.includedOnlyMeshes[0]).toBe(batch);
    expect(fetch).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith([batch]);
  } finally {
    picker.dispose();
    preview.dispose();
    scene.dispose();
    engine.dispose();
    vi.unstubAllGlobals();
  }
});
