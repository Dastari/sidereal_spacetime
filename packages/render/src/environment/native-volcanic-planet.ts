import {
  prepareNativeVolcanicGeometry,
  type NativeVolcanicBuildData,
} from "./native-volcanic-build";
import { setMeshRole } from "../mesh-roles";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type {
  NativePlanetKit,
  NativePlanetComposition,
} from "./native-planet-composition";
import { composeNativeVolcanic } from "./native-volcanic-composition";
import {
  createNativeBasaltMaterial,
  type NativeLavaSpillPlugin,
} from "./native-volcanic-material";
/** Native authored mesh composition plus bounded molten material/near-field illumination. */
export function* stageNativeVolcanicPlanet(
  scene: Scene,
  name: string,
  kit: NativePlanetKit,
  seed: number,
  emission = 2.4,
  options: {
    geometry?: NativePlanetComposition;
    revision?: string;
    prepared?: NativeVolcanicBuildData;
    shared?: <T>(key: string, create: () => T) => T;
  } = {},
) {
  const root = new TransformNode(name + "-native-volcanic", scene),
    geometry = options.geometry ?? composeNativeVolcanic(kit, seed, 0.55),
    plugins: NativeLavaSpillPlugin[] = [];
  root.metadata = { role: "planet", nativePlanet: true };
  if (options.prepared) root.setEnabled(false);
  yield root;
  const prepared =
      options.prepared ??
      prepareNativeVolcanicGeometry(geometry, seed, emission),
    pixels = prepared.pixels;
  const share =
    options.shared ?? (<T>(_key: string, create: () => T) => create());
  const moltenTexture = share("molten-texture", () =>
    RawTexture.CreateRGBATexture(
      pixels,
      512,
      256,
      scene,
      false,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    ),
  );
  moltenTexture.gammaSpace = false;
  moltenTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  moltenTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const emitters: Mesh[] = [];
  const moltenMaterials: { material: PBRMaterial; vent: boolean }[] = [];
  const { litVertices, minimumAO, maximumRadiance } = prepared;
  for (const [index, batch] of prepared.batches.entries()) {
    if (!batch.indices.length) continue;
    yield root;
    const mesh = new Mesh(name + "-" + kit.materials[index].name, scene),
      data = new VertexData();
    setMeshRole(mesh, "planet");
    data.positions = batch.positions;
    data.normals = batch.normals;
    data.indices = batch.indices;
    data.colors = batch.colors;
    data.uvs = batch.uvs;
    data.applyToMesh(mesh);
    mesh.setVerticesData("nativeLavaRadiance", batch.radiance, false, 3);
    if (index === 3 || index === 5) {
      const moltenMaterial = share("molten-material-" + index, () => {
        const moltenMaterial = new PBRMaterial(
          name + "-molten-material-" + index,
          scene,
        );
        moltenMaterial.albedoColor = new Color3(0.018, 0.01, 0.025);
        if (index === 3) moltenMaterial.emissiveTexture = moltenTexture;
        moltenMaterial.emissiveColor = (
          index === 5 ? new Color3(1, 0.12, 0.002) : new Color3(1, 1, 1)
        ).scale(Math.min(4, Math.max(0, emission)) * 3 * 0.9);
        moltenMaterial.roughness = 0.38;
        moltenMaterial.metallic = 0;
        return moltenMaterial;
      });
      mesh.material = moltenMaterial;
      emitters.push(mesh);
      moltenMaterials.push({ material: moltenMaterial, vent: index === 5 });
    } else {
      const { material, spill } = share("basalt-" + index, () =>
        createNativeBasaltMaterial(
          scene,
          name + "-" + kit.materials[index].name + "-material",
        ),
      );
      material.albedoColor = Color3.FromArray(
        kit.materials[index].linearColor,
      ).scale(index === 2 ? 1.8 : 1);
      mesh.material = material;
      plugins.push(spill);
    }
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.metadata = {
      role: "planet",
      style: "volcanic",
      nativeRevision: options.revision ?? "volcanic-r018",
    };
  }
  root.metadata = {
    role: "planet",
    nativePlanet: true,
    nativeRevision: options.revision ?? "volcanic-r018",
    seed,
    triangles: geometry.triangles,
    litVertices,
    minimumAO,
    maximumRadiance,
    ...geometry.diagnostics,
  };
  return {
    root,
    emitters,
    geometry,
    stats: root.metadata,
    setSpillEnabled(enabled: boolean) {
      for (const plugin of plugins) plugin.enabled = enabled;
    },
    update(age: number, reducedMotion: boolean) {
      if (reducedMotion) return;
      for (const plugin of plugins) plugin.age = age;
      for (const { material, vent } of moltenMaterials) {
        const gain =
          Math.min(4, Math.max(0, emission)) *
          3 *
          (0.9 + 0.1 * Math.sin(age * 0.6));
        material.emissiveColor.set(
          gain,
          vent ? gain * 0.12 : gain,
          vent ? gain * 0.002 : gain,
        );
      }
    },
    dispose() {
      root.dispose(false, true);
      moltenTexture.dispose();
    },
  };
}

export function createNativeVolcanicPlanet(
  scene: Scene,
  name: string,
  kit: NativePlanetKit,
  seed: number,
  emission = 2.4,
  options: { geometry?: NativePlanetComposition; revision?: string } = {},
) {
  const stage = stageNativeVolcanicPlanet(
    scene,
    name,
    kit,
    seed,
    emission,
    options,
  );
  let step = stage.next();
  while (!step.done) step = stage.next();
  return step.value;
}
