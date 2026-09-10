import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { createRenderDiagnostics } from "../../render/src/diagnostics";
import { setMeshRole } from "../../render/src/mesh-roles";
import { createDiagnosticsUI } from "./diagnostics";
import type { CanvasUI } from "./toolkit";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PassPostProcess } from "@babylonjs/core/PostProcesses/passPostProcess";

test("F3 presents role counts and keeps the full inventory scrollable", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    diagnostics = createRenderDiagnostics(scene);
  setMeshRole(CreateBox("no-name-classification", {}, scene), "floor");
  const camera = new FreeCamera("camera", Vector3.Zero(), scene);
  const capture = new PassPostProcess("capture", 1, camera);
  capture.activate(camera);
  diagnostics.read(true);
  scene.onAfterRenderObservable.notifyObservers(scene);
  const text = vi.fn();
  let close = () => {};
  const ui = {
    width: 900,
    height: 900,
    ctx: new Proxy({}, { get: () => () => {} }),
    text,
    invalidate: vi.fn(),
    button: vi.fn(),
    windowFrame: (
      _id: unknown,
      _title: unknown,
      _r: unknown,
      _focused: unknown,
      _drag: unknown,
      onClose: () => void,
    ) => {
      close = onClose;
    },
  } as unknown as CanvasUI;
  const panel = createDiagnosticsUI(ui, () => diagnostics.read(true));
  try {
    panel.toggle();
    panel.draw();
    expect(text.mock.calls.some(c => c[0] === "Capture size / MSAA")).toBe(true);
    expect(text.mock.calls.some(c => c[0] === `${capture.inputTexture.width} × ${capture.inputTexture.height} / ${capture.inputTexture.samples}×`)).toBe(true);
    expect(text.mock.calls.some((c) => c[0] === "Meshes by role")).toBe(true);
    expect(text.mock.calls.some((c) => c[0] === "floor")).toBe(true);
    expect(text.mock.calls.some((c) => c[0] === "0 / 1")).toBe(true);
    expect(panel.scroll(1000)).toBe(true);
    panel.draw();
  } finally {
    close();
    diagnostics.dispose();
    scene.dispose();
    engine.dispose();
  }
});
