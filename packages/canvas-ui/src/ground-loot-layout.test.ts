import { expect, test } from "vitest";
import { createGroundLootLayout } from "./ground-loot-layout";

const a = { id: "a", x: 500, y: 250, w: 142 };
const b = { ...a, id: "b", y: 278 };
test("camera movement across a collision threshold keeps the label on its chosen side", () => {
  const layout = createGroundLootLayout();
  const before = layout([a, b], 1000, 700).get("b")!;
  const after = layout([a, { ...b, y: b.y + 3 }], 1000, 700).get("b")!;
  expect(after.y - before.y).toBeCloseTo(3);
  expect(Math.sign(after.y - (a.y - 24))).toBe(
    Math.sign(before.y - (a.y - 24)),
  );
});
test("subscription row order and reach updates cannot shuffle a pile's slots", () => {
  const layout = createGroundLootLayout();
  const before = layout([a, b, { ...a, id: "c" }], 1000, 700);
  const after = layout([{ ...a, id: "c" }, b, a], 1000, 700);
  expect([...after]).toEqual([...before]);
});
test("nearby moving anchors make continuous separation corrections rather than grid jumps", () => {
  const layout = createGroundLootLayout();
  const start = layout([a, { ...b, y: 250 }], 1000, 700);
  const next = layout(
    [
      { ...a, y: 251 },
      { ...b, y: 250 },
    ],
    1000,
    700,
  );
  expect(Math.abs(next.get("b")!.y - start.get("b")!.y)).toBeLessThanOrEqual(1);
});
test("removal releases its slot; compact viewport and variable widths remain bounded", () => {
  const layout = createGroundLootLayout();
  const rows = Array.from({ length: 128 }, (_, i) => ({
    id: String(i),
    x: 195,
    y: 200,
    w: i % 2 ? 228 : 142,
  }));
  const crowded = layout(rows, 390, 400);
  expect(crowded.size).toBeGreaterThan(0);
  expect(crowded.size).toBeLessThan(128);
  for (const r of crowded.values()) {
    expect(r.x).toBeGreaterThanOrEqual(8);
    expect(r.x + r.w).toBeLessThanOrEqual(382);
    expect(r.y).toBeGreaterThanOrEqual(55);
    expect(r.y + r.h).toBeLessThanOrEqual(296);
  }
  layout([], 390, 400);
  expect(layout([b], 1000, 700).get("b")!.y).toBe(b.y - 24);
});
