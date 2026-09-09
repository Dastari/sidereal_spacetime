import { drawAppearanceControls } from "./appearance-controls";
import { drawGroundLoot } from "./ground-loot";
import type { GroundItemLabel } from "../../render/src/ground-items";
import type { LocalLightLimit } from "../../render/src/local-light-budget";
import { topHudLayout } from "./system-menu-layout";
import { drawGraphicsMenu } from "./graphics-menu";
import type { GraphicsSettings } from "../../render/src/graphics-settings";
import {
  createObjectDetailsUI,
  type ObjectDetailsState,
  type ObjectDetailsActions,
} from "./object-details";
export type {
  ObjectDetailsState,
  ObjectDetailsActions,
} from "./object-details";
import { destinationPagination } from "./destinations";
import {
  createInventoryUI,
  type InventoryState,
  type InventoryActions,
} from "./inventory";
export type { InventoryState, InventoryActions } from "./inventory";
import {
  resolveCrewAppearance,
  CREW_OUTFITS,
  type CrewAppearance,
} from "../../render/src/crew/appearance";
import type { Scene } from "@babylonjs/core/scene";
import { CanvasUI, palette } from "./toolkit";
import { drawVitalBars } from "./character-sheet";
import { actionBarRect } from "./action-bar";
import { createDiagnosticsUI } from "./diagnostics";
import type { RenderDiagnostics } from "../../render/src/diagnostics";
import {
  clampWindow,
  destinationBearing,
  flex,
  grid,
  type Rect,
} from "./layout";
export { gameplayIntent } from "./layout";
export type GameUIState = {
  characterAppearance?: CrewAppearance;
  graphics?: GraphicsSettings;
  localLightLimit?: LocalLightLimit;
  combat?: {
    enabled: boolean;
    active: boolean;
    weaponName: string;
    energy: number;
    capacity: number;
    shotCost: number;
  };
  inventory?: InventoryState;
  objectDetails?: ObjectDetailsState;
  interactionPrompt?: string;
  status: string;
  error: string;
  modelStatus: string;
  hasActor: boolean;
  connected: boolean;
  actorName: string;
  shipName: string;
  seated: boolean;
  resting?: boolean;
  nearStation: boolean;
  interior: boolean;
  speed?: number;
  heading?: number;
  mass?: number;
  thrust?: number;
  x?: number;
  y?: number;
  revision?: string;
  receipts: number;
  pending: boolean;
  vistaId: string;
  reducedMotion: boolean;
  destinations: {
    id: string;
    name: string;
    kind: string;
    x: number;
    y: number;
  }[];
};
export type GameUIActions = {
  groundItems?: () => readonly GroundItemLabel[];
  graphics?: (patch: Partial<GraphicsSettings>) => void;
  graphicsReset?: () => void;
  localLightLimit?: (limit: LocalLightLimit) => void;
  combat?: () => void;
  inventory?: InventoryActions;
  objectDetails?: ObjectDetailsActions;
  interact?: () => void;
  diagnostics?: (enabled: boolean) => RenderDiagnostics | undefined;
  diagnosticsToggle?: (
    key:
      "lighting" | "equipment" | "shadows" | "glow" | "planets" | "characters",
  ) => void;
  diagnosticsReset?: () => void;
  view: () => void;
  station: () => void;
  enter: (name: string) => void;
  rename: (name: string) => void;
  vista: (id: string) => void;
  motion: (reduced: boolean) => void;
  camera: () => void;
  focusDestination: (id?: string) => void;
  crew: (appearance: CrewAppearance) => void;
  dismiss: () => void;
  retry: () => void;
};
export function createGameUI(
  canvas: HTMLCanvasElement,
  scene: Scene,
  initial: GameUIState,
  actions: GameUIActions,
  vistas: readonly { id: string; name: string }[],
) {
  const ui = new CanvasUI(canvas, scene);
  const diagnostics = createDiagnosticsUI(
    ui,
    actions.diagnostics,
    actions.diagnosticsToggle || actions.diagnosticsReset
      ? { toggle: actions.diagnosticsToggle, reset: actions.diagnosticsReset }
      : undefined,
  );
  const objectDetails = actions.objectDetails
    ? createObjectDetailsUI(ui, actions.objectDetails)
    : undefined;
  let navVisible = false;
  const inventory = actions.inventory
    ? createInventoryUI(ui, actions.inventory, {
        presets: Object.keys(CREW_OUTFITS),
        appearance: () => appearance,
        change: (patch) => {
          appearance = { ...appearance, ...patch };
          customize();
        },
        selected: () => resolveCrewAppearance(appearance).outfit,
        reducedMotion: () => state.reducedMotion,
        label: (preset) =>
          CREW_OUTFITS[preset as keyof typeof CREW_OUTFITS]?.name ?? preset,
        select: (preset) => {
          appearance = { outfit: preset as CrewAppearance["outfit"] };
          customize();
        },
      })
    : undefined;
  let state = initial,
    menu = false,
    tab: "Display" | "Graphics" | "Vessel" | "Crew" | "Controls" = "Display",
    help = true;
  let inspectingDestination = false;
  let selectedDestination = "",
    navExpanded = false,
    destinationPage = 0,
    scrollY = 0,
    maxScroll = 0;
  let showGroundLabels = true;
  ui.shortcut = (code) => {
    if (code === "KeyZ" && state.hasActor && !menu) {showGroundLabels=!showGroundLabels;ui.invalidate();return true;}
    if (code === "F3") {
      diagnostics.toggle();
      return true;
    }
    if (!state.hasActor || !state.connected || !inventory || !state.inventory)
      return false;
    if ((code === "KeyI" || code === "KeyC") && !menu) {
      inventory.toggle(code === "KeyI" ? "inventory" : "character");
      return true;
    }
    if (!menu && inventory.isOpen() && code === "KeyR")
      return inventory.rotate();
    if (!menu && !inventory.isOpen() && /^Digit[1-5]$/.test(code)) {
      actions.inventory?.activateHotbar(Number(code.slice(-1)) - 1);
      return true;
    }
    if (!menu && (code === "Digit9" || code === "Digit0")) {
      inventory.quickSlot(
        code === "Digit9" ? 0 : 1,
        state.inventory,
        inventory.isOpen(),
        state.pending,
      );
      return true;
    }
    return false;
  };
  ui.scroll = (delta, x, y, horizontalDelta) => {
    if (diagnostics.scroll(delta, x, y)) return;
    if (!menu && objectDetails?.scroll(delta, x, y)) return;
    if (inventory?.isOpen()) {
      inventory.scroll(delta, x, y, horizontalDelta);
      return;
    }
    if (menu) {
      scrollY = Math.max(0, Math.min(maxScroll, scrollY + delta));
      ui.focus = "";
      ui.invalidate();
    }
  };
  let windowRect: Rect | undefined,
    name = "Captain",
    shipDraft = initial.shipName,
    draftSource = initial.shipName;
  let appearance: CrewAppearance = { ...initial.characterAppearance };
  let appearanceServerJson = JSON.stringify(initial.characterAppearance ?? {});
  const customize = () => {
    actions.crew(appearance);
    ui.invalidate();
  };
  const change = () => ui.invalidate();
  ui.escape = () => {
    if (menu) menu = false;
    else if (inventory?.isOpen()) inventory.close();
    else if (objectDetails?.isOpen()) objectDetails.close();
    else menu = !menu;
    change();
  };
  const setMenu = () => {
    menu = !menu;
    ui.focus = "";
    change();
  };
  const num = (v: number | undefined, precision = 1) =>
    v === undefined
      ? "—"
      : v.toLocaleString(undefined, {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        });
  ui.draw = () => {
    canvas.setAttribute(
      "aria-description",
      `${state.modelStatus}. Connection ${state.status}. ${state.hasActor ? `${state.shipName}. ${state.interior ? "Deck" : "Flight"} view. ${state.seated ? "Control seat occupied" : state.resting ? "Seated" : "On foot"}.` : "Character entry"} ${state.error}`,
    );
    const w = ui.width,
      h = ui.height,
      narrow = w < 700;
    // Floating inventory/character windows own their panel bounds, not the
    // uncovered world. Keyboard/gameplay remains blocked while they are open.
    ui.modal = menu || !state.hasActor || state.status !== "ready";
    if (showGroundLabels && !menu && state.interior) drawGroundLoot(ui,actions.groundItems?.() ?? [],id=>actions.inventory?.transferItem?.(id,""),state.pending);
    const nav = [
      ...(actions.combat
        ? [
            {
              id: "combat-toggle",
              label: "Combat",
              width: 90,
              action: actions.combat,
              selected: state.combat?.enabled,
            },
          ]
        : []),
      {
        id: "navigation",
        label: "Map",
        width: 65,
        action: () => {
          navVisible = !navVisible;
          change();
        },
        selected: navVisible,
      },
      {
        id: "character-open",
        label: "Character",
        width: 96,
        action: () => inventory?.toggle("character"),
        selected: inventory?.isOpen("character"),
      },
      {
        id: "inventory-open",
        label: "Inventory",
        width: 94,
        action: () => inventory?.toggle("inventory"),
        selected: inventory?.isOpen("inventory"),
      },
      {
        id: "view",
        label: state.interior ? "Flight" : "Deck",
        width: 65,
        action: actions.view,
        selected: false,
      },
      { id: "menu", label: "Menu", width: 66, action: setMenu, selected: menu },
    ];
    const topHud = topHudLayout(
      w,
      nav.map((item) => item.width),
    );
    ui.panel(topHud.vessel);
    ui.text(
      state.shipName || "Sidereal",
      topHud.vessel.x + 12,
      topHud.vessel.y + 11,
      21,
      palette.text,
      topHud.vessel.w - 24,
    );
    nav.forEach((v, i) =>
      ui.button(v.id, v.label, topHud.buttons[i], v.action, {
        selected: v.selected,
        disabled: !state.hasActor && v.id !== "menu",
      }),
    );
    if (state.hasActor && !inventory?.isOpen() && !menu) {
      const r = {
        x: 16,
        y: w < 1150 ? Math.max(70, h - 268) : h - 173,
        w: Math.min(233, w - 32),
        h: 160,
      };
      ui.panel(r);
      ui.text(state.actorName, r.x + 12, r.y + 8, 17, palette.text, r.w - 24);
      ui.text(
        `${state.seated ? "Helm" : state.resting ? "Seated" : "On foot"}   /   ${num(state.speed)} m/s   /   ${num(state.heading, 0)}°`,
        r.x + 12,
        r.y + 32,
        12,
        palette.muted,
        r.w - 24,
      );
      if (state.interactionPrompt || state.nearStation || state.seated)
        ui.button(
          "station",
          state.interactionPrompt
            ? "E   " + state.interactionPrompt
            : state.seated
              ? "E   Leave seat"
              : "E   Control seat",
          {
            x: Math.max(16, w - 200),
            y: w < 1150 ? h - 146 : h - 63,
            w: 184,
            h: 39,
          },
          actions.interact ?? actions.station,
          { accent: true, disabled: !state.connected },
        );
      drawVitalBars(ui, { x: r.x + 12, y: r.y + 45, w: r.w - 24, h: 90 }, true);
      ui.text("Vitals preview", r.x + 12, r.y + 148, 9, palette.muted);
      if (help && w > 1180)
        ui.text(
          state.resting
            ? "Stand up to walk · C character · I inventory"
            : state.seated
              ? "W / S thrust · A / D turn · Release to brake"
              : state.combat?.enabled
                ? "Mouse aim · Left click fire · Right-drag orbit · V leave combat"
                : "WASD walk · Shift sprint · C character · I inventory · Z loot labels",
          270,
          h - 116,
          12,
          palette.muted,
          w - 300,
        );
    }
    if (state.combat?.enabled && !inventory?.isOpen() && !menu) {
      const r = {
        x: Math.max(16, (w - 300) / 2),
        y: h - 170,
        w: Math.min(300, w - 32),
        h: 64,
      };
      ui.panel(r, true);
      ui.text(
        state.combat.weaponName || "Equip a weapon",
        r.x + 12,
        r.y + 8,
        16,
        palette.text,
        r.w - 24,
      );
      ui.text(
        `Energy ${Math.floor(state.combat.energy)} / ${state.combat.capacity} · ${state.combat.shotCost} / shot`,
        r.x + 12,
        r.y + 32,
        12,
        palette.muted,
        r.w - 24,
      );
      ui.ctx.fillStyle = "#173450";
      ui.ctx.fillRect(r.x + 12, r.y + 51, r.w - 24, 5);
      ui.ctx.fillStyle = palette.blue;
      ui.ctx.fillRect(
        r.x + 12,
        r.y + 51,
        (r.w - 24) *
          Math.max(
            0,
            Math.min(
              1,
              state.combat.energy / Math.max(1, state.combat.capacity),
            ),
          ),
        5,
      );
    }
    if (state.status !== "ready" || !state.connected)
      ui.text("● " + state.status, 24, topHud.bottom + 8, 12, palette.gold);
    if (
      state.hasActor &&
      state.connected &&
      navVisible &&
      state.destinations.length &&
      h > 360
    ) {
      const destination =
        state.destinations.find((d) => d.id === selectedDestination) ??
        state.destinations[0];
      selectedDestination = destination.id;
      const {
        distance,
        bearing,
        turn: delta,
      } = destinationBearing(
        state.x ?? 0,
        state.y ?? 0,
        state.heading ?? 0,
        destination.x,
        destination.y,
      );
      const pagination = destinationPagination(
        state.destinations.length,
        h,
        Math.max(narrow ? 106 : 140, topHud.bottom + 14),
        destinationPage,
      );
      const { rows: destinationRows, pages: destinationPages } = pagination;
      destinationPage = pagination.page;
      const r = {
        x: narrow ? 18 : w - 280,
        y: pagination.top,
        w: narrow ? w - 36 : 262,
        h: navExpanded ? pagination.panelHeight : 153,
      };
      ui.panel(r);
      ui.button(
        "destinations",
        "◇  " + destination.name + (navExpanded ? "   −" : "   +"),
        { x: r.x + 10, y: r.y + 9, w: r.w - 20, h: 32 },
        () => {
          navExpanded = !navExpanded;
          change();
        },
        { selected: navExpanded },
      );
      ui.text(
        (distance >= 1000
          ? num(distance / 1000, 2) + " km"
          : num(distance, 0) + " m") +
          "   /   " +
          num(bearing, 0) +
          "°",
        r.x + 14,
        r.y + 49,
        23,
        palette.gold,
        r.w - 28,
      );
      ui.text(
        state.seated
          ? Math.abs(delta) < 3
            ? "Bearing aligned · W applies thrust"
            : (delta > 0 ? "A  turn left " : "D  turn right ") +
              num(Math.abs(delta), 0) +
              "°"
          : "Known destination · select to navigate",
        r.x + 14,
        r.y + 82,
        13,
        palette.muted,
        r.w - 28,
      );
      ui.button(
        "look-destination",
        inspectingDestination ? "Return to ship" : "Observe destination",
        { x: r.x + 12, y: r.y + 111, w: r.w - 24, h: 29 },
        () => {
          inspectingDestination = !inspectingDestination;
          actions.focusDestination(
            inspectingDestination ? destination.id : undefined,
          );
          change();
        },
      );
      if (navExpanded) {
        state.destinations
          .slice(
            destinationPage * destinationRows,
            (destinationPage + 1) * destinationRows,
          )
          .forEach((d, i) =>
            ui.button(
              "destination-" + d.id,
              "◇  " + d.name,
              { x: r.x + 12, y: r.y + 151 + i * 34, w: r.w - 24, h: 29 },
              () => {
                selectedDestination = d.id;
                if (inspectingDestination) actions.focusDestination(d.id);
                navExpanded = false;
                change();
              },
              { selected: destination.id === d.id },
            ),
          );
        const pageY = r.y + 155 + destinationRows * 34;
        ui.button(
          "destinations-prev",
          "←",
          { x: r.x + 12, y: pageY, w: 44, h: 28 },
          () => {
            destinationPage--;
            change();
          },
          { disabled: destinationPage === 0 },
        );
        ui.text(
          `${destinationPage + 1} / ${destinationPages}`,
          r.x + 68,
          pageY + 5,
          14,
          palette.muted,
          r.w - 130,
        );
        ui.button(
          "destinations-next",
          "→",
          { x: r.x + r.w - 56, y: pageY, w: 44, h: 28 },
          () => {
            destinationPage++;
            change();
          },
          { disabled: destinationPage >= destinationPages - 1 },
        );
      }
    }
    if (state.error && (!inventory?.isOpen() || state.status !== "ready")) {
      const r = { x: 18, y: 155, w: Math.min(500, w - 36), h: 112 };
      ui.panel(r, true);
      ui.text("Action could not complete", r.x + 14, r.y + 12, 17, palette.red);
      ui.text(state.error, r.x + 14, r.y + 39, 14, palette.muted, r.w - 28);
      ui.button(
        "dismiss",
        "Dismiss",
        { x: r.x + 14, y: r.y + 68, w: 100, h: 30 },
        actions.dismiss,
      );
    }
    if (!state.hasActor || state.status !== "ready") {
      const r = clampWindow(
        { x: (w - 420) / 2, y: (h - 360) / 2, w: 420, h: 360 },
        w,
        h,
      );
      ui.panel(r, true);
      ui.text(
        state.status === "ready"
          ? "Take the controls."
          : state.status === "offline"
            ? "Connection lost"
            : "Connecting to your world",
        r.x + 24,
        r.y + 22,
        30,
        palette.text,
        r.w - 48,
      );
      ui.paragraph(
        state.status === "ready"
          ? "Create a persistent test character and your own private ship."
          : state.status === "offline"
            ? "Your controls are inactive. Reconnect to resume your character."
            : "Waiting for your permitted character and vessel data.",
        { x: r.x + 24, y: r.y + 74, w: r.w - 48, h: 50 },
      );
      if (state.status === "ready") {
        ui.text("Character name", r.x + 24, r.y + 140, 14, palette.muted);
        ui.input(
          "character-name",
          "Character name",
          name,
          { x: r.x + 24, y: r.y + 166, w: r.w - 48, h: 42 },
          (v) => {
            name = v;
            change();
          },
        );
        ui.button(
          "enter",
          state.pending ? "Entering…" : "Enter flight laboratory",
          { x: r.x + 24, y: r.y + 230, w: r.w - 48, h: 44 },
          () => actions.enter(name),
          { accent: true, disabled: state.pending || name.trim().length < 2 },
        );
        ui.paragraph(
          "Local development identity. Separate from your original account.",
          { x: r.x + 24, y: r.y + 290, w: r.w - 48, h: 44 },
          13,
        );
      } else if (state.status === "offline")
        ui.button(
          "reconnect",
          "Reconnect",
          { x: r.x + 24, y: r.y + 178, w: r.w - 48, h: 44 },
          actions.retry,
          { accent: true },
        );
      else
        ui.text(
          state.modelStatus,
          r.x + 24,
          r.y + 188,
          15,
          palette.blue,
          r.w - 48,
        );
    }
    if (menu) {
      windowRect = clampWindow(
        windowRect ?? { x: (w - 620) / 2, y: (h - 560) / 2, w: 620, h: 560 },
        w,
        h,
      );
      const r = windowRect;
      ui.panel(r, true);
      ui.text("System menu", r.x + 18, r.y + 14, 25);
      ui.drag(
        "window-drag",
        "Move console",
        { x: r.x, y: r.y, w: r.w - 60, h: 48 },
        (dx, dy) => {
          windowRect = { ...r, x: windowRect!.x + dx, y: windowRect!.y + dy };
          change();
        },
      );
      ui.button(
        "close",
        "×",
        { x: r.x + r.w - 44, y: r.y + 10, w: 32, h: 32 },
        setMenu,
      );
      const tabWidth = r.w < 440 ? 86 : 112;
      (["Display", "Graphics", "Vessel", "Crew", "Controls"] as const).forEach(
        (value, i) =>
          ui.button(
            "tab-" + value,
            value,
            { x: r.x + 12, y: r.y + 66 + i * 45, w: tabWidth, h: 38 },
            () => {
              tab = value;
              scrollY = 0;
              ui.focus = "";
              change();
            },
            { selected: tab === value },
          ),
      );
      const viewport = {
        x: r.x + tabWidth + 28,
        y: r.y + 70,
        w: r.w - tabWidth - 64,
        h: Math.max(40, r.h - 130),
      };
      const contentHeight =
        tab === "Graphics"
          ? 570
          : tab === "Crew"
            ? 600
            : tab === "Controls"
              ? 330
              : 300;
      maxScroll = Math.max(0, contentHeight - viewport.h);
      scrollY = Math.min(scrollY, maxScroll);
      const inner = { ...viewport, y: viewport.y - scrollY };
      const contentStart = ui.hits.length;
      ui.ctx.save();
      ui.ctx.beginPath();
      ui.ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
      ui.ctx.clip();
      if (tab === "Graphics") {
        drawGraphicsMenu(
          ui,
          inner,
          state.graphics,
          actions.graphics,
          actions.graphicsReset,
          state.localLightLimit,
          actions.localLightLimit,
        );
      } else if (tab === "Display") {
        ui.slider(
          "opacity",
          "Panel opacity",
          ui.opacity,
          { ...inner, h: 53 },
          (v) => {
            ui.opacity = Math.max(0.3, v);
            change();
          },
        );
        ui.toggle(
          "motion",
          "Reduced motion",
          state.reducedMotion,
          { ...inner, y: inner.y + 69, h: 38 },
          actions.motion,
        );
        ui.toggle(
          "hints",
          "Control hints",
          help,
          { ...inner, y: inner.y + 117, h: 38 },
          (v) => {
            help = v;
            change();
          },
        );
        ui.text("Space vista", inner.x, inner.y + 174, 15, palette.muted);
        const current = Math.max(
          0,
          vistas.findIndex((v) => v.id === state.vistaId),
        );
        ui.button(
          "vista",
          `${vistas[current]?.name ?? "Default"}   ›`,
          { ...inner, y: inner.y + 201, h: 40 },
          () => actions.vista(vistas[(current + 1) % vistas.length].id),
        );
        const sizes = flex({ ...inner, y: inner.y + 258, h: 36 }, [1, 1, 1]);
        [1, 1.35, 1.6].forEach((value, i) =>
          ui.button(
            "scale-" + value,
            `${Math.round(value * 100)}% UI`,
            sizes[i],
            () => {
              ui.scale = value;
              windowRect = undefined;
              change();
            },
            { selected: ui.scale === value },
          ),
        );
      } else if (tab === "Vessel") {
        ui.text("Vessel name", inner.x, inner.y, 14, palette.muted);
        ui.input(
          "ship-name",
          "Vessel name",
          shipDraft,
          { ...inner, y: inner.y + 25, h: 40 },
          (v) => {
            shipDraft = v;
            change();
          },
          48,
        );
        ui.button(
          "rename",
          state.pending ? "Saving…" : "Save vessel name",
          { ...inner, y: inner.y + 76, h: 38 },
          () => actions.rename(shipDraft),
          {
            disabled:
              !state.hasActor ||
              !state.connected ||
              state.pending ||
              shipDraft === state.shipName ||
              shipDraft.trim().length < 2,
          },
        );
        const rows = [
          `Mass     ${num(state.mass === undefined ? undefined : state.mass / 1000)} t`,
          `Main engines     ${num(state.thrust === undefined ? undefined : state.thrust / 1000)} kN`,
          `World position     ${num(state.x)}, ${num(state.y)} m`,
          `Revision     ${state.revision ?? "—"}`,
          `Saved edit receipts     ${state.receipts}`,
        ];
        rows.forEach((v, i) =>
          ui.text(
            v,
            inner.x,
            inner.y + 135 + i * 29,
            15,
            i === 3 ? palette.blue : palette.text,
            inner.w,
          ),
        );
      } else if (tab === "Crew") {
        const height = drawAppearanceControls(ui, inner, appearance, patch => {
          appearance = { ...appearance, ...patch };
          customize();
        });
        maxScroll = Math.max(0, height - viewport.h);
      } else {
        const rows = [
          "W / S      Thrust forward / reverse",
          "A / D      Turn left / right",
          "WASD      Walk relative to camera · Shift sprint",
          "Tab      Change view only",
          "E      Enter / leave nearby control seat",
          "Right-drag      Orbit on deck",
          "Wheel      Zoom in deck / flight view",
          "I / C      Inventory / character · F3 diagnostics",
          "F6      Focus interface, then Tab to navigate",
        ];
        rows.forEach((value, i) =>
          ui.text(value, inner.x, inner.y + i * 30, 15, palette.text, inner.w),
        );
        ui.button(
          "camera",
          "Reset camera",
          { ...inner, y: inner.y + 283, h: 38 },
          () => {
            inspectingDestination = false;
            actions.camera();
            change();
          },
        );
      }
      ui.ctx.restore();
      // Remove every partially clipped content control from pointer/focus navigation.
      ui.hits = ui.hits.filter(
        (hit, i) =>
          i < contentStart ||
          (hit.rect.y >= viewport.y &&
            hit.rect.y + hit.rect.h <= viewport.y + viewport.h),
      );
      if (maxScroll > 0) {
        const sx = r.x + r.w - 29;
        ui.button(
          "scroll-up",
          "↑",
          { x: sx - 3, y: viewport.y, w: 25, h: 28 },
          () => ui.scroll(-80),
          { disabled: scrollY === 0 },
        );
        ui.button(
          "scroll-down",
          "↓",
          { x: sx - 3, y: viewport.y + viewport.h - 28, w: 25, h: 28 },
          () => ui.scroll(80),
          { disabled: scrollY === maxScroll },
        );
        const track = viewport.h - 66;
        ui.ctx.fillStyle = "#163d60";
        ui.ctx.fillRect(sx + 7, viewport.y + 33, 4, track);
        ui.ctx.fillStyle = palette.blue;
        ui.ctx.fillRect(
          sx + 5,
          viewport.y + 33 + ((track - 16) * scrollY) / maxScroll,
          8,
          16,
        );
      }
      ui.text(
        maxScroll
          ? "Wheel / PgUp / PgDn scroll · Controls paused"
          : "Controls paused. The world continues.",
        r.x + 20,
        r.y + r.h - 36,
        13,
        palette.gold,
        r.w - 50,
      );
      ui.text("◢", r.x + r.w - 22, r.y + r.h - 23, 17, palette.blue);
      ui.drag(
        "window-resize",
        "Resize console",
        { x: r.x + r.w - 28, y: r.y + r.h - 28, w: 28, h: 28 },
        (dx, dy) => {
          windowRect = {
            ...windowRect!,
            w: Math.max(340, windowRect!.w + dx),
            h: Math.max(470, windowRect!.h + dy),
          };
          change();
        },
      );
      // Modal console owns focus and pointer input; underlying HUD stays visible.
      const start = ui.hits.findIndex((hit) => hit.id === "window-drag");
      ui.hits = ui.hits.slice(start);
    }
    if (
      inventory &&
      state.inventory &&
      state.hasActor &&
      state.status === "ready"
    ) {
      if (!menu && !inventory.isOpen()) {
        inventory.hotbar(
          state.inventory,
          actionBarRect(w, h),
          false,
          state.pending,
        );
      }
      if (inventory.isOpen() && !menu)
        inventory.draw(
          state.inventory,
          { x: 0, y: 0, w, h },
          state.actorName,
          () => inventory.close(),
          state.pending,
          state.error,
          actions.dismiss,
        );
    }
    if (!menu && state.hasActor && state.status === "ready")
      objectDetails?.draw(state.objectDetails, state.pending);
    diagnostics.draw();
    const disabledVisuals = diagnostics.disabled();
    if (disabledVisuals.length)
      ui.text(
        `Visual debug: ${disabledVisuals.join(", ")} off · F3`,
        24,
        topHud.bottom + (state.status === "ready" ? 8 : 25),
        12,
        palette.gold,
        w - 48,
      );
    if (ui.keyboard)
      ui.text(
        "Interface focus   •   Tab next   •   Enter select   •   F6 return to game",
        18,
        h - 18,
        12,
        palette.gold,
        w - 36,
      );
  };
  return {
    update(next: GameUIState) {
      const serialized = JSON.stringify(next.characterAppearance ?? {});
      if (serialized !== appearanceServerJson) {
        appearance = { ...next.characterAppearance };
        appearanceServerJson = serialized;
      }
      state = next;
      if (state.shipName !== draftSource) {
        draftSource = state.shipName;
        shipDraft = draftSource;
      }
      change();
    },
    openContainer(id: string) {
      if (!state.connected || !state.inventory || !inventory) return false;
      const opened = inventory.openContainer(id, state.inventory);
      if (opened) {
        menu = false;
        change();
      }
      return opened;
    },
    blocked: () => !!inventory?.isOpen() || menu || ui.blocked(),
    pointerBlocked: () => menu || ui.pointerBlocked(),
    dispose: () => {
      inventory?.dispose();
      objectDetails?.dispose();
      diagnostics.dispose();
      ui.dispose();
    },
  };
}
