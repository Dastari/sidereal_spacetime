import { uiTheme, type ControlVariant } from "@sidereal/ui/theme";
import { type Rect } from "./layout";
import { type CanvasUI, palette } from "./toolkit";

export const galleryPages = [
  "Actions",
  "States",
  "Controls",
  "Frames",
  "Status",
] as const;

/** Logical viewport geometry; DPR is owned solely by CanvasUI's texture transform. */
export function galleryLayout(width: number, height: number) {
  const margin = Math.min(16, width / 20, height / 20);
  const frame = {
    x: margin,
    y: margin,
    w: Math.max(0, width - margin * 2),
    h: Math.max(0, height - margin * 2),
  };
  const padding = Math.min(20, frame.w / 12);
  const content = {
    x: frame.x + padding,
    y: Math.min(frame.y + 110, frame.y + frame.h),
    w: Math.max(0, frame.w - padding * 2),
    h: Math.max(0, frame.h - 160),
  };
  const columns = content.w >= 650 ? 3 : content.w >= 380 ? 2 : 1;
  const gap = 12;
  return {
    frame,
    content,
    columns,
    gap,
    cellWidth: Math.max(0, (content.w - gap * (columns - 1)) / columns),
  };
}

/** Developer specimens only: interactions mutate local gallery state, never game actions. */
export function createComponentGallery(ui: CanvasUI, onClose?: () => void) {
  let visible = false;
  let page = 0,
    scrollY = 0,
    maximumScroll = 0;
  let selected = false,
    disabled = false,
    pending = false;
  let enabled = true,
    amount = 0.62,
    text = "Wayfarer",
    clicks = 0;
  let message =
    "Examples only. These controls do not change your ship or character.";
  const change = () => ui.invalidate();
  const close = () => {
    visible = false;
    ui.focus = "";
    ui.keyboard = false;
    onClose?.();
    change();
  };
  const example = () => {
    clicks++;
    message = `Example action used ${clicks} ${clicks === 1 ? "time" : "times"}.`;
    change();
  };
  return {
    isOpen: () => visible,
    open() {
      visible = true;
      scrollY = 0;
      ui.focus = "";
      change();
    },
    close,
    scroll(delta: number) {
      if (!visible) return false;
      scrollY = Math.max(0, Math.min(maximumScroll, scrollY + delta));
      ui.focus = "";
      change();
      return true;
    },
    draw() {
      if (!visible) return false;
      ui.modal = true;
      const { frame, content, columns, gap, cellWidth } = galleryLayout(
        ui.width,
        ui.height,
      );
      ui.windowFrame(
        "component-gallery",
        "Interface components",
        frame,
        true,
        () => {},
        close,
      );
      const selector = {
        x: content.x,
        y: frame.y + 56,
        w: content.w * 0.58,
        h: 38,
      };
      ui.button(
        "gallery-previous",
        "‹",
        { ...selector, w: 34 },
        () => {
          page = (page + galleryPages.length - 1) % galleryPages.length;
          scrollY = 0;
          change();
        },
        { variant: "ghost" },
      );
      ui.text(
        galleryPages[page],
        selector.x + 45,
        selector.y + 9,
        17,
        palette.blue,
        Math.max(0, selector.w - 45),
      );
      ui.button(
        "gallery-next",
        "›",
        { x: frame.x + frame.w - 56, y: selector.y, w: 34, h: 38 },
        () => {
          page = (page + 1) % galleryPages.length;
          scrollY = 0;
          change();
        },
        { variant: "ghost" },
      );
      const controls: (() => void)[] = [];
      const heights: number[] = [];
      const add = (height: number, draw: (r: Rect) => void) => {
        const i = controls.length,
          row = Math.floor(i / columns),
          col = i % columns;
        const y =
          content.y -
          scrollY +
          heights.slice(0, row).reduce((sum, h) => sum + h + gap, 0);
        heights[row] = Math.max(heights[row] ?? 0, height);
        controls.push(() =>
          draw({
            x: content.x + col * (cellWidth + gap),
            y,
            w: cellWidth,
            h: height,
          }),
        );
      };
      if (page === 0) {
        for (const variant of [
          "primary",
          "secondary",
          "ghost",
          "danger",
          "success",
          "warning",
        ] satisfies ControlVariant[])
          add(70, (r) => {
            ui.text(variant, r.x, r.y, 14, palette.muted);
            ui.button(
              `gallery-${variant}`,
              `${variant[0].toUpperCase()}${variant.slice(1)} action`,
              { ...r, y: r.y + 24, h: 44 },
              example,
              { variant },
            );
          });
        add(70, (r) => {
          ui.text("Key hint", r.x, r.y, 14, palette.muted);
          ui.button(
            "gallery-key",
            "E   Use example",
            { ...r, y: r.y + 24, h: 44 },
            example,
          );
        });
      } else if (page === 1) {
        add(44, (r) =>
          ui.toggle("gallery-selected", "Selected", selected, r, (v) => {
            selected = v;
            change();
          }),
        );
        add(44, (r) =>
          ui.toggle("gallery-disabled", "Disabled", disabled, r, (v) => {
            disabled = v;
            change();
          }),
        );
        add(44, (r) =>
          ui.toggle("gallery-pending", "Pending", pending, r, (v) => {
            pending = v;
            change();
          }),
        );
        add(100, (r) => {
          ui.text(
            "Combine states; focus with F6 / Tab",
            r.x,
            r.y,
            14,
            palette.muted,
            r.w,
          );
          ui.button(
            "gallery-composed",
            "Example action",
            { ...r, y: r.y + 42, h: 44 },
            example,
            { variant: "primary", selected, disabled, pending },
          );
        });
      } else if (page === 2) {
        add(72, (r) => {
          ui.text("Text field example", r.x, r.y, 14, palette.muted);
          ui.input(
            "gallery-input",
            "Example ship name",
            text,
            { ...r, y: r.y + 24, h: 44 },
            (v) => {
              text = v;
              change();
            },
          );
        });
        add(72, (r) => {
          ui.text("Toggle", r.x, r.y, 14, palette.muted);
          ui.toggle(
            "gallery-toggle",
            "Example switch",
            enabled,
            { ...r, y: r.y + 24, h: 44 },
            (v) => {
              enabled = v;
              change();
            },
          );
        });
        add(72, (r) =>
          ui.slider("gallery-slider", "Example value", amount, r, (v) => {
            amount = v;
            change();
          }),
        );
        add(110, (r) => {
          ui.panel(r);
          ui.paragraph(
            "Canvas text editing is a basic example. Account forms keep native browser editing and accessibility.",
            { ...r, x: r.x + 12, y: r.y + 12, w: r.w - 24 },
            14,
          );
        });
      } else if (page === 3) {
        add(130, (r) => {
          ui.panel(r);
          ui.text("Panel", r.x + 14, r.y + 14, 24, palette.blue);
          ui.paragraph(
            "A clipped navy surface with quiet borders and small luminous edges.",
            { ...r, x: r.x + 14, y: r.y + 50, w: r.w - 28 },
            14,
          );
        });
        add(130, (r) => {
          ui.panel(r, true);
          ui.text("Raised card", r.x + 14, r.y + 14, 24);
          ui.paragraph(
            "Opaque enough to keep controls readable above bright ship art.",
            { ...r, x: r.x + 14, y: r.y + 50, w: r.w - 28 },
            14,
          );
        });
        add(130, (r) => {
          ui.panel(r);
          ui.text("Inventory slots", r.x + 14, r.y + 14, 20);
          const cell = Math.min(48, (r.w - 40) / 3);
          for (let i = 0; i < 3; i++)
            ui.button(
              `gallery-slot-${i}`,
              String(i + 1),
              { x: r.x + 14 + i * (cell + 6), y: r.y + 58, w: cell, h: cell },
              example,
              { selected: i === 0, disabled: i === 2 },
            );
        });
      } else {
        for (const [label, color] of [
          ["Information", palette.blue],
          ["Success", palette.green],
          ["Warning", palette.gold],
          ["Error", palette.red],
        ])
          add(94, (r) => {
            ui.panel(r);
            ui.text(label, r.x + 12, r.y + 12, 20, color);
            ui.text(
              "Label reinforces the status colour",
              r.x + 12,
              r.y + 46,
              14,
              palette.muted,
              r.w - 24,
            );
          });
        add(72, (r) => {
          ui.text("Example progress", r.x, r.y, 14, palette.muted);
          ui.bar({ ...r, y: r.y + 28, h: 14 }, amount);
          ui.text(`${Math.round(amount * 100)}%`, r.x, r.y + 50, 14);
        });
      }
      maximumScroll = Math.max(
        0,
        heights.reduce((sum, h) => sum + h + gap, 0) - gap - content.h,
      );
      scrollY = Math.min(scrollY, maximumScroll);
      // Clip visual and hit rectangles together; offscreen controls are not Tab targets.
      const firstHit = ui.hits.length;
      ui.ctx.save();
      ui.ctx.beginPath();
      ui.ctx.rect(content.x, content.y, content.w, content.h);
      ui.ctx.clip();
      controls.forEach((draw) => draw());
      ui.ctx.restore();
      ui.hits = ui.hits.flatMap((hit, i) => {
        if (i < firstHit) return [hit];
        const x = Math.max(hit.rect.x, content.x),
          y = Math.max(hit.rect.y, content.y);
        const right = Math.min(hit.rect.x + hit.rect.w, content.x + content.w);
        const bottom = Math.min(hit.rect.y + hit.rect.h, content.y + content.h);
        return right > x && bottom > y
          ? [{ ...hit, rect: { x, y, w: right - x, h: bottom - y } }]
          : [];
      });
      ui.text(
        message,
        content.x,
        frame.y + frame.h - 35,
        13,
        uiTheme.colors.textSecondary,
        Math.max(0, content.w - 124),
      );
      ui.button(
        "gallery-back",
        "Back",
        {
          x: frame.x + frame.w - 120,
          y: frame.y + frame.h - 43,
          w: 100,
          h: 32,
        },
        close,
        { variant: "ghost" },
      );
      if (maximumScroll > 0)
        ui.text(
          "Scroll for more",
          frame.x + frame.w - 116,
          frame.y + frame.h - 58,
          13,
          palette.blue,
          100,
        );
      return true;
    },
  };
}
