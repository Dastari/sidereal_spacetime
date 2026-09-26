/**
 * 3D preview of the edited prefab. Owns one Babylon engine and right-handed scene; the ship
 * itself comes from `@sidereal/render/prefab-ship` (loaded on demand). Edits are debounced
 * into `update(doc)`; the preview never writes the document.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { PrefabComponentCatalog, ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { prefabStats } from "@sidereal/content/ship-prefab";
import { useEffect, useRef, useState } from "react";
import { mountEditorCanvas } from "../../editor/mountEditorCanvas";

type Doc = ShipPrefabDocumentV1;
type ShipViewModule = typeof import("@sidereal/render/prefab-ship");
type ShipView = Awaited<ReturnType<ShipViewModule["createPrefabShipView"]>>;
export type PreviewMode = "flight" | "deck";

async function loadShipView(): Promise<ShipViewModule> {
  return import("@sidereal/render/prefab-ship");
}

export default function PreviewPanel({ doc, catalog, mode, onMode }: { doc: Doc; catalog: PrefabComponentCatalog; mode: PreviewMode; onMode: (m: PreviewMode) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Starting the 3D preview");
  const [failed, setFailed] = useState(false);
  const [metrics, setMetrics] = useState("");
  const ctx = useRef<{ scene: Scene; camera: ArcRotateCamera; view: ShipView | null; busy: Promise<void>; disposed: boolean } | null>(null);
  const latest = useRef(doc);
  latest.current = doc;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const canvas = mountEditorCanvas(el, "3D prefab ship preview");
    let engine: Engine;
    try {
      engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    } catch (e) {
      setFailed(true);
      setStatus(`WebGL is unavailable here: ${String(e instanceof Error ? e.message : e)}`);
      canvas.remove();
      return;
    }
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0.03, 0.07, 0.1, 1);
    const camera = new ArcRotateCamera("prefab-preview-camera", -Math.PI / 3, Math.PI / 3.2, 40, Vector3.Zero(), scene);
    camera.minZ = 0.05;
    camera.maxZ = 2000;
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 400;
    camera.wheelDeltaPercentage = 0.01;
    camera.attachControl(canvas, true);
    new HemisphericLight("prefab-fill", new Vector3(0.2, 1, 0.1), scene).intensity = 0.9;
    new DirectionalLight("prefab-key", new Vector3(-0.5, -1, 0.35), scene).intensity = 2.2;
    const state = { scene, camera, view: null as ShipView | null, busy: Promise.resolve(), disposed: false };
    ctx.current = state;
    engine.runRenderLoop(() => scene.render());
    const resize = new ResizeObserver(() => engine.resize());
    resize.observe(el);
    const frame = (d: Doc) => {
      const s = prefabStats(d, catalog);
      camera.radius = Math.max(8, Math.max(s.lengthM, s.beamM) * 1.35);
    };
    setStatus("Loading the ship view and kit");
    loadShipView()
      .then(async (mod) => {
        if (state.disposed) return;
        const view = await mod.createPrefabShipView(scene, latest.current, { catalog, view: mode });
        if (state.disposed) return view.dispose();
        state.view = view;
        frame(latest.current);
        setStatus("");
        setMetrics(describe(view));
      })
      .catch((e) => {
        if (state.disposed) return;
        setFailed(true);
        setStatus(`The 3D ship view is not available yet: ${String(e instanceof Error ? e.message : e)}`);
      });
    return () => {
      state.disposed = true;
      resize.disconnect();
      state.view?.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
      canvas.remove();
      ctx.current = null;
    };
    // One engine per mounted panel; document and view changes go through update/setView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  // Debounced document updates, serialised so rebuilds never overlap.
  useEffect(() => {
    const c = ctx.current;
    if (!c?.view) return;
    const t = window.setTimeout(() => {
      c.busy = c.busy
        .then(async () => {
          if (c.disposed || !c.view) return;
          setStatus("Rebuilding");
          await c.view.update(latest.current);
          setStatus("");
          setMetrics(describe(c.view));
        })
        .catch((e) => setStatus(`Preview update failed: ${String(e instanceof Error ? e.message : e)}`));
    }, 250);
    return () => window.clearTimeout(t);
  }, [doc]);

  useEffect(() => {
    const c = ctx.current;
    if (!c?.view) return;
    c.view.setView(mode);
    setMetrics(describe(c.view));
  }, [mode]);

  return (
    <section className="prefab-preview" aria-label="3D preview">
      <header>
        <strong>3D preview</strong>
        <div className="pf-segmented" role="radiogroup" aria-label="Preview view">
          {(["flight", "deck"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => onMode(m)}>
              {m === "flight" ? "Flight" : "Deck"}
            </button>
          ))}
        </div>
        <span className="pf-preview-metrics">{metrics}</span>
      </header>
      <div className="prefab-preview-canvas" ref={host}>
        {status && (
          <p className={`prefab-preview-status${failed ? " failed" : ""}`} role="status">
            {status}
          </p>
        )}
      </div>
    </section>
  );
}

function describe(view: ShipView): string {
  try {
    const m = view.metrics();
    return `${m.meshes} meshes · ${m.instances} instances · ${(m.triangles / 1000).toFixed(0)}k triangles · ${m.componentGlbs} GLB / ${m.componentStandins} stand-in parts`;
  } catch {
    return "";
  }
}
