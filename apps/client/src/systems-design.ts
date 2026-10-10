import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { buildSystemsDesign } from "@sidereal/sim/ship-systems-design";
import { createSystemsInspectionUI } from "@sidereal/canvas-ui/systems-design";
import { mountCanvasOverlay } from "@sidereal/canvas-ui/canvas-overlay";
import type { SystemsDesignSource } from "./systems-design-source";
/** Paint controls immediately; the same engine/scene survives the delayed3D module load. */
export function openSystemsDesign(
  source: SystemsDesignSource,
  close: () => void,
  covered?: HTMLCanvasElement,
  reportError?: (message: string) => void,
) {
  const model = buildSystemsDesign(source.doc, source.catalogRevision);
  const host = mountCanvasOverlay(
    "Sidereal systems design. Read-only inspection.",
    covered,
  );
  let disposed = false;
  let renderer:
    | ReturnType<
        typeof import("@sidereal/render/ship-systems-design").createSystemsDesignView
      >
    | undefined;
  let allocatedEngine: Engine | undefined, allocatedScene: Scene | undefined;
  let allocatedUI: ReturnType<typeof createSystemsInspectionUI> | undefined,
    allocatedResize: ResizeObserver | undefined;
  let placeholder: FreeCamera;
  try {
    allocatedEngine = new Engine(host.canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      useHighPrecisionMatrix: true,
    });
    allocatedScene = new Scene(allocatedEngine);
    placeholder = new FreeCamera(
      "systems-pending",
      new Vector3(0, 0, -10),
      allocatedScene,
    );
    allocatedUI = createSystemsInspectionUI(
      host.canvas,
      allocatedScene,
      model,
      source.doc.name,
      {
        close,
        select: (id) => renderer?.select(id),
        channels: (channels) => renderer?.setChannels(channels),
        belowOnly: (below) => renderer?.setBelowOnly(below),
        deck: (deck) => renderer?.setDeck(deck),
        fit: () => renderer?.fit(),
        focus: (id) => renderer?.focus(id),
        viewport: (r, w, h) => renderer?.viewport(r, w, h),
      },
    );
    allocatedResize = new ResizeObserver(() => allocatedEngine?.resize());
    allocatedResize.observe(host.canvas);
    host.canvas.dataset.designSource = model.sourceHash;
  } catch (error) {
    allocatedResize?.disconnect();
    allocatedUI?.dispose();
    allocatedScene?.dispose();
    allocatedEngine?.dispose();
    host.dispose();
    throw error;
  }
  const engine = allocatedEngine,
    scene = allocatedScene,
    ui = allocatedUI,
    resize = allocatedResize;
  const pendingLoop = () => {
    if (!disposed && !document.hidden) scene.render();
  };
  try {
    engine.runRenderLoop(pendingLoop);
  } catch (error) {
    resize.disconnect();
    ui.dispose();
    scene.dispose();
    engine.dispose();
    host.dispose();
    throw error;
  }
  const ready = import("@sidereal/render/ship-systems-design")
    .then((module) => {
      if (disposed) return;
      engine.stopRenderLoop(pendingLoop);
      renderer = module.createSystemsDesignView(
        host.canvas,
        source.doc,
        source.catalogRevision,
        model,
        {
          onSelect: (id) => ui.select(id),
          onStatus: (message) => ui.status(message),
          onError: (error) => ui.error(error),
        },
        { engine, scene },
      );
      placeholder.dispose();
      const state = ui.snapshot();
      renderer.select(state.selected);
      renderer.setChannels(state.channels);
      renderer.setBelowOnly(state.belowOnly);
      renderer.setDeck(state.deck);
      return renderer.ready;
    })
    .catch((error: unknown) => {
      if (!disposed) {
        const message = `3D inspection is unavailable. ${String(error)}`;
        ui.error(message);
        reportError?.(message);
        if (!scene.activeCamera) scene.activeCamera = placeholder;
        engine.runRenderLoop(pendingLoop);
      }
    });
  return {
    ready,
    snapshot: () => ui.snapshot(),
    canvas: host.canvas,
    dispose() {
      if (disposed) return;
      disposed = true;
      resize.disconnect();
      ui.dispose();
      if (renderer) renderer.dispose();
      else {
        engine.stopRenderLoop(pendingLoop);
        scene.dispose();
        engine.dispose();
      }
      host.dispose();
    },
  };
}
