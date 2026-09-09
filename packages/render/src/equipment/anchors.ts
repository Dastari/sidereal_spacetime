import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
export type GripBasis = {
  origin: Vector3;
  forward: Vector3;
  up: Vector3;
  support?: Vector3;
};
export type EquipmentAimSource = {
  getGripBasis(): GripBasis | undefined;
  getMuzzleWorld(): { position: Vector3; direction: Vector3 } | undefined;
};
export type EquipmentAnchors = {
  attachmentOrigin: number[];
  forward: number[];
  up: number[];
  anchors?: { muzzle?: number[]; supportPalm?: number[] };
};
const vector = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
export function validAnchors(value: unknown): value is EquipmentAnchors {
  const v = value as EquipmentAnchors | undefined;
  return (
    !!v &&
    vector(v.attachmentOrigin) &&
    vector(v.forward) &&
    vector(v.up) &&
    Vector3.FromArray(v.forward).lengthSquared() > 0.001 &&
    Vector3.Cross(
      Vector3.FromArray(v.forward),
      Vector3.FromArray(v.up),
    ).lengthSquared() > 0.001 &&
    (!v.anchors?.muzzle || vector(v.anchors.muzzle)) &&
    (!v.anchors?.supportPalm || vector(v.anchors.supportPalm))
  );
}
/** glTF conversion root is included: authored coordinates must never bypass handedness. */
export function equipmentAimSource(
  importedRoot: TransformNode,
  hand: TransformNode,
  data: EquipmentAnchors,
): EquipmentAimSource {
  const matrix = () => {
    // A solved hand can change after the attachment intermediates were cached
    // this frame. Refresh the complete chain before reading the physical socket.
    const chain:TransformNode[]=[];
    for(let node:TransformNode|null=importedRoot;node;node=node.parent as TransformNode|null)chain.push(node);
    for(let i=chain.length-1;i>=0;i--)chain[i].computeWorldMatrix(true);
    return importedRoot.getWorldMatrix();
  };
  return {
    getMuzzleWorld() {
      if (importedRoot.isDisposed() || !data.anchors?.muzzle) return undefined;
      const m = matrix();
      return {
        position: Vector3.TransformCoordinates(
          Vector3.FromArray(data.anchors.muzzle),
          m,
        ),
        direction: Vector3.TransformNormal(
          Vector3.FromArray(data.forward),
          m,
        ).normalize(),
      };
    },
    getGripBasis() {
      if (importedRoot.isDisposed()) return undefined;
      const local = matrix().multiply(Matrix.Invert(hand.getWorldMatrix()));
      return {
        origin: Vector3.TransformCoordinates(
          Vector3.FromArray(data.attachmentOrigin),
          local,
        ),
        forward: Vector3.TransformNormal(
          Vector3.FromArray(data.forward),
          local,
        ).normalize(),
        up: Vector3.TransformNormal(
          Vector3.FromArray(data.up),
          local,
        ).normalize(),
        support: data.anchors?.supportPalm
          ? Vector3.TransformCoordinates(
              Vector3.FromArray(data.anchors.supportPalm),
              local,
            )
          : undefined,
      };
    },
  };
}
