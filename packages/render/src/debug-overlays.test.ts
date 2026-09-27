import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { createDebugFeatures } from "./debug-features";
import { lightDebugGeometry } from "./debug-light-geometry";
import {
  collisionDebugGeometry,
  type DebugCollisionFrame,
} from "./debug-collision-geometry";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  cleanup.push(() => {
    scene.dispose();
    engine.dispose();
  });
  return scene;
}

describe("F3 diagnostic rendering", () => {
  it("restores changing GI inputs and newly added hemispheres while preserving direct lights", () => {
    const scene = fixture();
    scene.environmentIntensity = 0.28;
    scene.ambientColor.set(0.1, 0.2, 0.3);
    const fill = new HemisphericLight("fill", Vector3.Up(), scene);
    fill.intensity = 0.12;
    const task = new PointLight("task", Vector3.Up(), scene);
    task.intensity = 5;
    const debug = createDebugFeatures(scene, []);
    debug.toggle("globalIllumination");
    expect(scene.environmentIntensity).toBe(0);
    expect(scene.ambientColor.equals(Color3.Black())).toBe(true);
    expect(fill.intensity).toBe(0);
    expect(task.intensity).toBe(5);
    expect(task.isEnabled()).toBe(true);
    debug.beforeFrame("same");
    expect(scene.environmentIntensity).toBe(0.28);
    expect(fill.intensity).toBe(0.12);
    scene.environmentIntensity = 0.6;
    fill.intensity = 0.33;
    const next = new HemisphericLight("new fill", Vector3.Up(), scene);
    next.intensity = 0.4;
    debug.afterFrame();
    expect(next.intensity).toBe(0);
    debug.toggle("globalIllumination");
    expect(scene.environmentIntensity).toBe(0.6);
    expect(fill.intensity).toBe(0.33);
    expect(next.intensity).toBe(0.4);
    expect(scene.ambientColor.asArray()).toEqual([0.1, 0.2, 0.3]);
    debug.toggle("globalIllumination");
    next.dispose();
    debug.dispose();
    expect(scene.environmentIntensity).toBe(0.6);
    expect(fill.intensity).toBe(0.33);
    expect(task.intensity).toBe(5);
  });

  it("shows all point, spot, directional and hemisphere sources; cleans additions/removals and reset", () => {
    const scene = fixture();
    const point = new PointLight("point", Vector3.Up(), scene);
    point.range = 3;
    const spot = new SpotLight(
      "spot",
      Vector3.Up(),
      Vector3.Down(),
      Math.PI / 3,
      1,
      scene,
    );
    spot.range = 6;
    new DirectionalLight("sun", Vector3.Down(), scene);
    new HemisphericLight("ambient", Vector3.Up(), scene);
    const baseMaterials = scene.materials.length;
    const debug = createDebugFeatures(scene, []);
    expect(debug.snapshot().lightBounds).toBe(false);
    debug.toggle("lightBounds");
    expect(debug.overlaySnapshot().lights).toBe(4);
    expect(scene.lights.length).toBe(4);
    const diagnosticMeshes = () =>
      scene.meshes.filter((mesh) => mesh.metadata?.debugOverlay);
    expect(diagnosticMeshes()).toHaveLength(4);
    expect(diagnosticMeshes().every((mesh) => !mesh.isPickable)).toBe(true);
    const fifth = new PointLight("fifth", Vector3.Zero(), scene);
    fifth.range = 1;
    fifth.setEnabled(false);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(debug.overlaySnapshot().lights).toBe(5);
    fifth.dispose();
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(debug.overlaySnapshot().lights).toBe(4);
    debug.reset();
    expect(debug.snapshot().lightBounds).toBe(false);
    expect(diagnosticMeshes()).toHaveLength(0);
    expect(scene.materials).toHaveLength(baseMaterials);
    debug.toggle("lightBounds");
    expect(diagnosticMeshes()).toHaveLength(4);
    debug.dispose();
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(diagnosticMeshes()).toHaveLength(0);
  });

  it("reads final linked rig joints after animation and preserves the source skeleton", () => {
    const scene = fixture(),
      root = new TransformNode("crew", scene);
    root.position.x = 4;
    const mesh = CreateBox("body", { size: 1 }, scene);
    mesh.parent = root;
    const parentNode = new TransformNode("upper_arm.R", scene);
    parentNode.parent = root;
    parentNode.position.y = 1.4;
    const childNode = new TransformNode("forearm.R", scene);
    childNode.parent = parentNode;
    childNode.position.y = -0.3;
    const skeleton = new Skeleton("rig", "rig", scene);
    const parent = new Bone("upper_arm.R", skeleton, null, Matrix.Identity());
    parent.linkTransformNode(parentNode);
    const child = new Bone(
      "forearm.R",
      skeleton,
      parent,
      Matrix.Translation(0, -0.3, 0),
    );
    child.linkTransformNode(childNode);
    mesh.skeleton = skeleton;
    const debug = createDebugFeatures(scene, [], [root], {
      characterRoots: () => [root],
    });
    debug.toggle("skeleton");
    expect(debug.overlaySnapshot().skeletons).toBe(1);
    const overlay = () =>
      scene.meshes.find((mesh) => mesh.metadata?.kind === "character-rig")!;
    childNode.position.z = 0.42;
    scene.onBeforeRenderObservable.notifyObservers(scene);
    const vertices = overlay().getVerticesData(VertexBuffer.PositionKind)!;
    expect(
      Array.from(vertices).some(
        (value, i) => i % 3 === 2 && Math.abs(value - 0.42) < 1e-5,
      ),
    ).toBe(true);
    root.setEnabled(false);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(debug.overlaySnapshot().skeletons).toBe(0);
    root.setEnabled(true);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(debug.overlaySnapshot().skeletons).toBe(1);
    debug.dispose();
    expect(scene.skeletons).toEqual([skeleton]);
    expect(childNode.position.z).toBe(0.42);
    expect(skeleton.bones).toHaveLength(2);
  });

  it("uses spot angle/radial range and point range with parent transforms, without fake infinite boxes", () => {
    const scene = fixture(),
      parent = new TransformNode("fixture", scene);
    parent.position.set(4, 2, -3);
    parent.rotation.y = Math.PI / 2;
    parent.computeWorldMatrix(true);
    const point = new PointLight("point", new Vector3(0, 1, 0), scene);
    point.parent = parent;
    point.range = 2;
    const geometry = lightDebugGeometry(point);
    expect(geometry.bounded).toBe(true);
    const vertices = geometry.lines.flat();
    expect(Math.min(...vertices.map((v) => v.x))).toBeCloseTo(2);
    expect(Math.max(...vertices.map((v) => v.y))).toBeCloseTo(5);
    const spot = new SpotLight(
      "spot",
      Vector3.Zero(),
      new Vector3(0, 0, -1),
      Math.PI / 3,
      1,
      scene,
    );
    spot.range = 6;
    spot.parent = parent;
    const cone = lightDebugGeometry(spot),
      origin = parent.getAbsolutePosition();
    // Four origin-to-rim rays have the exact source range and half-cone angle.
    const rays = cone.lines.filter(
      (line) =>
        line.length === 2 &&
        Vector3.Distance(line[0], origin) < 1e-7 &&
        Math.abs(Vector3.Distance(line[0], line[1]) - 6) < 1e-5,
    );
    expect(rays).toHaveLength(5);
    const box = cone.lines.slice(-12).flat();
    expect(Math.min(...box.map((point) => point.x))).toBeCloseTo(-2);
    point.range = Number.MAX_VALUE;
    expect(lightDebugGeometry(point).bounded).toBe(false);
    expect(
      lightDebugGeometry(point)
        .lines.flat()
        .every((v) => v.length() < 20),
    ).toBe(true);
  });

  it("draws supplied deck footprint widths and elevation, reports partial scope and follows removed frames", () => {
    const scene = fixture();
    const source: DebugCollisionFrame = {
      id: "deck",
      scope: "Static footprints; moving cargo unavailable",
      world: Matrix.Translation(10, 1, 0),
      frame: {
        shipId: "ship",
        deckId: "upper",
        fingerprint: "v1",
        elevationM: 2.8,
        floors: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
          ],
        ],
        segments: [{ id: "wall", a: [0, 0], b: [4, 0], halfWidthM: 0.2 }],
        obstacles: [],
      },
    };
    const serialized = JSON.stringify(source.frame);
    const geometry = collisionDebugGeometry(source);
    expect(
      geometry.blockers.flat().every((v) => Math.abs(v.y - 3.825) < 1e-6),
    ).toBe(true);
    expect(Math.min(...geometry.blockers.flat().map((v) => v.z))).toBeCloseTo(
      -0.2,
    );
    expect(Math.max(...geometry.blockers.flat().map((v) => v.x))).toBeCloseTo(
      14.2,
    );
    let frames = [source];
    const debug = createDebugFeatures(scene, [], [], {
      collisionFrames: () => frames,
      collisionScope: () =>
        frames.length ? source.scope! : "No admitted collision source",
    });
    debug.toggle("collision");
    expect(debug.overlaySnapshot().collisionScopes).toEqual([source.scope]);
    expect(debug.overlaySnapshot().collisionFrames).toBe(1);
    frames = [];
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(debug.overlaySnapshot().collisionFrames).toBe(0);
    expect(debug.overlaySnapshot().collisionScopes).toEqual([
      "No admitted collision source",
    ]);
    expect(
      scene.meshes.filter((mesh) => mesh.metadata?.debugOverlay),
    ).toHaveLength(0);
    expect(JSON.stringify(source.frame)).toBe(serialized);
    debug.dispose();
  });
});
