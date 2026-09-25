import { withSceneCoordinateContext } from "./scene-coordinate-context";
import { characterPresentationStatus } from "./character-preview-state";
import { MODULAR_CREW_ASSET_URL } from "@sidereal/content/character-components";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createCrewVisual, CREW_OUTFITS, type CrewAppearance } from "./crew";
import {
  createEquipmentVisual,
  EQUIPMENT_ASSETS,
  type EquipmentAsset,
} from "./equipment";
import { createHolographicDisc } from "./holographic-disc";
import {
  loadEquipmentPoseConfiguration,
  type EquipmentPoseConfiguration,
} from "./crew/pose-review-config";

export type CharacterPreviewAppearance = Partial<CrewAppearance> & {
  /** Current visual catalog ID; grants no inventory or equipment capability. */
  equipmentAsset?: string;
};
export type CharacterPreviewStatus = "loading" | "ready" | "error" | "disposed";

/** Caller-owned, lazily created portrait. No private RAF or input listeners:
 * render() immediately precedes Canvas2D.drawImage() in the visible HUD pass.
 * ready always settles; inspect status/error rather than catching a rejection. */
export function createCharacterPreview(
  options: {
    width?: number;
    height?: number;
    assetUrl?: string;
    /** Wake an otherwise static/reduced-motion HUD after asynchronous work. */
    onInvalidate?: () => void;
  } = {},
) {
  return withSceneCoordinateContext(undefined, () =>
    buildCharacterPreview(options),
  );
}

function buildCharacterPreview(
  options: NonNullable<Parameters<typeof createCharacterPreview>[0]>,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 560;
  let disposed = false,
    dirty = true;
  let status: CharacterPreviewStatus = "loading";
  let error: string | undefined;
  function invalidate() {
    if (disposed) return;
    dirty = true;
    options.onInvalidate?.();
  }
  const engine = new Engine(canvas, true, {
    alpha: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    stencil: false,
    powerPreference: "low-power",
    // Matrix precision is process-wide, even though this portrait has its own engine.
    useHighPrecisionMatrix: true,
  });
  engine.setHardwareScalingLevel(1);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0, 0, 0, 0);
  scene.skipPointerMovePicking =
    scene.skipPointerDownPicking =
    scene.skipPointerUpPicking =
      true;
  const environment = new HDRCubeTexture(
    "/assets/materials/frontier-workshop.hdr",
    scene,
    64,
    false,
    true,
    false,
    true,
    invalidate,
    (message) => {
      if (disposed) return;
      // The key/fill lights remain a usable portrait if environment loading
      // fails. Remove the failed texture so readiness can settle normally.
      scene.environmentTexture = null;
      environment.dispose();
      error = `Portrait environment unavailable: ${message ?? "texture load failed"}`;
      invalidate();
    },
  );
  scene.environmentTexture = environment;
  scene.environmentIntensity = 0.35;
  const camera = new ArcRotateCamera(
    "portrait-camera",
    -Math.PI / 2 + 0.19,
    1.31,
    5,
    new Vector3(0, 1.01, 0),
    scene,
  );
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.01;
  camera.maxZ = 20;
  const key = new DirectionalLight(
    "portrait-soft-key",
    new Vector3(0.4, -0.7, 0.75),
    scene,
  );
  key.diffuse = new Color3(0.84, 0.91, 1);
  key.intensity = 2.8;
  const fill = new HemisphericLight("portrait-fill", Vector3.Up(), scene);
  fill.diffuse = new Color3(0.6, 0.77, 1);
  fill.groundColor = new Color3(0.025, 0.07, 0.13);
  fill.intensity = 0.58;
  const disc = createHolographicDisc(scene, { radius: 0.64 });
  const placement = new TransformNode("portrait-display-pivot", scene);
  placement.rotation.y = 0.38;
  let crew: Awaited<ReturnType<typeof createCrewVisual>> | undefined;
  let gear: Awaited<ReturnType<typeof createEquipmentVisual>> | undefined;
  let pose:
    | ReturnType<
        Awaited<ReturnType<typeof createCrewVisual>>["createPoseController"]
      >
    | undefined;
  let poseConfiguration: EquipmentPoseConfiguration | undefined;
  let released = false,
    pending = 0,
    gearRevision = 0;
  let preset = "engineer",
    appearance: CharacterPreviewAppearance = {};
  let selectedEquipment: string | undefined;
  let frameReady = false,
    equipmentFailed = false;
  let previousFrame = -Infinity,
    previousReducedMotion: boolean | undefined;
  let aspect = 360 / 560,
    baseHalfHeight = 1.4;
  const abort = new AbortController();

  function release() {
    if (!disposed || released || pending) return;
    released = true;
    pose?.bind(undefined);
    gear?.dispose();
    crew?.dispose();
    disc.dispose();
    withSceneCoordinateContext(scene, () => {
      scene.dispose();
      engine.dispose();
    });
  }
  function subjects() {
    disc.setSubjects(placement.getChildMeshes());
  }
  function applyAppearance() {
    if (!crew || disposed) return;
    frameReady = false;
    const outfit = (
      preset in CREW_OUTFITS || preset === "crew" || preset === "explorer"
        ? preset
        : "engineer"
    ) as CrewAppearance["outfit"];
    const { equipmentAsset: _asset, ...customization } = appearance;
    crew.customize({ outfit, ...customization, weaponFixture: !gear });
    dirty = true;
    subjects();
    const asset = EQUIPMENT_ASSETS.includes(
      appearance.equipmentAsset as EquipmentAsset,
    )
      ? (appearance.equipmentAsset as EquipmentAsset)
      : undefined;
    if (asset === selectedEquipment) return;
    selectedEquipment = asset;
    equipmentFailed = false;
    const revision = ++gearRevision;
    pose?.bind(undefined);
    crew.bindHeldEquipment(undefined);
    gear?.dispose();
    gear = undefined;
    crew.customize({ weaponFixture: true });
    if (!asset) {
      subjects();
      return;
    }
    pending++;
    createEquipmentVisual(
      scene,
      crew.sockets.handR,
      asset,
      poseConfiguration?.items[asset]
        ? poseConfiguration.equipmentUrl
        : undefined,
    )
      .then((loaded) => {
        if (disposed || revision !== gearRevision) {
          loaded.dispose();
          return;
        }
        gear = loaded;
        const item = poseConfiguration?.items[asset];
        if (pose && crew && item)
          pose.bind(gear.createPoseBinding(crew.root, item));
        else crew?.bindHeldEquipment(gear);
        crew?.customize({ weaponFixture: false });
        subjects();
        invalidate();
      })
      .catch((reason) => {
        if (!disposed && revision === gearRevision) {
          // A held-item failure does not blank the successfully loaded character.
          equipmentFailed = true;
          error = `Held item preview unavailable: ${String(reason)}`;
          invalidate();
        }
      })
      .finally(() => {
        pending--;
        release();
      });
  }

  function resize(width: number, height: number) {
    if (disposed || !Number.isFinite(width) || !Number.isFinite(height)) return;
    const scale = Math.min(1, 640 / Math.max(width, height));
    const w = Math.max(64, Math.round(width * scale)),
      h = Math.max(64, Math.round(height * scale));
    if (canvas.width !== w || canvas.height !== h) {
      engine.setSize(w, h, true);
      dirty = true;
    }
    aspect = w / h;
    baseHalfHeight = Math.max(1.4, 0.68 / aspect);
    frameEquipment();
  }
  function frameEquipment() {
    let halfHeight = baseHalfHeight;
    if (gear) {
      const view = camera.getViewMatrix();
      for (const mesh of gear.root.getChildMeshes()) {
        if (!mesh.isEnabled() || !mesh.getTotalVertices()) continue;
        mesh.computeWorldMatrix(true);
        for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
          const point = Vector3.TransformCoordinates(corner, view);
          halfHeight = Math.max(
            halfHeight,
            (Math.abs(point.x) + 0.045) / aspect,
            Math.abs(point.y) + 0.045,
          );
        }
      }
    }
    const changed = Math.abs((camera.orthoTop ?? 0) - halfHeight) > 0.0001;
    camera.orthoTop = halfHeight;
    camera.orthoBottom = -halfHeight;
    camera.orthoLeft = -halfHeight * aspect;
    camera.orthoRight = halfHeight * aspect;
    return changed;
  }
  resize(options.width ?? 360, options.height ?? 560);

  pending++;
  const ready = (async () => {
    try {
      // Fetch can be cancelled while a closed panel is still loading. Babylon
      // parsing is allowed to settle before the owned WebGL context is released.
      const [response, configuration] = await Promise.all([
        fetch(options.assetUrl ?? MODULAR_CREW_ASSET_URL, {
          signal: abort.signal,
        }),
        loadEquipmentPoseConfiguration(),
      ]);
      if (!response.ok)
        throw new Error(`Character asset returned HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (disposed) return;
      const loaded = await createCrewVisual(scene, placement, bytes);
      if (disposed) {
        loaded.dispose();
        return;
      }
      crew = loaded;
      poseConfiguration = configuration;
      pose = crew.createPoseController();
      pose.setAimSpace(configuration.aimSpace);
      applyAppearance();
      status = "ready";
      invalidate();
    } catch (reason) {
      if (!disposed) {
        status = "error";
        error = String(reason);
        invalidate();
      }
    } finally {
      pending--;
      release();
    }
  })();

  return {
    canvas,
    ready,
    get status() {
      return status;
    },
    get presentationStatus() {
      return characterPresentationStatus({
        status,
        frameReady,
        pending,
        equipmentRequested: !!selectedEquipment,
        equipmentReady: !!gear,
        equipmentFailed,
      });
    },
    get error() {
      return error;
    },
    /** Continue caller-owned visible invalidation until shader/bloom readiness
     * settles. Network readiness wakes the caller through onInvalidate. */
    get needsRender() {
      return !disposed && status === "ready" && dirty;
    },
    setAppearance(nextPreset: string, next: CharacterPreviewAppearance = {}) {
      if (disposed) return;
      if (
        preset === nextPreset &&
        JSON.stringify(appearance) === JSON.stringify(next)
      )
        return;
      preset = nextPreset;
      appearance = { ...next };
      applyAppearance();
    },
    setRotation(radians: number) {
      if (disposed || !Number.isFinite(radians)) return;
      placement.rotation.y = radians % (Math.PI * 2);
      dirty = true;
    },
    rotate(delta: number) {
      if (disposed || !Number.isFinite(delta)) return;
      placement.rotation.y = (placement.rotation.y + delta) % (Math.PI * 2);
      dirty = true;
    },
    resize,
    render(timeSeconds: number, reducedMotion = false) {
      if (disposed || status !== "ready") return false;
      const t = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
      if (previousReducedMotion !== reducedMotion) dirty = true;
      // Includes a hard cap for callers drawing the surrounding UI at 60+ Hz.
      if (!dirty && (reducedMotion || t - previousFrame < 1 / 30)) return false;
      disc.update(t, reducedMotion);
      crew?.update({
        moving: false,
        seated: false,
        reducedMotion,
        combat: !!gear,
      });
      const poseItem = selectedEquipment
        ? poseConfiguration?.items[selectedEquipment]
        : undefined;
      const poseIntent = poseItem
        ? {
            yaw: -(crew?.root.rotation.y ?? 0),
            facing: -(crew?.root.rotation.y ?? 0),
            pitch: 0,
            active: !!gear,
            moving: false,
            seated: false,
            reducedMotion,
            profile: poseItem.profile,
            itemId: selectedEquipment,
          }
        : undefined;
      if (poseIntent)
        pose?.update(poseIntent, Math.min(0.1, Math.max(0, t - previousFrame)));
      withSceneCoordinateContext(scene, () => {
        engine.beginFrame();
        frameEquipment();
        scene.render();
        // A freshly loaded/rotated hand item acquires its final socket transform
        // during animation evaluation. Fit once more so side-on rifles never
        // clip the portrait, including the final static reduced-motion frame.
        if (frameEquipment()) {
          if (poseIntent) pose?.update(poseIntent, 0);
          scene.render();
        }
        engine.endFrame();
      });
      previousFrame = t;
      previousReducedMotion = reducedMotion;
      // A first visible frame can arrive before HDR/GLB shader compilation.
      // Keep rendering until ready, including when reduced motion is enabled.
      dirty =
        !scene.isReady() ||
        scene.effectLayers.some((layer) => !layer.isLayerReady());
      frameReady = !dirty;
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      status = "disposed";
      gearRevision++;
      abort.abort();
      release();
    },
  };
}
