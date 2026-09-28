import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import "@babylonjs/loaders/glTF";
import {
  CREW_HEAD_CATALOG,
  DEFAULT_HEAD_LOADOUT,
  composeFace as composeHeadFace,
  crewFaceAtlasUrl,
  crewHeadAssetUrl,
  resolveFaceFrames,
  resolveHeadLoadout,
  type HeadLoadout,
} from "@sidereal/content/crew-heads";
import {
  CREW_ITEM_CATALOG,
  crewArmedClass,
  crewItem,
} from "@sidereal/content/crew-items";
import {
  createVoxelItemVisual,
  crewItemHandSocketRotation,
} from "../equipment/voxel-items";
import { setMeshRole } from "../mesh-roles";
import type { createVoxelCrewVisual } from "./voxel-crew";
import { loadRgbaImage } from "./voxel-face";

type VoxelCrew = Awaited<ReturnType<typeof createVoxelCrewVisual>>;

/** crew_rig head bone rest head (voxels) — CHARACTER_SPEC_BODY r005 `headSpace.originVox`. */
const HEAD_ORIGIN_M = 39 / 32;

/**
 * CHAR-HEADS head space under the animated head joint: origin at the head bone rest head, glTF
 * axes of the body. world(rest) = T(head origin) * bodyModelWorld; follows every head animation.
 */
function headSpaceNode(scene: Scene, crew: VoxelCrew) {
  const joint = crew.joints.get("head");
  const bone = crew.skeleton?.bones.find((b) => b.name === "head");
  if (!joint || !bone) throw new Error("voxel crew has no head joint");
  const node = new TransformNode("crew-head-space", scene);
  node.parent = joint;
  const local = Matrix.Translation(0, HEAD_ORIGIN_M, 0).multiply(
    bone.getAbsoluteInverseBindMatrix(),
  );
  const s = new Vector3();
  const q = new Quaternion();
  const t = new Vector3();
  local.decompose(s, q, t);
  node.scaling.copyFrom(s);
  node.rotationQuaternion = q;
  node.position.copyFrom(t);
  return node;
}

/**
 * CHAR-HEADS face canvas UVs (FACE_ATLAS_SPEC): u = (8 - x) / 16, v = z / 16 in head-space voxels
 * (x = character right, z = up; glTF head space: x right, y up). Only fills missing UVs.
 */
export function ensureFaceCanvasUVs(mesh: AbstractMesh, space: TransformNode) {
  if (mesh.isVerticesDataPresent(VertexBuffer.UVKind)) return false;
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions || !(mesh instanceof Mesh)) return false;
  const [cols, rows] = CREW_HEAD_CATALOG.space.faceCanvas.px;
  const voxel = CREW_HEAD_CATALOG.voxelMeters;
  const toSpace = mesh
    .computeWorldMatrix(true)
    .multiply(Matrix.Invert(space.computeWorldMatrix(true)));
  const uvs = new Float32Array((positions.length / 3) * 2);
  const p = new Vector3();
  for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
    Vector3.TransformCoordinatesFromFloatsToRef(
      positions[i],
      positions[i + 1],
      positions[i + 2],
      toSpace,
      p,
    );
    uvs[j] = (cols / 2 - p.x / voxel) / cols;
    uvs[j + 1] = p.y / voxel / rows;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs, false);
  return true;
}

/**
 * Reverse every triangle whose winding disagrees with its authored vertex normals. Double-sided
 * crew materials light back-facing fragments with the flipped normal, so a reversed triangle is
 * lit from inside. Returns the number of triangles reversed (0 for a consistent mesh).
 */
export function alignWindingToNormals(mesh: AbstractMesh) {
  if (!(mesh instanceof Mesh)) return 0;
  const p = mesh.getVerticesData(VertexBuffer.PositionKind);
  const n = mesh.getVerticesData(VertexBuffer.NormalKind);
  const source = mesh.getIndices();
  if (!p || !n || !source) return 0;
  const indices = Array.from(source);
  let reversed = 0;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t] * 3,
      b = indices[t + 1] * 3,
      c = indices[t + 2] * 3;
    const ux = p[b] - p[a],
      uy = p[b + 1] - p[a + 1],
      uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a],
      vy = p[c + 1] - p[a + 1],
      vz = p[c + 2] - p[a + 2];
    const dot =
      (uy * vz - uz * vy) * (n[a] + n[b] + n[c]) +
      (uz * vx - ux * vz) * (n[a + 1] + n[b + 1] + n[c + 1]) +
      (ux * vy - uy * vx) * (n[a + 2] + n[b + 2] + n[c + 2]);
    if (dot < 0) {
      [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
      reversed++;
    }
  }
  if (reversed) mesh.setIndices(indices);
  return reversed;
}

/** Map legacy appearance to a CHAR-HEADS loadout (presentation default until loadouts persist). */
export function voxelHeadLoadoutFor(
  bodyType: string | undefined,
  skin?: string,
  hair?: string,
): HeadLoadout {
  const female = bodyType === "female";
  return {
    ...DEFAULT_HEAD_LOADOUT,
    head: female ? "female" : "male",
    faceVariant: female ? "f_classic" : "m_classic",
    hair: female ? "long_bob" : DEFAULT_HEAD_LOADOUT.hair,
    ...(skin ? { skin } : {}),
    ...(hair ? { hairColor: hair } : {}),
  };
}

/**
 * Attach a CHAR-HEADS head (heads/hair/accessories/helmet GLBs) to the voxel crew: nodes are
 * reparented into head space, the body's head + default hair are hidden, and the crew face API is
 * pointed at the head's `crew.face` material through CHAR-HEADS' compositor.
 */
export async function attachVoxelCrewHead(
  scene: Scene,
  crew: VoxelCrew,
  loadout: HeadLoadout,
) {
  const resolved = resolveHeadLoadout(loadout);
  const files = [...new Set(resolved.nodes.map((n) => n.file))];
  const wanted = new Set(resolved.nodes.map((n) => n.node));
  const containers: AssetContainer[] = await Promise.all(
    files.map((f) =>
      SceneLoader.LoadAssetContainerAsync(
        "",
        crewHeadAssetUrl(f),
        scene,
        undefined,
        ".glb",
      ),
    ),
  );
  const space = headSpaceNode(scene, crew);
  for (const c of containers) {
    c.addAllToScene();
    for (const g of c.animationGroups) g.stop();
    const gltfRoot = c.rootNodes[0];
    for (const child of gltfRoot.getChildren() as TransformNode[])
      child.parent = space;
    for (const node of [...c.transformNodes, ...c.meshes]) {
      const named = [
        node,
        ...(function* () {
          for (let p = node.parent; p; p = p.parent) yield p;
        })(),
      ].some((n) => wanted.has(n.name));
      node.setEnabled(named);
    }
    for (const m of c.meshes) setMeshRole(m, "crew");
    gltfRoot.dispose(true);
  }
  // colour the person slots (skin, hair, eye) on every head material
  const person: Record<string, string> = {
    skin: resolved.face.tints.skin,
    hair: resolved.face.tints.hair,
    eye: resolved.face.tints.eye,
  };
  let faceMaterial: PBRMaterial | undefined;
  for (const c of containers)
    for (const m of c.materials) {
      if (!(m instanceof PBRMaterial)) continue;
      const slot = m.name.replace(/^crew\./, "").replace(/\.\d+$/, "");
      if (slot === "face") faceMaterial ??= m;
      else if (person[slot])
        m.albedoColor = Color3.FromHexString(person[slot]).toLinearSpace();
    }
  crew.setHiddenRegions(["head", "hair"]);
  // Two v1 head-kit export defects, repaired at load (see ensureFaceCanvasUVs /
  // alignWindingToNormals): no TEXCOORD_0, so the pixel face sampled one texel (flat skin); and
  // triangle winding opposite to the (outward) normals on several parts, so double-sided lighting
  // flipped them inward and faces rendered near black.
  for (const c of containers)
    for (const mesh of c.meshes) {
      alignWindingToNormals(mesh);
      if (mesh.material?.name.replace(/\.\d+$/, "") === "crew.face")
        ensureFaceCanvasUVs(mesh, space);
    }
  if (faceMaterial) {
    const atlas = await loadRgbaImage(crewFaceAtlasUrl(resolved.face.variant));
    crew.face.setComposer(faceMaterial, (st) =>
      composeHeadFace(
        atlas,
        resolved.face.variant,
        resolveFaceFrames(
          loadout,
          {
            expression: st.expression,
            blink: st.blinkEyes ?? null,
            viseme: st.viseme ?? null,
            look: st.look ?? 0,
          },
          resolved.face.mouthHidden,
        ),
        resolved.face.tints,
      ),
    );
  }
  return {
    resolved,
    dispose() {
      space.dispose();
      for (const c of containers) c.dispose();
      crew.setHiddenRegions([]);
    },
  };
}

/** Legacy equipment ids -> CHAR-WEAPONS voxel items (presentation only). */
export const LEGACY_TO_VOXEL_ITEM: Readonly<Record<string, string>> = {
  carbine: "compact-carbine",
  "long-rifle": "rifle",
  "compact-pistol": "pistol",
  "heavy-handgun": "pistol",
  flashlight: "flashlight",
  "plasma-cutter": "utility-cutter",
  "sample-scanner": "sample-scanner",
};

const armedClipsLoaded = new WeakMap<object, Promise<void>>();

/**
 * Hold a CHAR-WEAPONS item in the right hand (socket.hand.R + item rotation) and switch the crew
 * to that class's baked armed clips (idle/walk/run/aim/shoot, support hand already solved on the
 * item). Returns the item visual (same surface as createEquipmentVisual).
 */
export async function equipVoxelCrewItem(
  scene: Scene,
  crew: VoxelCrew,
  itemOrLegacyId: string,
) {
  const itemId = LEGACY_TO_VOXEL_ITEM[itemOrLegacyId] ?? itemOrLegacyId;
  const item = crewItem(itemId);
  if (!armedClipsLoaded.has(crew))
    armedClipsLoaded.set(
      crew,
      SceneLoader.LoadAssetContainerAsync(
        CREW_ITEM_CATALOG.assetBase,
        "armed-actions.glb",
        scene,
        undefined,
        ".glb",
      ).then((armed) => {
        crew.addClips(armed);
        armed.dispose();
      }),
    );
  const [visual] = await Promise.all([
    createVoxelItemVisual(scene, crew.socketNodes["socket.hand.R"], itemId, {
      localRotation: crewItemHandSocketRotation(),
    }),
    armedClipsLoaded.get(crew),
  ]);
  crew.setArmedClass(crewArmedClass(item));
  const dispose = visual.dispose;
  return {
    ...visual,
    dispose() {
      crew.setArmedClass(null);
      dispose();
    },
  };
}
