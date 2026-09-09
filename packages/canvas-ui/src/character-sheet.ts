import {
  CHARACTER_HAIR_STYLES,
  type EquipmentSlot,
} from "@sidereal/content/character-components";
import {
  resolveCrewAppearance,
  type CrewAppearance,
} from "@sidereal/render/crew/appearance";
import type { InventoryState } from "./inventory";
import {
  INVENTORY_DEFINITIONS,
  type InventoryDefinition,
  characterEquipmentFromInventory,
} from "../../content/src/inventory";
import { CanvasUI, palette } from "./toolkit";
import type { Rect } from "./layout";
import { createCrewPortrait } from "./crew-portrait";

import { CHARACTER_PREVIEW, STAT_GROUPS, itemRarity } from "./character-data";
import {
  drawItemFrame,
  ITEM_RARITY_PALETTES,
  type ItemRarity,
} from "./item-frame";
import { drawHudIcon, type HudIconKind } from "./hud-icons";
import type { createCharacterPreview } from "../../render/src/character-preview";

export type CharacterCosmetics = {
  presets: readonly string[];
  selected: () => string;
  label?: (preset: string) => string;
  select: (preset: string) => void;
  reducedMotion?: () => boolean;
  appearance?: () => CrewAppearance;
  change?: (patch: CrewAppearance) => void;
};
export function drawVitalBars(ui: CanvasUI, r: Rect, compact = false) {
  const rows = CHARACTER_PREVIEW.vitals,
    row = compact ? 25 : 40;
  rows.forEach((v, i) => {
    const y = r.y + i * row;
    drawHudIcon(
      ui,
      { x: r.x, y, w: compact ? 19 : 23, h: compact ? 19 : 23 },
      v.icon,
      { color: v.color, glow: true },
    );
    ui.text(v.label, r.x + 29, y, compact ? 10 : 12, palette.muted);
    ui.text(
      `${v.current} / ${v.max}`,
      r.x + r.w - 69,
      y,
      compact ? 10 : 12,
      palette.text,
      69,
    );
    const b = {
      x: r.x + 29,
      y: y + (compact ? 15 : 22),
      w: r.w - 31,
      h: compact ? 5 : 9,
    };
    const c = ui.ctx;
    c.save();
    c.fillStyle = "#030b19";
    c.fillRect(b.x, b.y, b.w, b.h);
    c.strokeStyle = "#346487";
    c.lineWidth = 1;
    c.strokeRect(b.x - 0.5, b.y - 0.5, b.w + 1, b.h + 1);
    c.shadowColor = v.color;
    c.shadowBlur = 8;
    c.fillStyle = v.color;
    c.fillRect(
      b.x + 1,
      b.y + 1,
      ((b.w - 2) * v.current) / v.max,
      Math.max(2, b.h - 2),
    );
    c.fillStyle = "#ffffff66";
    c.fillRect(b.x + 1, b.y + 1, ((b.w - 2) * v.current) / v.max, 1);
    c.restore();
  });
}
function section(ui: CanvasUI, r: Rect, title: string) {
  const panelCount = ui.panels.length;
  ui.panel(r);
  // The outer floating window owns input; clipped interior sections do not.
  ui.panels.length = panelCount;
  ui.text(title, r.x + 10, r.y + 7, 16, palette.blue, r.w - 20);
  ui.ctx.fillStyle = "#2676a877";
  ui.ctx.fillRect(r.x + 10, r.y + 29, r.w - 20, 1);
}
export function createCharacterSheet(
  ui: CanvasUI,
  options: {
    cosmetics?: CharacterCosmetics;
    icon: (ui: CanvasUI, d: InventoryDefinition, r: Rect) => void;
    equipment: (slot: EquipmentSlot) => void;
    equipmentHit?: (slot: EquipmentSlot, box: Rect) => void;
  },
) {
  const fallback = createCrewPortrait(ui);
  let preview: ReturnType<typeof createCharacterPreview> | undefined;
  let loading = false,
    disposed = false,
    rotation = -0.3,
    statsTab = "Overview",
    page = "Equipment";
  let viewport: Rect | undefined;
  const ensurePreview = () => {
    if (loading || disposed || typeof document === "undefined") return;
    loading = true;
    void import("../../render/src/character-preview")
      .then(({ createCharacterPreview }) => {
        if (disposed) return;
        preview = createCharacterPreview({
          width: 360,
          height: 540,
          onInvalidate: () => ui.invalidate(),
        });
        preview.setRotation(rotation);
        void preview.ready
          .then(() => ui.invalidate())
          .catch(() => ui.invalidate());
        ui.invalidate();
      })
      .catch(() => ui.invalidate());
  };
  function identity(r: Rect, name: string, state: InventoryState) {
    section(ui, { ...r, h: 142 }, "CREW MEMBER");
    ui.text(name, r.x + 12, r.y + 39, 25, palette.text, r.w - 24);
    ui.text(
      "Explorer · Human Federation",
      r.x + 12,
      r.y + 72,
      11,
      palette.blue,
      r.w - 24,
    );
    ui.text("LEVEL 12", r.x + 12, r.y + 94, 13, palette.blue);
    ui.text("3,450 / 6,000 XP", r.x + r.w - 105, r.y + 96, 10, palette.muted);
    ui.bar(
      { x: r.x + 12, y: r.y + 116, w: r.w - 24, h: 9 },
      3450 / 6000,
      "#9f64ff",
    );
    const v = { x: r.x, y: r.y + 152, w: r.w, h: 199 };
    section(ui, v, "CORE STATS");
    drawVitalBars(ui, { x: v.x + 10, y: v.y + 38, w: v.w - 20, h: 160 });
    const a = { x: r.x, y: r.y + 361, w: r.w, h: 167 };
    section(ui, a, "ATTRIBUTES");
    CHARACTER_PREVIEW.attributes.forEach(([label, value], i) => {
      const y = a.y + 38 + i * 24;
      drawHudIcon(
        ui,
        { x: a.x + 10, y, w: 17, h: 17 },
        (["cargo", "stamina", "scan", "heart", "gear"] as HudIconKind[])[i],
        { color: palette.blue },
      );
      ui.text(label, a.x + 35, y + 1, 12, palette.muted);
      ui.text(String(value), a.x + a.w - 32, y + 1, 13, palette.text);
    });
    ui.text(
      `${state.carriedMassKg.toFixed(1)} / ${state.carryLimitKg} kg carried`,
      r.x + 8,
      r.y + 530,
      12,
      palette.muted,
      r.w - 16,
    );
  }
  function equipment(r: Rect, state: InventoryState, pending: boolean) {
    section(ui, { ...r, h: 528 }, "EQUIPMENT");
    const look = resolveCrewAppearance(options.cosmetics?.appearance?.() ?? {});
    const body = look.bodyType,
      hair = look.hairStyle;
    const choiceWidth = (r.w - 28) / 2;
    ui.button(
      "character-body",
      body === "female" ? "Body: Female" : "Body: Male",
      { x: r.x + 12, y: r.y + 36, w: choiceWidth, h: 27 },
      () => {
        options.cosmetics?.change?.({
          bodyType: body === "female" ? "male" : "female",
        });
        ui.invalidate();
      },
      { disabled: !options.cosmetics?.change },
    );
    ui.button(
      "character-hair",
      "Hair: " + hair,
      { x: r.x + 16 + choiceWidth, y: r.y + 36, w: choiceWidth, h: 27 },
      () => {
        options.cosmetics?.change?.({
          hairStyle:
            CHARACTER_HAIR_STYLES[
              (CHARACTER_HAIR_STYLES.indexOf(hair) + 1) %
                CHARACTER_HAIR_STYLES.length
            ],
        });
        ui.invalidate();
      },
      { disabled: !options.cosmetics?.change },
    );
    const cardW = Math.max(65, Math.min(90, r.w * 0.245));
    const view = {
      x: r.x + cardW + 4,
      y: r.y + 68,
      w: r.w - 2 * cardW - 8,
      h: Math.min(383, Math.max(96, (viewport?.h ?? 546) - 130)),
    };
    const visible =
      !viewport ||
      (view.y + view.h > viewport.y && view.y < viewport.y + viewport.h);
    if (visible) ensurePreview();
    const preset = options.cosmetics?.selected() ?? "crew";
    const held = state.items.find((i) => i.equipmentSlot === "hand");
    const heldDef = INVENTORY_DEFINITIONS.find(
      (d) => d.id === held?.definitionId,
    );
    if (preview && visible) {
      preview.resize(Math.round(view.w * 1.5), Math.round(view.h * 1.5));
      preview.setAppearance(preset, {
        ...options.cosmetics?.appearance?.(),
        equippedComponents: characterEquipmentFromInventory(state.items),
        weapon: heldDef?.pose ?? "none",
        backpack: state.items.some((i) => i.equipmentSlot === "back"),
        backpackStyle: "utility",
        equipmentAsset: heldDef?.assetId,
      });
      preview.render(
        performance.now() / 1000,
        options.cosmetics?.reducedMotion?.() ?? false,
      );
      if (preview.status === "ready")
        ui.ctx.drawImage(preview.canvas, view.x, view.y, view.w, view.h);
      else fallback(preset, { ...view, h: view.h - 24 });
      if (
        preview.status !== "error" &&
        (!options.cosmetics?.reducedMotion?.() || preview.needsRender)
      )
        ui.invalidate();
    } else fallback(preset, { ...view, h: view.h - 24 });
    ui.drag("character-rotate", "Rotate character preview", view, (dx) => {
      rotation += dx * 0.015;
      preview?.setRotation(rotation);
      ui.invalidate();
    });
    const slots: [string, ItemRarity, EquipmentSlot][] = [
      ["Helmet", "epic", "helmet"],
      ["Shoulders", "rare", "shoulders"],
      ["Primary weapon", "legendary", "hand"],
      ["Gloves", "rare", "gloves"],
      ["Legs", "rare", "legs"],
      ["Visor", "rare", "visor"],
      ["Chest armor", "uncommon", "chest"],
      ["Backpack", "rare", "back"],
      ["Belt", "common", "belt"],
      ["Boots", "uncommon", "boots"],
    ];
    slots.forEach(([label, rarity, slot], i) => {
      const col = i < 5 ? 0 : 1,
        row = i % 5;
      const box = {
        x: col ? r.x + r.w - cardW - 8 : r.x + 8,
        y: r.y + 68 + row * 79,
        w: cardW,
        h: 73,
      };
      const item = slot
        ? state.items.find((it) => it.equipmentSlot === slot)
        : undefined;
      const d =
        item && INVENTORY_DEFINITIONS.find((d) => d.id === item.definitionId);
      const id = slot ? "equip-slot-" + slot : "appearance-slot-" + i;
      drawItemFrame(ui, box, {
        rarity: d ? itemRarity(d.id) : rarity,
        hovered: ui.hover === id,
        focused: ui.focus === id,
        empty: !!slot && !item,
      });
      if (slot)
        ui.hits.push({
          id,
          rect: box,
          label: `${slot}: ${d?.name ?? "empty"}${d ? " · " + ITEM_RARITY_PALETTES[itemRarity(d.id)].label : ""}`,
          disabled: pending,
          action: () => options.equipment(slot),
        });
      options.equipmentHit?.(slot, box);
      if (d)
        options.icon(ui, d, {
          x: box.x + 7,
          y: box.y + 7,
          w: box.w - 14,
          h: box.h - 14,
        });
      else
        ui.text(
          label,
          box.x + 7,
          box.y + box.h - 19,
          10,
          palette.muted,
          box.w - 14,
        );
    });
    ui.text(
      "Drag to rotate",
      r.x + cardW + 3,
      view.y + view.h + 9,
      10,
      palette.blue,
      r.w - 2 * cardW,
    );
    const compactPreview = view.h < 383;
    const controlsY = compactPreview ? view.y + view.h + 26 : r.y + 486;
    const controlsX = compactPreview ? view.x + 8 : r.x + 12;
    const controlsWidth = compactPreview ? view.w - 16 : r.w - 24;
    ui.button(
      "character-turn-left",
      "‹",
      { x: controlsX, y: controlsY, w: 28, h: 27 },
      () => {
        rotation -= Math.PI / 6;
        preview?.setRotation(rotation);
        ui.invalidate();
      },
    );
    ui.button(
      "character-turn-right",
      "›",
      { x: controlsX + controlsWidth - 28, y: controlsY, w: 28, h: 27 },
      () => {
        rotation += Math.PI / 6;
        preview?.setRotation(rotation);
        ui.invalidate();
      },
    );

    ui.text(
      "Body & hair · gear equipped from inventory",
      r.x + 8,
      r.y + 530,
      10,
      palette.muted,
      r.w - 16,
    );
  }
  function statistics(r: Rect) {
    section(ui, { ...r, h: 528 }, "STATS & DETAILS");
    const tabs = ["Overview", "Combat", "Explore", "Crafting", "Resists"];
    const tw = (r.w - 22) / 5;
    tabs.forEach((tab, i) => {
      const b = { x: r.x + 10 + i * tw, y: r.y + 37, w: tw - 3, h: 25 };
      ui.button(
        "character-stat-" + tab,
        "",
        b,
        () => {
          statsTab = tab;
          ui.invalidate();
        },
        { selected: statsTab === tab },
      );
      ui.hits[ui.hits.length - 1].label = "Character statistics: " + tab;
      ui.text(
        tab,
        b.x + 5,
        b.y + 6,
        10,
        statsTab === tab ? palette.text : palette.muted,
        b.w - 10,
      );
    });
    const top = r.y + 74;
    const groups =
      statsTab === "Overview"
        ? STAT_GROUPS
        : statsTab === "Combat"
          ? [STAT_GROUPS[1], STAT_GROUPS[0]]
          : statsTab === "Explore"
            ? [STAT_GROUPS[2]]
            : statsTab === "Crafting"
              ? [
                  {
                    name: "Workshop",
                    rows: [
                      ["Fabrication speed", "+20%", "gear"],
                      ["Material efficiency", "+12%", "cargo"],
                      ["Repair speed", "+40%", "repair"],
                      ["Salvage recovery", "+18%", "scan"],
                      ["Research speed", "+15%", "emp"],
                      ["Blueprint quality", "Rare", "gear"],
                      ["Tech affinity", "14", "bolt"],
                    ],
                  },
                ]
              : [];
    const gw =
      (r.w - 20 - 6 * (groups.length - 1)) / Math.max(1, groups.length);
    groups.forEach((group, col) => {
      const box = { x: r.x + 10 + col * (gw + 6), y: top, w: gw, h: 251 };
      section(ui, box, group.name.toUpperCase());
      group.rows.forEach(([label, value, kind], i) => {
        const y = box.y + 37 + i * 30;
        const clr =
          kind === "heart"
            ? "#ff5279"
            : kind === "bolt"
              ? "#ffe56b"
              : kind === "emp"
                ? "#c67aff"
                : palette.blue;
        drawHudIcon(
          ui,
          { x: box.x + 6, y, w: 18, h: 18 },
          kind as HudIconKind,
          { color: clr },
        );
        if (gw >= 155) {
          ui.ctx.font = "500 11px Barlow, sans-serif";
          const valueWidth = ui.ctx.measureText(value).width;
          ui.text(
            label,
            box.x + 29,
            y + 2,
            10,
            palette.muted,
            gw - 38 - Math.max(40, valueWidth),
          );
          ui.text(value, box.x + gw - 9 - valueWidth, y + 2, 11, palette.text);
        } else {
          ui.text(
            label === "Armor penetration" ? "Armor pen." : label,
            box.x + 29,
            y + 1,
            10,
            palette.muted,
            gw - 35,
          );
          ui.text(value, box.x + 29, y + 14, 10, palette.text, gw - 35);
        }
        ui.ctx.fillStyle = "#2676a833";
        ui.ctx.fillRect(box.x + 6, y + 26, gw - 12, 1);
      });
    });
    const ry = groups.length ? top + 264 : top;
    ui.text("RESISTANCES", r.x + 12, ry, 14, palette.blue);
    const cols = r.w > 450 ? 6 : 3,
      cw = (r.w - 24 - 5 * (cols - 1)) / cols;
    CHARACTER_PREVIEW.resistances.forEach((v, i) => {
      const b = {
        x: r.x + 12 + (i % cols) * (cw + 5),
        y: ry + 24 + Math.floor(i / cols) * 69,
        w: cw,
        h: 63,
      };
      drawItemFrame(ui, b, { rarity: "common" });
      drawHudIcon(ui, { x: b.x + 8, y: b.y + 8, w: 21, h: 21 }, v.icon, {
        color: v.color,
        glow: true,
      });
      ui.text(v.label, b.x + 5, b.y + 35, 9, v.color, b.w - 10);
      ui.text(v.value + "%", b.x + b.w - 31, b.y + 12, 12, palette.text);
    });
    if (statsTab === "Resists")
      ui.paragraph(
        "Environmental protection\nA balanced explorer loadout with additional resistance to electromagnetic interference.",
        { x: r.x + 16, y: ry + 180, w: r.w - 32, h: 110 },
        14,
        palette.muted,
      );
    ui.text(
      "Preview statistics · mock values",
      r.x + 10,
      r.y + 530,
      11,
      palette.gold,
      r.w - 20,
    );
  }
  return {
    draw(
      state: InventoryState,
      r: Rect,
      name: string,
      pending: boolean,
      visibleViewport?: Rect,
    ) {
      viewport = visibleViewport
        ? {
            ...visibleViewport,
            y: visibleViewport.y + 40,
            h: visibleViewport.h - 40,
          }
        : undefined;
      ["Equipment", "Stats & details"].forEach((label, i) =>
        ui.button(
          "character-page-" + i,
          label,
          { x: r.x + i * 156, y: r.y, w: 148, h: 30 },
          () => {
            page = label;
            ui.invalidate();
          },
          { selected: page === label },
        ),
      );
      const body = { ...r, y: r.y + 40 };
      if (page === "Equipment") {
        equipment({ ...body, h: 558 }, state, pending);
        return 586;
      }
      if (r.w >= 570) {
        const left = Math.max(190, r.w * 0.34);
        identity({ ...body, w: left, h: 558 }, name, state);
        statistics({
          ...body,
          x: body.x + left + 12,
          w: r.w - left - 12,
          h: 558,
        });
        return 586;
      }
      identity({ ...body, h: 558 }, name, state);
      statistics({ ...body, y: body.y + 570, h: 558 });
      return 1156;
    },
    dispose() {
      disposed = true;
      preview?.dispose();
    },
  };
}
