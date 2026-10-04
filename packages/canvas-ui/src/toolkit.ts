import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Layer } from "@babylonjs/core/Layers/layer";
import type { Scene } from "@babylonjs/core/scene";
import { contains, type Rect } from "./layout";
import { gameCursors } from "./cursors";
import { uiTheme } from "@sidereal/ui/theme";
import {
  canvasControlState,
  controlAction,
  controlCornerCut,
  type CanvasControlState,
} from "./component-state";
/** Compatibility names used by existing HUD compositions; all resolve to shared tokens. */
export const palette: Record<
  "text" | "muted" | "line" | "blue" | "gold" | "red" | "green" | "well",
  string
> = {
  text: uiTheme.colors.text,
  muted: uiTheme.colors.textSecondary,
  line: uiTheme.colors.border,
  blue: uiTheme.colors.primary,
  gold: uiTheme.colors.warning,
  red: uiTheme.colors.danger,
  green: uiTheme.colors.success,
  well: uiTheme.colors.input,
};
const rgba = (hex: string, alpha: number) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${Math.max(0, Math.min(1, alpha))})`;
};
export type PointerAction = {
  x: number;
  y: number;
  button: number;
  shiftKey: boolean;
};
type Hit = {
  id: string;
  rect: Rect;
  label: string;
  disabled?: boolean;
  action?: (event?: PointerAction) => void;
  context?: (event: PointerAction) => void;
  press?: () => void;
  change?: (value: number) => void;
  value?: number;
  edit?: { value: string; max: number; change: (text: string) => void };
  drag?: (dx: number, dy: number) => void;
  drop?: (x: number, y: number) => void;
  cancel?: () => void;
};
/** CPU raster backing texture, composited by Babylon in the sole visible WebGL canvas. */
/** A DOM text field or editable element owns its key presses. */
export function isEditableTarget(target: EventTarget | null) {
  if (!target || typeof (target as Element).tagName !== "string") return false;
  const element = target as HTMLElement;
  return (
    element.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)
  );
}
export class CanvasUI {
  readonly texture: DynamicTexture;
  readonly layer: Layer;
  readonly ctx: CanvasRenderingContext2D;
  width = 1;
  height = 1;
  scale = 1;
  opacity = 0.94;
  hits: Hit[] = [];
  panels: Rect[] = [];
  focus = "";
  hover = "";
  keyboard = false;
  private selectedText = "";
  modal = false;
  private active?: {
    hit: Hit;
    x: number;
    y: number;
    id: number;
    startX: number;
    startY: number;
    moved?: boolean;
  };
  private pointer = { x: -1, y: -1 };
  private worldCursor = "default";
  /** An item rides the pointer (click-held or dragged): show the grab cursor. */
  holding = false;
  /** Set during draw when the next frame must not wait for the 30 Hz HUD cadence
   * (a held item following the pointer, a release glide). Cleared before each draw. */
  fluid = false;
  /** World cursor from the scene: a CSS value, or "default" for the themed arrow. */
  setWorldCursor(cursor: string) {
    this.worldCursor = cursor;
    this.updateCursor();
  }
  private updateCursor() {
    const cursors = gameCursors();
    // A locked pointer has no cursor; camera modes that lock it never show one.
    if (
      typeof document !== "undefined" &&
      document.pointerLockElement === this.canvas
    ) {
      this.canvas.style.cursor = "none";
      return;
    }
    const hit = [...this.hits]
      .reverse()
      .find((h) => contains(h.rect, this.pointer.x, this.pointer.y));
    const worldHover = !!this.canvas.dataset?.prefabObject;
    this.canvas.style.cursor =
      this.holding || (this.active?.moved && this.active.hit.drag)
        ? cursors.grab
        : hit?.disabled
          ? cursors["not-allowed"]
          : hit?.edit
            ? cursors.text
            : hit
              ? cursors.interact
              : this.pointerBlocked()
                ? cursors.default
                : this.worldCursor !== "default"
                  ? this.worldCursor
                  : worldHover
                    ? cursors.interact
                    : cursors.default;
  }
  pointerPosition() {
    return this.pointer ?? { x: -1, y: -1 };
  }
  pointerAction: (event: PointerAction) => boolean = () => false;
  private dirty = true;
  private lastPaint = 0;
  private revision = "";
  private backingWidth = 1;
  private backingHeight = 1;
  private disposed = false;
  private observer;
  draw: () => void = () => {};
  escape: () => void = () => {};
  scroll: (
    delta: number,
    x?: number,
    y?: number,
    horizontalDelta?: number,
  ) => void = () => {};
  shortcut: (code: string) => boolean = () => false;
  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
  ) {
    this.texture = new DynamicTexture(
      "game-interface",
      { width: 1, height: 1 },
      scene,
      false,
    );
    this.texture.hasAlpha = true;
    this.ctx = this.texture.getContext() as CanvasRenderingContext2D;
    this.layer = new Layer("game-interface", null, scene, false);
    this.layer.texture = this.texture;
    // HUD windows cover world effects, including selection silhouettes.
    // Use Babylon's existing foreground stage after camera postprocessing.
    this.layer.applyPostProcess = false;
    this.observer = scene.onBeforeRenderObservable.add(() => this.paint());
    // The HUD owns the canvas cursor; Babylon would reset it on every scene pointer move.
    scene.doNotHandleCursors = true;
    canvas.addEventListener("pointerdown", this.down, true);
    canvas.addEventListener("pointermove", this.move, true);
    canvas.addEventListener("pointerup", this.up, true);
    canvas.addEventListener("pointercancel", this.cancel, true);
    canvas.addEventListener("contextmenu", this.contextMenu, true);
    canvas.addEventListener("wheel", this.wheel, {
      capture: true,
      passive: false,
    });
    window.addEventListener("keydown", this.key, true);
    window.addEventListener("blur", this.blur);
    // Scene hover (prefab object under the pointer) is decided by later canvas listeners;
    // re-evaluate once the move has finished propagating.
    window.addEventListener("pointermove", this.afterMove);
    document.addEventListener?.("pointerlockchange", this.afterMove);
    document.fonts.ready.then(() => this.invalidate());
    scene.onDisposeObservable.add(() => this.dispose());
  }
  invalidate() {
    this.dirty = true;
  }
  blocked() {
    return (
      this.modal ||
      this.keyboard ||
      !!this.hits.find((h) => h.id === this.focus)?.edit
    );
  }
  pointerBlocked() {
    return (
      this.modal ||
      !!this.active ||
      this.panels.some((r) => contains(r, this.pointer.x, this.pointer.y))
    );
  }
  private point(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / this.scale,
      y: (e.clientY - r.top) / this.scale,
    };
  }
  private down = (e: PointerEvent) => {
    this.selectedText = "";
    this.pointer = this.point(e);
    const event = { ...this.pointer, button: e.button, shiftKey: e.shiftKey };
    if (this.pointerAction?.(event)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.invalidate();
      return;
    }
    const hit = [...this.hits]
      .reverse()
      .find((h) => contains(h.rect, this.pointer.x, this.pointer.y));
    if (!hit && !this.pointerBlocked()) {
      this.focus = "";
      this.keyboard = false;
      this.invalidate();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    this.canvas.focus();
    if (hit && !hit.disabled && e.button === 2) {
      this.focus = hit.id;
      hit.context?.(event);
    }
    if (hit && !hit.disabled && e.button === 0) {
      hit.press?.();
      this.focus = hit.id;
      this.keyboard = !!hit.edit;
      this.active = {
        hit,
        ...this.pointer,
        startX: this.pointer.x,
        startY: this.pointer.y,
        id: e.pointerId,
      };
      this.canvas.setPointerCapture(e.pointerId);
      if (hit.change) this.setSlider(hit, this.pointer.x);
    }
    this.invalidate();
  };
  private move = (e: PointerEvent) => {
    this.pointer = this.point(e);
    const hit = [...this.hits]
      .reverse()
      .find((h) => contains(h.rect, this.pointer.x, this.pointer.y));
    this.hover = hit?.id ?? "";
    if (this.active) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const { hit, x, y } = this.active;
      const wasMoved = this.active.moved;
      if (
        Math.hypot(
          this.pointer.x - this.active.startX,
          this.pointer.y - this.active.startY,
        ) > 4
      )
        this.active.moved = true;
      if (this.active.moved)
        hit.drag?.(
          this.pointer.x - (wasMoved ? x : this.active.startX),
          this.pointer.y - (wasMoved ? y : this.active.startY),
        );
      if (hit.change) this.setSlider(hit, this.pointer.x);
      this.active.x = this.pointer.x;
      this.active.y = this.pointer.y;
    }
    this.updateCursor();
    this.invalidate();
  };
  private afterMove = () => this.updateCursor();
  private up = (e: PointerEvent) => {
    if (!this.active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const hit = this.active.hit,
      p = this.point(e);
    const moved = this.active.moved;
    this.active = undefined;
    if (this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
    if (moved && hit.drop) hit.drop(p.x, p.y);
    else {
      hit.cancel?.();
      // A repaint may have disabled/removed this control while the pointer was held.
      const current = this.hits.find((candidate) => candidate.id === hit.id);
      if (current && !current.disabled && contains(current.rect, p.x, p.y))
        current.action?.({ ...p, button: e.button, shiftKey: e.shiftKey });
    }
    this.updateCursor();
    this.invalidate();
  };
  private contextMenu = (e: MouseEvent) => {
    if (this.pointerBlocked()) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  private cancel = () => {
    this.active?.hit.cancel?.();
    this.active = undefined;
    this.invalidate();
  };
  private blur = () => {
    this.active?.hit.cancel?.();
    this.active = undefined;
    this.focus = "";
    this.keyboard = false;
    this.invalidate();
  };
  private wheel = (e: WheelEvent) => {
    this.pointer = this.point(e);
    if (this.pointerBlocked()) {
      const unit =
        (e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? this.height : 1) /
        this.scale;
      this.scroll(
        e.shiftKey ? 0 : e.deltaY * unit,
        this.pointer.x,
        this.pointer.y,
        (e.deltaX || 0 || (e.shiftKey ? e.deltaY : 0)) * unit,
      );
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  private setSlider(hit: Hit, x: number) {
    hit.change?.(
      Math.max(0, Math.min(1, (x - hit.rect.x - 12) / (hit.rect.w - 24))),
    );
    this.invalidate();
  }
  private key = (e: KeyboardEvent) => {
    // The DOM loading/error layer owns input while the game surface is inert.
    // Window listeners still receive keys even when their canvas is inert.
    if (this.canvas.closest("[inert]")) return;
    // Typing into a DOM form field (account transfer code, service panels)
    // is text entry, not a game shortcut.
    if (isEditableTarget(e.target)) return;
    if (!this.keyboard && !e.repeat && this.shortcut(e.code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.invalidate();
      return;
    }
    if (e.code === "F6") {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.keyboard = !this.keyboard;
      this.focus = this.keyboard
        ? (this.hits.find((h) => !h.disabled && (!h.drag || !!h.action))?.id ??
          "")
        : "";
      this.invalidate();
      return;
    }
    if (e.code === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.focus = "";
      this.keyboard = false;
      this.escape();
      this.invalidate();
      return;
    }
    if (!this.blocked()) return;
    e.stopImmediatePropagation();
    const list = this.hits.filter(
        (h) => !h.disabled && (!h.drag || !!h.action),
      ),
      hit = list.find((h) => h.id === this.focus);
    if (e.code === "Tab") {
      e.preventDefault();
      const i = list.findIndex((h) => h.id === this.focus);
      this.focus =
        list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length]?.id ?? "";
      this.keyboard = true;
    } else if (!hit?.edit && ["PageDown", "PageUp"].includes(e.code)) {
      e.preventDefault();
      this.scroll((e.code === "PageDown" ? 1 : -1) * 160);
    } else if (hit?.edit) {
      const replace = (value: string) => {
        // Input events can arrive faster than the HUD's paint cadence.
        hit.edit!.value = value;
        hit.edit!.change(value);
        this.selectedText = "";
      };
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyA") {
        e.preventDefault();
        this.selectedText = hit.id;
      } else if (
        e.key === "Backspace" ||
        (e.key === "Delete" && this.selectedText === hit.id)
      ) {
        e.preventDefault();
        replace(
          this.selectedText === hit.id
            ? ""
            : Array.from(hit.edit.value).slice(0, -1).join(""),
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.focus = "";
        this.keyboard = false;
        this.selectedText = "";
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        replace(
          ((this.selectedText === hit.id ? "" : hit.edit.value) + e.key).slice(
            0,
            hit.edit.max,
          ),
        );
      }
    } else if (
      hit?.change &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
    ) {
      e.preventDefault();
      hit.change(
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? 1
            : Math.max(
                0,
                Math.min(
                  1,
                  (hit.value ?? 0) + (e.key === "ArrowLeft" ? -0.05 : 0.05),
                ),
              ),
      );
    } else if ((e.shiftKey && e.code === "F10") || e.code === "ContextMenu") {
      e.preventDefault();
      if (hit)
        hit.context?.({
          x: hit.rect.x + hit.rect.w,
          y: hit.rect.y,
          button: 2,
          shiftKey: false,
        });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      hit?.action?.({
        x: hit.rect.x,
        y: hit.rect.y,
        button: 0,
        shiftKey: e.shiftKey,
      });
    }
    this.invalidate();
  };
  paint() {
    if (this.disposed) return;
    const w = Math.max(1, Math.round(this.canvas.clientWidth)),
      h = Math.max(1, Math.round(this.canvas.clientHeight));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const rev = `${w}:${h}:${this.scale}:${pixelRatio}`;
    const resized = rev !== this.revision;
    if (resized) {
      this.revision = rev;
      const backingWidth = Math.round(w * pixelRatio),
        backingHeight = Math.round(h * pixelRatio);
      if (
        backingWidth !== this.backingWidth ||
        backingHeight !== this.backingHeight
      ) {
        this.texture.scaleTo(backingWidth, backingHeight);
        this.backingWidth = backingWidth;
        this.backingHeight = backingHeight;
      }
      this.dirty = true;
    }
    // scaleTo clears/reallocates the texture. Repaint and upload in this same
    // render frame; throttling after a resize exposes a blank HUD texture.
    // Pointer-following content (a dragged or held item, a release glide) paints every
    // frame so it tracks the pointer 1:1; everything else keeps the 30 Hz HUD cadence.
    const fluid = this.fluid || !!this.active?.moved;
    if (
      !this.dirty ||
      (!resized && !fluid && performance.now() - this.lastPaint < 33)
    )
      return;
    this.lastPaint = performance.now();
    this.dirty = false;
    this.width = w / this.scale;
    this.height = h / this.scale;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, w * pixelRatio, h * pixelRatio);
    this.ctx.setTransform(
      pixelRatio * this.scale,
      0,
      0,
      pixelRatio * this.scale,
      0,
      0,
    );
    this.hits = [];
    this.panels = [];
    this.fluid = false;
    this.draw();
    const focused = this.hits.find((h) => h.id === this.focus);
    if (!focused)
      this.canvas.setAttribute(
        "aria-label",
        "Sidereal game. WASD moves. Shift sprints on deck. Tab changes view. E uses the control seat. Escape opens the console. F6 focuses interface controls.",
      );
    if (focused)
      this.canvas.setAttribute(
        "aria-label",
        `Sidereal. ${focused.label}. ${focused.edit ? "Type to edit. Backspace deletes. " : ""}Tab moves through interface. Escape returns to game.`,
      );
    this.texture.update(true);
  }
  private framePath(r: Rect, inset = 0) {
    const c = this.ctx,
      x = r.x + inset,
      y = r.y + inset,
      w = Math.max(0, r.w - inset * 2),
      h = Math.max(0, r.h - inset * 2),
      cut = controlCornerCut(w, h, uiTheme.frame.cornerCut);
    c.beginPath();
    c.moveTo(x + cut, y);
    c.lineTo(x + w - cut, y);
    c.lineTo(x + w, y + cut);
    c.lineTo(x + w, y + h - cut);
    c.lineTo(x + w - cut, y + h);
    c.lineTo(x + cut, y + h);
    c.lineTo(x, y + h - cut);
    c.lineTo(x, y + cut);
    c.closePath();
  }
  panel(r: Rect, strong = false) {
    this.panels.push(r);
    const c = this.ctx;
    c.save();
    this.framePath(r, 0.5);
    const gradient = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    gradient.addColorStop(
      0,
      rgba(uiTheme.colors.panel, strong ? 0.995 : this.opacity),
    );
    gradient.addColorStop(
      1,
      rgba(uiTheme.colors.background, strong ? 0.99 : this.opacity),
    );
    c.fillStyle = gradient;
    c.fill();
    c.strokeStyle = palette.line;
    c.lineWidth = uiTheme.frame.borderWidth;
    c.stroke();
    // Glow is confined to two small edge segments, never the whole window.
    const cut = controlCornerCut(r.w, r.h, uiTheme.frame.cornerCut);
    const edge = Math.min(46, r.w / 3),
      rise = Math.min(28, r.h / 3);
    c.strokeStyle = palette.blue;
    c.lineWidth = uiTheme.frame.focusWidth;
    c.shadowColor = palette.blue;
    c.shadowBlur = strong ? 6 : 3;
    c.beginPath();
    c.moveTo(r.x, r.y + rise);
    c.lineTo(r.x, r.y + cut);
    c.lineTo(r.x + cut, r.y);
    c.lineTo(r.x + edge, r.y);
    c.moveTo(r.x + r.w - edge, r.y + r.h);
    c.lineTo(r.x + r.w - cut, r.y + r.h);
    c.lineTo(r.x + r.w, r.y + r.h - cut);
    c.lineTo(r.x + r.w, r.y + r.h - rise);
    c.stroke();
    c.restore();
  }
  text(
    text: string,
    x: number,
    y: number,
    size = 16,
    color = palette.text,
    maxWidth?: number,
  ) {
    const c = this.ctx;
    c.font = `${size >= 24 ? "600" : "500"} ${size}px ${size >= 24 ? uiTheme.fonts.title : uiTheme.fonts.body}`;
    c.fillStyle = color;
    c.textBaseline = "top";
    if (maxWidth) {
      while (text.length > 1 && c.measureText(text).width > maxWidth)
        text = text.slice(0, -2) + "…";
    }
    c.fillText(text, x, y);
  }
  paragraph(text: string, r: Rect, size = 15, color = palette.muted) {
    let line = "",
      y = r.y;
    this.ctx.font = `500 ${size}px ${uiTheme.fonts.body}`;
    for (const word of text.split(" ")) {
      if (this.ctx.measureText(line + word).width > r.w && line) {
        this.text(line, r.x, y, size, color);
        y += size + 6;
        line = "";
      }
      line += word + " ";
    }
    this.text(line, r.x, y, size, color);
  }
  button(
    id: string,
    label: string,
    r: Rect,
    action: () => void,
    options: CanvasControlState = {},
  ) {
    const c = this.ctx,
      style = canvasControlState({
        ...options,
        focused: options.focused || id === this.focus,
        hovered: options.hovered || id === this.hover,
        pressed: options.pressed || id === this.active?.hit.id,
      });
    c.save();
    this.framePath(r, 0.5);
    c.fillStyle = style.fill;
    c.fill();
    c.strokeStyle = style.border;
    c.lineWidth = options.selected
      ? uiTheme.frame.focusWidth
      : uiTheme.frame.borderWidth;
    c.stroke();
    if (style.focus) {
      this.framePath(r, 3);
      c.strokeStyle = style.focus;
      c.lineWidth = uiTheme.frame.focusWidth;
      c.stroke();
    }
    if (style.glow) {
      c.strokeStyle = style.accent;
      c.shadowColor = style.accent;
      c.shadowBlur = style.glow;
      c.beginPath();
      c.moveTo(r.x + 12, r.y + 1);
      c.lineTo(r.x + Math.min(36, r.w - 12), r.y + 1);
      c.stroke();
      c.shadowBlur = 0;
    }
    const keycap = /^(Esc|Tab|[A-Z])   (.+)$/.exec(label);
    let inset = 12;
    if (keycap) {
      const kw = keycap[1].length > 1 ? 35 : 24;
      c.fillStyle = uiTheme.colors.input;
      c.fillRect(r.x + 8, r.y + (r.h - 25) / 2, kw, 25);
      c.strokeStyle = style.border;
      c.strokeRect(r.x + 8.5, r.y + (r.h - 25) / 2 + 0.5, kw, 25);
      this.text(keycap[1], r.x + 13, r.y + (r.h - 17) / 2, 15, style.text);
      inset = kw + 17;
    }
    const text = (options.pending ? "… " : "") + (keycap?.[2] ?? label);
    c.font = `500 16px ${uiTheme.fonts.body}`;
    this.text(
      text,
      r.x +
        (r.w < 45 ? Math.max(3, (r.w - c.measureText(text).width) / 2) : inset),
      r.y +
        (r.h - 17) / 2 +
        (style.interactive && (options.pressed || id === this.active?.hit.id)
          ? 1
          : 0),
      16,
      style.text,
      r.w < 45 ? r.w - 6 : r.w - inset - 8,
    );
    c.restore();
    this.hits.push({
      id,
      label: options.pending ? `${label}, pending` : label,
      rect: r,
      action: controlAction(action, () => options),
      disabled: !style.interactive,
    });
  }
  /** Shared measured-value bar; callers provide real replicated quantities. */
  bar(r: Rect, fraction: number, color = palette.blue) {
    const c = this.ctx;
    c.save();
    c.fillStyle = uiTheme.colors.input;
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = palette.line;
    c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    const w =
      Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) *
      (r.w - 4);
    const fill = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    fill.addColorStop(0, palette.text);
    fill.addColorStop(0.3, color);
    fill.addColorStop(1, color);
    c.fillStyle = fill;
    c.shadowColor = color;
    c.shadowBlur = 3;
    c.fillRect(r.x + 2, r.y + 2, w, Math.max(1, r.h - 4));
    c.restore();
  }
  windowFrame(
    id: string,
    title: string,
    r: Rect,
    focused: boolean,
    move: (dx: number, dy: number) => void,
    close: () => void,
  ) {
    this.panel(r, true);
    this.hits.push({
      id: id + "-surface",
      label: title,
      rect: r,
      action: () => {},
    });
    const c = this.ctx;
    c.save();
    c.strokeStyle = focused ? palette.text : palette.blue;
    c.shadowColor = palette.blue;
    c.shadowBlur = focused ? 5 : 0;
    c.beginPath();
    c.moveTo(r.x + 12, r.y + 43);
    c.lineTo(r.x + r.w - 12, r.y + 43);
    c.stroke();
    c.restore();
    this.text(
      title,
      r.x + 16,
      r.y + 11,
      25,
      focused ? palette.text : palette.blue,
      r.w - 64,
    );
    this.drag(
      id + "-title",
      "Move " + title,
      { x: r.x, y: r.y, w: r.w - 48, h: 43 },
      move,
    );
    this.button(
      id + "-close",
      "×",
      { x: r.x + r.w - 38, y: r.y + 8, w: 28, h: 27 },
      close,
    );
  }
  toggle(
    id: string,
    label: string,
    value: boolean,
    r: Rect,
    change: (v: boolean) => void,
  ) {
    this.button(
      id,
      `${value ? "✓" : "○"}   ${label}`,
      r,
      () => change(!value),
      { selected: value },
    );
  }
  slider(
    id: string,
    label: string,
    value: number,
    r: Rect,
    change: (v: number) => void,
    valueText?: string,
  ) {
    this.text(label, r.x, r.y, 15);
    this.text(
      valueText ?? `${Math.round(value * 100)}%`,
      r.x + r.w - 42,
      r.y,
      15,
      palette.blue,
    );
    const track = { ...r, y: r.y + 23, h: 30 },
      c = this.ctx;
    c.fillStyle = uiTheme.colors.input;
    c.fillRect(track.x + 12, track.y + 12, track.w - 24, 5);
    c.fillStyle = palette.blue;
    c.fillRect(track.x + 12, track.y + 12, (track.w - 24) * value, 5);
    c.fillStyle = this.focus === id ? palette.text : palette.blue;
    c.fillRect(track.x + 8 + (track.w - 24) * value, track.y + 4, 8, 21);
    this.hits.push({ id, label, rect: track, change, value });
  }
  input(
    id: string,
    label: string,
    value: string,
    r: Rect,
    change: (v: string) => void,
    max = 40,
  ) {
    this.button(id, value + (this.focus === id ? "│" : ""), r, () => {});
    if (this.selectedText === id && this.focus === id) {
      this.ctx.fillStyle = rgba(palette.blue, 0.2);
      this.ctx.fillRect(
        r.x + 8,
        r.y + 5,
        Math.min(r.w - 16, this.ctx.measureText(value).width + 3),
        r.h - 10,
      );
    }
    Object.assign(this.hits[this.hits.length - 1], {
      label,
      action: undefined,
      edit: { value, max, change },
    });
  }
  drag(
    id: string,
    label: string,
    r: Rect,
    drag: (dx: number, dy: number) => void,
  ) {
    this.hits.push({ id, label, rect: r, drag });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.onBeforeRenderObservable.remove(this.observer);
    this.canvas.removeEventListener("pointerdown", this.down, true);
    this.canvas.removeEventListener("pointermove", this.move, true);
    this.canvas.removeEventListener("pointerup", this.up, true);
    this.canvas.removeEventListener("pointercancel", this.cancel, true);
    this.canvas.removeEventListener("contextmenu", this.contextMenu, true);
    this.canvas.removeEventListener("wheel", this.wheel, true);
    window.removeEventListener("keydown", this.key, true);
    window.removeEventListener("blur", this.blur);
    window.removeEventListener("pointermove", this.afterMove);
    document.removeEventListener?.("pointerlockchange", this.afterMove);
    this.layer.dispose();
  }
}
