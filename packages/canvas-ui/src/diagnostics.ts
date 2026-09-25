import type { RenderDiagnostics } from "../../render/src/diagnostics";
import type { DebugFeature } from "../../render/src/debug-features";
export type { DebugFeature } from "../../render/src/debug-features";
import { CanvasUI, palette } from "./toolkit";
import { WindowStack } from "./windows";
const features: readonly [DebugFeature, string][] = [
  ["lighting", "Lighting"],
  ["equipment", "Equipment"],
  ["shadows", "Shadows"],
  ["glow", "Glow"],
  ["planets", "Planets"],
  ["characters", "Characters"],
  ["globalIllumination", "Global illumination"],
];
const overlays: readonly [DebugFeature, string][] = [
  ["skeleton", "Rig skeleton"],
  ["lightBounds", "Light volumes"],
  ["collision", "Collision"],
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
  let tab: "metrics" | "visuals" = "metrics";
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
          x: Math.max(16, ui.width - 394),
          y: 75,
          w: 376,
          h: 580,
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
      if (controls) {
        for (const [i, value] of (["metrics", "visuals"] as const).entries()) {
          ui.button(
            `diagnostics-tab-${value}`,
            value === "metrics" ? "Performance" : "Visuals / debug",
            {
              x: r.x + 16 + (i * (r.w - 24)) / 2,
              y: r.y + 53,
              w: (r.w - 40) / 2,
              h: 30,
            },
            () => {
              tab = value;
              window.scroll = 0;
              ui.invalidate();
            },
            { selected: tab === value },
          );
        }
      }
      if (!data) {
        ui.text("Renderer starting", r.x + 16, r.y + 99, 15, palette.muted);
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
        [
          "Local light limit",
          data.localLightBudget
            ? String(
                data.localLightBudget.limit === "all"
                  ? "All"
                  : data.localLightBudget.limit,
              )
            : "—",
        ],
        [
          "Local enabled / eligible",
          data.localLightBudget
            ? `${data.localLightBudget.enabledLights} / ${data.localLightBudget.eligibleLights}`
            : "—",
        ],
        [
          "Local shadow lights",
          data.localLightBudget
            ? String(data.localLightBudget.enabledShadowLights)
            : "—",
        ],
        ["Allocated shadow maps", String(data.allocatedShadowMaps ?? "—")],
        ["Transparent meshes", String(data.transparentMeshes ?? "—")],
        ["Render resolution", `${data.renderWidth} × ${data.renderHeight}`],
        ["Hardware scale", data.hardwareScale.toFixed(2)],
        [
          "Scene IBL texture",
          data.environmentTexturePresent === undefined
            ? "—"
            : data.environmentTexturePresent
              ? "Present"
              : "None",
        ],
        [
          "Attached camera passes",
          String(data.cameraPostProcesses?.length ?? "—"),
        ],
        ["Camera pass names", data.cameraPostProcesses?.join(", ") || "None"],
        ["Scene capture", data.sceneCapture?.name ?? "None"],
        ["Renderer", data.renderBackend === "webgpu" ? "WebGPU" : "WebGL"],
        ["Snapshot rendering", !data.snapshotRendering ? "Unavailable" : data.snapshotRendering.enabled
          ? "Enabled" : data.snapshotRendering.armed ? "Preparing" : data.snapshotRendering.reason],
        ["Capture size / MSAA", !data.sceneCapture ? "None" : data.sceneCapture.width === undefined
          ? "Awaiting allocation"
          : `${data.sceneCapture.width} × ${data.sceneCapture.height} / ${data.sceneCapture.samples}×`],
        ["Custom targets", String(data.customRenderTargets ?? "—")],
        [
          "Camera radius / elev",
          data.cameraRadius === undefined ||
          data.cameraElevationDegrees === undefined
            ? "—"
            : `${data.cameraRadius.toFixed(1)} m / ${data.cameraElevationDegrees.toFixed(1)}°`,
        ],
      ];
      const viewport = {
        x: r.x + 16,
        y: r.y + (controls ? 99 : 59),
        w: r.w - 48,
        h: Math.max(24, r.h - (controls ? 121 : 81)),
      };
      const visualLines = [
        "GI: environment, ambient and hemispheric fill.",
        "Emissive / baked surface textures stay visible.",
        "Unbounded lights use source/direction markers.",
        ...(data.debugOverlays?.collisionScopes.length
          ? data.debugOverlays.collisionScopes
          : ["Collision: supplied simulation footprints only."]),
        "Local presentation only · F3 keeps overrides.",
      ];
      const visualHeight =
        343 +
        visualLines.reduce(
          (sum, line) =>
            sum +
            Math.max(
              1,
              Math.ceil(
                line.length / Math.max(20, Math.floor(viewport.w / 5.8)),
              ),
            ) *
              16,
          0,
        );
      window.limit = Math.max(
        0,
        (controls && tab === "visuals" ? visualHeight : rows.length * 30 + 44) -
          viewport.h,
      );
      window.scroll = Math.min(window.scroll, window.limit);
      ui.ctx.save();
      ui.ctx.beginPath();
      ui.ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
      ui.ctx.clip();
      if (controls && tab === "visuals") {
        const width = (viewport.w - 8) / 2;
        const top = viewport.y - window.scroll;
        const drawGroup = (
          entries: readonly [DebugFeature, string][],
          title: string,
          y: number,
          overlay: boolean,
        ) => {
          ui.text(title, viewport.x, y, 11, palette.muted, viewport.w);
          entries.forEach(([key, label], i) => {
            const on = overlay ? enabled[key] === true : enabled[key] !== false;
            const r = {
              x: viewport.x + (i % 2) * (width + 8),
              y: y + 22 + Math.floor(i / 2) * 34,
              w:
                i === entries.length - 1 && entries.length % 2
                  ? viewport.w
                  : width,
              h: 28,
            };
            // Canvas clipping does not clip hit regions. Register only controls
            // fully within the scroll viewport, including on compact screens.
            if (r.y < viewport.y || r.y + r.h > viewport.y + viewport.h) return;
            ui.button(
              `diagnostics-${key}`,
              `${label}: ${on ? "On" : "Off"}`,
              r,
              () => {
                controls.toggle?.(key);
                remember(sample?.(true));
                ui.invalidate();
              },
              { disabled: !controls.toggle, accent: overlay ? on : !on },
            );
          });
        };
        drawGroup(features, "RENDER FEATURES", top, false);
        drawGroup(overlays, "DEBUG OVERLAYS", top + 165, true);
        const reset = { x: viewport.x, y: top + 269, w: viewport.w, h: 28 };
        if (
          reset.y >= viewport.y &&
          reset.y + reset.h <= viewport.y + viewport.h
        )
          ui.button(
            "diagnostics-reset",
            "Reset visuals",
            reset,
            () => {
              controls.reset?.();
              remember(sample?.(true));
              ui.invalidate();
            },
            {
              disabled:
                !controls.reset ||
                (disabled().length === 0 &&
                  !overlays.some(([key]) => enabled[key] === true)),
            },
          );
        let y = top + 310;
        for (const line of visualLines) {
          const count = Math.max(20, Math.floor(viewport.w / 5.8));
          const words = line.split(" ");
          let current = "";
          for (const word of words) {
            if (current && (current + " " + word).length > count) {
              ui.text(current, viewport.x, y, 10, palette.muted, viewport.w);
              y += 16;
              current = "";
            }
            current += (current ? " " : "") + word;
          }
          if (current) {
            ui.text(current, viewport.x, y, 10, palette.muted, viewport.w);
            y += 16;
          }
        }
      } else {
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
      }
      ui.ctx.restore();
      if (window.limit) {
        const x = r.x + r.w - 23;
        ui.button(
          "diagnostics-up",
          "↑",
          { x, y: viewport.y, w: 18, h: 23 },
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
