/** Actual production canvas inspection. No React, database, auth or alternate controls. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CanvasUI } from "../../packages/canvas-ui/src/toolkit";
import { openSystemsDesign } from "../../apps/client/src/systems-design";
import { HULL_ACCESS_SOURCE } from "@sidereal/content/hull-access-profile";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow-condensed/600.css";
const canvas = document.createElement("canvas");
canvas.style.cssText =
  "position:fixed;inset:0;width:100%;height:100%;display:block";
canvas.tabIndex = 0;
document.body.appendChild(canvas);
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
new FreeCamera("reference", new Vector3(0, 0, -10), scene);
const ui = new CanvasUI(canvas, scene);
let inspection: ReturnType<typeof openSystemsDesign> | undefined;
const close = () => {
  inspection?.dispose();
  inspection = undefined;
  ui.invalidate();
};
const open = () => {
  if (!inspection)
    inspection = openSystemsDesign(
      { doc: HULL_ACCESS_SOURCE, catalogRevision: "ship-components-v1@4" },
      close,
      canvas,
    );
};
ui.draw = () => {
  const r = { x: 24, y: 24, w: Math.min(480, ui.width - 48), h: 200 };
  ui.windowFrame(
    "reference",
    "In-game canvas kit",
    r,
    true,
    () => {},
    () => {},
  );
  ui.text("Actual shared painter · Offline fixture", 40, 84, 16);
  ui.button(
    "open",
    "Open systems design",
    { x: 40, y: 122, w: r.w - 32, h: 40 },
    open,
    { selected: true },
  );
};
ui.escape = () => {};
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
Object.assign(window, {
  __systemsFixture: {
    open,
    close,
    snapshot: () => inspection?.snapshot(),
    capture: () => inspection?.canvas.toDataURL("image/png"),
    stats: () => ({
      engines: EngineStore.Instances.length,
      canvases: document.querySelectorAll("canvas").length,
      domWidgets: document.querySelectorAll("button,input,select,[role=dialog]")
        .length,
      baseInert: canvas.inert,
      activeRoutes: EngineStore.Instances.flatMap((e) =>
        e.scenes.flatMap((s) =>
          s.meshes
            .filter((m) => m.name.startsWith("service:") && m.isEnabled())
            .map((m) => m.name),
        ),
      ),
      equipmentModels: new Set(
        EngineStore.Instances.flatMap((e) =>
          e.scenes.flatMap((s) =>
            s.meshes
              .filter(
                (m) => m.metadata?.componentId && !m.name.startsWith("port:"),
              )
              .map((m) => m.metadata.componentId),
          ),
        ),
      ).size,
    }),
  },
});
open();
