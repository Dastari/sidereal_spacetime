import { afterEach, expect, test, vi } from "vitest";
import { CanvasUI } from "./toolkit";
import { dismissGroundLootMenu, drawGroundLoot } from "./ground-loot";
import { createInventoryUI, type InventoryState } from "./inventory";
import { drawAppearanceControls } from "./appearance-controls";
afterEach(() => vi.unstubAllGlobals());
test("a dense ground pile keeps pickup labels separate and inside a compact viewport", () => {
  const { ui } = fixture();
  ui.width = 390;
  ui.height = 400;
  ui.scale = 1;
  const labels = vi.spyOn(ui, "text");
  drawGroundLoot(
    ui,
    Array.from({ length: 128 }, (_, i) => ({
      id: String(i),
      definitionId: "scanner",
      localX: 0,
      localY: 0,
      reachable: true,
      x: 195,
      y: 200,
    })),
    vi.fn(),
    false,
  );
  expect(ui.hits.length).toBeGreaterThan(0);
  expect(ui.hits.length).toBeLessThan(128);
  for (const [i, hit] of ui.hits.entries()) {
    const r = hit.rect;
    expect(r.x).toBeGreaterThanOrEqual(8);
    expect(r.x + r.w).toBeLessThanOrEqual(382);
    expect(r.y).toBeGreaterThanOrEqual(55);
    expect(r.y + r.h).toBeLessThanOrEqual(296);
    for (const other of ui.hits.slice(i + 1)) {
      const b = other.rect;
      expect(
        r.x + r.w <= b.x ||
          b.x + b.w <= r.x ||
          r.y + r.h <= b.y ||
          b.y + b.h <= r.y,
      ).toBe(true);
    }
  }
  expect(labels.mock.calls.some(([text]) => text.includes("more nearby"))).toBe(
    true,
  );
  expect(labels.mock.calls.some(([text]) => text === "SURVEY SCANNER")).toBe(
    true,
  );
  expect(labels.mock.calls.some(([text]) => text === "Survey scanner")).toBe(
    false,
  );
});
test("ground backpack offers a separate Equip/Swap action and retains ordinary pickup", () => {
  const { ui } = fixture();
  ui.scale = 1;
  const pickup = vi.fn(),
    equip = vi.fn();
  const rows = [
    {
      id: "ground-pack",
      definitionId: "field-pack",
      localX: 0,
      localY: 0,
      x: 500,
      y: 350,
      reachable: true,
    },
  ];
  const draw = (backpackEquipped: boolean, pending = false) => {
    ui.hits = [];
    drawGroundLoot(ui, rows, pickup, pending, { equip, backpackEquipped });
  };
  draw(false);
  ui.hits[0].context?.({ x: 510, y: 350, button: 2, shiftKey: false });
  draw(false);
  expect(ui.hits.find((h) => h.id === "ground-menu-equip")?.label).toBe(
    "Equip backpack",
  );
  draw(true);
  expect(ui.hits.find((h) => h.id === "ground-menu-equip")?.label).toBe(
    "Swap backpack",
  );
  draw(true, true);
  expect(ui.hits.find((h) => h.id === "ground-menu-equip")?.disabled).toBe(
    true,
  );
  draw(true);
  ui.hits.find((h) => h.id === "ground-menu-equip")?.action?.();
  expect(equip).toHaveBeenCalledWith("ground-pack");
  expect(pickup).not.toHaveBeenCalled();
  draw(false);
  expect(ui.hits.some((h) => h.id === "ground-menu-equip")).toBe(false);
  ui.hits[0].action?.();
  expect(pickup).toHaveBeenCalledWith("ground-pack");
  draw(false);
  ui.hits[0].context?.({ x: 510, y: 350, button: 2, shiftKey: false });
  expect(ui.keyboard).toBe(true);
  dismissGroundLootMenu(ui);
  expect(ui.keyboard).toBe(false);
  expect(ui.focus).toBe("");
});
function fixture() {
  vi.stubGlobal(
    "Image",
    class {
      complete = false;
      decoding = "";
      src = "";
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ entries: [] }) }),
    ),
  );
  const noop = () => {};
  const ctx = new Proxy(
    {
      measureText: (text: string) => ({ width: text.length * 7 }),
      createLinearGradient: () => ({ addColorStop: noop }),
    },
    {
      get: (o, k) => Reflect.get(o, k) ?? noop,
      set: (o, k, v) => Reflect.set(o, k, v),
    },
  );
  const ui = Object.assign(Object.create(CanvasUI.prototype), {
    ctx,
    hits: [],
    panels: [],
    width: 1280,
    height: 800,
    focus: "",
    hover: "",
    opacity: 0.94,
  }) as CanvasUI;
  const actions = {
    claimKit: vi.fn(),
    moveItem: vi.fn(),
    equipItem: vi.fn(),
    transferItem: vi.fn(),
    takeAll: vi.fn(),
    storeAll: vi.fn(),
    dropItem: vi.fn(),
    assignHotbar: vi.fn(),
    activateHotbar: vi.fn(),
  };
  const board = createInventoryUI(ui, actions);
  const state: InventoryState = {
    revision: "1",
    carriedMassKg: 9.7,
    carryLimitKg: 32,
    hotbar: [],
    items: [
      {
        id: "pack",
        definitionId: "field-pack",
        containerId: "",
        equipmentSlot: "back",
        x: 0,
        y: 0,
        rotated: false,
      },
      {
        id: "gun",
        definitionId: "carbine",
        containerId: "bag",
        equipmentSlot: "",
        x: 0,
        y: 0,
        rotated: false,
      },
    ],
    containers: [
      {
        id: "bag",
        parentItemId: "pack",
        kind: "grid",
        name: "Backpack",
        width: 8,
        height: 6,
        maxMassKg: 24,
        capacityLitres: 0,
        amountLitres: 0,
        liquidType: "",
        carried: true,
      },
      {
        id: "pocket",
        parentItemId: "",
        kind: "grid",
        name: "Pockets",
        width: 4,
        height: 2,
        maxMassKg: 6,
        capacityLitres: 0,
        amountLitres: 0,
        liquidType: "",
        carried: true,
      },
      {
        id: "crate",
        parentItemId: "",
        kind: "grid",
        name: "Storage crate",
        width: 6,
        height: 6,
        maxMassKg: 500,
        capacityLitres: 0,
        amountLitres: 0,
        liquidType: "",
        carried: false,
      },
    ],
  };
  const draw = () => {
    ui.hits = [];
    ui.panels = [];
    board.draw(state, { x: 0, y: 0, w: 1280, h: 800 }, "Review", () => {});
  };
  const hit = (id: string) => {
    const h = ui.hits.find((h) => h.id === id);
    if (!h) throw Error("Missing " + id);
    return h;
  };
  return { ui, board, state, actions, draw, hit };
}

test("click picks up without a mutation; context menu equips through authority", () => {
  const { board, draw, hit, ui, actions, state } = fixture();
  board.open("inventory");
  draw();
  const before = JSON.stringify(state);
  hit("item-inventory-gun").action?.();
  draw();
  expect(actions.moveItem).not.toHaveBeenCalled();
  expect(actions.equipItem).not.toHaveBeenCalled();
  expect(ui.hits.some((h) => h.id === "selected-item-surface")).toBe(false);
  board.close(); // Escape cancels the held item first.
  hit("item-inventory-gun").context?.({
    x: 200,
    y: 200,
    button: 2,
    shiftKey: false,
  });
  draw();
  hit("equip-item").action?.();
  expect(actions.equipItem).toHaveBeenCalledWith("gun");
  expect(JSON.stringify(state)).toBe(before);
});
test("inventory replacement backpack context action explicitly swaps through authority", () => {
  const { board, draw, hit, actions, state } = fixture();
  state.items[1] = { ...state.items[1], definitionId: "field-pack" };
  board.open("inventory");
  draw();
  hit("item-inventory-gun").context?.({
    x: 200,
    y: 200,
    button: 2,
    shiftKey: false,
  });
  draw();
  expect(hit("equip-item").label).toBe("Swap backpack");
  hit("equip-item").action?.();
  expect(actions.equipItem).toHaveBeenCalledWith("gun");
});
test("Shift-click transfers to open storage and storage-to-backpack does not require its window", () => {
  const { board, draw, hit, actions, state } = fixture();
  board.open("inventory");
  board.open("crate");
  draw();
  hit("item-inventory-gun").action?.({ x: 0, y: 0, button: 0, shiftKey: true });
  expect(actions.transferItem).toHaveBeenLastCalledWith("gun", "crate");
  state.items[1].containerId = "crate";
  board.toggle("inventory");
  draw();
  hit("item-crate-gun").action?.({ x: 0, y: 0, button: 0, shiftKey: true });
  expect(actions.transferItem).toHaveBeenLastCalledWith("gun", "");
  hit("take-all-crate").action?.();
  expect(actions.takeAll).toHaveBeenCalledWith("crate");
  expect(board.isOpen("inventory")).toBe(false);
});
test("opening a crate has consistent size in either order and never opens the backpack", () => {
  const f = fixture();
  expect(f.board.openContainer("hidden", f.state)).toBe(false);
  f.board.openContainer("crate", f.state);
  f.draw();
  const size = { ...f.hit("crate-surface").rect };
  expect(f.board.isOpen("inventory")).toBe(false);
  f.board.open("character");
  f.draw();
  expect(f.hit("crate-surface").rect).toEqual(size);
  const g = fixture();
  g.board.open("character");
  g.board.openContainer("crate", g.state);
  g.draw();
  expect(g.hit("crate-surface").rect.w).toBe(size.w);
});
test("inventory-first and character-first both find nonoverlapping space without resizing", () => {
  for (const order of [
    ["inventory", "character"],
    ["character", "inventory"],
  ]) {
    const { board, draw, hit } = fixture();
    order.forEach((id) => board.open(id));
    draw();
    const a = hit("inventory-surface").rect,
      b = hit("character-surface").rect;
    expect(a.x + a.w <= b.x || b.x + b.w <= a.x).toBe(true);
    expect(a.w).toBe(500);
    expect(b.w).toBe(620);
  }
});
test("dragging onto the Backpack tab targets that container without switching first", () => {
  const { board, draw, hit, actions, state } = fixture();
  state.items[1].containerId = "pocket";
  board.open("inventory");
  draw();
  hit("storage-tab-pocket").action?.();
  draw();
  const source = hit("item-inventory-gun"),
    target = hit("storage-tab-bag").rect;
  source.drag?.(7, 0);
  source.drop?.(target.x + 10, target.y + 10);
  expect(actions.transferItem).toHaveBeenCalledWith("gun", "bag");
});
test("dragging to a backpack icon targets its contents rather than its parent grid", () => {
  const { board, draw, hit, actions, state } = fixture();
  state.items[0].equipmentSlot = "";
  state.items[0].containerId = "crate";
  state.items[1].containerId = "crate";
  state.items[1].x = 3;
  board.open("crate");
  draw();
  const source = hit("item-crate-gun");
  source.drag?.(7, 7);
  draw();
  const target = hit("item-crate-pack").rect;
  source.drop?.(target.x + 10, target.y + 10);
  expect(actions.transferItem).toHaveBeenCalledWith("gun", "bag");
});
test("paper-doll backpack accepts contents while matching armor equips and unequips", () => {
  const { board, draw, hit, actions, state } = fixture();
  board.open("character");
  board.open("inventory");
  draw();
  const source = hit("item-inventory-gun");
  source.drag?.(7, 7);
  draw();
  const back = hit("equip-slot-back").rect;
  source.drop?.(back.x + 10, back.y + 10);
  expect(actions.transferItem).toHaveBeenCalledWith("gun", "bag");
  const hand = hit("equip-slot-hand").rect;
  source.drag?.(7, 7);
  source.drop?.(hand.x + 10, hand.y + 10);
  expect(actions.equipItem).toHaveBeenCalledWith("gun");
  state.items[1].equipmentSlot = "hand";
  state.items[1].containerId = "";
  draw();
  hit("equip-slot-hand").context?.({
    x: 500,
    y: 250,
    button: 2,
    shiftKey: false,
  });
  draw();
  hit("unequip-item").action?.();
  expect(actions.transferItem).toHaveBeenLastCalledWith("gun", "");
});
test("default Tetris grid preserves placement coordinates and held rotation until drop", () => {
  const { board, draw, hit, actions, state } = fixture();
  board.open("inventory");
  draw();
  hit("item-inventory-gun").action?.();
  board.rotate();
  draw();
  expect(actions.moveItem).not.toHaveBeenCalled();
  hit("slot-bag-2-2").action?.();
  expect(actions.moveItem).toHaveBeenCalledWith({
    itemId: "gun",
    containerId: "bag",
    x: 2,
    y: 2,
    rotated: true,
  });
  expect(state.items[1].rotated).toBe(false);
});
test("backpacks and crates show different item footprints at their saved positions", () => {
  for (const [containerId, window] of [
    ["bag", "inventory"],
    ["crate", "crate"],
  ]) {
    const { board, draw, hit, state, ui } = fixture();
    state.items[1].containerId = containerId;
    state.items.push({
      id: "cell",
      definitionId: "power-cell",
      containerId,
      equipmentSlot: "",
      x: 4,
      y: 0,
      rotated: false,
    });
    board.open(window);
    draw();
    const unit = hit(`slot-${containerId}-0-0`).rect;
    const rifle = hit(`item-${window}-gun`).rect;
    const cell = hit(`item-${window}-cell`).rect;
    expect(rifle).toEqual({
      x: unit.x + 2,
      y: unit.y + 2,
      w: unit.w * 2 - 4,
      h: unit.h * 4 - 4,
    });
    expect(cell).toEqual({
      x: unit.x + unit.w * 4 + 2,
      y: unit.y + 2,
      w: unit.w - 4,
      h: unit.h * 2 - 4,
    });
    hit(`filter-${window}-Weapons`).action?.();
    draw();
    expect(hit(`item-${window}-gun`).rect).toEqual(rifle);
    expect(hit(`item-${window}-cell`).rect).toEqual(cell);
    expect(hit(`item-${window}-cell`).disabled).toBe(true);
    expect(hit(`view-${window}`).label).toBe("Icons");
    expect(hit(`sort-${window}`).disabled).toBe(true);
  }
});
test("held preview snaps to the full footprint and rotation changes fit without changing inventory", () => {
  const { board, draw, hit, state, ui, actions } = fixture();
  board.open("inventory");
  draw();
  const slot = hit("slot-bag-5-1").rect;
  vi.spyOn(ui, "pointerPosition").mockReturnValue({
    x: slot.x + 10,
    y: slot.y + 10,
  });
  const strokes: { rect: number[]; color: string }[] = [];
  ui.ctx.strokeRect = (...rect) => {
    strokes.push({ rect, color: String(ui.ctx.strokeStyle) });
  };
  const before = JSON.stringify(state);
  hit("item-inventory-gun").action?.();
  draw();
  expect(strokes.at(-1)?.rect).toEqual([
    slot.x + 2,
    slot.y + 2,
    slot.w * 2 - 4,
    slot.h * 4 - 4,
  ]);
  expect(strokes.at(-1)?.color).toBe("#74dcbb");
  board.rotate();
  draw();
  expect(strokes.at(-1)?.rect).toEqual([
    slot.x + 2,
    slot.y + 2,
    slot.w * 4 - 4,
    slot.h * 2 - 4,
  ]);
  expect(strokes.at(-1)?.color).toBe("#ff8eaa");
  hit("slot-bag-5-1").action?.();
  expect(actions.moveItem).not.toHaveBeenCalled();
  expect(JSON.stringify(state)).toBe(before);
});
test("Icons remains optional and returning to Slots restores the physical layout", () => {
  const { board, draw, hit, state, ui } = fixture();
  board.open("inventory");
  draw();
  const footprint = { ...hit("item-inventory-gun").rect };
  const before = JSON.stringify(state);
  expect(hit("sort-inventory").disabled).toBe(true);
  hit("view-inventory").action?.();
  draw();
  const icon = hit("item-inventory-gun").rect;
  expect(icon.w).toBe(icon.h);
  expect(hit("sort-inventory").disabled).toBe(false);
  hit("sort-inventory").action?.();
  draw();
  hit("view-inventory").action?.();
  draw();
  expect(hit("item-inventory-gun").rect).toEqual(footprint);
  expect(ui.hits.some((h) => h.id === "slot-bag-0-0")).toBe(true);
  expect(JSON.stringify(state)).toBe(before);
});
test("different container widths keep equal cells and scrolling preserves exact drop coordinates", () => {
  const { board, draw, hit, state, ui, actions } = fixture();
  state.containers[2].width = 14;
  state.containers[2].height = 14;
  state.items.push({
    ...state.items[1],
    id: "far-rifle",
    containerId: "crate",
    x: 12,
  });
  board.open("inventory");
  board.open("crate");
  draw();
  expect(hit("slot-bag-0-0").rect.w).toBe(48);
  expect(hit("slot-crate-0-0").rect.w).toBe(48);
  expect(hit("item-crate-far-rifle").rect.w).toBeLessThan(92);
  hit("grid-pan-crate").change?.(1);
  draw();
  expect(hit("item-crate-far-rifle").rect.w).toBe(
    hit("item-inventory-gun").rect.w,
  );
  expect(hit("item-crate-far-rifle").rect.h).toBe(
    hit("item-inventory-gun").rect.h,
  );
  const source = hit("item-inventory-gun");
  const destination = hit("slot-crate-10-0").rect;
  source.drag?.(8, 0);
  source.drop?.(destination.x + 5, destination.y + 5);
  expect(actions.moveItem).toHaveBeenCalledWith({
    itemId: "gun",
    containerId: "crate",
    x: 10,
    y: 0,
    rotated: false,
  });
  board.scroll(1000, destination.x, destination.y);
  draw();
  expect(hit("slot-crate-13-13").rect.w).toBe(48);
  board.scroll(-1000, destination.x, destination.y, -1000);
  ui.width = 390;
  draw();
  expect(hit("slot-crate-0-0").rect.w).toBe(48);
  expect(hit("grid-right-crate").disabled).toBe(false);
});
test("ground drop uses an item intent and modal menus cannot consume stale pickup targets", () => {
  const { board, draw, hit, ui, actions } = fixture();
  board.open("inventory");
  draw();
  hit("item-inventory-gun").action?.();
  draw();
  ui.modal = true;
  expect(ui.pointerAction({ x: 100, y: 300, button: 0, shiftKey: false })).toBe(
    false,
  );
  expect(actions.dropItem).not.toHaveBeenCalled();
  ui.modal = false;
  expect(ui.pointerAction({ x: 100, y: 300, button: 0, shiftKey: false })).toBe(
    true,
  );
  expect(actions.dropItem).toHaveBeenCalledWith("gun");
});
test("filters and search dim occupied footprints without changing source data", () => {
  const { board, draw, hit, state } = fixture();
  board.open("inventory");
  draw();
  const before = JSON.stringify(state);
  hit("filter-inventory-Armor").action?.();
  draw();
  expect(hit("item-inventory-gun").disabled).toBe(true);
  hit("filter-inventory-All").action?.();
  hit("search-inventory").edit?.change("frontier");
  draw();
  expect(hit("item-inventory-gun").disabled).toBe(false);
  expect(JSON.stringify(state)).toBe(before);
});
test("compact controls stay in bounds and stats are a separate tab", () => {
  const { board, draw, hit, ui } = fixture();
  ui.width = 390;
  ui.height = 600;
  board.open("inventory");
  draw();
  for (const id of ["rarity-inventory", "search-inventory"])
    expect(hit(id).rect.w).toBeGreaterThan(80);
  board.toggle("inventory");
  board.open("character");
  draw();
  expect(ui.hits.some((h) => h.id === "character-stat-Overview")).toBe(false);
  hit("character-page-1").action?.();
  draw();
  expect(ui.hits.some((h) => h.id === "character-rotate")).toBe(false);
});
test("storage header exposes Store all only with a world destination and removes duplicated hints", () => {
  const { board, draw, hit, ui, actions } = fixture();
  const labels = vi.spyOn(ui, "text");
  board.open("inventory");
  draw();
  expect(ui.hits.some((h) => h.id === "store-all-bag")).toBe(false);
  board.open("crate");
  draw();
  hit("store-all-bag").action?.();
  expect(actions.storeAll).toHaveBeenCalledWith("bag", "crate");
  expect(
    labels.mock.calls.some(([text]) =>
      /Click to pick up|items ·|Backpack first/.test(text),
    ),
  ).toBe(false);
  board.open("character");
  draw();
  expect(
    ui.hits.some((h) =>
      ["character-body", "character-hair", "character-down"].includes(h.id),
    ),
  ).toBe(false);
  expect(labels.mock.calls.some(([text]) => text.includes("Body & hair"))).toBe(
    false,
  );
});
test("crew color swatches send separate supported skin and hair choices", () => {
  const { ui } = fixture();
  const change = vi.fn();
  drawAppearanceControls(
    ui,
    { x: 0, y: 0, w: 430, h: 500 },
    { skin: "#bb805e", hair: "#3b2823" },
    change,
  );
  ui.hits.find((h) => h.id === "crew-hair-color-7")!.action?.();
  expect(change).toHaveBeenLastCalledWith({ hair: "#2a8c95" });
  ui.hits.find((h) => h.id === "crew-skin-color-6")!.action?.();
  expect(change).toHaveBeenLastCalledWith({ skin: "#764e3b" });
  expect(ui.hits.some((h) => h.id === "crew-bodyType")).toBe(true);
  expect(ui.hits.some((h) => h.id === "crew-hairStyle")).toBe(true);
});
test("range loss closes storage and removes stale targets", () => {
  const { board, draw, state, ui } = fixture();
  board.open("crate");
  draw();
  state.containers = state.containers.filter((c) => c.id !== "crate");
  draw();
  expect(board.isOpen("crate")).toBe(false);
  expect(ui.hits.some((h) => h.id.startsWith("item-crate-"))).toBe(false);
});
test("hotbar quick slots bind locally without mutating inventory", () => {
  const { board, draw, hit, actions, state } = fixture();
  board.open("inventory");
  draw();
  hit("item-inventory-gun").action?.();
  draw();
  hit("quick-slot-0").action?.();
  board.close();
  board.quickSlot(0, state);
  draw();
  expect(board.isOpen("inventory")).toBe(true);
  expect(actions.equipItem).not.toHaveBeenCalled();
  expect(actions.assignHotbar).not.toHaveBeenCalled();
});
