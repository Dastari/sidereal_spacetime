import { planetShadowCoverage } from "./planet-shadow-coverage";
import { applyPlanetShadowDepthOffset } from "./planet-shadow-depth-offset";
import { createPlanetShadowPreparation } from "./planet-shadow-preparation";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
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
  const releaseDepthOffset = applyPlanetShadowDepthOffset(
    scene.getEngine(),
    shadows,
  );
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = 0.0005;
  shadows.transparencyShadow = true;
  shadows.enableSoftTransparentShadow = true;
  let primary: DirectionalLight | undefined;
  let disposed = false;
  let lightEpoch = 0;
  let preparationTail: Promise<void> = Promise.resolve();
  let preparationYield: () => Promise<void> = async () => {};
  const preparation = createPlanetShadowPreparation(scene, {
    hero: key,
    shadows,
    yield: () => preparationYield(),
  });
  let selected: TransformNode | undefined;
  let coverage = 0;
  let selectedRadius = 0;
  const selectedScale = Vector3.Zero();
  let excluded: AbstractMesh[] = [];
  let addedExclusions: AbstractMesh[] = [];
  const previousReceive = new Map<AbstractMesh, boolean>();
  function release() {
    if (primary)
      primary.excludedMeshes = primary.excludedMeshes.filter(
        (m) => !addedExclusions.includes(m),
      );
    for (const [mesh, receive] of previousReceive)
      mesh.receiveShadows = receive;
    previousReceive.clear();
    addedExclusions = [];
    excluded = [];
    selected = undefined;
    key.includedOnlyMeshes = [];
    shadows.getShadowMap()!.renderList = [];
    key.setEnabled(false);
  }
  return {
    setPrimaryLight(light: DirectionalLight) {
      lightEpoch++;
      release();
      primary = light;
    },
    /** Prepare the exact initial, returned-far and hero light orders before a
     * pending native level is made ready. Babylon appends restored lights. */
    prepare(
      mesh: Mesh,
      nextFrame: () => Promise<void>,
      options: { signal?: AbortSignal; opaqueRefraction?: boolean } = {},
    ) {
      const { signal, opaqueRefraction } = options;
      const epoch = lightEpoch;
      const run = preparationTail
        .catch(() => {})
        .then(async () => {
          const check = () => {
            if (
              disposed ||
              epoch !== lightEpoch ||
              signal?.aborted ||
              mesh.isDisposed()
            )
              throw new Error("Planet shadow preparation invalidated");
          };
          check();
          if (!primary)
            throw new Error("Planet shadow preparation requires primary light");
          const far = mesh.lightSources.filter((light) => light !== key);
          const other = far.filter((light) => light !== primary);
          const returned = far.includes(primary) ? [...other, primary] : other;
          preparationYield = async () => {
            await nextFrame();
            check();
          };
          await preparation.prepare({
            mesh,
            signal,
            opaqueRefraction,
            cast: mesh.metadata?.planetShadow?.cast !== false,
            variants: [
              { lights: far, receiveShadows: mesh.receiveShadows },
              { lights: returned, receiveShadows: mesh.receiveShadows },
              {
                lights: [...other, key],
                receiveShadows: mesh.metadata?.planetShadow?.receive !== false,
              },
            ],
          });
          check();
        });
      preparationTail = run;
      return run;
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
          .filter(
            (c) => c.lod === 0 && !c.node.isDisposed() && c.node.isEnabled(),
          )
          .sort(
            (a, b) =>
              Vector3.DistanceSquared(camera, a.node.getAbsolutePosition()) -
              Vector3.DistanceSquared(camera, b.node.getAbsolutePosition()),
          )[0];
      if (!target || !primary || !primary.isEnabled()) {
        if (selected) release();
        return;
      }
      const meshes = target.node
        .getChildMeshes()
        .filter(
          (m) =>
            m.metadata?.role === "planet" &&
            !m.isDisposed() &&
            m.isEnabled() &&
            m.isVisible &&
            m.visibility > 0 &&
            m.material?.getClassName() === "PBRMaterial",
        );
      // Empty includedOnlyMeshes means all meshes in Babylon, never enable that.
      if (!meshes.length) {
        if (selected) release();
        return;
      }
      target.node.computeWorldMatrix(true);
      const worldScale = target.node.absoluteScaling;
      const selectionChanged =
        selected !== target.node ||
        meshes.length !== excluded.length ||
        meshes.some((m, i) => m !== excluded[i]);
      const coverageChanged =
        selectionChanged ||
        selectedRadius !== target.radius ||
        !selectedScale.equals(worldScale);
      if (
        selected !== target.node ||
        meshes.length !== excluded.length ||
        meshes.some((m, i) => m !== excluded[i])
      ) {
        release();
        selected = target.node;
        excluded = meshes;
        addedExclusions = excluded.filter(
          (mesh) => !primary!.excludedMeshes.includes(mesh),
        );
        primary.excludedMeshes = [
          ...primary.excludedMeshes,
          ...addedExclusions,
        ];
        for (const mesh of excluded)
          previousReceive.set(mesh, mesh.receiveShadows);
        key.includedOnlyMeshes = excluded;

        key.setEnabled(true);
      }
      if (coverageChanged) {
        coverage = planetShadowCoverage(target.node, meshes, target.radius);
        selectedRadius = target.radius;
        selectedScale.copyFrom(worldScale);
      }
      // Planet surfaces default to casting/receiving; exceptional producers carry
      // explicit semantics, independent of names and shared weather flags.
      shadows.getShadowMap()!.renderList = excluded.filter(
        (mesh) => mesh.metadata?.planetShadow?.cast !== false,
      );
      for (const mesh of excluded)
        mesh.receiveShadows = mesh.metadata?.planetShadow?.receive !== false;
      key.direction.copyFrom(primary.direction).normalize();
      key.diffuse.copyFrom(primary.diffuse);
      key.intensity = primary.intensity;
      key.position.copyFrom(
        target.node
          .getAbsolutePosition()
          .subtract(key.direction.scale(coverage * 4)),
      );
      key.shadowMinZ = coverage;
      key.shadowMaxZ = coverage * 7;
      key.shadowFrustumSize = Math.max(target.radius * 2.7, coverage * 2.05);
      // Ice's close snow/ice boundaries require a slightly larger normal offset.
      // The fixed-camera sweep preserves contact shadows at .003R; other
      // families retain their accepted setting.
      const ice = meshes.some((mesh) => mesh.metadata?.style === "ice");
      shadows.normalBias = target.radius * (ice ? 0.003 : 0.0008);
    },
    dispose() {
      disposed = true;
      lightEpoch++;
      preparation.dispose();
      release();
      releaseDepthOffset();
      shadows.dispose();
      key.dispose();
    },
  };
}
