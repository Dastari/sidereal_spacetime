import { setMeshRole } from '../mesh-roles';
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { SurfaceGeometry } from "./planet-terrain";
import { hash } from "./voxel-planets";
/** Select surface-facing water cells globally, so no cube face monopolizes glints. */
export function sampleOceanGlints(water: SurfaceGeometry, seed: number) {
  const candidates: { position: number[]; normal: number[]; score: number }[] =
    [];
  for (let face = 0; face < water.faces; face++) {
    const offset = face * 12,
      normal = water.normals.slice(offset, offset + 3);
    const position = [0, 1, 2].map(
      (axis) =>
        [0, 1, 2, 3].reduce(
          (sum, v) => sum + water.positions[offset + v * 3 + axis],
          0,
        ) / 4,
    );
    const length = Math.hypot(...position);
    if (
      !length ||
      normal.reduce((sum, v, i) => sum + (v * position[i]) / length, 0) < 0.98
    )
      continue;
    const score = hash(face, 19, 7, seed);
    if (score > 0.012) continue;
    candidates.push({
      position: position.map((v, i) => v + normal[i] * 0.0014),
      normal,
      score,
    });
  }
  return candidates.sort((a, b) => a.score - b.score).slice(0, 96);
}
export function createOceanGlints(
  scene: Scene,
  name: string,
  water: SurfaceGeometry,
  seed: number,
) {
  const points = sampleOceanGlints(water, seed),
    mesh = new Mesh(name + "-water-glints", scene),
    data = new VertexData();
setMeshRole(mesh, "planet");
  data.positions = points.flatMap((p) => p.position);
  data.normals = points.flatMap((p) => p.normal);
  data.indices = points.map((_, i) => i);
  data.applyToMesh(mesh);
  mesh.setVerticesData(
    "phase",
    points.map((p) => p.score * 18000),
    false,
    1,
  );
  const material = new ShaderMaterial(
    name + "-water-glint-material",
    scene,
    {
      vertexSource: `precision highp float;attribute vec3 position;attribute vec3 normal;attribute float phase;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 vWorld;varying vec3 vNormal;varying float vPhase;void main(){vWorld=(world*vec4(position,1.)).xyz;vNormal=normalize(mat3(world)*normal);vPhase=phase;gl_Position=worldViewProjection*vec4(position,1.);gl_PointSize=2.;}`,
      fragmentSource: `precision highp float;varying vec3 vWorld;varying vec3 vNormal;varying float vPhase;uniform vec3 cameraPosition;uniform vec3 lightDirection;uniform float time;uniform float sunIntensity;void main(){vec3 h=normalize(normalize(cameraPosition-vWorld)+lightDirection);float reflection=pow(max(dot(normalize(vNormal),h),0.),10.);float pulse=pow(.5+.5*sin(time*.6+vPhase),12.);float edge=1.-smoothstep(.25,1.,length(gl_PointCoord-.5)*2.);gl_FragColor=vec4(.65,.92,1.,edge*reflection*(.12+.65*pulse)*clamp(sunIntensity/2.1,0.,2.));}`,
    },
    {
      attributes: ["position", "normal", "phase"],
      uniforms: [
        "world",
        "worldViewProjection",
        "cameraPosition",
        "lightDirection",
        "time",
        "sunIntensity",
      ],
      needAlphaBlending: true,
    },
  );
  material.fillMode = Material.PointFillMode;
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  material.setVector3("lightDirection", new Vector3(0.6, 1, -0.45).normalize());
  material.setVector3("cameraPosition", Vector3.Zero());
  material.setFloat("time", 0);
  material.setFloat("sunIntensity", 2.1);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.metadata = { role: "planet", planetSparkles: true, count: points.length };
  return { mesh, material };
}
