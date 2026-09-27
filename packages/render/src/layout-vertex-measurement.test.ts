import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { PickingInfo } from "@babylonjs/core/Collisions/pickingInfo";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import {
  createVertexMeasurement,
  isMeasurableMesh,
  measurementVertexFromPick,
} from "./layout-vertex-measurement";
import type { MeasurementPoint } from "./layout-measurement";

const engines: NullEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
function fixture() {
  const engine = new NullEngine({
    renderWidth: 800,
    renderHeight: 600,
    textureSize: 128,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new ArcRotateCamera(
    "measure",
    0.7,
    1,
    20,
    new Vector3(4, 2, -2),
    scene,
  );
  camera.minZ = 0.01;
  const parent = new TransformNode("part", scene);
  parent.position.set(4, 2, -3);
  parent.rotation.y = Math.PI / 2;
  const mesh = new Mesh("native-triangle", scene);
  const data = new VertexData();
  data.positions = [1, 0.5, 0, 2, 0.5, 0, 1, 0.5, 2];
  data.indices = [0, 1, 2];
  data.applyToMesh(mesh);
  mesh.parent = parent;
  mesh.scaling.x = -1;
  mesh.isPickable = false;
  mesh.metadata = { role: "floor" };
  const pick = new PickingInfo();
  pick.hit = true;
  pick.faceId = 0;
  pick.pickedMesh = mesh;
  const screen = (point: Vector3) =>
    Vector3.Project(
      point,
      Matrix.Identity(),
      camera.getViewMatrix().multiply(camera.getProjectionMatrix()),
      camera.viewport.toGlobal(800, 600),
    );
  return { scene, camera, parent, mesh, pick, screen };
}

describe("native vertex measurement adapter", () => {
  it("selects the rotated, mirrored and elevated vertex in its parent frame", () => {
    const { camera, pick, screen } = fixture();
    const pixel = screen(new Vector3(4, 2.5, -2));
    const result = measurementVertexFromPick(
      pick,
      camera,
      800,
      600,
      [1000, 10, -2000],
      pixel.x + 3,
      pixel.y - 2,
    );
    expect(result?.[0]).toBeCloseTo(1004);
    expect(result?.[1]).toBeCloseTo(2002);
    expect(result?.[2]).toBeCloseTo(12.5);
  });
  it("uses an instance's own transform instead of the shared native prototype", () => {
    const { camera, mesh, pick, screen } = fixture();
    const instance = mesh.createInstance("other-object");
    instance.parent = null;
    instance.position.set(5, 3, -1);
    instance.scaling.set(1, 1, 1);
    pick.pickedMesh = instance;
    const pixel = screen(new Vector3(6, 3.5, -1));
    expect(
      measurementVertexFromPick(
        pick,
        camera,
        800,
        600,
        [0, 0, 0],
        pixel.x,
        pixel.y,
      ),
    ).toEqual([6, 1, 3.5]);
  });
  it("allows visible structural context but excludes hidden geometry and presentation guides", () => {
    const { camera, mesh } = fixture();
    expect(mesh.isPickable).toBe(false);
    expect(isMeasurableMesh(mesh, camera)).toBe(true);
    mesh.setEnabled(false);
    expect(isMeasurableMesh(mesh, camera)).toBe(false);
    mesh.setEnabled(true);
    mesh.metadata.role = "effect";
    expect(isMeasurableMesh(mesh, camera)).toBe(false);
    mesh.metadata.role = "floor";
    mesh.layerMask = 0;
    expect(isMeasurableMesh(mesh, camera)).toBe(false);
  });
  it("adds points without editing meshes, supports remove/clear, and hides inactive guides", () => {
    const { scene, camera, mesh, pick, screen } = fixture();
    vi.spyOn(scene, "pick").mockReturnValue(pick);
    const canvas = {
      clientHeight: 600,
      dataset: {},
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      }),
    } as unknown as HTMLCanvasElement;
    let points: MeasurementPoint[] = [];
    const measure = createVertexMeasurement(
      scene,
      camera,
      canvas,
      (x, y) => [x, y],
      () => Vector3.Zero(),
      (next) => {
        points = next;
      },
      () => {},
    );
    const before = mesh.computeWorldMatrix(true).asArray().slice();
    measure.setActive(true);
    const first = screen(new Vector3(4, 2.5, -2));
    expect(measure.measureAt(first.x, first.y, true)).toBe(true);
    expect(measure.measureAt(first.x, first.y, true)).toBe(false);
    const second = screen(new Vector3(4, 2.5, -1));
    expect(measure.measureAt(second.x, second.y, true)).toBe(true);
    expect(points).toHaveLength(2);
    expect(mesh.computeWorldMatrix(true).asArray()).toEqual(before);
    measure.setActive(false);
    expect(
      scene.meshes.some((mesh) => mesh.name.startsWith("vertex-measurement")),
    ).toBe(false);
    expect(points).toHaveLength(2);
    measure.setActive(true);
    expect(
      scene.meshes.some((mesh) => mesh.name.startsWith("vertex-measurement")),
    ).toBe(true);
    measure.removeLast();
    expect(points).toHaveLength(1);
    measure.clear();
    expect(points).toEqual([]);
    expect(canvas.dataset.measurementPoints).toBe("[]");
    measure.dispose();
  });
});
