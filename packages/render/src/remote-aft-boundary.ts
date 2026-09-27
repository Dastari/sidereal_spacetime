import { setMeshRole } from "./mesh-roles";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
/** Exact pinned stock shell datum, renderer metres. Copy existing outward aft
 * triangles only: no synthesized cap, cabin-facing lining or emissive fixture.
 * Native side/roof/cockpit armor supplies the other exterior boundaries. */
export function extractStockAftBoundary(source: Mesh): Mesh | undefined {
  if (
    !/^GEO-(walls|cutaway-aft)(?:_|\.|$)/.test(source.name) ||
    !/^MAT-(light-hull|mid-hull|dark-structural)-polymer$/.test(
      source.material?.name ?? "",
    )
  )
    return;
  const data = VertexData.ExtractFromMesh(source, true, true);
  if (!data.positions || !data.normals || !data.indices) return;
  const indices: number[] = [];
  for (let i = 0; i < data.indices.length; i += 3) {
    const triangle = [
      data.indices[i],
      data.indices[i + 1],
      data.indices[i + 2],
    ];
    if (
      triangle.every(
        (v) =>
          data.positions![v * 3 + 2] >= 9 - 1e-6 &&
          data.normals![v * 3 + 2] > 0.99,
      )
    )
      indices.push(...triangle);
  }
  if (!indices.length) return;
  data.indices = indices;
  const result = new Mesh(`${source.name}--outward-aft`, source.getScene());
  setMeshRole(result, "remote");
  data.applyToMesh(result);
  result.material = source.material;
  result.sideOrientation = source.sideOrientation;
  result.receiveShadows = true;
  result.isVisible = false;
  result.isPickable = false;
  return result;
}
