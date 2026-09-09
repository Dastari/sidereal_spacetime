import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { EquipmentAimSource } from "../equipment/anchors";
const position = (n: TransformNode) => {
  n.computeWorldMatrix(true);
  return n.getAbsolutePosition().clone();
};
function pointAt(node: TransformNode, child: TransformNode, target: Vector3) {
  const inverse = Matrix.Invert(node.parent!.getWorldMatrix());
  const from = Vector3.TransformCoordinates(position(child), inverse)
    .subtract(node.position)
    .normalize();
  const to = Vector3.TransformCoordinates(target, inverse)
    .subtract(node.position)
    .normalize();
  const delta = Quaternion.Identity();
  Quaternion.FromUnitVectorsToRef(from, to, delta);
  node.rotationQuaternion = delta.multiply(
    node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation),
  );
  node.computeWorldMatrix(true);
}
export function solveLimb(
  upper: TransformNode,
  lower: TransformNode,
  end: TransformNode,
  target: Vector3,
  pole: Vector3,
) {
  const a = position(upper),
    b = position(lower),
    c = position(end),
    l1 = Vector3.Distance(a, b),
    l2 = Vector3.Distance(b, c);
  const direction = target.subtract(a).normalize();
  const d = Math.max(
    Math.abs(l1 - l2) + 0.0001,
    Math.min(l1 + l2 - 0.0001, Vector3.Distance(a, target)),
  );
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const bend = pole.subtract(a);
  bend
    .subtractInPlace(direction.scale(Vector3.Dot(bend, direction)))
    .normalize();
  pointAt(upper, lower, a.add(direction.scale(along)).add(bend.scale(height)));
  pointAt(lower, end, a.add(direction.scale(d)));
}
function basis(forward: Vector3, up: Vector3) {
  const f = forward.normalizeToNew(),
    r = Vector3.Cross(up, f).normalize(),
    u = Vector3.Cross(f, r).normalize();
  return Quaternion.FromRotationMatrix(
    Matrix.FromValues(
      r.x,
      r.y,
      r.z,
      0,
      u.x,
      u.y,
      u.z,
      0,
      f.x,
      f.y,
      f.z,
      0,
      0,
      0,
      0,
      1,
    ),
  );
}
function orient(
  node: TransformNode,
  localForward: Vector3,
  localUp: Vector3,
  worldForward: Vector3,
  worldUp: Vector3,
) {
  const inv = Matrix.Invert(node.parent!.getWorldMatrix());
  node.rotationQuaternion = basis(
    Vector3.TransformNormal(worldForward, inv),
    Vector3.TransformNormal(worldUp, inv),
  ).multiply(Quaternion.Inverse(basis(localForward, localUp)));
  node.computeWorldMatrix(true);
}
/** Layer after authored clips; restore before animation to avoid accumulating paused poses. */
export function createCombatPose(
  scene: Scene,
  root: TransformNode,
  nodes: TransformNode[],
) {
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const n = (name: string) => byName.get(name)!;
  const affected = nodes.filter((n) =>
    /^(pelvis|upper_arm\.[LR]|forearm\.[LR]|hand\.[LR]|thigh\.[LR]|shin\.[LR]|foot\.[LR])$/.test(
      n.name,
    ),
  );
  let source: EquipmentAimSource | undefined,
    enabled = false,
    reduced = false,
    rifle = false,
    weight = 0;
  let saved: Array<{
    node: TransformNode;
    position: Vector3;
    rotation: Quaternion;
  }> = [];
  const restore = () => {
    for (const s of saved) {
      s.node.position.copyFrom(s.position);
      s.node.rotationQuaternion = s.rotation.clone();
      s.node.computeWorldMatrix(true);
    }
    saved = [];
  };
  const before = scene.onBeforeAnimationsObservable.add(restore);
  const after = scene.onAfterAnimationsObservable.add(() => {
    const target = enabled && source?.getGripBasis() ? 1 : 0;
    weight = reduced
      ? target
      : weight +
        Math.sign(target - weight) *
          Math.min(
            Math.abs(target - weight),
            Math.max(0, scene.getEngine().getDeltaTime()) / 180,
          );
    if (weight === 0) return;
    const grip = source?.getGripBasis();
    if (!grip) return;
    saved = affected.map((node) => ({
      node,
      position: node.position.clone(),
      rotation: (
        node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation)
      ).clone(),
    }));
    const forward = root.getDirection(new Vector3(0, 0, -1)).normalize(),
      up = root.getDirection(Vector3.Up()).normalize(),
      right = root.getDirection(Vector3.Right()).normalize();
    const feet = ["L", "R"].map((side) => ({
      side,
      point: position(n(`foot.${side}`)),
      f: n(`foot.${side}`).getDirection(Vector3.Forward()).normalize(),
      u: n(`foot.${side}`).getDirection(Vector3.Up()).normalize(),
    }));
    const pelvis = n("pelvis");
    pelvis.position.addInPlace(
      Vector3.TransformNormal(
        up.scale(-0.035),
        Matrix.Invert(pelvis.parent!.getWorldMatrix()),
      ),
    );
    pelvis.computeWorldMatrix(true);
    const shoulder = position(n("upper_arm.R"));
    const chest = position(n("upper_arm.L")).add(shoulder).scale(0.5);
    const hand = n("hand.R");
    const desiredGrip = chest
      .add(forward.scale(rifle ? 0.065 : 0.23))
      .add(up.scale(-0.045))
      .add(right.scale(rifle ? 0 : 0.1));
    orient(hand, grip.forward, grip.up, forward, up);
    const offset = Vector3.TransformNormal(grip.origin, hand.getWorldMatrix());
    solveLimb(
      n("upper_arm.R"),
      n("forearm.R"),
      hand,
      desiredGrip.subtract(offset),
      shoulder.add(right.scale(0.6)).subtract(up.scale(0.45)),
    );
    orient(hand, grip.forward, grip.up, forward, up);
    if (rifle && grip.support) {
      const support = Vector3.TransformCoordinates(
        grip.support,
        hand.getWorldMatrix(),
      );
      const left = n("hand.L");
      const wrist = support.subtract(
        Vector3.TransformNormal(
          new Vector3(0, 0.055, 0),
          left.getWorldMatrix(),
        ),
      );
      solveLimb(
        n("upper_arm.L"),
        n("forearm.L"),
        left,
        wrist,
        chest.subtract(right.scale(0.6)).subtract(up.scale(0.4)),
      );
    }
    for (const foot of feet) {
      solveLimb(
        n(`thigh.${foot.side}`),
        n(`shin.${foot.side}`),
        n(`foot.${foot.side}`),
        foot.point,
        foot.point.add(forward),
      );
      orient(
        n(`foot.${foot.side}`),
        Vector3.Forward(),
        Vector3.Up(),
        foot.f,
        foot.u,
      );
    }
    for (const s of saved) {
      s.node.position.copyFrom(
        Vector3.Lerp(s.position, s.node.position, weight),
      );
      s.node.rotationQuaternion = Quaternion.Slerp(
        s.rotation,
        s.node.rotationQuaternion!,
        weight,
      );
      s.node.computeWorldMatrix(true);
    }
  });
  return {
    bind(value: EquipmentAimSource | undefined) {
      restore();
      source = value;
    },
    update(
      combat: boolean,
      seated: boolean,
      isRifle: boolean,
      reducedMotion: boolean,
    ) {
      restore();
      enabled = combat && !seated;
      rifle = isRifle;
      reduced = reducedMotion;
      if (seated) weight = 0;
    },
    dispose() {
      restore();
      scene.onBeforeAnimationsObservable.remove(before);
      scene.onAfterAnimationsObservable.remove(after);
    },
  };
}
