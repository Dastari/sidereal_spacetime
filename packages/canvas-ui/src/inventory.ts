import { drawHudIcon, type HudIcon } from "./hud-icons";
import type { EquipmentSlot } from "@sidereal/content/character-components";
import {
  INVENTORY_DEFINITIONS,
  LIQUID_DENSITY_KG_PER_LITRE,
  type InventoryDefinition,
} from "../../content/src/inventory";
import { inventoryMass } from "../../sim/src/inventory";
import { CanvasUI, palette } from "./toolkit";
import { contains, type Rect } from "./layout";
import { WindowStack, type FloatingWindow } from "./windows";
import {
  createCharacterSheet,
  type CharacterCosmetics,
} from "./character-sheet";
import { drawItemFrame, ITEM_RARITY_PALETTES } from "./item-frame";
import { itemRarity } from "./character-data";
import {
  drawItemTooltip,
  itemDetails,
  ITEM_CATEGORIES,
  type ItemCategory,
} from "./item-details";
import { actionBarRect, drawActionBar } from "./action-bar";
export interface InventoryItem {
  id: string;
  definitionId: string;
  containerId: string;
  equipmentSlot: EquipmentSlot | "";
  x: number;
  y: number;
  rotated: boolean;
}
export interface InventoryContainer {
  placementId?: string;
  id: string;
  parentItemId: string;
  kind: "grid" | "liquid";
  name: string;
  width: number;
  height: number;
  maxMassKg: number;
  capacityLitres: number;
  amountLitres: number;
  liquidType: string;
  carried?: boolean;
}
export interface InventoryState {
  revision: string;
  items: InventoryItem[];
  containers: InventoryContainer[];
  hotbar: { slot: number; itemId: string }[];
  carriedMassKg: number;
  carryLimitKg: number;
}
export interface InventoryActions {
  claimKit(): void;
  claimArmory?(): void;
  moveItem(input: {
    itemId: string;
    containerId: string;
    x: number;
    y: number;
    rotated: boolean;
  }): void;
  equipItem(itemId: string): void;
  transferItem?(itemId: string, containerId: string): void;
  takeAll?(containerId: string): void;
  storeAll?(containerId: string, destinationId: string): void;
  dropItem?(itemId: string): void;
  assignHotbar(slot: number, itemId: string): void;
  activateHotbar(slot: number): void;
}
const definition = (item: InventoryItem) =>
  INVENTORY_DEFINITIONS.find((d) => d.id === item.definitionId);
/** Shared logical cell size; overflow scrolls instead of shrinking footprints. */
export const INVENTORY_CELL_SIZE = 48;
export function inventoryPlacement(
  state: InventoryState,
  item: InventoryItem,
  container: InventoryContainer,
  x: number,
  y: number,
  rotated: boolean,
): string | undefined {
  const d = definition(item);
  if (!d) return "Unknown item";
  const w = rotated ? d.height : d.width,
    h = rotated ? d.width : d.height;
  if (container.kind !== "grid")
    return "Liquid storage accepts volume, not item slots";
  if (x < 0 || y < 0 || x + w > container.width || y + h > container.height)
    return "Item extends outside this container";
  for (const other of state.items) {
    if (other.id === item.id || other.containerId !== container.id) continue;
    const o = definition(other);
    if (!o) continue;
    const ow = other.rotated ? o.height : o.width,
      oh = other.rotated ? o.width : o.height;
    if (
      x < other.x + ow &&
      x + w > other.x &&
      y < other.y + oh &&
      y + h > other.y
    )
      return "These slots are occupied";
  }
  let ancestor: InventoryContainer | undefined = container;
  const seen = new Set<string>();
  while (ancestor?.parentItemId) {
    if (ancestor.parentItemId === item.id)
      return "A container cannot hold itself";
    if (seen.has(ancestor.id)) return "Invalid container nesting";
    seen.add(ancestor.id);
    const parent = state.items.find((i) => i.id === ancestor!.parentItemId);
    ancestor = state.containers.find((c) => c.id === parent?.containerId);
  }
  return undefined;
}
const iconBounds = new Map<string, number[]>();
let boundsRequested = false;
const inventoryIcons = new Map<string, HTMLImageElement>();
/** Published transparent renders of the actual equipment source; vector fallback while loading. */
function icon(ui: CanvasUI, d: InventoryDefinition, r: Rect) {
  if (r.w <= 0 || r.h <= 0) return;
  if (!boundsRequested) {
    boundsRequested = true;
    fetch("/assets/equipment/icons/manifest.json")
      .then((r) => r.json())
      .then((manifest) => {
        for (const entry of manifest.entries ?? [])
          if (entry.boundsPixels?.length === 4)
            iconBounds.set(entry.assetId, entry.boundsPixels);
        ui.invalidate();
      })
      .catch(() => {});
  }
  let bitmap = inventoryIcons.get(d.assetId);
  if (!bitmap) {
    bitmap = new Image();
    bitmap.decoding = "async";
    bitmap.onload = () => {
      // Component exports retain transparent margins from their authoring cameras.
      // Fit their visible pixels, not the full source canvas, without editing PNGs.
      if (
        !iconBounds.has(d.assetId) &&
        bitmap!.naturalWidth &&
        typeof document !== "undefined"
      ) {
        try {
          const sample = document.createElement("canvas");
          sample.width = bitmap!.naturalWidth;
          sample.height = bitmap!.naturalHeight;
          const context = sample.getContext("2d", {
            willReadFrequently: true,
          })!;
          context.drawImage(bitmap!, 0, 0);
          const data = context.getImageData(
            0,
            0,
            sample.width,
            sample.height,
          ).data;
          let minX = sample.width,
            minY = sample.height,
            maxX = 0,
            maxY = 0;
          for (let y = 0; y < sample.height; y++)
            for (let x = 0; x < sample.width; x++)
              if (data[(y * sample.width + x) * 4 + 3] > 24) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + 1);
                maxY = Math.max(maxY, y + 1);
              }
          if (maxX > minX && maxY > minY)
            iconBounds.set(d.assetId, [minX, minY, maxX, maxY]);
        } catch {
          /* Keep the complete image if pixel inspection is unavailable. */
        }
      }
      ui.invalidate();
    };
    bitmap.src =
      d.iconUrl ??
      "/assets/equipment/icons/" + encodeURIComponent(d.assetId) + ".png";
    inventoryIcons.set(d.assetId, bitmap);
  }
  if (bitmap.complete && bitmap.naturalWidth) {
    const [sx, sy, ex, ey] = iconBounds.get(d.assetId) ?? [
      0,
      0,
      bitmap.naturalWidth,
      bitmap.naturalHeight,
    ];
    const sw = ex - sx,
      sh = ey - sy;
    const angle = d.pose === "rifle" ? (r.h > r.w * 1.15 ? -1.35 : -1.05) : 0;
    const cosine = Math.abs(Math.cos(angle)),
      sine = Math.abs(Math.sin(angle));
    const scale =
      0.88 *
      Math.min(
        r.w / (cosine * sw + sine * sh),
        r.h / (sine * sw + cosine * sh),
      );
    ui.ctx.save();
    ui.ctx.beginPath();
    ui.ctx.rect(r.x, r.y, r.w, r.h);
    ui.ctx.clip();
    ui.ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    if (angle) ui.ctx.rotate(angle);
    ui.ctx.drawImage(
      bitmap,
      sx,
      sy,
      sw,
      sh,
      (-sw * scale) / 2,
      (-sh * scale) / 2,
      sw * scale,
      sh * scale,
    );
    ui.ctx.restore();
    return;
  }
  const c = ui.ctx;
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  c.translate(r.x + r.w / 2, r.y + r.h / 2);
  const s = 0.88 * Math.min(r.w / 48, r.h / 64);
  c.scale(s, s);
  c.fillStyle = "#a8cedb";
  c.strokeStyle = palette.blue;
  c.lineWidth = 1.5;
  if (d.pose === "rifle") {
    c.rotate(-0.45);
    c.fillRect(-5, -23, 10, 38);
    c.fillRect(-3, -31, 6, 13);
    c.fillRect(3, -5, 9, 7);
    c.fillRect(-8, 13, 16, 9);
    c.fillStyle = "#32617a";
    c.fillRect(-3, -18, 6, 17);
  } else if (d.pose) {
    c.fillRect(-15, -12, 29, 10);
    c.fillRect(-8, -2, 9, 19);
    c.fillStyle = "#43cce0";
    c.fillRect(5, -10, 8, 4);
  } else if (d.storage) {
    c.fillRect(-16, -22, 32, 43);
    c.strokeRect(-12, -17, 24, 20);
    c.fillStyle = "#3c7584";
    c.fillRect(-11, 7, 22, 10);
    c.strokeRect(-8, -27, 16, 7);
  } else {
    c.fillRect(-12, -19, 24, 38);
    c.fillStyle = d.id === "medkit" ? "#80dab1" : "#3b839f";
    c.fillRect(-9, -13, 18, 25);
    if (d.id === "medkit") {
      c.fillStyle = "#edfff8";
      c.fillRect(-2, -9, 4, 16);
      c.fillRect(-8, -3, 16, 4);
    } else {
      c.fillStyle = palette.blue;
      c.fillRect(-6, -8, 12, 3);
      c.fillRect(-6, 1, 12, 3);
    }
  }
  c.restore();
}
export function createInventoryUI(
  ui: CanvasUI,
  actions: InventoryActions,
  cosmetics?: CharacterCosmetics,
) {
  const stack = new WindowStack();
  type Filters = {
    category: ItemCategory;
    query: string;
    rarity: string;
    sort: "Name" | "Rarity" | "Type";
    view: "icons" | "grid";
    scrollX: number;
  };
  const filters = new Map<string, Filters>();
  const filterFor = (id: string) => {
    if (!filters.has(id))
      filters.set(id, {
        category: "All",
        query: "",
        rarity: "All",
        sort: "Name",
        view: "grid",
        scrollX: 0,
      });
    return filters.get(id)!;
  };
  let selected = "",
    rotated = false,
    message = "",
    activeContainer = "";
  let dragging:
    { id: string; x: number; y: number; source: string } | undefined;
  let context: { itemId: string; x: number; y: number } | undefined;
  let current: { state: InventoryState; pending: boolean } | undefined;
  let targets: {
    window: string;
    container: InventoryContainer;
    rect: Rect;
    cell: number;
    limitX: number;
    visible?: Rect;
  }[] = [];
  let panes: { window: string; container: InventoryContainer; rect: Rect }[] =
    [];
  let itemHits = new Map<
    string,
    { item: InventoryItem; rect: Rect; window: string }
  >();
  let quickBindings: (string | undefined)[] = [];
  const invalidate = () => ui.invalidate();
  const cancelHeld = () => {
    selected = "";
    dragging = undefined;
    invalidate();
  };
  function select(item: InventoryItem) {
    selected = item.id;
    rotated = item.rotated;
    context = undefined;
    message = "";
    invalidate();
  }
  function transfer(item: InventoryItem, containerId = "") {
    if (!current || current.pending) return;
    if (actions.transferItem) actions.transferItem(item.id, containerId);
    else {
      const pack = current.state.items.find((i) => i.equipmentSlot === "back");
      const containers = containerId
        ? current.state.containers.filter((c) => c.id === containerId)
        : current.state.containers.filter(
            (c) =>
              c.parentItemId === pack?.id || (!c.parentItemId && c.carried),
          );
      let fit = false;
      for (const c of containers)
        for (let y = 0; y < c.height && !fit; y++)
          for (let x = 0; x < c.width && !fit; x++)
            if (
              !inventoryPlacement(current.state, item, c, x, y, item.rotated)
            ) {
              actions.moveItem({
                itemId: item.id,
                containerId: c.id,
                x,
                y,
                rotated: item.rotated,
              });
              fit = true;
            }
      if (!fit) message = "No room in the destination";
    }
    cancelHeld();
  }
  function openTransferContainer() {
    return [...stack.windows]
      .reverse()
      .map((w) => current?.state.containers.find((c) => c.id === w.id))
      .find(
        (c) =>
          c?.kind === "grid" &&
          !c.carried &&
          !c.placementId?.startsWith("ground:"),
      );
  }
  function quickTransfer(item: InventoryItem) {
    if (!current) return;
    const source = current.state.containers.find(
      (c) => c.id === item.containerId,
    );
    const other = openTransferContainer();
    transfer(
      item,
      (item.equipmentSlot || source?.carried) && other ? other.id : "",
    );
  }
  function rotateSelected() {
    if (!selected || !current) return false;
    if (!current.pending) {
      rotated = !rotated;
      invalidate();
    }
    return true;
  }
  const characterSheet = createCharacterSheet(ui, {
    cosmetics,
    icon,
    equipment: (slot) => {
      if (!current || current.pending) return;
      const item = current.state.items.find((i) => i.equipmentSlot === slot);
      if (item) select(item);
    },
    equipmentHit: (slot, box) => {
      const item = current?.state.items.find((i) => i.equipmentSlot === slot);
      if (item) wireItem(ui.hits[ui.hits.length - 1], item, box, "character");
    },
  });
  function open(id: string) {
    const width = id === "inventory" ? 500 : 620;
    const existing = stack.windows;
    const first = existing[0]?.rect;
    const right = first ? first.x + first.w + 14 : 18;
    const left = first ? first.x - width - 14 : 18;
    const x =
      first && right + width <= ui.width - 8
        ? right
        : first && left >= 8
          ? left
          : id === "character"
            ? 18
            : Math.max(18, ui.width - width - 18);
    stack.open(id, {
      x,
      y: 72 + Math.min(3, existing.length) * 14,
      w: width,
      h: Math.max(
        290,
        Math.min(
          id === "character" ? 680 : 640,
          ui.height - (id === "character" ? 128 : 178),
        ),
      ),
    });
    stack.clamp(ui.width, ui.height);
    invalidate();
  }
  function closeWindow(id: string) {
    stack.close(id);
    context = undefined;
    if (!stack.windows.length) cancelHeld();
    invalidate();
  }
  function toggle(id: string) {
    if (stack.windows.some((w) => w.id === id)) closeWindow(id);
    else open(id);
  }
  function place(
    item: InventoryItem,
    target: (typeof targets)[number],
    x: number,
    y: number,
  ) {
    if (!current || current.pending) return;
    message =
      inventoryPlacement(
        current.state,
        item,
        target.container,
        x,
        y,
        rotated,
      ) ?? "";
    if (!message) {
      actions.moveItem({
        itemId: item.id,
        containerId: target.container.id,
        x,
        y,
        rotated,
      });
      cancelHeld();
    }
    invalidate();
  }
  function dropAt(item: InventoryItem, px: number, py: number) {
    if (!current || current.pending) return;
    const overlay = [...ui.hits]
      .reverse()
      .find((h) => contains(h.rect, px, py));
    if (overlay?.id.startsWith("quick-slot-")) {
      quickBindings[Number(overlay.id.slice(11))] = item.id;
      cancelHeld();
      return;
    }
    if (overlay?.id.startsWith("tool-")) {
      const n = Number(overlay.id.slice(5));
      if (n < 5) actions.assignHotbar(n, item.id);
      cancelHeld();
      return;
    }
    const top = stack.at(px, py),
      d = definition(item);
    if (overlay?.id.startsWith("storage-tab-")) {
      const target = current.state.containers.find(
        (c) => c.id === overlay.id.slice(12),
      );
      if (target) transfer(item, target.id);
      return;
    }
    const onto = overlay && itemHits.get(overlay.id)?.item;
    const child =
      onto &&
      onto.id !== item.id &&
      (top?.id !== "character" || d?.equipSlot !== "back") &&
      current.state.containers.find(
        (c) => c.parentItemId === onto.id && c.kind === "grid",
      );
    if (child) {
      transfer(item, child.id);
      dragging = undefined;
      return;
    }
    if (onto?.id === item.id && !dragging) {
      cancelHeld();
      return;
    }
    if (top?.id === "character" && overlay?.id.startsWith("equip-slot-")) {
      const slot = overlay.id.slice(11);
      if (slot === "back" && d?.equipSlot !== "back") {
        const pack = current.state.items.find(
            (i) => i.equipmentSlot === "back",
          ),
          bag = current.state.containers.find(
            (c) => c.parentItemId === pack?.id,
          );
        if (bag) transfer(item, bag.id);
        else message = "Equip a backpack first";
      } else if (slot === d?.equipSlot) {
        actions.equipItem(item.id);
        cancelHeld();
      } else message = "This item does not fit that equipment slot";
    } else {
      const grid = targets.find(
        (t) => t.window === top?.id && contains(t.visible ?? t.rect, px, py),
      );
      const pane = panes.find(
        (p) => p.window === top?.id && contains(p.rect, px, py),
      );
      if (grid)
        place(
          item,
          grid,
          Math.floor((px - grid.rect.x) / grid.cell),
          Math.floor((py - grid.rect.y) / grid.cell),
        );
      else if (pane) transfer(item, pane.container.id);
      else if (
        !top &&
        !ui.panels.some((r) => contains(r, px, py)) &&
        actions.dropItem
      ) {
        actions.dropItem(item.id);
        cancelHeld();
      } else
        message = "Choose an item grid, backpack, equipment slot or the ground";
    }
    dragging = undefined;
    invalidate();
  }
  ui.pointerAction = (event) => {
    if (ui.modal || !stack.windows.length) return false;
    if (
      context &&
      !ui.hits.some(
        (h) =>
          h.id === "item-menu-surface" && contains(h.rect, event.x, event.y),
      )
    ) {
      context = undefined;
      invalidate();
      return true;
    }
    if (event.button === 2 && selected) {
      cancelHeld();
      return true;
    }
    if (event.button !== 0 || !selected || dragging || !current) return false;
    const hit = [...ui.hits]
      .reverse()
      .find((h) => contains(h.rect, event.x, event.y));
    if (
      hit &&
      !(
        hit.id.startsWith("slot-") ||
        hit.id.startsWith("item-") ||
        hit.id.startsWith("equip-slot-") ||
        hit.id.startsWith("storage-tab-") ||
        hit.id.startsWith("quick-slot-") ||
        hit.id.startsWith("tool-") ||
        hit.id.endsWith("-surface")
      )
    )
      return false;
    const item = current.state.items.find((i) => i.id === selected);
    if (item) dropAt(item, event.x, event.y);
    return true;
  };
  function wireItem(
    hit: CanvasUI["hits"][number],
    item: InventoryItem,
    box: Rect,
    window: string,
  ) {
    itemHits.set(hit.id, { item, rect: box, window });
    hit.disabled = current?.pending;
    hit.action = (event) => {
      if (current?.pending) return;
      if (event?.shiftKey) quickTransfer(item);
      else select(item);
    };
    hit.context = (event) => {
      cancelHeld();
      context = { itemId: item.id, x: event.x, y: event.y };
      invalidate();
    };
    hit.cancel = () => {
      dragging = undefined;
    };
    hit.drag = (dx, dy) => {
      if (current?.pending) return;
      if (selected !== item.id) select(item);
      dragging ??= { id: item.id, x: box.x, y: box.y, source: window };
      dragging.x += dx;
      dragging.y += dy;
    };
    hit.drop = (px, py) => dropAt(item, px, py);
  }
  function itemButton(
    state: InventoryState,
    item: InventoryItem,
    box: Rect,
    window: string,
    pending: boolean,
    dim = false,
  ) {
    const d = definition(item);
    if (!d) return;
    const id = "item-" + window + "-" + item.id;
    ui.ctx.save();
    if (dim) ui.ctx.globalAlpha = 0.3;
    drawItemFrame(ui, box, {
      rarity: itemRarity(d.id),
      hovered: ui.hover === id,
      focused: ui.focus === id,
      selected: item.id === selected,
    });
    icon(ui, d, { x: box.x + 6, y: box.y + 6, w: box.w - 12, h: box.h - 12 });
    ui.ctx.restore();
    ui.hits.push({
      id,
      label: d.name + " · " + ITEM_RARITY_PALETTES[itemRarity(d.id)].label,
      rect: box,
      disabled: pending || dim,
    });
    if (!dim) wireItem(ui.hits[ui.hits.length - 1], item, box, window);
  }
  function matches(item: InventoryItem, f: Filters) {
    const d = definition(item);
    if (!d) return false;
    const detail = itemDetails(d);
    return (
      (f.category === "All" || f.category === detail.category) &&
      (f.rarity === "All" || f.rarity === detail.rarity) &&
      (d.name + " " + detail.description)
        .toLowerCase()
        .includes(f.query.toLowerCase())
    );
  }
  function toolbar(
    container: InventoryContainer,
    window: FloatingWindow,
    r: Rect,
  ) {
    const f = filterFor(container.id),
      cw = (r.w - 5 * 5) / 6;
    ITEM_CATEGORIES.forEach((label, i) => {
      const box = { x: r.x + i * (cw + 5), y: r.y, w: cw, h: 27 };
      ui.button(
        `filter-${window.id}-${label}`,
        "",
        box,
        () => {
          f.category = label;
          window.scroll = 0;
          invalidate();
        },
        { selected: f.category === label },
      );
      ui.hits.at(-1)!.label = label + " items";
      const glyphs: HudIcon[] = [
        "cargo",
        "kinetic",
        "shield",
        "repair",
        "medkit",
        "cargo",
      ];
      drawHudIcon(ui, { x: box.x + 5, y: box.y + 6, w: 16, h: 16 }, glyphs[i], {
        color: f.category === label ? palette.text : palette.blue,
      });
      if (box.w > 61)
        ui.text(
          label === "Weapons" && box.w < 80 ? "Arms" : label,
          box.x + 25,
          box.y + 7,
          11,
          f.category === label ? palette.text : palette.muted,
          box.w - 29,
        );
    });
    const compact = r.w < 380;
    const search = { x: r.x, y: r.y + 35, w: compact ? r.w : r.w - 276, h: 29 };
    ui.input(
      "search-" + window.id,
      "Search items",
      f.query,
      search,
      (value) => {
        f.query = value;
        invalidate();
      },
      60,
    );
    if (!f.query && ui.focus !== "search-" + window.id) {
      drawHudIcon(
        ui,
        { x: search.x + 7, y: search.y + 6, w: 17, h: 17 },
        "scan",
        { color: palette.muted },
      );
      ui.text(
        "Search items…",
        search.x + 30,
        search.y + 8,
        12,
        palette.muted,
        search.w - 38,
      );
    }
    const right = compact ? r.x : search.x + search.w + 7;
    const controlY = search.y + (compact ? 35 : 0),
      controlW = compact ? (r.w - 12) / 3 : 0;
    ui.button(
      "rarity-" + window.id,
      f.rarity === "All"
        ? "Any rarity"
        : ITEM_RARITY_PALETTES[f.rarity as keyof typeof ITEM_RARITY_PALETTES]
            .label,
      { x: right, y: controlY, w: compact ? controlW : 92, h: 29 },
      () => {
        const grades = ["All", ...Object.keys(ITEM_RARITY_PALETTES)];
        f.rarity = grades[(grades.indexOf(f.rarity) + 1) % grades.length];
        invalidate();
      },
    );
    ui.button(
      "sort-" + window.id,
      f.sort + " ▾",
      {
        x: right + (compact ? controlW + 6 : 98),
        y: controlY,
        w: compact ? controlW : 82,
        h: 29,
      },
      () => {
        const sorts = ["Name", "Rarity", "Type"] as const;
        f.sort = sorts[(sorts.indexOf(f.sort) + 1) % sorts.length];
        invalidate();
      },
      { disabled: f.view === "grid" },
    );
    ui.button(
      "view-" + window.id,
      f.view === "icons" ? "Slots" : "Icons",
      {
        x: right + (compact ? (controlW + 6) * 2 : 186),
        y: controlY,
        w: compact ? controlW : 76,
        h: 29,
      },
      () => {
        f.view = f.view === "icons" ? "grid" : "icons";
        window.scroll = 0;
        invalidate();
      },
    );
    return compact ? 112 : 77;
  }
  function grid(
    state: InventoryState,
    container: InventoryContainer,
    r: Rect,
    window: string,
    pending: boolean,
  ) {
    const f = filterFor(container.id),
      items = state.items.filter((i) => i.containerId === container.id);
    if (f.view === "icons") {
      const cols = Math.max(2, Math.floor(r.w / 77)),
        cell = (r.w - (cols - 1) * 7) / cols;
      const rank = Object.keys(ITEM_RARITY_PALETTES);
      const visible = items
        .filter((i) => matches(i, f))
        .sort((a, b) => {
          const da = definition(a)!,
            db = definition(b)!;
          return (
            (f.sort === "Rarity"
              ? rank.indexOf(itemRarity(db.id)) -
                rank.indexOf(itemRarity(da.id))
              : f.sort === "Type"
                ? itemDetails(da).category.localeCompare(
                    itemDetails(db).category,
                  )
                : 0) || da.name.localeCompare(db.name)
          );
        });
      visible.forEach((item, i) =>
        itemButton(
          state,
          item,
          {
            x: r.x + (i % cols) * (cell + 7),
            y: r.y + Math.floor(i / cols) * (cell + 7),
            w: cell,
            h: cell,
          },
          window,
          pending,
        ),
      );
      if (!visible.length)
        ui.text(
          items.length ? "No matching items" : "Empty storage",
          r.x + 12,
          r.y + 24,
          16,
          palette.muted,
          r.w - 24,
        );
      return Math.max(cell, Math.ceil(visible.length / cols) * (cell + 7));
    }
    // Keep the physical layout visible, including filtered-out occupied cells.
    const cell = INVENTORY_CELL_SIZE;
    const limitX = Math.max(0, container.width * cell - r.w);
    f.scrollX = Math.max(0, Math.min(limitX, f.scrollX));
    const scrollHeight = limitX ? 34 : 0;
    if (limitX) {
      const pan = (delta: number) => {
        f.scrollX = Math.max(0, Math.min(limitX, f.scrollX + delta));
        invalidate();
      };
      ui.button(
        "grid-left-" + container.id,
        "‹",
        { x: r.x, y: r.y, w: 26, h: 26 },
        () => pan(-cell),
        { disabled: f.scrollX === 0 },
      );
      ui.button(
        "grid-right-" + container.id,
        "›",
        { x: r.x + r.w - 26, y: r.y, w: 26, h: 26 },
        () => pan(cell),
        { disabled: f.scrollX === limitX },
      );
      const track = { x: r.x + 32, y: r.y, w: r.w - 64, h: 26 };
      ui.ctx.fillStyle = palette.line;
      ui.ctx.fillRect(track.x + 12, track.y + 11, track.w - 24, 4);
      ui.ctx.fillStyle = palette.blue;
      ui.ctx.fillRect(
        track.x + 8 + ((track.w - 24) * f.scrollX) / limitX,
        track.y + 3,
        8,
        20,
      );
      ui.hits.push({
        id: "grid-pan-" + container.id,
        label: "Scroll grid horizontally; Shift-wheel also scrolls",
        rect: track,
        value: f.scrollX / limitX,
        change: (value) => {
          f.scrollX = Math.max(0, Math.min(1, value)) * limitX;
          invalidate();
        },
      });
    }
    const origin = { x: r.x - f.scrollX, y: r.y + scrollHeight };
    const target = {
      window,
      container,
      rect: {
        x: origin.x,
        y: origin.y,
        w: cell * container.width,
        h: cell * container.height,
      },
      cell,
      limitX,
    };
    targets.push(target);
    for (let y = 0; y < container.height; y++)
      for (let x = 0; x < container.width; x++) {
        const box = {
          x: origin.x + x * cell,
          y: origin.y + y * cell,
          w: cell,
          h: cell,
        };
        drawItemFrame(
          ui,
          { x: box.x + 2, y: box.y + 2, w: cell - 4, h: cell - 4 },
          { rarity: "common", empty: true, disabled: true },
        );
        ui.hits.push({
          id: `slot-${container.id}-${x}-${y}`,
          label: `${container.name} column ${x + 1} row ${y + 1}`,
          rect: box,
          action: () => {
            const item = state.items.find((i) => i.id === selected);
            if (item) place(item, target, x, y);
          },
        });
      }
    for (const item of items) {
      const d = definition(item);
      if (d)
        itemButton(
          state,
          item,
          {
            x: origin.x + item.x * cell + 2,
            y: origin.y + item.y * cell + 2,
            w: (item.rotated ? d.height : d.width) * cell - 4,
            h: (item.rotated ? d.width : d.height) * cell - 4,
          },
          window,
          pending,
          !matches(item, f),
        );
    }
    return target.rect.h + scrollHeight;
  }
  function storage(
    state: InventoryState,
    window: FloatingWindow,
    r: Rect,
    pending: boolean,
  ) {
    const pack = state.items.find((i) => i.equipmentSlot === "back");
    const equippedStorage = new Set(
      state.items.filter((i) => i.equipmentSlot).map((i) => i.id),
    );
    const personal = state.containers.filter(
      (c) =>
        c.kind === "grid" &&
        (equippedStorage.has(c.parentItemId) || (!c.parentItemId && c.carried)),
    );
    const container =
      window.id === "inventory"
        ? (personal.find((c) => c.id === activeContainer) ??
          personal.find((c) => c.parentItemId === pack?.id) ??
          personal[0])
        : state.containers.find((c) => c.id === window.id);
    let y = r.y;
    if (window.id === "inventory") {
      if (!personal.length) {
        ui.button(
          "claim-kit",
          "Issue field kit",
          { x: r.x, y, w: r.w, h: 34 },
          actions.claimKit,
          { disabled: pending },
        );
        return 50;
      }
      const tabColumns = Math.max(1, Math.floor(r.w / 114));
      personal.forEach((entry, i) =>
        ui.button(
          "storage-tab-" + entry.id,
          entry.parentItemId
            ? state.items.find((i) => i.id === entry.parentItemId)
                ?.equipmentSlot === "back"
              ? "Backpack"
              : entry.name
            : "Pockets",
          {
            x: r.x + (i % tabColumns) * 114,
            y: y + Math.floor(i / tabColumns) * 39,
            w: Math.min(106, r.w),
            h: 29,
          },
          () => {
            activeContainer = entry.id;
            window.scroll = 0;
            invalidate();
          },
          { selected: container?.id === entry.id },
        ),
      );
      y += 39 * Math.ceil(personal.length / tabColumns);
    }
    if (!container) return 0;
    if (container.kind === "liquid") {
      ui.text(
        container.liquidType || "Empty reservoir",
        r.x,
        y,
        21,
        palette.blue,
        r.w,
      );
      ui.text(
        `${container.amountLitres.toFixed(1)} / ${container.capacityLitres} L`,
        r.x,
        y + 38,
        26,
      );
      ui.bar(
        { x: r.x, y: y + 78, w: r.w, h: 16 },
        container.amountLitres / Math.max(1, container.capacityLitres),
      );
      return 115;
    }
    panes.push({
      window: window.id,
      container,
      rect: { ...window.rect, y: window.rect.y + 45, h: window.rect.h - 45 },
    });
    y += toolbar(container, window, { ...r, y });
    const count = state.items.filter(
      (i) => i.containerId === container.id,
    ).length;
    const destination =
      window.id === "inventory" ? openTransferContainer() : undefined;
    const personalHeader = window.id === "inventory";
    const payload = personalHeader
      ? state.carriedMassKg
      : inventoryMass(
          state,
          INVENTORY_DEFINITIONS,
          LIQUID_DENSITY_KG_PER_LITRE,
        ).containerMass(container.id);
    const capacity = personalHeader ? state.carryLimitKg : container.maxMassKg;
    if (personalHeader && destination && actions.storeAll) {
      ui.button(
        "store-all-" + container.id,
        "Store all",
        { x: r.x, y, w: 128, h: 32 },
        () => {
          actions.storeAll!(container.id, destination.id);
          cancelHeld();
        },
        { disabled: pending || !count },
      );
    } else if (!container.carried && actions.takeAll) {
      ui.button(
        "take-all-" + container.id,
        "Take all",
        { x: r.x, y, w: 128, h: 32 },
        () => {
          actions.takeAll!(container.id);
          cancelHeld();
        },
        { disabled: pending || !count },
      );
    }
    const meterX = r.x + Math.max(142, r.w * 0.54),
      meterW = r.x + r.w - meterX;
    ui.text(
      `${payload.toFixed(1)} / ${capacity} kg`,
      meterX,
      y + 3,
      11,
      palette.blue,
      meterW,
    );
    ui.bar(
      { x: meterX, y: y + 22, w: meterW, h: 5 },
      payload / Math.max(1, capacity),
    );
    y += 44;
    y += grid(state, container, { ...r, y }, window.id, pending) + 8;
    return y - r.y + 8;
  }
  function quickSlot(
    index: number,
    state: InventoryState,
    assign = false,
    pending = false,
  ) {
    if (pending) return;
    if (assign && selected) {
      quickBindings[index] = selected;
      cancelHeld();
      return;
    }
    open("inventory");
    if (quickBindings[index])
      ui.focus = "item-inventory-" + quickBindings[index];
  }
  function hotbar(
    state: InventoryState,
    r: Rect,
    assign = false,
    pending = false,
  ) {
    current = { state, pending };
    const entry = (id: string | undefined) => {
      const item = state.items.find((i) => i.id === id),
        d = item && definition(item);
      return item && d
        ? { id: item.id, definition: d, equipped: !!item.equipmentSlot }
        : undefined;
    };
    ["medkit", "power-cell"].forEach((id, i) => {
      if (!state.items.some((item) => item.id === quickBindings[i]))
        quickBindings[i] = state.items.find(
          (item) => item.definitionId === id,
        )?.id;
    });
    drawActionBar(ui, r, {
      entries: Array.from({ length: 8 }, (_, n) =>
        entry(state.hotbar.find((h) => h.slot === n)?.itemId),
      ),
      quick: quickBindings.map(entry),
      pending,
      assign,
      icon,
      activate: (n) => {
        if (assign && selected) {
          actions.assignHotbar(n, selected);
          cancelHeld();
        } else if (state.hotbar.some((h) => h.slot === n))
          actions.activateHotbar(n);
        else open("inventory");
      },
      clear: (n) => actions.assignHotbar(n, ""),
      activateQuick: (n) => quickSlot(n, state, assign, pending),
    });
    for (const hit of ui.hits.filter((h) => /^(tool|quick-slot)-/.test(h.id))) {
      itemHits.delete(hit.id);
      const n = Number(hit.id.split("-").at(-1)),
        id = hit.id.startsWith("tool-")
          ? state.hotbar.find((h) => h.slot === n)?.itemId
          : quickBindings[n],
        item = state.items.find((i) => i.id === id);
      if (item)
        itemHits.set(hit.id, { item, rect: hit.rect, window: "hotbar" });
    }
    if (!assign) {
      const hit = ui.hits.find(
          (h) => h.id === (ui.keyboard ? ui.focus : ui.hover),
        ),
        item = hit && itemHits.get(hit.id)?.item,
        d = item && definition(item);
      if (hit && d) drawItemTooltip(ui, d, hit.rect, icon);
    }
  }
  function drawContext(state: InventoryState, pending: boolean) {
    if (!context) return;
    const item = state.items.find((i) => i.id === context!.itemId),
      d = item && definition(item);
    if (!item || !d) {
      context = undefined;
      return;
    }
    const child = state.containers.find((c) => c.parentItemId === item.id);
    const entries: {
      id: string;
      label: string;
      action: () => void;
      disabled?: boolean;
    }[] = [];
    if (d.equipSlot)
      entries.push(
        item.equipmentSlot
          ? {
              id: "unequip-item",
              label: "Unequip to backpack",
              action: () => transfer(item),
            }
          : {
              id: "equip-item",
              label:
                d.equipSlot === "back" &&
                state.items.some((i) => i.equipmentSlot === "back")
                  ? "Swap backpack"
                  : "Equip",
              action: () => {
                actions.equipItem(item.id);
                cancelHeld();
              },
            },
      );
    entries.push({
      id: "transfer-item",
      label: "Quick transfer",
      action: () => quickTransfer(item),
    });
    if (child)
      entries.push({
        id: "inspect-item",
        label: "Open storage",
        action: () => open(child.id),
      });
    entries.push({
      id: "rotate-item",
      label: "Pick up and rotate",
      action: () => {
        select(item);
        rotated = !item.rotated;
      },
    });
    if (actions.dropItem)
      entries.push({
        id: "drop-item",
        label: "Drop on ground",
        action: () => {
          actions.dropItem!(item.id);
          cancelHeld();
        },
      });
    const r = {
      x: Math.max(8, Math.min(context.x, ui.width - 226)),
      y: Math.max(8, Math.min(context.y, ui.height - entries.length * 34 - 48)),
      w: 218,
      h: entries.length * 34 + 36,
    };
    ui.panel(r, true);
    ui.hits.push({
      id: "item-menu-surface",
      label: "Item actions",
      rect: r,
      disabled: true,
    });
    ui.text(
      d.name,
      r.x + 10,
      r.y + 9,
      13,
      ITEM_RARITY_PALETTES[itemRarity(d.id)].edge,
      r.w - 20,
    );
    entries.forEach((entry, i) =>
      ui.button(
        entry.id,
        entry.label,
        { x: r.x + 7, y: r.y + 29 + i * 34, w: r.w - 14, h: 29 },
        () => {
          context = undefined;
          entry.action();
          invalidate();
        },
        { disabled: pending || entry.disabled },
      ),
    );
    // Mark the actual menu bounds, while retaining stable action IDs for keyboard/review.
    for (const hit of ui.hits.slice(-entries.length)) hit.context = () => {};
  }
  function draw(
    state: InventoryState,
    _r: Rect,
    name: string,
    _close: () => void,
    pending = false,
    error = "",
    dismissError: () => void = () => {},
  ) {
    current = { state, pending };
    targets = [];
    panes = [];
    itemHits = new Map();
    if (selected && !state.items.some((i) => i.id === selected)) cancelHeld();
    for (const window of [...stack.windows])
      if (
        !["inventory", "character"].includes(window.id) &&
        !state.containers.some((c) => c.id === window.id)
      )
        closeWindow(window.id);
    stack.clamp(ui.width, ui.height);
    for (const window of [...stack.windows]) {
      const r = window.rect,
        firstHit = ui.hits.length;
      ui.windowFrame(
        window.id,
        window.id === "character"
          ? "CHARACTER"
          : window.id === "inventory"
            ? "INVENTORY"
            : (state.containers
                .find((c) => c.id === window.id)
                ?.name.toUpperCase() ?? "STORAGE"),
        r,
        stack.windows.at(-1)?.id === window.id,
        (dx, dy) => {
          stack.move(window.id, dx, dy, ui.width, ui.height);
          invalidate();
        },
        () => closeWindow(window.id),
      );
      const viewport = { x: r.x + 16, y: r.y + 58, w: r.w - 40, h: r.h - 76 },
        start = ui.hits.length;
      ui.ctx.save();
      ui.ctx.beginPath();
      ui.ctx.rect(viewport.x, viewport.y, viewport.w, viewport.h);
      ui.ctx.clip();
      const content = { ...viewport, y: viewport.y - window.scroll };
      const height =
        window.id === "character"
          ? characterSheet.draw(state, content, name, pending, viewport)
          : storage(state, window, content, pending);
      window.limit = Math.max(0, height - viewport.h);
      window.scroll = Math.min(window.scroll, window.limit);
      ui.ctx.restore();
      ui.hits = ui.hits.flatMap((hit, i) => {
        if (i < start) return [hit];
        const x = Math.max(hit.rect.x, viewport.x),
          y = Math.max(hit.rect.y, viewport.y),
          w = Math.min(hit.rect.x + hit.rect.w, viewport.x + viewport.w) - x,
          h = Math.min(hit.rect.y + hit.rect.h, viewport.y + viewport.h) - y;
        return w > 0 && h > 0 ? [{ ...hit, rect: { x, y, w, h } }] : [];
      });
      for (const target of targets.filter((t) => t.window === window.id))
        target.visible = {
          ...target.rect,
          x: Math.max(target.rect.x, viewport.x),
          w: Math.max(
            0,
            Math.min(target.rect.x + target.rect.w, viewport.x + viewport.w) -
              Math.max(target.rect.x, viewport.x),
          ),
          y: Math.max(target.rect.y, viewport.y),
          h: Math.max(
            0,
            Math.min(target.rect.y + target.rect.h, viewport.y + viewport.h) -
              Math.max(target.rect.y, viewport.y),
          ),
        };
      if (window.limit) {
        const x = r.x + r.w - 21;
        ui.button(
          window.id + "-up",
          "↑",
          { x, y: viewport.y, w: 18, h: 24 },
          () => {
            window.scroll = Math.max(0, window.scroll - 110);
            invalidate();
          },
          { disabled: window.scroll === 0 },
        );
        ui.button(
          window.id + "-down",
          "↓",
          { x, y: viewport.y + viewport.h - 24, w: 18, h: 24 },
          () => {
            window.scroll = Math.min(window.limit, window.scroll + 110);
            invalidate();
          },
          { disabled: window.scroll === window.limit },
        );
        ui.ctx.fillStyle = palette.line;
        ui.ctx.fillRect(x + 8, viewport.y + 32, 2, viewport.h - 64);
        ui.ctx.fillStyle = palette.blue;
        ui.ctx.fillRect(
          x + 5,
          viewport.y + 32 + ((viewport.h - 80) * window.scroll) / window.limit,
          8,
          16,
        );
      }
      for (let i = firstHit; i < ui.hits.length; i++)
        ui.hits[i].press = () => {
          stack.focus(window.id);
          invalidate();
        };
    }
    // Short screens give the open inventory the available height; the normal
    // action bar returns as soon as the windows close.
    if (stack.windows.length && ui.height >= 500)
      hotbar(state, actionBarRect(ui.width, ui.height), true, pending);
    if (selected) {
      const item = state.items.find((i) => i.id === selected),
        d = item && definition(item),
        p = ui.pointerPosition();
      if (d && item) {
        const top = stack.at(p.x, p.y);
        const destination = targets.find(
          (t) =>
            t.window === top?.id && contains(t.visible ?? t.rect, p.x, p.y),
        );
        const source = targets.find((t) => t.container.id === item.containerId);
        const cell = destination?.cell ?? source?.cell ?? INVENTORY_CELL_SIZE;
        const column = destination
          ? Math.floor((p.x - destination.rect.x) / cell)
          : 0;
        const row = destination
          ? Math.floor((p.y - destination.rect.y) / cell)
          : 0;
        const box = {
          x: destination
            ? destination.rect.x + column * cell + 2
            : Math.max(8, p.x + 12),
          y: destination
            ? destination.rect.y + row * cell + 2
            : Math.max(8, p.y + 12),
          w: (rotated ? d.height : d.width) * cell - 4,
          h: (rotated ? d.width : d.height) * cell - 4,
        };
        ui.ctx.save();
        ui.ctx.globalAlpha = 0.96;
        drawItemFrame(ui, box, { rarity: itemRarity(d.id), selected: true });
        icon(ui, d, { x: box.x + 4, y: box.y + 4, w: box.w - 8, h: box.h - 8 });
        if (destination) {
          ui.ctx.strokeStyle = inventoryPlacement(
            state,
            item,
            destination.container,
            column,
            row,
            rotated,
          )
            ? palette.red
            : palette.green;
          ui.ctx.lineWidth = 2;
          ui.ctx.strokeRect(box.x, box.y, box.w, box.h);
        }
        ui.ctx.restore();
        ui.text(
          "R rotate · Right-click cancel",
          Math.min(box.x, ui.width - 180),
          Math.min(box.y + box.h + 8, ui.height - 18),
          10,
          palette.blue,
          180,
        );
      }
    } else if (!context) {
      const hit = ui.hits.find(
          (h) => h.id === (ui.keyboard ? ui.focus : ui.hover),
        ),
        entry = hit && itemHits.get(hit.id),
        d = entry && definition(entry.item);
      if (d && entry && hit) drawItemTooltip(ui, d, hit.rect, icon);
    }
    drawContext(state, pending);
    if (message || error) {
      const r = {
        x: Math.max(12, (ui.width - 490) / 2),
        y: 66,
        w: Math.min(490, ui.width - 24),
        h: 58,
      };
      ui.panel(r, true);
      ui.text(
        error ? "Action could not complete" : "Item placement",
        r.x + 12,
        r.y + 7,
        16,
        palette.red,
        r.w - 55,
      );
      ui.text(
        error || message,
        r.x + 12,
        r.y + 31,
        12,
        palette.muted,
        r.w - 55,
      );
      ui.button(
        "inventory-dismiss-error",
        "×",
        { x: r.x + r.w - 36, y: r.y + 9, w: 26, h: 26 },
        () => {
          message = "";
          dismissError();
          invalidate();
        },
      );
    }
  }
  return {
    draw,
    hotbar,
    quickSlot,
    toggle,
    open,
    rotate: rotateSelected,
    dispose: () => {
      ui.pointerAction = () => false;
      characterSheet.dispose();
    },
    openContainer(id: string, state: InventoryState) {
      if (!state.containers.some((c) => c.id === id)) return false;
      open(id);
      return true;
    },
    isOpen: (id?: string) =>
      id ? stack.windows.some((w) => w.id === id) : stack.windows.length > 0,
    close: () => {
      if (context) {
        context = undefined;
        invalidate();
        return;
      }
      if (selected) {
        cancelHeld();
        return;
      }
      const id = stack.windows.at(-1)?.id;
      if (id) closeWindow(id);
    },
    scroll: (delta: number, x?: number, y?: number, horizontalDelta = 0) => {
      const w =
        x !== undefined && y !== undefined
          ? stack.at(x, y)
          : stack.windows.at(-1);
      if (w) {
        const grid = targets.find((t) => t.window === w.id);
        if (horizontalDelta && grid) {
          const f = filterFor(grid.container.id);
          f.scrollX = Math.max(
            0,
            Math.min(grid.limitX, f.scrollX + horizontalDelta),
          );
        }
        w.scroll = Math.max(0, Math.min(w.limit, w.scroll + delta));
        context = undefined;
        invalidate();
      }
    },
  };
}

export { icon as drawInventoryIcon };
