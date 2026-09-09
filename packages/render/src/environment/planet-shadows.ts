import { Scene } from "@babylonjs/core/scene";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** One presentation-only sun/shadow allocation for the nearest hero globe. */
export function createPlanetShadows(scene: Scene) {
  const key = new DirectionalLight(
    "planet-hero-key",
    new Vector3(-0.6, -1, 0.45),
    scene,
  );
  key.setEnabled(false);
  key.autoUpdateExtends = false;
  key.autoCalcShadowZBounds = false;
  key.specular.setAll(0.3);
  key.radius = 0.25;
  const shadows = new ShadowGenerator(1024, key);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = 0.0005;
  let primary: DirectionalLight | undefined;
  let selected: TransformNode | undefined;
  let excluded: AbstractMesh[] = [];
  function release() {
    if (primary)
      primary.excludedMeshes = primary.excludedMeshes.filter(
        (m) => !excluded.includes(m),
      );
    for (const mesh of excluded) mesh.receiveShadows = false;
    excluded = [];
    selected = undefined;
    key.includedOnlyMeshes = [];
    shadows.getShadowMap()!.renderList = [];
    key.setEnabled(false);
  }
  return {
    setPrimaryLight(light: DirectionalLight) {
      release();
      primary = light;
    },
    update(
      candidates: readonly {
        node: TransformNode;
        radius: number;
        lod: number;
      }[],
    ) {
      const camera = scene.activeCamera?.globalPosition;
      const target =
        camera &&
        candidates
          .filter((c) => c.lod === 0)
          .sort(
            (a, b) =>
              Vector3.DistanceSquared(camera, a.node.position) -
              Vector3.DistanceSquared(camera, b.node.position),
          )[0];
      if (!target || !primary) {
        if (selected) release();
        return;
      }
      const meshes = target.node
        .getChildMeshes()
        .filter((m) => m.material?.getClassName() === "PBRMaterial");
      // Empty includedOnlyMeshes means all meshes in Babylon, never enable that.
      if (!meshes.length) {
        if (selected) release();
        return;
      }
      if (
        selected !== target.node ||
        meshes.length !== excluded.length ||
        meshes.some((m, i) => m !== excluded[i])
      ) {
        release();
        selected = target.node;
        excluded = meshes;
        primary.excludedMeshes = [...primary.excludedMeshes, ...excluded];
        key.includedOnlyMeshes = excluded;
        const casters = excluded.filter(
          (m) => !m.name.includes("smoke") && !m.name.includes("closed-core"),
        );
        shadows.getShadowMap()!.renderList = casters;
        for (const mesh of excluded) mesh.receiveShadows = true;
        key.setEnabled(true);
      }
      key.direction.copyFrom(primary.direction).normalize();
      key.diffuse.copyFrom(primary.diffuse);
      key.intensity = primary.intensity;
      key.position.copyFrom(
        target.node.position.subtract(key.direction.scale(target.radius * 4)),
      );
      key.shadowMinZ = target.radius;
      key.shadowMaxZ = target.radius * 7;
      key.shadowFrustumSize = target.radius * 2.7;
      // Ice's close snow/ice boundaries require a slightly larger normal offset.
      // The fixed-camera sweep preserves contact shadows at .003R; other
      // families retain their accepted setting.
      const ice = meshes.some((mesh) => mesh.metadata?.style === "ice");
      shadows.normalBias = target.radius * (ice ? 0.003 : 0.0008);
    },
    dispose() {
      release();
      shadows.dispose();
      key.dispose();
    },
  };
}
