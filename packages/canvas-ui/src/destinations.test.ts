import { expect, test } from "vitest";
import { destinationPagination } from "./destinations";

test("all eleven destinations are reachable on desktop and compact viewports", () => {
  for (const [height, top] of [
    [740, 140],
    [474, 106],
    [361, 140],
  ]) {
    const seen = new Set<number>();
    const first = destinationPagination(11, height, top, 0);
    for (let p = 0; p < first.pages; p++) {
      const page = destinationPagination(11, height, top, p);
      expect(page.top + page.panelHeight).toBeLessThanOrEqual(height);
      for (let i = page.start; i < page.end; i++) seen.add(i);
    }
    expect([...seen]).toEqual(Array.from({ length: 11 }, (_, i) => i));
  }
});

test("catalog shrink and resize clamp the page while retaining valid destination indices", () => {
  expect(destinationPagination(2, 740, 140, 8)).toMatchObject({
    page: 0,
    start: 0,
    end: 2,
  });
  expect(destinationPagination(11, 740, 140, -1).page).toBe(0);
});
