import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/**
 * Analytic two-bone IK for the voxel crew, solved in the rig-root space (free of the glTF
 * handedness flip on the loader's __root__). Presentation only: used after animations to pin the
 * support hand onto a held item's support socket every frame, and by future foot planting.
 */
export type TwoBoneChain = {
  root: TransformNode;          // armature root (any ancestor with unit, non-mirrored scale below it)
  upper: TransformNode;
  lower: TransformNode;
  end: TransformNode;
  /** socket node that must land on the target (child of `end`), or `end` itself */
  effector: TransformNode;
};

const rel = (node: TransformNode, rootInv: Matrix) => node.computeWorldMatrix(true).multiply(rootInv);

function setRel(node: TransformNode, desiredRel: Matrix, rootInv: Matrix) {
  const parent = node.parent as TransformNode | null;
  const parentRel = parent ? rel(parent, rootInv) : Matrix.Identity();
  const local = desiredRel.multiply(parentRel.invert());
  const s = new Vector3();
  const q = new Quaternion();
  const t = new Vector3();
  local.decompose(s, q, t);
  node.rotationQuaternion = q;
  node.computeWorldMatrix(true);
}

function rotationBetween(a: Vector3, b: Vector3) {
  const u = a.normalizeToNew();
  const v = b.normalizeToNew();
  const d = Vector3.Dot(u, v);
  if (d > 0.999999) return Quaternion.Identity();
  if (d < -0.999999) {
    let axis = Vector3.Cross(Vector3.Right(), u);
    if (axis.lengthSquared() < 1e-6) axis = Vector3.Cross(Vector3.Up(), u);
    return Quaternion.RotationAxis(axis.normalize(), Math.PI);
  }
  const axis = Vector3.Cross(u, v).normalize();
  return Quaternion.RotationAxis(axis, Math.acos(d));
}

/** Rotate `node` (in root space) by quaternion `q` about its own origin. */
function rotateRel(node: TransformNode, q: Quaternion, rootInv: Matrix) {
  const m = rel(node, rootInv);
  const pos = m.getTranslation();
  const rot = Matrix.Identity();
  q.toRotationMatrix(rot);
  const toOrigin = Matrix.Translation(-pos.x, -pos.y, -pos.z);
  const back = Matrix.Translation(pos.x, pos.y, pos.z);
  setRel(node, m.multiply(toOrigin).multiply(rot).multiply(back), rootInv);
}

/**
 * Move the chain so `effector` reaches `targetWorld` (position and orientation). The elbow keeps
 * its current bend plane (pole = current elbow offset), so animated arm character is preserved.
 * Returns the remaining effector error in metres (0 when reachable).
 */
export function solveTwoBone(chain: TwoBoneChain, targetWorld: Matrix, matchRotation = true): number {
  const rootInv = chain.root.computeWorldMatrix(true).clone().invert();
  const target = targetWorld.multiply(rootInv);
  // desired end transform = target * inverse(end->effector)
  const endRel = rel(chain.end, rootInv);
  const effRel = rel(chain.effector, rootInv);
  const endToEff = effRel.multiply(endRel.clone().invert());
  const desiredEnd = endToEff.clone().invert().multiply(target);
  const S = rel(chain.upper, rootInv).getTranslation();
  const E = rel(chain.lower, rootInv).getTranslation();
  const W = endRel.getTranslation();
  const Wt = desiredEnd.getTranslation();
  const l1 = Vector3.Distance(S, E);
  const l2 = Vector3.Distance(E, W);
  const toT = Wt.subtract(S);
  const dist = Math.max(1e-4, Math.min(toT.length(), (l1 + l2) * 0.9995));
  const dir = toT.normalizeToNew();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let pole = E.subtract(S);
  pole = pole.subtract(dir.scale(Vector3.Dot(pole, dir)));
  if (pole.lengthSquared() < 1e-8) pole = new Vector3(0, 0, 1).subtract(dir.scale(dir.z));
  pole.normalize();
  const Et = S.add(dir.scale(a)).add(pole.scale(h));
  rotateRel(chain.upper, rotationBetween(E.subtract(S), Et.subtract(S)), rootInv);
  const E2 = rel(chain.lower, rootInv).getTranslation();
  const W2 = rel(chain.end, rootInv).getTranslation();
  rotateRel(chain.lower, rotationBetween(W2.subtract(E2), Wt.subtract(E2)), rootInv);
  if (matchRotation) {
    const pos = rel(chain.end, rootInv).getTranslation();
    const s = new Vector3();
    const q = new Quaternion();
    desiredEnd.decompose(s, q, new Vector3());
    const m = Matrix.Identity();
    Matrix.ComposeToRef(Vector3.One(), q, pos, m);
    setRel(chain.end, m, rootInv);
  }
  const reached = rel(chain.effector, rootInv).getTranslation();
  return Vector3.Distance(reached, target.getTranslation());
}
