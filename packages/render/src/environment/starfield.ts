import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { setMeshRole } from "../mesh-roles";

export const DISTANT_STAR_COUNT = 8192;
export interface DistantStar {
  direction: readonly [number, number, number];
  angularRadius: number;
  color: readonly [number, number, number];
}

/** Immutable astronomical decoration; camera/viewport/time never enter its identity. */
export function distantStarCatalog(
  count = DISTANT_STAR_COUNT,
  seed = 117,
): DistantStar[] {
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 16384 ||
    !Number.isSafeInteger(seed)
  )
    throw Error("Invalid distant-star catalogue");
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const phase = random() * Math.PI * 2;
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.25 + random() * 0.5)) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = phase + i * Math.PI * (3 - Math.sqrt(5)) + (random() - 0.5) * 0.3;
    const brightness = 0.45 + Math.pow(random(), 2) * 0.95;
    const warm = random();
    return {
      direction: [r * Math.cos(a), y, r * Math.sin(a)] as const,
      angularRadius: 0.00045 + Math.pow(random(), 3) * 0.0011,
      color: [
        brightness * (0.76 + warm * 0.24),
        brightness * 0.88,
        brightness * (1 - warm * 0.18),
      ] as const,
    };
  });
}

/** Background depth, never the finite sphere depth: distant bodies stay in front. */
export const backgroundDepth = /* glsl */ `
#ifdef USE_REVERSE_DEPTHBUFFER
 #ifdef IS_NDC_HALF_ZRANGE
  gl_Position.z=0.;
 #else
  gl_Position.z=-gl_Position.w;
 #endif
#else
 gl_Position.z=gl_Position.w;
#endif
`;

export const starfieldVertex = /* glsl */ `
precision highp float;
attribute vec3 position;attribute vec2 uv;attribute vec4 color;
uniform mat4 world;uniform mat4 viewProjection;
varying vec2 vUV;varying vec4 vColor;
void main(){
 vUV=uv;vColor=color;
 gl_Position=viewProjection*world*vec4(position,1.);
 ${backgroundDepth}
}
`;
export const starfieldFragment = /* glsl */ `
precision highp float;varying vec2 vUV;varying vec4 vColor;
void main(){
 vec2 q=vUV*2.-1.;float r=length(q);
 float aa=max(fwidth(r),.035);
 float coverage=(1.-smoothstep(1.-aa,1.+aa,r))*exp(-r*r*1.8);
 gl_FragColor=vec4(vColor.rgb,coverage);
}
`;

/** One mesh, one unlit material, no lights/textures/ambient animation. */
export function createDistantStarfield(scene: Scene, parent?: TransformNode) {
  const data = new VertexData();
  const positions: number[] = [],
    uvs: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  for (const star of distantStarCatalog()) {
    const n = Vector3.FromArray(star.direction);
    const axis = Math.abs(n.y) > 0.98 ? Vector3.Right() : Vector3.Up();
    const u = Vector3.Cross(axis, n).normalize();
    const v = Vector3.Cross(n, u).normalize();
    const base = positions.length / 3;
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const p = n
        .add(u.scale(x * star.angularRadius))
        .add(v.scale(y * star.angularRadius));
      positions.push(p.x * 600, p.y * 600, p.z * 600);
      uvs.push((x + 1) / 2, (y + 1) / 2);
      colors.push(...star.color, 1);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  data.positions = positions;
  data.uvs = uvs;
  data.colors = colors;
  data.indices = indices;
  const mesh = setMeshRole(
    new Mesh("distant-spherical-starfield", scene),
    "environment",
  );
  data.applyToMesh(mesh);
  mesh.parent = parent ?? null;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.receiveShadows = false;
  const material = new ShaderMaterial(
    "distant-spherical-starfield-material",
    scene,
    { vertexSource: starfieldVertex, fragmentSource: starfieldFragment },
    {
      attributes: ["position", "uv", "color"],
      uniforms: ["world", "viewProjection"],
      needAlphaBlending: true,
    },
  );
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  material.alphaMode = Constants.ALPHA_ADD;
  mesh.material = material;
  let disposed = false;
  return {
    mesh,
    update(camera: Vector3) {
      if (!disposed && camera.asArray().every(Number.isFinite))
        mesh.position.copyFrom(camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.dispose();
      material.dispose();
    },
  };
}
