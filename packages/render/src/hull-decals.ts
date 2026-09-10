import { setMeshRole } from './mesh-roles';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { HullDecal } from '../../content/src/hull-decals';
import { validateHullDecals } from '../../content/src/hull-decals';
const states = new WeakMap<TransformNode, { signature: string; meshes: Mesh[] }>();
const caches = new WeakMap<Scene, Map<string, { material: PBRMaterial; refs: number }>>();
/** Paint follows its owning component, including reflected positions; text UVs compensate so lettering stays readable.
 * No occupancy, power or light emission; alpha paint receives the scene's PBR lighting. */
export function updateHullDecals(scene: Scene, parent: TransformNode, decals: HullDecal[] | undefined, reflected = false): Mesh[] {
  validateHullDecals(decals);
  const signature = JSON.stringify([decals ?? [], reflected]), prior = states.get(parent);
  if (prior?.signature === signature) return prior.meshes;
  prior?.meshes.forEach(m => m.dispose());
  let cache = caches.get(scene);
  if (!cache) { cache = new Map(); caches.set(scene, cache); }
  const meshes = (decals ?? []).map(d => {
    const key = JSON.stringify([d.kind, d.text, d.color]);
    let shared = cache!.get(key);
    if (!shared) {
      const texture = new DynamicTexture('hull-paint', { width: 512, height: 256 }, scene, true);
      texture.hasAlpha = true;
      const ctx = texture.getContext() as CanvasRenderingContext2D; ctx.clearRect(0, 0, 512, 256); ctx.fillStyle = d.color; ctx.strokeStyle = d.color;
      if (d.kind === 'text') {
        ctx.font = 'bold 104px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(d.text!, 256, 128, 480);
      } else {
        ctx.beginPath(); ctx.arc(256, 128, 78, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 12; ctx.beginPath(); ctx.ellipse(256, 128, 167, 34, -.22, 0, Math.PI * 2); ctx.stroke();
      }
      texture.update(false);
      const material = new PBRMaterial('hull-paint', scene);
      material.albedoTexture = texture; material.useAlphaFromAlbedoTexture = true;
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      material.metallic = 0; material.roughness = .62; material.zOffset = -2;
      material.backFaceCulling = false;
      shared = { material, refs: 0 }; cache!.set(key, shared);
    }
    shared.refs++;
    const mesh = new Mesh('hull-marking-' + d.id, scene), data = new VertexData();
    setMeshRole(mesh, "hull");
    const face = d.face ?? 'top';
    // Basis vectors in renderer X/Y/Z; front is local north, right is local east.
    const u = face === 'left' ? [0, 0, 1] : face === 'right' ? [0, 0, -1] : face === 'front' ? [-1, 0, 0] : [1, 0, 0];
    const v = face === 'top' ? [0, 0, -1] : [0, 1, 0];
    const n = face === 'left' ? [-1, 0, 0] : face === 'top' ? [0, 1, 0] : face === 'front' ? [0, 0, -1] : [1, 0, 0];
    const c = Math.cos(d.rotation), s = Math.sin(d.rotation);
    data.positions = []; data.normals = [];
    for (const [a, b] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]) {
      const x = a * d.size[0], y = b * d.size[1], rx = c*x-s*y, ry = s*x+c*y;
      data.positions.push(...u.map((q,i) => q*rx+v[i]*ry+n[i]*.003)); data.normals.push(...n);
    }
    data.indices = [0,1,2,0,2,3]; data.uvs = reflected && d.kind === 'text' ? [1,1,0,1,0,0,1,0] : [0,1,1,1,1,0,0,0]; data.applyToMesh(mesh);
    mesh.parent = parent; mesh.position.set(d.position[0],d.position[2],-d.position[1]);
    mesh.material = shared.material; mesh.isPickable = false;
    mesh.metadata = { hullDecal: true, role: parent.metadata?.role ?? 'hull', partId: parent.metadata?.partId };
    const held = shared;
    mesh.onDisposeObservable.addOnce(() => { if (--held.refs === 0) { held.material.dispose(false, true); cache!.delete(key); } });
    return mesh;
  });
  states.set(parent, { signature, meshes });
  return meshes;
}
