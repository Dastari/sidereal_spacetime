/** Private native profile review; no gameplay write, account access or public art delivery. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import {
  WAYFARER_ACCESS_SOURCE,
  WAYFARER_ACCESS_PHYSICAL,
} from "@sidereal/content/wayfarer-access-profile";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { loadPrefabShipPresentation } from "../../packages/render/src/prefab-ship-presentation";

const fixture = window as unknown as {
  __wayfarerAccessBytes: Record<string, string>;
  __wayfarerAccessDocument?: string;
};
const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const status = document.querySelector<HTMLElement>("#status")!;
const review: {
  ready: boolean;
  error?: string;
  scene?: Scene;
  view?: Awaited<ReturnType<typeof loadPrefabShipPresentation>>;
  applyReceipt?: (receipt: {
    label: string;
    states: {
      deviceId: string;
      open: boolean;
      locked: boolean;
      state: string;
    }[];
  }) => void;
} = { ready: false };
Object.assign(window, { __wayfarerAccess: review });
async function main() {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new Scene(engine);
  review.scene = scene;
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.009, 0.016, 0.033, 1);
  const camera = new ArcRotateCamera(
    "candidate-camera",
    -0.8,
    1,
    32,
    new Vector3(0, 1, 1.5),
    scene,
  );
  camera.position = new Vector3(-23, 18, -26);
  camera.setTarget(new Vector3(0, 1, 1.5));
  camera.minZ = 0.05;
  camera.attachControl(canvas, true);
  const key = new DirectionalLight("key", new Vector3(0.5, -1, 0.4), scene);
  key.intensity = 2.1;
  const fill = new HemisphericLight("fill", new Vector3(0, 1, 0), scene);
  fill.intensity = 0.45;
  const root = new TransformNode("private-native-ship", scene);
  const document =
    fixture.__wayfarerAccessDocument ??
    JSON.stringify({
      prefab: {
        document: WAYFARER_ACCESS_SOURCE,
        catalog: defaultPrefabComponentCatalog().revision,
      },
    });
  const view = await loadPrefabShipPresentation(
    scene,
    root,
    document,
    undefined,
    undefined,
    async (piece) => {
      const pin = WAYFARER_ACCESS_PHYSICAL.pieces.find(
        (p) => p.id === piece.id && p.sha256 === piece.sha256,
      );
      if (!pin) throw Error("Unknown physical review byte pin");
      const encoded = fixture.__wayfarerAccessBytes[piece.sha256];
      if (!encoded)
        throw Error("Missing explicit private physical review bytes");
      return Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    },
  );
  if (!view) throw Error("Missing normal prefab presentation");
  review.view = view;
  review.applyReceipt = (receipt) => {
    const states = new Map(receipt.states.map((s) => [s.deviceId, s]));
    const logic = new Map(
      WAYFARER_ACCESS_SOURCE.logic!.devices.filter(
        (d) => d.kind === "door",
      ).map((d) => [
        d.door!,
        states.get(d.id)?.open === true && !states.get(d.id)?.locked,
      ]),
    );
    view.updateDoors({ logic, dt: 1, nowMs: performance.now(), actors: [] });
    const lights = new Map(
      receipt.states
        .filter((s) => s.deviceId.endsWith("button"))
        .map((s) => [s.deviceId, { light: s.state, pressedMicros: 0 }]),
    );
    view.updatePanels(lights, performance.now());
    status.textContent = receipt.label;
    scene.render();
  };
  view.setInterior(true);
  review.ready = true;
  status.textContent =
    "Private physical candidate: waiting for isolated server state receipt";
  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}
main().catch((error) => {
  review.error = String(error);
  status.textContent = review.error;
  console.error(error);
});
