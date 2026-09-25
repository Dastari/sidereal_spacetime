import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Constants } from "@babylonjs/core/Engines/constants";
import { surfaceVertex } from "./shaders";

/** Unresolved stellar light remains a small point at astronomical distances.
 * The native photosphere retains its authored radius; this optical glow lives
 * along the same camera ray inside the far plane, never in authority state. */
export function createDistantStar(scene: Scene, bodyId: string) {
  const mesh = CreatePlane(`distant-star:${bodyId}`, { size: 1 }, scene);
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;
  mesh.metadata = {
    role: "effect",
    bodyId,
    partId: `${bodyId}:distant-light`,
    trianglePlacementRanges: [
      { firstTriangle: 0, triangleCount: 2, partId: `${bodyId}:distant-light` },
    ],
  };
  const material = new ShaderMaterial(
    `distant-star:${bodyId}`,
    scene,
    {
      vertexSource: surfaceVertex,
      fragmentSource: `precision highp float; varying vec2 vUV; void main(){ float r=length((vUV-.5)*2.); float a=exp(-r*r*12.)*(1.-smoothstep(.7,1.,r)); gl_FragColor=vec4(vec3(1.,.72,.26)*a,a); }`,
    },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: ["world", "viewProjection"],
      needAlphaBlending: true,
    },
  );
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  mesh.material = material;
  mesh.setEnabled(false);
  return {
    mesh,
    update(position: Vector3, camera: Vector3, projectedRadius: number) {
      const direction = position.subtract(camera);
      const distance = direction.length();
      const enabled = projectedRadius < 2 && distance > 0;
      mesh.setEnabled(enabled);
      if (!enabled) return;
      const depth = Math.min(
        distance,
        (scene.activeCamera?.maxZ ?? 1600) * 0.85,
      );
      mesh.position.copyFrom(camera.add(direction.scale(depth / distance)));
      const pixelSize =
        (2 * depth * Math.tan((scene.activeCamera?.fov ?? 0.5) / 2)) /
        scene.getEngine().getRenderHeight();
      mesh.scaling.setAll(pixelSize * 8);
    },
    dispose() {
      mesh.dispose();
      material.dispose();
    },
  };
}
