/** Private actual system-menu harness. No database, reducer or auth connection. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { createGameUI, type GameUIActions, type GameUIState } from "../../packages/canvas-ui/src";
import { CanvasUI } from "../../packages/canvas-ui/src/toolkit";
import { createCrewVisual } from "../../packages/render/src/crew";
import type { CrewAppearance } from "../../packages/render/src/crew/appearance";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine); scene.useRightHandedSystem = true; scene.clearColor = new Color4(.022, .038, .067, 1);
const camera = new ArcRotateCamera("private-ui-camera", -Math.PI / 2, 1.35, 5, new Vector3(0, 1.1, 0), scene);
camera.mode = Camera.ORTHOGRAPHIC_CAMERA; camera.orthoTop = 1.2; camera.orthoBottom = -1.2;
camera.orthoLeft = -1.8; camera.orthoRight = 1.8; camera.minZ = .01;
new DirectionalLight("private-key", new Vector3(.4, -.7, .75), scene).intensity = 2.4;
new HemisphericLight("private-fill", Vector3.Up(), scene).intensity = .9;
const pivot = new TransformNode("private-mannequin", scene); pivot.position.x = 1.2; pivot.rotation.y = .38;
let appearance: CrewAppearance = { bodyType: "female", hairStyle: "swept", hair: "#353047", skin: "#edc8ad", equippedComponents: {}, weaponFixture: false };
let crew: Awaited<ReturnType<typeof createCrewVisual>> | undefined;
let ui: CanvasUI | undefined;
const changes: { at: number; appearance: CrewAppearance }[] = [];
// Read-only capture of the real UI instance for hit-coordinate/evidence inspection.
// All draw calls, clipping, scroll, pointer and keyboard handlers remain production code.
const originalPaint = CanvasUI.prototype.paint;
CanvasUI.prototype.paint = function () { if (this.canvas === canvas) ui = this; return originalPaint.call(this); };
const state: GameUIState = { status: "ready", error: "", modelStatus: "Private local appearance preview; no server", hasActor: true, connected: false, actorName: "Preview mannequin", shipName: "Private review", seated: false, nearStation: false, interior: true, receipts: 0, pending: false, vistaId: "private", reducedMotion: true, destinations: [], characterAppearance: appearance };
const inert = () => {};
const actions: GameUIActions = { view: inert, station: inert, enter: inert, rename: inert, vista: inert, motion: inert, camera: inert, focusDestination: inert, dismiss: inert, retry: inert,
  crew: next => { appearance = { ...next }; changes.push({ at: performance.now(), appearance }); crew?.customize(appearance); },
};
const gameUI = createGameUI(canvas, scene, state, actions, [{ id: "private", name: "Private review" }]);
document.querySelector<HTMLInputElement>("#asset")!.onchange = async event => {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
  crew?.dispose(); crew = await createCrewVisual(scene, pivot, new Uint8Array(await file.arrayBuffer()));
  crew.customize(appearance); for (const clip of scene.animationGroups) clip.stop();
  ui?.invalidate();
};
let disposed = false;
function dispose() { if (disposed) return; disposed = true; engine.stopRenderLoop(); crew?.dispose(); gameUI.dispose(); scene.dispose(); engine.dispose(); CanvasUI.prototype.paint = originalPaint; }
document.querySelector<HTMLButtonElement>("#dispose")!.onclick = dispose;
window.addEventListener("pagehide", dispose);
window.addEventListener("resize", () => { engine.resize(); ui?.invalidate(); });
Object.assign(window, { crewControlsReview: { scene, engine, gameUI, get ui() { return ui; }, get appearance() { return appearance; }, changes, get disposed() { return disposed; }, dispose } });
engine.runRenderLoop(() => scene.render());
