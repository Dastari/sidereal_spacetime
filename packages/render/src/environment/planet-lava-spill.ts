import type { PackedPlanetGeometry } from "./planet-build";
import { setMeshRole } from '../mesh-roles';
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { SurfaceGeometry } from "./planet-terrain";

/** Adjacent cliff-face irradiance overlay: no scene lights or per-frame rebuild. */
export function createLavaSpill(
  scene: Scene,
  name: string,
  geometry: SurfaceGeometry,
  prepared?: PackedPlanetGeometry,
) {
  const mesh = new Mesh(name + "-lava-spill", scene),
    data = new VertexData();
  setMeshRole(mesh, "planet");
  data.positions = prepared?.positions ?? geometry.positions;
  data.colors = prepared?.colors ?? geometry.colors;
  data.indices = prepared?.indices ?? geometry.indices.map(
    (_, i) => geometry.indices[i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i],
  );
  data.applyToMesh(mesh);
  const material = new ShaderMaterial(
    name + "-lava-spill-material",
    scene,
    {
      vertexSource: `precision highp float;attribute vec3 position;attribute vec4 color;uniform mat4 worldViewProjection;varying vec3 radiance;void main(){radiance=color.rgb;gl_Position=worldViewProjection*vec4(position,1.);}`,
      fragmentSource: `precision highp float;varying vec3 radiance;uniform float time;void main(){float pulse=.88+.12*sin(time*.65);vec3 mapped=vec3(1.)-exp(-radiance*pulse);gl_FragColor=vec4(pow(mapped,vec3(1./2.2)),1.);}`,
    },
    {
      attributes: ["position", "color"],
      uniforms: ["worldViewProjection", "time"],
      needAlphaBlending: true,
    },
  );
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  material.setFloat("time", 0);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.metadata = { role: "planet", planetLavaSpill: true, faces: geometry.faces };
  return { mesh, material };
}
