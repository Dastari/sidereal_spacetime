import { createComponentGallery } from "./component-gallery";
import { contains, type Rect } from "./layout";
import { CanvasUI, palette } from "./toolkit";
import type { CharacterPreviewAppearance } from "@sidereal/render/character-preview";
export type CharacterEntry = {
  id: string;
  name: string;
  shipName: string;
  appearance: CharacterPreviewAppearance;
  health?: number;
  maxHealth?: number;
  equipment: readonly { name: string; slot: string }[];
};
export type EntryState =
  | {
      kind: "sign-in";
      ready: boolean;
      pending: boolean;
      error: string;
      development: boolean;
    }
  | {
      kind: "loading";
      stage: string;
      shipName: string;
      error: string;
      awaitingShip: boolean;
    }
  | {
      kind: "character";
      character?: CharacterEntry;
      pending: boolean;
      error: string;
    }
  | { kind: "world" };
import type { CanvasServiceView } from "./ship-systems";
export type EntryActions = {
  readService?: () => CanvasServiceView | undefined;
  account?: () => void;
  signIn: () => void;
  signOut: () => void;
  development: () => void;
  enter: () => void;
  create: (name: string) => void;
  retry: () => void;
  retryPreview: () => void;
};
export type EntryPortrait = {
  canvas: HTMLCanvasElement;
  render: (time: number, reduced: boolean) => boolean;
  resize: (w: number, h: number) => void;
  needsRender: boolean;
  presentationStatus: string;
};
/** Canvas-only sign-in/loading/character screens reuse the live gameplay painter. */
export function createCanvasEntryUI(
  canvas: HTMLCanvasElement,
  read: () => EntryState,
  actions: EntryActions,
  portrait: () => { view?: EntryPortrait; failed?: boolean },
) {
  const ui = new CanvasUI(canvas, undefined, {
    label:
      "Sidereal entry. F6 focuses controls. Tab moves between controls. Enter activates the focused control.",
  });
  const gallery = createComponentGallery(ui, () => {
    location.assign(location.pathname);
  });
  if (new URLSearchParams(location.search).get("ui") === "gallery")
    gallery.open();
  let detailsScroll = 0,
    detailsLimit = 0;
  let creationError = "";
  let detailRect: Rect | undefined;
  ui.scroll = (delta, x, y) => {
    if (actions.readService?.()?.scroll(delta, x, y)) {
      ui.invalidate();
      return;
    }
    if (gallery.scroll(delta)) return;
    if (detailRect && (x === undefined || contains(detailRect, x, y ?? 0))) {
      detailsScroll = Math.max(
        0,
        Math.min(detailsLimit, detailsScroll + delta),
      );
      ui.invalidate();
    }
  };
  const changeName = (value: string) => {
    name = value;
    ui.invalidate();
  };
  let name = "",
    background: HTMLImageElement | undefined;
  let portraitSize = "";
  const image = new Image();
  image.onload = () => {
    background = image;
    ui.invalidate();
  };
  image.src = "/assets/ui/hangar-r001.webp";
  ui.modal = true;
  ui.keyboard = true;
  ui.escape = () => {
    actions.readService?.()?.close?.();
    ui.invalidate();
  };
  ui.draw = () => {
    if (gallery.draw()) return;
    const state = read();
    const w = ui.width,
      h = ui.height;
    if (state.kind === "world") return;
    const ctx = ui.ctx;
    ctx.fillStyle = "#02091b";
    ctx.fillRect(0, 0, w, h);
    if (background) {
      const scale = Math.max(w / background.width, h / background.height);
      ctx.drawImage(
        background,
        (w - background.width * scale) / 2,
        (h - background.height * scale) / 2,
        background.width * scale,
        background.height * scale,
      );
      ctx.fillStyle = "#02091b77";
      ctx.fillRect(0, 0, w, h);
    }
    ui.text("SIDEREAL", 24, 20, w < 500 ? 42 : 60, palette.text, w - 48);
    const service = actions.readService?.();
    if (service) {
      service.draw(ui);
      return;
    }
    const compact = w < 600 && h > w;
    if (state.kind === "sign-in" || state.kind === "loading") {
      const r = {
        x: Math.max(12, (w - 460) / 2),
        y: Math.max(90, Math.min(h - 340, (h - 280) / 2)),
        w: Math.min(460, w - 24),
        h: Math.min(330, h - 110),
      };
      ui.panel(r, true);
      ui.text(
        state.kind === "sign-in"
          ? "Sign in"
          : state.error
            ? "Loading failed"
            : "Loading game",
        r.x + 20,
        r.y + 18,
        28,
      );
      let y = r.y + 66;
      const message =
        state.kind === "sign-in"
          ? "Sign in with your Dastari account."
          : state.awaitingShip
            ? "Loading your character."
            : `${state.shipName || "Your ship"} · ${({ connecting: "Connecting to server", ship: "Loading ship", environment: "Loading environment", crew: "Loading character", equipment: "Loading equipped items", finishing: "Rendering first frame" } as Record<string, string>)[state.stage] ?? "Loading game"}`;
      ui.paragraph(message, { x: r.x + 20, y, w: r.w - 40, h: 56 }, 16);
      y += 62;
      if (state.error) {
        ui.paragraph(
          state.error,
          { x: r.x + 20, y, w: r.w - 40, h: 52 },
          14,
          palette.red,
        );
        y += 62;
      }
      if (state.kind === "sign-in") {
        ui.button(
          "sign-in",
          state.pending
            ? "Opening sign-in…"
            : state.ready
              ? "Sign in"
              : "Preparing sign-in…",
          { x: r.x + 20, y, w: r.w - 40, h: 42 },
          actions.signIn,
          { disabled: !state.ready, pending: state.pending },
        );
        y += 58;
        ui.paragraph(
          "Account registration is available on the sign-in page.",
          { x: r.x + 20, y, w: r.w - 40, h: 45 },
          13,
          palette.muted,
        );
        if (state.development)
          ui.button(
            "development",
            "Continue development character",
            { x: r.x + 20, y: y + 48, w: r.w - 40, h: 34 },
            actions.development,
          );
      } else {
        if (state.error)
          ui.button(
            "retry-loading",
            "Retry loading",
            { x: r.x + 20, y, w: r.w - 40, h: 38 },
            actions.retry,
          );
        else
          ui.text(
            "Preparing your game…",
            r.x + 20,
            y,
            16,
            palette.muted,
            r.w - 40,
          );
        ui.button(
          "sign-out",
          "Sign out",
          { x: w - 110, y: 24, w: 90, h: 34 },
          actions.signOut,
        );
      }
      canvas.setAttribute(
        "aria-description",
        `${state.kind}. ${message} ${state.error}`,
      );
      return;
    }
    ui.button(
      "sign-out",
      "Sign out",
      { x: w - 110, y: 24, w: 90, h: 34 },
      actions.signOut,
      { disabled: state.pending },
    );
    const actor = state.character;
    const r = { x: 16, y: 100, w: w - 32, h: h - 116 };
    ui.panel(r, true);
    ui.text(
      actor ? actor.name : "Create character",
      r.x + 20,
      r.y + 18,
      30,
      palette.text,
      r.w - 40,
    );
    if (!actor) {
      detailRect = {
        x: r.x + 20,
        y: r.y + 62,
        w: r.w - 40,
        h: Math.max(1, r.h - 84),
      };
      detailsLimit = Math.max(0, (state.error ? 258 : 214) - detailRect.h);
      if (state.error && state.error !== creationError)
        detailsScroll = detailsLimit;
      creationError = state.error;
      detailsScroll = Math.min(detailsScroll, detailsLimit);
      ui.scrollRegion(detailRect, () => {
        ui.paragraph(
          "No character is linked to this account. Enter a name to create one.",
          { x: r.x + 20, y: r.y + 62 - detailsScroll, w: r.w - 40, h: 50 },
          16,
        );
        ui.input(
          "character-name",
          "Character name",
          name,
          {
            x: r.x + 20,
            y: r.y + 126 - detailsScroll,
            w: Math.min(420, r.w - 40),
            h: 42,
          },
          changeName,
          40,
          {
            disabled: state.pending,
            submit: () => {
              if (
                !state.pending &&
                name.trim().length >= 2 &&
                name.trim().length <= 40
              )
                actions.create(name.trim());
            },
          },
        );
        if (actions.account)
          ui.button(
            "character-transfer",
            "Character transfer",
            {
              x: r.x + 20,
              y: r.y + 240 - detailsScroll,
              w: Math.min(420, r.w - 40),
              h: 36,
            },
            actions.account,
            { disabled: state.pending },
          );
        ui.button(
          "create-character",
          state.pending ? "Creating…" : "Create character",
          {
            x: r.x + 20,
            y: r.y + 182 - detailsScroll,
            w: Math.min(420, r.w - 40),
            h: 42,
          },
          () => actions.create(name.trim()),
          {
            pending: state.pending,
            disabled: name.trim().length < 2 || name.trim().length > 40,
          },
        );
        if (state.error)
          ui.text(
            state.error,
            r.x + 20,
            r.y + 290 - detailsScroll,
            14,
            palette.red,
            r.w - 40,
          );
      });
    } else {
      creationError = "";
      const portraitState = portrait();
      const preview = portraitState.view;
      let failed = !!portraitState.failed;
      const area = compact
        ? {
            x: r.x + 20,
            y: r.y + 60,
            w: r.w - 40,
            h: Math.min(230, Math.max(80, (r.h - 160) * 0.4)),
          }
        : {
            x: r.x + 20,
            y: r.y + 60,
            w: Math.max(150, r.w * 0.46),
            h: r.h - 130,
          };
      if (preview) {
        const key = `${area.w}:${area.h}`;
        if (key !== portraitSize) {
          preview.resize(Math.round(area.w), Math.round(area.h));
          portraitSize = key;
        }
        try {
          preview.render(performance.now() / 1000, true);
        } catch {
          failed = true;
        }
        if (!failed && preview.presentationStatus === "ready")
          ctx.drawImage(preview.canvas, area.x, area.y, area.w, area.h);
        else
          ui.text(
            failed || preview.presentationStatus === "error"
              ? "Character preview unavailable"
              : "Loading character preview…",
            area.x,
            area.y + area.h / 2,
            16,
            palette.muted,
            area.w,
          );
        if (preview.needsRender) ui.invalidate();
      } else
        ui.text(
          failed
            ? "Character preview unavailable"
            : "Loading character preview…",
          area.x,
          area.y + area.h / 2,
          16,
          palette.muted,
          area.w,
        );
      if (failed || preview?.presentationStatus === "error")
        ui.button(
          "retry-preview",
          "Retry preview",
          {
            x: area.x,
            y: area.y + area.h / 2 + 30,
            w: Math.min(140, area.w),
            h: 32,
          },
          actions.retryPreview,
        );
      const x = compact ? r.x + 20 : area.x + area.w + 24;
      const top = compact ? area.y + area.h + 18 : r.y + 74;
      detailRect = {
        x,
        y: top,
        w: compact ? r.w - 40 : r.x + r.w - x - 20,
        h: Math.max(1, r.y + r.h - 90 - top),
      };
      let y = top - detailsScroll;
      ui.scrollRegion(detailRect, () => {
        const width = compact ? r.w - 40 : r.x + r.w - x - 20;
        ui.text(
          actor.shipName || "No ship assigned",
          x,
          y,
          18,
          palette.text,
          width,
        );
        y += 30;
        if (actor.health !== undefined && actor.maxHealth) {
          ui.text(
            `Health ${Math.round(actor.health)} / ${Math.round(actor.maxHealth)}`,
            x,
            y,
            15,
            palette.muted,
            width,
          );
          y += 23;
          ui.bar(
            { x, y, w: width, h: 10 },
            actor.health / actor.maxHealth,
            palette.red,
          );
          y += 25;
        }
        ui.text("Loadout", x, y, 20);
        y += 28;
        for (const item of actor.equipment) {
          ui.text(item.name, x, y, 15, palette.text, width);
          y += 20;
          ui.text(
            item.slot.replaceAll("-", " "),
            x,
            y,
            12,
            palette.muted,
            width,
          );
          y += 25;
        }
        if (!actor.equipment.length)
          ui.text("No items equipped.", x, y, 15, palette.muted, width);
      });
      detailsLimit = Math.max(0, y + detailsScroll - top - detailRect.h);
      detailsScroll = Math.min(detailsScroll, detailsLimit);
      ui.button(
        "enter-world",
        "Enter world",
        { x: r.x + 20, y: r.y + r.h - 56, w: Math.min(260, r.w - 40), h: 38 },
        actions.enter,
        { pending: state.pending },
      );
    }
    if (actor && state.error)
      ui.text(state.error, r.x + 20, r.y + r.h - 82, 14, palette.red, r.w - 40);
    canvas.setAttribute(
      "aria-description",
      actor
        ? `${actor.name}. ${actor.shipName}. ${actor.equipment.length} equipped items. Enter world is an explicit action.`
        : "Create a character. Choose a name between2 and40 characters.",
    );
  };
  ui.paint();
  return {
    invalidate: () => ui.invalidate(),
    snapshot: () => ({
      state: read().kind,
      controls: ui.hits.map(({ id, label, rect, disabled }) => ({
        id,
        label,
        rect,
        disabled,
      })),
    }),
    dispose: () => ui.dispose(),
  };
}
