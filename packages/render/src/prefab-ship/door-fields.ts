/** Traversable hull air seals. Accepted door state drives presentation only. */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ShipAccessDoorPack } from "@sidereal/content/ship-access-doors";
import {
  accessDoorMatrix,
  type AuthoredAccessDoorPlacement,
} from "./authored-access-doors";
import { setMeshRole } from "../mesh-roles";

export function createDoorFields(
  scene: Scene,
  parent: TransformNode,
  placements: readonly AuthoredAccessDoorPlacement[],
  pack: ShipAccessDoorPack,
) {
  const fields = placements.map((p) => {
    const variant = pack.variants.find((v) => v.id === p.variant);
    if (!variant)
      throw Error("Force field requires a registered native aperture");
    const root = new TransformNode(`hull-field:${p.id}`, scene);
    root.parent = parent;
    root.rotationQuaternion = new Quaternion();
    accessDoorMatrix(p).decompose(
      root.scaling,
      root.rotationQuaternion,
      root.position,
    );
    const half = variant.clearWidthM / 2;
    const bottom = 0.045,
      top = variant.clearHeightM;
    const surface = new Mesh(`hull-field:${p.id}:membrane`, scene);
    const data = new VertexData();
    data.positions = [
      -half,
      bottom,
      0,
      half,
      bottom,
      0,
      half,
      top,
      0,
      -half,
      top,
      0,
    ];
    data.indices = [0, 1, 2, 0, 2, 3];
    data.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
    data.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    data.applyToMesh(surface);
    surface.parent = root;
    surface.isPickable = false;
    surface.receiveShadows = false;
    setMeshRole(surface, "equipment");
    surface.metadata = {
      ...surface.metadata,
      airRetentionField: { doorId: p.id, blocksBodies: false },
    };
    const material = new StandardMaterial(`hull-field:${p.id}:cyan`, scene);
    material.disableLighting = true;
    material.emissiveColor = new Color3(0.025, 0.36, 0.65);
    material.alpha = 0;
    material.backFaceCulling = false;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.disableDepthWrite = true;
    surface.material = material;
    const perimeter = CreateLines(
      `hull-field:${p.id}:perimeter`,
      {
        points: [
          new Vector3(-half, bottom, 0),
          new Vector3(half, bottom, 0),
          new Vector3(half, top, 0),
          new Vector3(-half, top, 0),
          new Vector3(-half, bottom, 0),
        ],
      },
      scene,
    );
    perimeter.parent = root;
    perimeter.color = new Color3(0.06, 0.65, 1);
    perimeter.isPickable = false;
    perimeter.alpha = 0;
    root.setEnabled(false);
    return { id: p.id, root, surface, perimeter, material, open: 0 };
  });
  return {
    update(states: readonly { id: string; open: number }[]) {
      const byId = new Map(states.map((s) => [s.id, s.open]));
      for (const field of fields) {
        const supplied = byId.get(field.id) ?? 0;
        const open = Number.isFinite(supplied)
          ? Math.max(0, Math.min(1, supplied))
          : 0;
        field.open = open;
        field.root.setEnabled(open > 0.001);
        field.material.alpha = 0.14 * open;
        field.perimeter.alpha = 0.52 * open;
      }
    },
    states: () =>
      fields.map((f) => ({
        id: f.id,
        open: f.open,
        active: f.root.isEnabled(),
        blocksBodies: false,
      })),
    meshes: (): AbstractMesh[] =>
      fields.flatMap((f) => [f.surface, f.perimeter]),
    dispose() {
      for (const f of fields) {
        f.root.dispose(false);
        f.material.dispose();
      }
    },
  };
}
