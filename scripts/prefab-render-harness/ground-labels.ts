/** Production projection and canvas kit; synthetic drops, no account or reducers. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { createGroundItems } from "@sidereal/render/ground-items";
import { CanvasUI } from "../../packages/canvas-ui/src/toolkit";
import {
  drawGroundLoot,
  groundLootRevision,
} from "../../packages/canvas-ui/src/ground-loot";
import "@babylonjs/loaders/glTF";
import "@fontsource/barlow/400.css";
const canvas = document.createElement("canvas");
canvas.style.cssText =
  "position:fixed;inset:0;width:100%;height:100%;display:block";
canvas.tabIndex = 0;
document.body.append(canvas);
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
const camera = new ArcRotateCamera(
  "fixture",
  0.8,
  0.8,
  9,
  Vector3.Zero(),
  scene,
);
new HemisphericLight("fixture", new Vector3(0, 1, 0), scene);
const ship = new TransformNode("fixture-ship", scene);
const deck = MeshBuilder.CreateBox(
  "fixture-deck",
  { width: 8, height: 0.12, depth: 8 },
  scene,
);
deck.parent = ship;
const items = createGroundItems(scene, ship);
let rows = [
  { id: "a", definitionId: "scanner", localX: 0, localY: 0, reachable: true },
  {
    id: "b",
    definitionId: "power-cell",
    localX: 0.1,
    localY: 0.1,
    reachable: true,
  },
  {
    id: "c",
    definitionId: "flashlight",
    localX: 0.3,
    localY: 0.1,
    reachable: false,
  },
];
items.update(rows, true);
const ui = new CanvasUI(canvas, scene);
ui.frameRevision = () => groundLootRevision(items.labels());
let frames = 0,
  paints = 0;
let last: ReturnType<typeof items.labels> = [];
ui.draw = () => {
  paints++;
  last = items.labels();
  drawGroundLoot(
    ui,
    last,
    (id) => {
      rows = rows.filter((r) => r.id !== id);
      items.update(rows, true);
    },
    false,
  );
  ui.text(
    "OFFLINE · production ground projection / canvas kit",
    16,
    16,
    16,
    "#47dfff",
  );
};
const samples: {
  frame: number;
  painted: boolean;
  anchorError: number;
  labels: unknown;
}[] = [];
const step = (rotate = true, walk = true) => {
  const before = paints;
  if (rotate) camera.alpha += 0.012;
  if (walk) camera.target.x += 0.01;
  frames++;
  engine.beginFrame();
  scene.render();
  engine.endFrame();
  const viewport = camera.viewport.toGlobal(
    canvas.clientWidth,
    canvas.clientHeight,
  );
  const expected = Vector3.Project(
    new Vector3(0, 0.91, 0),
    ship.computeWorldMatrix(true),
    scene.getTransformMatrix(),
    viewport,
  );
  const first = last.find((r) => r.id === "a");
  const anchorError = first
    ? Math.hypot(first.x - expected.x, first.y - expected.y)
    : 0;
  const sample = {
    frame: frames,
    painted: paints !== before,
    anchorError,
    labels: ui.hits
      .filter((h) => h.id.startsWith("ground-pickup"))
      .map((h) => ({ id: h.id, rect: h.rect, disabled: h.disabled })),
  };
  samples.push(sample);
  return sample;
};
const fixture = {
  engine,
  scene,
  camera,
  ui,
  items,
  step,
  async probe(count = 90, rotate = true, walk = true) {
    samples.length = 0;
    for (let i = 0; i < count; i++) {
      step(rotate, walk);
      await new Promise((r) => setTimeout(r, 16));
    }
    return {
      frames: count,
      paints: samples.filter((s) => s.painted).length,
      maximumAnchorError: Math.max(...samples.map((s) => s.anchorError)),
      samples: [...samples],
    };
  },
  stop() {
    items.dispose();
    ui.dispose();
    scene.dispose();
    engine.dispose();
  },
};
Object.assign(globalThis, { groundLabelFixture: fixture });
engine.resize();
step(false, false);
window.addEventListener("resize", () => {
  engine.resize();
  step(false, false);
});
