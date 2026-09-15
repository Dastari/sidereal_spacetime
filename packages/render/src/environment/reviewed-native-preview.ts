import { applyReviewedPreviewLighting } from "./reviewed-preview-lighting";
import { createYellowStarRuntime } from "./yellow-star-runtime";
import { REVIEWED_YELLOW_STAR } from "./reviewed-star-catalog";
import { createReviewedNativeSelection } from "./reviewed-native-selection";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { planetRecipe, planetEffects } from "../../../content/src/environment";
import { createGlowOccluders } from "../glow-occluders";
import { createPlanetWorkerClient } from "./planet-worker-client";
import { createPlanetShadows } from "./planet-shadows";
import { createPlanetAtmosphere } from "./planet-atmosphere";
import { reviewedNativePlanet } from "./reviewed-native-planet-catalog";
import {
  createReviewedPlanetRuntime,
  type ReviewedPlanetRuntime,
} from "./reviewed-native/runtime";

const colors = {
  temperate: "#86cfff",
  ocean: "#86cfff",
  desert: "#f5aa62",
  rock: "#a5a2c6",
  ice: "#64d6ff",
  volcanic: "#ff7429",
  toxic: "#b8e943",
  gas: "#a677ff",
  crystal: "#da65ff",
  moon: "#a5a2c6",
};
/** Local Genesis catalog preview. No simulation, transport or authority dependencies. */
export function createReviewedNativePreview(
  canvas: HTMLCanvasElement,
  status: (message: string, error?: boolean) => void,
) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.012, 0.016, 0.035, 1);
  scene.environmentTexture = new HDRCubeTexture(
    "/assets/materials/frontier-workshop.hdr",
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  scene.environmentIntensity = 0.28;
  const camera = new ArcRotateCamera(
    "genesis-camera",
    Math.atan2(4.3, 2.45),
    Math.acos(2.1 / Math.hypot(2.45, 4.3, 2.1)),
    5.5,
    Vector3.Zero(),
    scene,
  );
  camera.fov = 0.52;
  camera.minZ = 0.01;
  camera.maxZ = 10000;
  camera.lowerRadiusLimit = 2.8;
  camera.upperRadiusLimit = 120;
  camera.attachControl(canvas, true);
  const sun = new DirectionalLight(
    "genesis-sun",
    new Vector3(-0.6, -1, 0.45),
    scene,
  );
  sun.intensity = 2.1;
  sun.diffuse = new Color3(0.93, 0.95, 1);
  sun.position.set(3, 5, -2.25);
  const fill = new HemisphericLight("genesis-fill", Vector3.Up(), scene);
  fill.intensity = 0.2;
  fill.diffuse = new Color3(0.6, 0.72, 1);
  fill.groundColor = new Color3(0.025, 0.02, 0.06);
  const worker = createPlanetWorkerClient(),
    shadows = createPlanetShadows(scene);
  shadows.setPrimaryLight(sun);
  const glow = new GlowLayer("genesis-glow", scene, {
    blurKernelSize: 24,
    mainTextureRatio: 0.25,
    excludeByDefault: true,
  });
  glow.intensity = 0.45;
  const occluders = createGlowOccluders(glow);
  let emitters: Mesh[] = [];
  type Candidate = {
    runtime: Pick<ReviewedPlanetRuntime, "root" | "dispose"> & {
      update(projected: number): void;
      stats(): { active?: number; requestedLOD?: number; error?: string };
    };
    controller: AbortController;
    id: string;
    seed: number;
    glow: boolean;
    radius?: number;
    dispose: () => void;
  };
  const selection = createReviewedNativeSelection<Candidate>();
  let request: AbortController | undefined;
  let disposed = false,
    frames = 0,
    lastStatus = "",
    lastStatusAt = 0;
  const announce = (message: string, error = false) => {
    if (disposed) return;
    if (message !== lastStatus) {
      lastStatus = message;
      status(message, error);
    }
  };
  async function select(id: string, seed: number) {
    const descriptor = reviewedNativePlanet(id);
    const isStar = id === REVIEWED_YELLOW_STAR.id;
    if (
      (!descriptor && !isStar) ||
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 2147483647
    ) {
      announce("Choose a valid celestial body and seed.", true);
      return;
    }
    const token = selection.begin();
    request?.abort();
    const controller = new AbortController();
    request = controller;
    announce(`Loading ${descriptor?.label ?? REVIEWED_YELLOW_STAR.label}…`);
    try {
      if (isStar) {
        const star = await createYellowStarRuntime(scene, {
          bodyId: `genesis-star:${token}`,
          radius: 1,
          signal: controller.signal,
        });
        if (disposed || !selection.isCurrent(token)) {
          star.dispose();
          return;
        }
        selection.stage(token, {
          runtime: {
            root: star.root,
            update: () => star.update(performance.now() / 1000),
            stats: () => ({
              active: 0,
              requestedLOD: 2,
              flareCount: star.flareCount,
              revision: REVIEWED_YELLOW_STAR.revision,
              assetSha256: REVIEWED_YELLOW_STAR.sha256,
            }),
            dispose: star.dispose,
          },
          controller,
          id,
          seed: REVIEWED_YELLOW_STAR.seed,
          glow: false,
          radius:
            2.3 /
            (Math.tan(camera.fov / 2) *
              Math.min(1, engine.getRenderWidth() / engine.getRenderHeight())),
          dispose: () => {
            controller.abort();
            star.dispose();
          },
        });
        return;
      }
      if (!descriptor) throw new Error("Unknown reviewed celestial body");
      const recipe = planetRecipe(descriptor.style, seed);
      const runtime = await createReviewedPlanetRuntime(scene, {
        bodyId: `genesis:${token}:${id}`,
        descriptor,
        recipe,
        worker,
        signal: controller.signal,
        prepareMaterial: (mesh, nextFrame, opaqueRefraction) =>
          shadows.prepare(mesh, nextFrame, {
            opaqueRefraction,
            signal: controller.signal,
          }),
      });
      if (disposed || !selection.isCurrent(token)) {
        runtime.dispose();
        return;
      }
      runtime.root.setEnabled(false);
      const atmosphere = createPlanetAtmosphere(
        scene,
        `genesis:${token}`,
        1,
        Color3.FromHexString(colors[descriptor.style]),
        planetEffects(recipe).atmosphere,
      );
      atmosphere.mesh.parent = runtime.root;
      atmosphere.mesh.metadata = {
        ...atmosphere.mesh.metadata,
        bodyId: runtime.root.metadata.bodyId,
        partId: `genesis:${token}:atmosphere`,
      };
      try {
        await atmosphere.material.forceCompilationAsync(atmosphere.mesh);
      } catch (error) {
        runtime.dispose();
        atmosphere.material.dispose();
        throw error;
      }
      if (
        disposed ||
        !selection.isCurrent(token) ||
        controller.signal.aborted
      ) {
        runtime.dispose();
        atmosphere.material.dispose();
        return;
      }
      selection.stage(token, {
        runtime,
        controller,
        id,
        seed,
        glow: descriptor.glow,
        radius:
          selection.current?.id !== id
            ? descriptor.style === "gas"
              ? 7.5
              : 5.5
            : undefined,
        dispose: () => {
          controller.abort();
          runtime.dispose();
          atmosphere.material.dispose();
        },
      });
    } catch (error) {
      if (
        !disposed &&
        selection.isCurrent(token) &&
        !controller.signal.aborted
      ) {
        request = undefined;
        announce(`Could not load this body: ${String(error)}`, true);
      }
    }
  }
  engine.runRenderLoop(() => {
    if (disposed) return;
    let { current, pending } = selection;
    const projected =
      engine.getRenderHeight() / (camera.radius * 2 * Math.tan(camera.fov / 2));
    current?.runtime.update(projected);
    pending?.runtime.update(
      engine.getRenderHeight() /
        ((pending.radius ?? camera.radius) * 2 * Math.tan(camera.fov / 2)),
    );
    const next = pending?.runtime.stats();
    if (pending && next?.error) {
      announce(`Could not prepare this body: ${next.error}`, true);
      selection.rejectPending();
      pending = undefined;
      request = undefined;
    }
    const published = selection.publishIfReady(
      (candidate) => candidate.runtime.stats().active !== undefined,
    );
    if (published) {
      current = published;
      pending = undefined;
      request = undefined;
      if (current.radius !== undefined) camera.radius = current.radius;
      const starSelected = current.id === REVIEWED_YELLOW_STAR.id;
      applyReviewedPreviewLighting(scene, sun, fill, starSelected);
      announce(
        starSelected
          ? `${REVIEWED_YELLOW_STAR.label} · active solar flares`
          : `${reviewedNativePlanet(current.id)!.label} · seed ${current.seed}`,
      );
    }
    if (!request && !pending && current?.runtime.stats().error)
      announce(
        `Could not prepare detail: ${current.runtime.stats().error}`,
        true,
      );
    shadows.update(
      current
        ? [
            {
              node: current.runtime.root,
              radius: 1,
              lod: current.runtime.stats().requestedLOD ?? 2,
            },
          ]
        : [],
    );
    glow.isEnabled = !!current?.glow;
    const visible =
      current?.runtime.root
        .getChildMeshes()
        .filter((mesh) => mesh.isEnabled()) ?? [];
    const nextEmitters = glow.isEnabled
      ? visible.filter(
          (mesh): mesh is Mesh =>
            mesh instanceof Mesh &&
            mesh.material instanceof PBRMaterial &&
            mesh.material.emissiveColor.r +
              mesh.material.emissiveColor.g +
              mesh.material.emissiveColor.b >
              0,
        )
      : [];
    if (
      emitters.length !== nextEmitters.length ||
      emitters.some((mesh, index) => mesh !== nextEmitters[index])
    ) {
      for (const mesh of emitters) glow.removeIncludedOnlyMesh(mesh);
      emitters = nextEmitters;
      occluders.set(visible.filter((mesh) => !emitters.includes(mesh as Mesh)));
      for (const mesh of emitters) glow.addIncludedOnlyMesh(mesh);
    }
    scene.render();
    frames++;
    if (performance.now() - lastStatusAt > 250) {
      lastStatusAt = performance.now();
      canvas.dataset.planetState = JSON.stringify({
        frames,
        selected: current?.id,
        seed: current?.seed,
        pending: pending?.id,
        loading: !!request,
        stats: current?.runtime.stats(),
        worker: worker.snapshot(),
        ready: scene.isReady(),
      });
    }
  });
  const resize = new ResizeObserver(() => engine.resize());
  resize.observe(canvas);
  return {
    select,
    dispose() {
      if (disposed) return;
      disposed = true;
      request?.abort();
      selection.dispose();
      resize.disconnect();
      occluders.dispose();
      shadows.dispose();
      worker.dispose();
      scene.dispose();
      engine.dispose();
      delete canvas.dataset.planetState;
    },
  };
}
