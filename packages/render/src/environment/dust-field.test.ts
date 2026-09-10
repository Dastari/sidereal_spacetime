import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createDustField } from "./dust-field";
import { dustCell, dustLayout, dustMotion } from "./dust";

test("dust keeps moving at constant velocity without matrix uploads or bounds refresh", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("environment", scene);
  const field = createDustField(scene, root),
    camera = new Vector3(0, 60, 40),
    target = new Vector3(2, 0, 3);
  const refresh = vi.spyOn(field.mesh, "thinInstanceRefreshBoundingInfo"),
    upload = vi.spyOn(field.mesh, "thinInstanceSetBuffer");
  const options = {
    x: 10,
    y: 12,
    vx: 900,
    vy: 300,
    reducedMotion: false,
    aspect: 1.5,
  };
  field.update(camera, target, options);
  const first = field.snapshot(),
    calls = upload.mock.calls.length;
  for (let i = 1; i <= 5; i++)
    field.update(camera, target, {
      ...options,
      x: 10 + i * 0.1,
      y: 12 + i * 0.2,
    });
  expect(upload).toHaveBeenCalledTimes(calls);
  expect(refresh).not.toHaveBeenCalled();
  expect(field.rebuilds).toBe(1);
  const next = field.snapshot();
  expect(next.matrices).toEqual(first.matrices);
  expect(next.uniforms[0][0]).toBeCloseTo(-0.5);
  expect(next.uniforms[0][2]).toBeCloseTo(1);
  // Compare reconstructed shader vertices to the old Matrix.Compose geometry,
  // including world origin, random grain size, streak heading and variation.
  const layout = dustLayout(55, 1.5),
    motion = dustMotion(900, 300, false);
  for (const i of [0, 17, 211]) {
    const cell = dustCell(
      i,
      10.5 + target.x,
      13 - target.z,
      layout.spacing,
      layout.columns,
      layout.rows,
    );
    const matrix = Matrix.Compose(
      new Vector3(
        cell.size,
        cell.size,
        cell.size * (1 + (motion.streakRatio - 1) * cell.lengthVariation),
      ),
      Quaternion.RotationAxis(Vector3.Up(), motion.heading),
      new Vector3(cell.x + target.x, cell.height, -cell.y + target.z),
    );
    for (const corner of [
      new Vector3(-0.5, 0.5, 0.5),
      new Vector3(0.5, -0.5, -0.5),
    ]) {
      const expected = Vector3.TransformCoordinates(corner, matrix),
        g = i * 4,
        m = i * 16,
        s = next.uniforms[5];
      const x = corner.x * next.grains[g + 2],
        y = corner.y * next.grains[g + 2],
        z = corner.z * next.grains[g + 2] * (1 + (s[2] - 1) * next.grains[g]);
      const actual = [
        s[0] * x + s[1] * z + next.matrices[m + 12] + next.uniforms[0][0],
        y + next.matrices[m + 13],
        -s[1] * x + s[0] * z + next.matrices[m + 14] + next.uniforms[0][2],
      ];
      expected
        .asArray()
        .forEach((v, axis) => expect(actual[axis]).toBeCloseTo(v, 4));
    }
  }
  field.update(camera, target, { ...options, x: 100 });
  expect(field.rebuilds).toBe(2);
  expect(refresh).not.toHaveBeenCalled();
  expect(field.mesh.metadata.role).toBe("environment");
  expect(field.mesh.alwaysSelectAsActiveMesh).toBe(true);
  scene.dispose();
  engine.dispose();
});

test("dust streak and perspective cap update without rebuilding stationary cell layout", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("environment", scene);
  const camera = new FreeCamera("camera", new Vector3(0, 900, 10), scene),
    target = Vector3.Zero();
  const field = createDustField(scene, root),
    options = {
      x: 0,
      y: 0,
      reducedMotion: false,
      dustParallax: true,
      aspect: 1.5,
    };
  field.update(camera.position, target, options);
  const initial = field.rebuilds;
  field.update(camera.position, target, { ...options, vx: 2000 });
  expect(field.rebuilds).toBe(initial);
  expect(field.snapshot().uniforms[5][2]).toBeGreaterThan(1);
  expect(field.snapshot().uniforms[3][3]).toBeGreaterThan(0);
  field.update(camera.position, target, {
    ...options,
    vx: 2000,
    reducedMotion: true,
  });
  expect(field.snapshot().uniforms[5][2]).toBe(1);
  expect(field.rebuilds).toBe(initial);
  field.update(camera.position, target, { ...options, dustParallax: false });
  expect(field.rebuilds).toBe(initial + 1);
  expect(field.snapshot().uniforms[3][3]).toBe(0);
  scene.dispose();
  engine.dispose();
});

test("dust snapshot revision changes only when GPU uniforms or instance buffers change", () => {
  const engine=new NullEngine(), scene=new Scene(engine), root=new TransformNode("environment",scene);
  const field=createDustField(scene,root), camera=new Vector3(0,60,40), target=Vector3.Zero();
  const options={x:0,y:0,reducedMotion:true,aspect:1.5};
  field.update(camera,target,options);
  const initial=field.mesh.metadata.snapshotRevision;
  for (let i=0;i<4;i++) {
    expect(field.mesh.isVerticesDataPresent(`previousWorld${i}`)).toBe(true);
    expect(field.mesh.getVerticesData(`previousWorld${i}`)).toEqual(field.mesh.getVerticesData(`world${i}`));
  }
  field.update(camera,target,options);
  expect(field.mesh.metadata.snapshotRevision).toBe(initial);
  field.update(camera,target,{...options,x:0.1});
  expect(field.mesh.metadata.snapshotRevision).toBe(initial+1);
  field.update(camera,target,{...options,x:100});
  expect(field.mesh.metadata.snapshotRevision).toBe(initial+2);
  scene.dispose();engine.dispose();
});
