import { CanvasUI, palette } from "./toolkit";
import { WindowStack } from "./windows";
import type { Rect } from "./layout";

export interface ObjectPlacementState {
  pending: boolean;
  snap: boolean;
  wall: boolean;
  issue: string;
  error: string;
}
export function placementActionRows(state: ObjectPlacementState) {
  const enabled = !state.pending;
  const editable = enabled && !state.error;
  const rows = [];
  if (!state.wall)
    rows.push([
      { id: "placement-left", label: "Rotate left", enabled: editable },
      { id: "placement-right", label: "Rotate right", enabled: editable },
    ]);
  rows.push([
    {
      id: "placement-snap",
      label: `Snapping: ${state.snap ? "on" : "off"}`,
      enabled: editable,
    },
  ]);
  rows.push([
    {
      id: "placement-place",
      label: state.pending ? "Placing…" : "Place",
      enabled: editable && !state.issue,
    },
    { id: "placement-cancel", label: "Cancel", enabled },
  ]);
  if (state.error)
    rows.push([
      { id: "placement-retry", label: "Retry same", enabled },
      { id: "placement-reset", label: "Use current", enabled },
    ]);
  return rows;
}
export interface ObjectDetailsState {
  placement?: ObjectPlacementState;
  placementId: string;
  name: string;
  image?: string;
  /** Measured bounds (metres) drawn as a schematic when there is no rendered image. */
  schematic?: { widthM: number; depthM: number; heightM: number };
  category: string;
  stats: readonly { label: string; value: string }[];
  distance?: number;
  reachable?: boolean;
  status?: string;
  actions: readonly { id: string; label: string; enabled: boolean }[];
}
export interface ObjectDetailsActions {
  action(actionId: string): void;
  close(): void;
}
export function objectActionEnabled(
  state: ObjectDetailsState,
  actionId: string,
  pending = false,
) {
  return (
    !pending &&
    state.reachable !== false &&
    state.actions.some((action) => action.id === actionId && action.enabled)
  );
}
/** Shared layout leaves interaction controls visible while long inspection data scroll. */
export function objectDetailsLayout(
  r: Rect,
  stats: number,
  actions: number,
  placementFooter?: number,
) {
  const footer = Math.min(
    placementFooter ?? Math.max(46, 74 + actions * 38),
    Math.max(46, r.h - (placementFooter ? 65 : 110)),
  );
  const viewport = {
    x: r.x + 16,
    y: r.y + 55,
    w: Math.max(1, r.w - 40),
    h: Math.max(1, r.h - 65 - footer),
  };
  const imageHeight = Math.min(158, Math.max(84, r.h * 0.29));
  const contentHeight = imageHeight + 50 + stats * 29;
  return {
    viewport,
    imageHeight,
    contentHeight,
    footerY: r.y + r.h - footer,
    footer,
  };
}

/** One nonmodal canvas window. All displayed state and actions come from the caller. */
export function createObjectDetailsUI(
  ui: CanvasUI,
  actions: ObjectDetailsActions,
) {
  const stack = new WindowStack(),
    images = new Map<string, HTMLImageElement>(),
    failedImages = new Set<string>();
  let selectedId = "",
    dismissedId = "",
    current: ObjectDetailsState | undefined,
    pending = false,
    disposed = false;
  const invalidate = () => ui.invalidate();
  function close() {
    if (current?.placement?.pending) return;
    dismissedId = selectedId;
    stack.close("object-details");
    actions.close();
    invalidate();
  }
  function bitmap(url: string) {
    let image = images.get(url);
    if (!image) {
      image = new Image();
      image.decoding = "async";
      image.onload = invalidate;
      image.onerror = () => {
        failedImages.add(url);
        invalidate();
      };
      image.src = url;
      images.set(url, image);
    }
    return image.complete && image.naturalWidth ? image : undefined;
  }
  return {
    isOpen: () => stack.windows.length > 0,
    close,
    scroll(delta: number, x?: number, y?: number) {
      const window =
        x !== undefined && y !== undefined ? stack.at(x, y) : undefined;
      if (!window) return false;
      window.scroll = Math.max(
        0,
        Math.min(window.limit, window.scroll + delta),
      );
      invalidate();
      return true;
    },
    draw(state: ObjectDetailsState | undefined, busy = false) {
      if (disposed) return;
      current = state;
      pending = busy;
      if (!state) {
        stack.close("object-details");
        selectedId = "";
        dismissedId = "";
        return;
      }
      if (state.placementId !== selectedId) {
        selectedId = state.placementId;
        dismissedId = "";
        stack.open("object-details", {
          x: Math.max(18, ui.width - 346),
          y: 82,
          w: 326,
          h: 494,
        });
        stack.windows[0].scroll = 0;
      }
      if (dismissedId === selectedId) return;
      const window = stack.windows[0];
      if (!window) return;
      stack.clamp(ui.width, ui.height);
      const r = window.rect;
      ui.windowFrame(
        "object-details",
        state.name,
        r,
        true,
        (dx, dy) => {
          stack.move("object-details", dx, dy, ui.width, ui.height);
          invalidate();
        },
        close,
      );
      const placementRows = state.placement
        ? placementActionRows(state.placement)
        : undefined;
      const layout = objectDetailsLayout(
          r,
          state.stats.length,
          placementRows
            ? placementRows.length +
                (state.placement!.issue || state.placement!.error ? 2 : 1)
            : state.actions.length,
          placementRows
            ? 73 +
                placementRows.length * 34 +
                (state.placement!.issue || state.placement!.error ? 40 : 0)
            : undefined,
        ),
        v = layout.viewport,
        c = ui.ctx;
      window.limit = Math.max(0, layout.contentHeight - v.h);
      window.scroll = Math.min(window.scroll, window.limit);
      c.save();
      c.beginPath();
      c.rect(v.x, v.y, v.w, v.h);
      c.clip();
      const y = v.y - window.scroll;
      c.fillStyle = palette.well;
      c.fillRect(v.x, y, v.w, layout.imageHeight);
      c.strokeStyle = "#6bdcff80";
      c.lineWidth = 1;
      c.strokeRect(v.x + 0.5, y + 0.5, v.w - 1, layout.imageHeight - 1);
      const image = state.image ? bitmap(state.image) : undefined;
      if (image) {
        const scale = Math.min(
          (v.w - 24) / image.naturalWidth,
          (layout.imageHeight - 18) / image.naturalHeight,
        );
        const w = image.naturalWidth * scale,
          h = image.naturalHeight * scale;
        c.drawImage(
          image,
          v.x + (v.w - w) / 2,
          y + (layout.imageHeight - h) / 2,
          w,
          h,
        );
      } else if (state.image && !failedImages.has(state.image))
        ui.text(
          "Loading preview",
          v.x + 12,
          y + layout.imageHeight / 2 - 8,
          13,
          palette.muted,
          v.w - 24,
        );
      else if (state.schematic)
        drawSchematic(
          ui,
          { x: v.x, y, w: v.w, h: layout.imageHeight },
          state.schematic,
        );
      else
        ui.text(
          "Preview unavailable",
          v.x + 12,
          y + layout.imageHeight / 2 - 8,
          13,
          palette.muted,
          v.w - 24,
        );
      ui.text(
        state.category,
        v.x,
        y + layout.imageHeight + 12,
        14,
        palette.blue,
        v.w,
      );
      state.stats.forEach((row, i) => {
        const top = y + layout.imageHeight + 43 + i * 29;
        ui.text(row.label, v.x, top, 13, palette.muted, v.w * 0.48);
        ui.text(row.value, v.x + v.w * 0.5, top, 14, palette.text, v.w * 0.5);
      });
      c.restore();
      if (window.limit) {
        const track = { x: r.x + r.w - 17, y: v.y, w: 3, h: v.h };
        c.fillStyle = "#173554";
        c.fillRect(track.x, track.y, track.w, track.h);
        const thumb = Math.max(18, (track.h * v.h) / layout.contentHeight);
        c.fillStyle = palette.blue;
        c.fillRect(
          track.x,
          track.y + ((track.h - thumb) * window.scroll) / window.limit,
          track.w,
          thumb,
        );
        ui.button(
          "object-details-up",
          "↑",
          { x: r.x + r.w - 27, y: v.y, w: 20, h: 22 },
          () => {
            window.scroll = Math.max(0, window.scroll - 90);
            invalidate();
          },
        );
        ui.button(
          "object-details-down",
          "↓",
          { x: r.x + r.w - 27, y: v.y + v.h - 22, w: 20, h: 22 },
          () => {
            window.scroll = Math.min(window.limit, window.scroll + 90);
            invalidate();
          },
        );
      }
      c.strokeStyle = "#277fbd80";
      c.beginPath();
      c.moveTo(r.x + 16, layout.footerY);
      c.lineTo(r.x + r.w - 16, layout.footerY);
      c.stroke();
      if (state.placement && placementRows) {
        const placement = state.placement;
        const message = placement.error || placement.issue;
        ui.text(
          "Arrange this furnishing",
          r.x + 16,
          layout.footerY + 9,
          14,
          palette.text,
          r.w - 32,
        );
        ui.paragraph(
          placement.wall
            ? "Drag onto a wall; release to place. Esc cancels."
            : "Drag to place. R rotates; Esc cancels.",
          { x: r.x + 16, y: layout.footerY + 31, w: r.w - 32, h: 30 },
          12,
          palette.muted,
        );
        if (message)
          ui.paragraph(
            message.replace(/^(SenderError|Error):\s*/, ""),
            { x: r.x + 16, y: layout.footerY + 65, w: r.w - 32, h: 36 },
            12,
            palette.gold,
          );
        const top = layout.footerY + (message ? 104 : 64);
        placementRows.forEach((row, i) =>
          row.forEach((action, j) => {
            const width = (r.w - 32 - (row.length - 1) * 8) / row.length;
            ui.button(
              "object-action-" + action.id,
              action.label,
              {
                x: r.x + 16 + j * (width + 8),
                y: top + i * 34,
                w: width,
                h: 29,
              },
              () => {
                const latest = current?.placement;
                if (
                  latest &&
                  placementActionRows(latest)
                    .flat()
                    .some((a) => a.id === action.id && a.enabled)
                )
                  actions.action(action.id);
              },
              { disabled: !action.enabled, selected: action.enabled },
            );
          }),
        );
        return;
      }
      const finiteDistance =
        state.distance !== undefined && Number.isFinite(state.distance);
      ui.text(
        state.status || (state.actions.length ? "Interaction" : "Inspect only"),
        r.x + 16,
        layout.footerY + 9,
        14,
        palette.text,
        r.w - 32,
      );
      const instruction =
        state.reachable === false
          ? "Move closer to use this object."
          : finiteDistance
            ? `${Math.max(0, state.distance!).toFixed(1)} m away`
            : state.actions.length
              ? "Choose an action below."
              : "No interaction available.";
      ui.text(
        instruction,
        r.x + 16,
        layout.footerY + 31,
        12,
        state.reachable === false ? palette.gold : palette.muted,
        r.w - 32,
      );
      state.actions.forEach((action, i) => {
        const button = {
          x: r.x + 16,
          y: layout.footerY + 55 + i * 38,
          w: r.w - 32,
          h: 31,
        };
        if (button.y + button.h > r.y + r.h - 7) return;
        ui.button(
          "object-action-" + action.id,
          action.label,
          button,
          () => {
            if (current && objectActionEnabled(current, action.id, pending))
              actions.action(action.id);
          },
          {
            disabled: !objectActionEnabled(state, action.id, busy),
            selected: objectActionEnabled(state, action.id, busy),
          },
        );
      });
    },
    dispose() {
      disposed = true;
      for (const image of images.values()) {
        image.onload = null;
        image.onerror = null;
      }
      images.clear();
      stack.close("object-details");
    },
  };
}

/**
 * Isometric wireframe of an object's measured bounds, for objects that have no rendered image
 * (prefab ship components, furniture and doors). Proportions come from the real bounds.
 */
export function drawSchematic(
  ui: CanvasUI,
  r: Rect,
  size: { widthM: number; depthM: number; heightM: number },
) {
  const c = ui.ctx;
  const w = Math.max(0.05, size.widthM),
    d = Math.max(0.05, size.depthM),
    h = Math.max(0.05, size.heightM);
  const cos = Math.cos(Math.PI / 6),
    sin = Math.sin(Math.PI / 6);
  // World (x across, y deep, z up) to an isometric plane, then fit and centre the box in the
  // frame above the caption.
  const iso = (x: number, y: number, z: number) => ({
    x: (x - y) * cos,
    y: (x + y) * sin - z,
  });
  const corners = [
    iso(0, 0, 0),
    iso(w, 0, 0),
    iso(w, d, 0),
    iso(0, d, 0),
    iso(0, 0, h),
    iso(w, 0, h),
    iso(w, d, h),
    iso(0, d, h),
  ];
  const minX = Math.min(...corners.map((q) => q.x)),
    maxX = Math.max(...corners.map((q) => q.x)),
    minY = Math.min(...corners.map((q) => q.y)),
    maxY = Math.max(...corners.map((q) => q.y));
  const frame = { x: r.x + 24, y: r.y + 24, w: r.w - 48, h: r.h - 52 };
  const scale = Math.min(frame.w / (maxX - minX), frame.h / (maxY - minY));
  const ox = frame.x + (frame.w - (maxX - minX) * scale) / 2 - minX * scale,
    oy = frame.y + (frame.h - (maxY - minY) * scale) / 2 - minY * scale;
  const v = corners.map((q) => ({ x: ox + q.x * scale, y: oy + q.y * scale }));
  const face = (ids: number[], fill: string) => {
    c.beginPath();
    ids.forEach((i, n) =>
      n ? c.lineTo(v[i].x, v[i].y) : c.moveTo(v[i].x, v[i].y),
    );
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  c.save();
  // Hidden edges first, dashed and dim.
  c.setLineDash?.([3, 3]);
  c.strokeStyle = "#47dfff55";
  c.lineWidth = 1;
  c.beginPath();
  for (const [a, b] of [
    [0, 1],
    [0, 3],
    [0, 4],
  ]) {
    c.moveTo(v[a].x, v[a].y);
    c.lineTo(v[b].x, v[b].y);
  }
  c.stroke();
  c.setLineDash?.([]);
  face([3, 2, 6, 7], "rgba(71,223,255,0.10)");
  face([1, 2, 6, 5], "rgba(71,223,255,0.16)");
  face([4, 5, 6, 7], "rgba(71,223,255,0.26)");
  c.strokeStyle = palette.blue;
  c.lineWidth = 1.5;
  c.shadowColor = "#169bff";
  c.shadowBlur = 6;
  c.beginPath();
  for (const [a, b] of [
    [1, 2],
    [2, 3],
    [1, 5],
    [2, 6],
    [3, 7],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
  ]) {
    c.moveTo(v[a].x, v[a].y);
    c.lineTo(v[b].x, v[b].y);
  }
  c.stroke();
  c.restore();
  ui.text("SCHEMATIC", r.x + 10, r.y + 8, 10, palette.blue, r.w - 20);
  ui.text(
    `${w.toFixed(2)} × ${d.toFixed(2)} × ${h.toFixed(2)} m`,
    r.x + 10,
    r.y + r.h - 20,
    11,
    palette.muted,
    r.w - 20,
  );
}
