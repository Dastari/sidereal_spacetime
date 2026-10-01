/** Disclosed isolated b741/real-crew diagnostic. Never qualifies a production ship or registration. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import "@babylonjs/loaders/glTF";
import {
  verifyOperatorEnsemblePlan,
  prepareOperatorEnsemble,
  operatorDrawReady,
  type PreparedOperatorEnsemble,
} from "../../packages/render/src/crew/operator-ensemble";
import profiles from "../../packages/render/src/crew/operator-contact-profiles.json";
import { moldedLightRig } from "../../packages/render/src/molded-plastic";
import {
  diagnosticOperatorAppearance,
  diagnosticOperatorPlan,
  validateDiagnosticHeadSources,
} from "./operator-plan";

const q = new URLSearchParams(location.search);
const bodyType = q.get("body") === "female" ? "female" : "male";
const tier = q.get("tier") === "2" ? "security" : "marine";
const item = q.get("item") ?? "pistol";
const partial = q.get("outfit") === "partial";
const headSelection = q.get("head") ?? "legacy";
const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.06, 0.075, 0.1, 1);
const parent = new TransformNode("isolated-operator-parent", scene);
const camera = new ArcRotateCamera(
  "operator-camera",
  -2.1,
  1.1,
  3.2,
  new Vector3(0, 0.8, 0),
  scene,
);
camera.attachControl(canvas, true);
new HemisphericLight("operator-fill", Vector3.Up(), scene).intensity = 0.55;
new DirectionalLight("operator-key", new Vector3(-1, -2, 1), scene).intensity =
  1.2;
const state: {
  diagnostic: string;
  navigationSha256: string;
  bodyType: string;
  tier: string;
  item: string;
  ready: boolean;
  error: string | null;
  frames: number;
  handle?: PreparedOperatorEnsemble;
} = {
  diagnostic: `isolated raw-GLB frame / ${partial ? "partial armor, no uniform" : "complete armor + Security uniform"} / heads=${headSelection} / no admitted context or production registration`,
  navigationSha256: profiles.navigationSha256,
  bodyType,
  tier,
  item,
  ready: false,
  error: null,
  frames: 0,
};
const diagnosticWindow = window as typeof window & {
  __operatorDiagnostic?: typeof state & {
    scene: Scene;
    parent: TransformNode;
    engine: Engine;
    stop(): void;
    recover(dead?: boolean): void;
    freeze(): void;
    snapshot(): unknown;
  };
};
diagnosticWindow.__operatorDiagnostic = {
  ...state,
  scene,
  parent,
  engine,
  stop: () => engine.stopRenderLoop(),
  freeze: () => state.handle?.contact?.freeze(),
  recover: (dead = false) => {
    const physical = state.handle,
      ordinary = physical?.ordinaryBaseline;
    if (!physical || !ordinary)
      throw new Error("No current complete ordinary ensemble");
    ordinary.root.position.set(1.2, 0, 0);
    ordinary.crew.update({ moving: false, seated: false, dead });
    ordinary.activate();
    physical.releaseOrdinaryBaseline!(ordinary);
    state.handle = ordinary;
    physical.dispose();
  },
  // Read indexed geometry and the ACTUAL normal-loop palettes after a completed render.
  snapshot: () => {
    const handle = state.handle;
    if (!handle) return null;
    return {
      sceneUid: scene.uid,
      source: state.navigationSha256,
      frames: state.frames,
      diagnostic: state.diagnostic,
      residual: handle.contact?.residual ?? null,
      joints: [...handle.crew.joints].map(([name, node]) => ({
        name,
        world: Array.from(node.computeWorldMatrix(true).m),
      })),
      meshes: handle.root
        .getChildMeshes()
        .filter(
          (mesh) =>
            mesh.isEnabled() &&
            mesh.isVisible &&
            mesh.visibility > 0 &&
            mesh.getTotalVertices(),
        )
        .map((mesh) => ({
          name: mesh.name,
          world: Array.from(mesh.computeWorldMatrix(true).m),
          positions: Array.from(mesh.getVerticesData("position") ?? []),
          indices: Array.from(mesh.getIndices() ?? []),
          jointIndices: Array.from(
            mesh.getVerticesData("matricesIndices") ?? [],
          ),
          weights: Array.from(mesh.getVerticesData("matricesWeights") ?? []),
          skin: mesh.skeleton
            ? Array.from(mesh.skeleton.getTransformMatrices(mesh))
            : [],
        })),
    };
  },
};
const status = document.getElementById("status")!;
engine.runRenderLoop(() => scene.render());
scene.onAfterRenderObservable.add(() => {
  state.frames++;
  try {
    state.handle?.contact?.assertReady();
    const visible =
      state.handle?.root
        .getChildMeshes()
        .filter(
          (mesh) =>
            mesh.isEnabled() &&
            mesh.isVisible &&
            mesh.visibility > 0 &&
            mesh.getTotalVertices(),
        ) ?? [];
    state.ready =
      !!state.handle &&
      state.frames > 3 &&
      scene.isReady() &&
      operatorDrawReady(scene, visible);
  } catch {
    state.ready = false;
  }
  Object.assign(diagnosticWindow.__operatorDiagnostic!, state);
  status.textContent = `${state.diagnostic}\n${bodyType} / ${tier} / ${item}; ready=${state.ready}; frames=${state.frames}; error=${state.error ?? "none"}`;
});
window.addEventListener("resize", () => engine.resize());
void (async () => {
  // This is an explicitly supplied scratch artifact, never a renderer/default URL selection.
  const navigationUrl = q.get("nav");
  if (!navigationUrl)
    throw new Error("Supply the isolated scratch navigation URL explicitly");
  const response = await fetch(navigationUrl);
  if (!response.ok) throw new Error("Isolated navigation source unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer()).slice();
  if (bytesToHex(sha256(bytes)) !== profiles.navigationSha256)
    throw new Error("Isolated navigation source mismatch");
  const navigation = await SceneLoader.LoadAssetContainerAsync(
    "",
    bytes,
    scene,
    undefined,
    ".glb",
  );
  navigation.addAllToScene();
  for (const node of navigation.rootNodes) node.parent = parent;
  const { plan, manifest } = await diagnosticOperatorPlan(
    diagnosticOperatorAppearance(bodyType, tier, partial),
    item === "none" ? null : item,
    headSelection,
  );
  const request = await verifyOperatorEnsemblePlan(scene, plan);
  validateDiagnosticHeadSources(request, manifest);
  state.handle = await prepareOperatorEnsemble(
    scene,
    parent,
    request,
    undefined,
    (meshes) => moldedLightRig(scene).include(meshes),
    {
      profileId: profiles.profileId,
      navigationSha256: profiles.navigationSha256,
      associationKey: request.associationKey,
      navigationLocal: Matrix.Identity(),
      acceptedX: 0,
      acceptedY: 0,
      standingElevationM: 0,
    },
  );
  await state.handle.prepareActivation();
  state.handle.activate();
})().catch((error) => {
  state.error =
    error instanceof Error ? error.message : "Isolated preparation failed";
  state.ready = false;
});
