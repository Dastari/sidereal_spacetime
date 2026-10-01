import { afterEach, expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { solveTwoBone } from "./voxel-ik";

const engines: NullEngine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
function chain() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  const root = new TransformNode("rig", scene),
    upper = new TransformNode("shoulder", scene),
    lower = new TransformNode("elbow", scene),
    end = new TransformNode("wrist", scene);
  upper.parent = root;
  lower.parent = upper;
  end.parent = lower;
  lower.position.set(0.3, -0.2, 0);
  end.position.set(-0.1, -0.3, 0);
  return { root, upper, lower, end, effector: end };
}
test("measured root-space poles follow arbitrary parent rotation while retaining wrist rotation", () => {
  const first = chain(),
    second = chain();
  second.root.position.set(100, -5, 20);
  second.root.rotationQuaternion = Quaternion.RotationYawPitchRoll(
    0.7,
    0.2,
    -0.1,
  );
  const local = Matrix.Compose(
    Vector3.One(),
    Quaternion.RotationYawPitchRoll(0.3, -0.5, 0.7),
    new Vector3(0.2, -0.4, 0.12),
  );
  for (const rig of [first, second]) {
    const target = local.multiply(rig.root.computeWorldMatrix(true));
    expect(
      solveTwoBone(rig, target, true, new Vector3(0.15, 0.05, 0.15)),
    ).toBeLessThan(1e-5);
    const wrist = rig.end
      .computeWorldMatrix(true)
      .multiply(rig.root.computeWorldMatrix(true).clone().invert());
    Array.from(wrist.m)
      .slice(0, 12)
      .forEach((value, i) => expect(value).toBeCloseTo(local.m[i], 5));
    expect(
      Vector3.Distance(wrist.getTranslation(), local.getTranslation()),
    ).toBeLessThan(1e-4);
  }
  const elbow = (rig: ReturnType<typeof chain>) =>
    rig.lower
      .computeWorldMatrix(true)
      .multiply(rig.root.computeWorldMatrix(true).clone().invert())
      .getTranslation();
  expect(Vector3.Distance(elbow(first), elbow(second))).toBeLessThan(1e-5);
});
test("ordinary animated elbow default is unchanged; invalid qualified poles cannot mutate joints", () => {
  const ordinary = chain(),
    explicit = chain();
  const target = Matrix.Translation(0.2, -0.4, 0.12);
  solveTwoBone(ordinary, target);
  solveTwoBone(explicit, target, true, new Vector3(0.3, -0.2, 0));
  for (const bone of ["upper", "lower", "end"] as const) {
    const expected = ordinary[bone].computeWorldMatrix(true).m;
    Array.from(explicit[bone].computeWorldMatrix(true).m).forEach((value, i) =>
      expect(value).toBeCloseTo(expected[i], 6),
    );
  }
  for (const pole of [
    Vector3.Zero(),
    new Vector3(NaN, 0, 1),
    new Vector3(0.2, -0.4, 0.12),
  ]) {
    const rig = chain(),
      before = Array.from(rig.upper.computeWorldMatrix(true).m);
    expect(() => solveTwoBone(rig, target, true, pole)).toThrow();
    expect(Array.from(rig.upper.computeWorldMatrix(true).m)).toEqual(before);
  }
});
