import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Layer } from "@babylonjs/core/Layers/layer";
import type { Scene } from "@babylonjs/core/scene";
import { contains, type Rect } from "./layout";
export const palette = {
  text: "#eff6ff",
  muted: "#a7c5e8",
  line: "#277fbd",
  blue: "#47dfff",
  gold: "#ffd26d",
  red: "#ff8eaa",
  green: "#74dcbb",
  well: "#091a30",
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
export class CanvasUI {
  readonly texture: DynamicTexture;
  readonly layer: Layer;
  readonly ctx: CanvasRenderingContext2D;
  width = 1;
  height = 1;
  scale = window.innerWidth >= 1100 ? 1.35 : 1;
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
  scroll: (delta: number, x?: number, y?: number) => void = () => {};
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
    this.canvas.style.cursor = hit?.disabled
      ? "not-allowed"
      : hit?.edit
        ? "text"
        : hit?.drag
          ? "move"
          : hit
            ? "pointer"
            : "default";
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
    this.invalidate();
  };
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
      if (contains(hit.rect, p.x, p.y))
        hit.action?.({ ...p, button: e.button, shiftKey: e.shiftKey });
    }
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
      this.scroll(
        (e.deltaY *
          (e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? this.height : 1)) /
          this.scale,
        this.pointer.x,
        this.pointer.y,
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
    if (!this.dirty || (!resized && performance.now() - this.lastPaint < 33))
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
  panel(r: Rect, strong = false) {
    this.panels.push(r);
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.moveTo(r.x + 8, r.y);
    c.lineTo(r.x + r.w - 10, r.y);
    c.lineTo(r.x + r.w, r.y + 10);
    c.lineTo(r.x + r.w, r.y + r.h - 8);
    c.lineTo(r.x + r.w - 8, r.y + r.h);
    c.lineTo(r.x, r.y + r.h);
    c.lineTo(r.x, r.y + 8);
    c.closePath();
    const gradient = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    gradient.addColorStop(0, `rgba(5,23,54,${strong ? 0.995 : this.opacity})`);
    gradient.addColorStop(
      1,
      `rgba(2,9,27,${strong ? 0.985 : this.opacity * 0.9})`,
    );
    c.fillStyle = gradient;
    c.fill();
    c.strokeStyle = palette.line;
    c.lineWidth = 1;
    c.stroke();
    c.strokeStyle = palette.blue;
    c.lineWidth = 2;
    c.shadowColor = "#169bff";
    c.shadowBlur = 12;
    c.beginPath();
    c.moveTo(r.x, r.y + 22);
    c.lineTo(r.x, r.y + 8);
    c.lineTo(r.x + 8, r.y);
    c.lineTo(r.x + 46, r.y);
    c.moveTo(r.x + r.w - 46, r.y + r.h);
    c.lineTo(r.x + r.w - 8, r.y + r.h);
    c.lineTo(r.x + r.w, r.y + r.h - 8);
    c.lineTo(r.x + r.w, r.y + r.h - 28);
    c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = "#759ad044";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(r.x + 12, r.y + 3);
    c.lineTo(r.x + r.w - 14, r.y + 3);
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
    c.font = `${size >= 24 ? "600" : "500"} ${size}px ${size >= 24 ? '"Barlow Condensed"' : "Barlow"}, sans-serif`;
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
    this.ctx.font = `500 ${size}px Barlow, sans-serif`;
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
    options: { selected?: boolean; disabled?: boolean; accent?: boolean } = {},
  ) {
    const c = this.ctx,
      focus = id === this.focus,
      hover = id === this.hover;
    const fill = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    fill.addColorStop(
      0,
      options.selected ? "#124c9c" : hover ? "#174e77" : "#112c50",
    );
    fill.addColorStop(0.5, options.selected ? "#063771" : "#071a35");
    fill.addColorStop(1, options.selected ? "#165dc3" : "#0a2344");
    c.fillStyle = fill;
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = focus
      ? "#ffffff"
      : options.accent
        ? palette.gold
        : options.selected || hover
          ? palette.blue
          : palette.line;
    c.lineWidth = focus || options.selected ? 2 : 1;
    if (options.selected || focus) {
      c.save();
      c.shadowColor = "#168aff";
      c.shadowBlur = 17;
      c.strokeStyle = "#f0fcff";
      c.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      c.restore();
    } else c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (!options.disabled) {
      c.save();
      c.shadowColor = options.accent ? "#ffaf29" : "#159fff";
      c.shadowBlur = options.selected || hover || focus ? 10 : 0;
      c.strokeStyle =
        options.selected || focus
          ? "#f3fdff"
          : options.accent
            ? palette.gold
            : palette.blue;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(r.x + 1, r.y + 12);
      c.lineTo(r.x + 1, r.y + 1);
      c.lineTo(r.x + 20, r.y + 1);
      c.moveTo(r.x + r.w - 20, r.y + r.h - 1);
      c.lineTo(r.x + r.w - 1, r.y + r.h - 1);
      c.lineTo(r.x + r.w - 1, r.y + r.h - 12);
      c.stroke();
      c.restore();
    }
    const keycap = /^(Esc|Tab|E)   (.+)$/.exec(label);
    let inset = 12;
    if (keycap) {
      const kw = keycap[1].length > 1 ? 35 : 24;
      c.fillStyle = "#163d60";
      c.fillRect(r.x + 8, r.y + (r.h - 25) / 2, kw, 25);
      c.strokeStyle = options.disabled ? "#526477" : "#91c6e5";
      c.strokeRect(r.x + 8.5, r.y + (r.h - 25) / 2 + 0.5, kw, 25);
      this.text(keycap[1], r.x + 13, r.y + (r.h - 17) / 2, 15);
      inset = kw + 17;
    }
    this.text(
      keycap?.[2] ?? label,
      r.x +
        (r.w < 45
          ? Math.max(3, (r.w - c.measureText(keycap?.[2] ?? label).width) / 2)
          : inset),
      r.y + (r.h - 17) / 2,
      16,
      options.disabled
        ? "#62778d"
        : options.accent
          ? palette.gold
          : palette.text,
      r.w < 45 ? r.w - 6 : r.w - inset - 8,
    );
    this.hits.push({ id, label, rect: r, action, disabled: options.disabled });
  }
  /** Shared measured-value bar; callers provide real replicated quantities. */
  bar(r: Rect, fraction: number, color = palette.blue) {
    const c = this.ctx;
    c.save();
    c.fillStyle = "#051327";
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = "#386aa0";
    c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    const w =
      Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) *
      (r.w - 4);
    const fill = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    fill.addColorStop(0, "#e9fdff");
    fill.addColorStop(0.3, color);
    fill.addColorStop(1, "#116bcb");
    c.fillStyle = fill;
    c.shadowColor = color;
    c.shadowBlur = 8;
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
    c.strokeStyle = focused ? "#e7faff" : palette.blue;
    c.shadowColor = "#138dff";
    c.shadowBlur = focused ? 12 : 4;
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
    c.fillStyle = "#0a192c";
    c.fillRect(track.x + 12, track.y + 12, track.w - 24, 5);
    c.fillStyle = palette.blue;
    c.fillRect(track.x + 12, track.y + 12, (track.w - 24) * value, 5);
    c.fillStyle = this.focus === id ? "#ffffff" : palette.blue;
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
      this.ctx.fillStyle = "rgba(45,165,255,.25)";
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
    this.layer.dispose();
  }
}
