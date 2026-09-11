import type { RenderDiagnostics } from "../../render/src/diagnostics";
import { CanvasUI, palette } from "./toolkit";
import { WindowStack } from "./windows";
export type DebugFeature =
  "lighting" | "equipment" | "shadows" | "glow" | "planets" | "characters";
const features: readonly [DebugFeature, string][] = [
  ["lighting", "Lighting"],
  ["equipment", "Equipment"],
  ["shadows", "Shadows"],
  ["glow", "Glow"],
  ["planets", "Planets"],
  ["characters", "Characters"],
];

/** Debug instrumentation is requested only while the movable F3 window is open. */
export function createDiagnosticsUI(
  ui: CanvasUI,
  sample?: (enabled: boolean) => RenderDiagnostics | undefined,
  controls?: { toggle?: (key: DebugFeature) => void; reset?: () => void },
) {
  const stack = new WindowStack();
  let refresh: ReturnType<typeof setInterval> | undefined;
  let enabled: Partial<Record<DebugFeature, boolean>> = {};
  const remember = (data: RenderDiagnostics | undefined) => {
    if (data?.debugFeatures) enabled = { ...data.debugFeatures };
  };
  const disabled = () =>
    features
      .filter(([key]) => enabled[key] === false)
      .map(([, label]) => label.toLowerCase());
  const close = () => {
    stack.close("diagnostics");
    if (refresh !== undefined) clearInterval(refresh);
    refresh = undefined;
    sample?.(false);
    ui.invalidate();
  };
  return {
    disabled,
    toggle() {
      if (stack.windows.length) close();
      else {
        refresh = setInterval(() => ui.invalidate(), 500);
        stack.open("diagnostics", {
          x: Math.max(16, ui.width - 344),
          y: 75,
          w: 326,
          h: 520,
        });
        ui.invalidate();
      }
    },
    scroll(delta: number, x?: number, y?: number) {
      const window =
        x !== undefined && y !== undefined ? stack.at(x, y) : stack.windows[0];
      if (!window) return false;
      window.scroll = Math.max(
        0,
        Math.min(window.limit, window.scroll + delta),
      );
      ui.invalidate();
      return true;
    },
    draw() {
      const window = stack.windows[0];
      if (!window) return;
      stack.clamp(ui.width, ui.height);
      const r = window.rect;
      const data = sample?.(true);
      remember(data);
      ui.windowFrame(
        "diagnostics",
        "PERFORMANCE / F3",
        r,
        true,
        (dx, dy) => {
          stack.move("diagnostics", dx, dy, ui.width, ui.height);
          ui.invalidate();
        },
        close,
      );
      const controlsHeight = controls ? 187 : 0;
      if (controls) {
        const top = r.y + r.h - controlsHeight;
        const gap = 8,
          width = (r.w - 32 - gap) / 2;
        ui.text(
          "LOCAL VISUAL COMPARISON",
          r.x + 16,
          top,
          11,
          palette.muted,
          r.w - 32,
        );
        for (const [i, [key, label]] of features.entries()) {
          ui.button(
            `diagnostics-${key}`,
            `${label}: ${enabled[key] === false ? "Off" : "On"}`,
            {
              x: r.x + 16 + (i % 2) * (width + gap),
              y: top + 23 + Math.floor(i / 2) * 34,
              w: width,
              h: 28,
            },
            () => {
              controls.toggle?.(key);
              remember(sample?.(true));
              ui.invalidate();
            },
            {
              disabled: !data || !controls.toggle,
              accent: enabled[key] === false,
            },
          );
        }
        ui.button(
          "diagnostics-reset",
          "Reset visuals",
          { x: r.x + 16, y: top + 128, w: r.w - 32, h: 28 },
          () => {
            controls.reset?.();
            remember(sample?.(true));
            ui.invalidate();
          },
          { disabled: !data || !controls.reset || disabled().length === 0 },
        );
        ui.text(
          "Local presentation only · F3 keeps overrides",
          r.x + 16,
          top + 163,
          10,
          palette.muted,
          r.w - 32,
        );
      }
      if (!data) {
        ui.text("Renderer starting", r.x + 16, r.y + 61, 15, palette.muted);
        return;
      }
      const rows: [string, string][] = [
        ["Frame rate", `${data.fps.toFixed(1)} fps`],
        ["Frame interval", `${data.frameMs.toFixed(2)} ms`],
        [
          "Frame CPU",
          data.frameCpuMs === undefined
            ? "—"
            : `${data.frameCpuMs.toFixed(2)} ms`,
        ],
        [
          "Update CPU",
          data.updateCpuMs === undefined
            ? "—"
            : `${data.updateCpuMs.toFixed(2)} ms`,
        ],
        ["Render CPU", `${data.renderCpuMs.toFixed(2)} ms`],
        [
          "GPU frame",
          data.gpuFrameMs === undefined
            ? "Unavailable"
            : `${data.gpuFrameMs.toFixed(2)} ms`,
        ],
        ["Draw calls", String(data.drawCalls)],
        ["Last planet build", data.planetBuild?.lastBuildMs === undefined ? "—" : `${data.planetBuild.lastBuildMs.toFixed(2)} ms`],
        ["Pending planet builds", String(data.planetBuild?.pendingBuilds ?? 0)],
        ["Active / total meshes", `${data.activeMeshes} / ${data.totalMeshes}`],
        ["Meshes by role", "Active / total"],
        ...Object.entries(data.meshesByRole ?? {}).filter(([, count]) => count.total > 0).map(([role, count]): [string, string] => [role, `${count.active} / ${count.total}`]),
        ["Active indices", data.activeIndices.toLocaleString()],
        ["Materials / textures", `${data.materials} / ${data.textures}`],
        ["Lit lights / eligible maps", `${data.lights} / ${data.shadowMaps}`],
        ["Local light limit", data.localLightBudget ? String(data.localLightBudget.limit === 'all' ? 'All' : data.localLightBudget.limit) : "—"],
        ["Local enabled / eligible", data.localLightBudget ? `${data.localLightBudget.enabledLights} / ${data.localLightBudget.eligibleLights}` : "—"],
        ["Local shadow lights", data.localLightBudget ? String(data.localLightBudget.enabledShadowLights) : "—"],
        ["Allocated shadow maps", String(data.allocatedShadowMaps ?? "—")],
        ["Transparent meshes", String(data.transparentMeshes ?? "—")],
        ["Render resolution", `${data.renderWidth} × ${data.renderHeight}`],
        ["Hardware scale", data.hardwareScale.toFixed(2)],
        ["Scene IBL texture", data.environmentTexturePresent === undefined ? "—" : data.environmentTexturePresent ? "Present" : "None"],
        ["Attached camera passes", String(data.cameraPostProcesses?.length ?? "—")],
        ["Camera pass names", data.cameraPostProcesses?.join(", ") || "None"],
        ["Scene capture", data.sceneCapture?.name ?? "None"],
        ["Renderer", data.renderBackend === "webgpu" ? "WebGPU" : "WebGL"],
        ["Snapshot rendering", !data.snapshotRendering ? "Unavailable" : data.snapshotRendering.enabled
          ? "Enabled" : data.snapshotRendering.armed ? "Preparing" : data.snapshotRendering.reason],
        ["Capture size / MSAA", !data.sceneCapture ? "None" : data.sceneCapture.width === undefined
          ? "Awaiting allocation"
          : `${data.sceneCapture.width} × ${data.sceneCapture.height} / ${data.sceneCapture.samples}×`],
        ["Custom targets", String(data.customRenderTargets ?? "—")],
        ["Camera radius / elev", data.cameraRadius === undefined || data.cameraElevationDegrees === undefined ? "—" : `${data.cameraRadius.toFixed(1)} m / ${data.cameraElevationDegrees.toFixed(1)}°`],
      ];
      const viewport = {
        x: r.x + 16,
        y: r.y + 59,
        w: r.w - 32,
        h: Math.max(24, r.h - 77 - controlsHeight),
      };
      window.limit = Math.max(0, rows.length * 30 + 44 - viewport.h);
      window.scroll = Math.min(window.scroll, window.limit);
      ui.ctx.save();
      ui.ctx.beginPath();
      ui.ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
      ui.ctx.clip();
      rows.forEach(([label, value], i) => {
        const y = viewport.y + i * 30 - window.scroll;
        ui.text(label, viewport.x, y, 13, palette.muted, viewport.w * 0.56);
        ui.text(
          value,
          viewport.x + viewport.w * 0.57,
          y,
          14,
          i === 0 ? palette.blue : palette.text,
          viewport.w * 0.43,
        );
      });
      ui.text(
        "Measured locally · updated twice per second",
        viewport.x,
        viewport.y + rows.length * 30 + 14 - window.scroll,
        11,
        palette.muted,
        viewport.w,
      );
      ui.ctx.restore();
      if (window.limit) {
        const x = r.x + r.w - 23;
        ui.button(
          "diagnostics-up",
          "↑",
          { x, y: r.y + 52, w: 18, h: 23 },
          () => {
            window.scroll = Math.max(0, window.scroll - 90);
            ui.invalidate();
          },
        );
        ui.button(
          "diagnostics-down",
          "↓",
          { x, y: viewport.y + viewport.h - 23, w: 18, h: 23 },
          () => {
            window.scroll = Math.min(window.limit, window.scroll + 90);
            ui.invalidate();
          },
        );
      }
    },
    dispose: close,
  };
}
