import type { LayoutWall } from "@sidereal/sim/layout-compiler";
import { planComplexPerimeter } from "@sidereal/sim/layout-complex-perimeter";
import type { Point } from "@sidereal/content/ship-layout";

/** The compiler supplies topology and treatment intent; this adapter only chooses
 * additive native preview pieces. No authority path invokes it. */
export function complexVisualPerimeters(
  walls: readonly LayoutWall[],
  deckId: string,
  elevation: number,
) {
  const active = walls.filter((w) => w.deckId === deckId);
  const issues: { key: string; message: string }[] = [];
  const placements: {
    key: string;
    profileId: string;
    quarterHeight: number;
    originUnits: [number, number, number];
    quarterTurns: number;
    yawRadians?: number;
  }[] = [];
  const fail = (key: string, message: string) => issues.push({ key, message });
  const result = () => ({
    placements: issues.length ? [] : placements,
    issues,
  });
  if (
    active.length > 512 ||
    active.some(
      (w) =>
        w.source !== "perimeter" ||
        !w.treatment ||
        w.treatment.native ||
        w.treatment.floorThicknessUnits !== 6 ||
        ![24, 48, 72, 96].includes(w.treatment.heightUnits) ||
        !["auto", "vertical-hull", "bulkhead"].includes(w.treatment.intent),
    )
  ) {
    fail(
      "complex-treatment",
      "Complex native walls currently require a closed opaque perimeter without internal partitions or openings",
    );
    return result();
  }
  const key = (p: Point) => p.join(",");
  const remaining = new Set(active);
  for (const w of active) {
    if (
      active.filter((v) => key(v.a) === key(w.a)).length !== 1 ||
      active.filter((v) => key(v.b) === key(w.a)).length !== 1
    ) {
      fail(w.key, "Complex perimeter has an open or branching boundary");
      return result();
    }
  }
  while (remaining.size) {
    const start = remaining.values().next().value!;
    const loop: LayoutWall[] = [];
    let current = start;
    do {
      if (!remaining.delete(current)) {
        fail(start.key, "Complex perimeter loop is not closed");
        return result();
      }
      loop.push(current);
      current = active.find((v) => key(v.a) === key(current.b))!;
    } while (current !== start);
    const height = start.treatment!.heightUnits;
    if (
      loop.some(
        (w) =>
          w.treatment!.heightUnits !== height ||
          w.treatment!.intent !== start.treatment!.intent,
      )
    ) {
      fail(
        start.key,
        "Complex perimeter needs matching wall heights and intents at its joins",
      );
      continue;
    }
    const plan = planComplexPerimeter(
      loop.map((w) => w.a),
      (height / 24) as 1 | 2 | 3 | 4,
    );
    for (const message of plan.issues) fail(start.key, message);
    for (const [i, p] of plan.placements.entries())
      placements.push({
        key: start.key + ":" + i,
        profileId: p.profileId,
        quarterHeight: height / 24,
        originUnits: [...p.originUnits, elevation + 6],
        quarterTurns: p.quarterTurns,
        yawRadians: p.yawRadians,
      });
  }
  return result();
}
