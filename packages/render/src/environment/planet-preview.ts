import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import "@babylonjs/loaders/glTF";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { createSpaceEnvironment, type SpaceBodyState } from "./index";
import {
  PLANET_STYLES,
  planetRecipe,
  type PlanetRecipe,
} from "../../../content/src/environment";
export function createPlanetPreview(
  canvas: HTMLCanvasElement,
  status: (message: string) => void,
) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.015, 0.018, 0.04, 1);
  scene.useRightHandedSystem = true;
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
  const sun = new DirectionalLight(
    "preview-sun",
    new Vector3(-0.6, -1, 0.45),
    scene,
  );
  sun.intensity = 2.1;
  sun.diffuse = new Color3(0.93, 0.95, 1);
  sun.specular.setAll(0.3);
  sun.radius = 0.25;
  const fill = new HemisphericLight("preview-fill", Vector3.Up(), scene);
  fill.intensity = 0.12;
  fill.diffuse = new Color3(0.72, 0.8, 1);
  fill.groundColor = new Color3(0.025, 0.035, 0.06);
  const camera = new ArcRotateCamera(
    "planet-author-camera",
    -Math.PI / 2,
    0.55,
    7,
    Vector3.Zero(),
    scene,
  );
  camera.minZ = 0.05;
  camera.maxZ = 2000;
  camera.fov = 0.5;
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 3;
  camera.upperRadiusLimit = 45;
  const environment = createSpaceEnvironment(scene);
  environment.setPrimaryLight(sun);
  let bodies: SpaceBodyState[] = [],
    age = performance.now(),
    pending = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let previousGallery: boolean | undefined;
  let previousRings: boolean | undefined;
  let lastStatus = "";
  function update(recipe: PlanetRecipe, gallery: boolean) {
    const recipes = gallery
      ? PLANET_STYLES.map((style, index) =>
          planetRecipe(style, (recipe.seed + index) % 2147483648),
        )
      : [recipe];
    bodies = recipes.map((r, index) => ({
      id: "draft-" + index,
      kind: "planet",
      appearance: r.style,
      x: gallery ? ((index % 5) - 2) * 3.1 : 0,
      y: gallery ? (Math.floor(index / 5) - 0.5) * 3.4 : 0,
      vx: 0,
      vy: 0,
      heading: 0,
      omega: 0,
      height: 0,
      radius: 1,
      seed: r.seed,
      recipe: r,
    }));
    if (previousGallery !== gallery || previousRings !== recipe.rings) {
      camera.radius = gallery
        ? Math.max(
            4.5,
            8.6 / Math.max(0.4, canvas.clientWidth / canvas.clientHeight),
          ) / Math.tan(camera.fov / 2)
        : recipe.rings
          ? 9.4
          : 6.8;
      camera.beta = gallery ? 0.025 : 1.05;
      previousGallery = gallery;
      previousRings = recipe.rings;
    }
    pending = true;
  }
  engine.runRenderLoop(() => {
    const now = performance.now();
    try {
      environment.update({
        id: "orion-veil",
        x: 0,
        y: 0,
        dt: (now - age) / 1000,
        enabled: true,
        reducedMotion: reduced.matches,
        viewHalfExtent: camera.radius * Math.tan(camera.fov / 2),
        aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight),
        bodies,
      });
    } catch (error) {
      status(`Generation failed: ${String(error)}`);
      bodies = [];
      pending = false;
    }
    age = now;
    {
      let faces = 0;
      const details = scene.transformNodes
        .filter((n) => n.metadata?.layeredPlanet)
        .map(
          (n) =>
            `${n.metadata.resolution} cells${n.metadata.budgetReduced ? " (budget adjusted)" : ""}`,
        );
      for (const mesh of scene.meshes) {
        if (mesh.metadata?.voxelPlanet) faces += mesh.metadata.faces;
      }
      const message = `${bodies.length} ${bodies.length === 1 ? "world" : "worlds"} · ${faces.toLocaleString()} exposed faces · ${[...new Set(details)].join(", ")} · local draft`;
      if (message !== lastStatus || pending) {
        status(message);
        lastStatus = message;
      }
      pending = false;
    }
    scene.render();
  });
  const resize = new ResizeObserver(() => engine.resize());
  resize.observe(canvas);
  return {
    update,
    dispose() {
      resize.disconnect();
      environment.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
