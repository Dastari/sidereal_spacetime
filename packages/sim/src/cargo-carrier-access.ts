import {
  canOccupyDeck,
  type DeckCollisionFrame,
} from "./construction-collision";
import {
  carrierInterface,
  type SecuredCargoAssembly,
} from "./cargo-carrier-assembly";
import type { CargoPoint } from "./construction-cargo";

export function cargoCarrierAccessPoint(
  assembly: SecuredCargoAssembly,
  origin: CargoPoint,
  q: number,
  frame?: DeckCollisionFrame,
  actor?: readonly [number, number],
): readonly [number, number, number] {
  const width = carrierInterface(assembly.carrierSize).size[0] / 32;
  // Inventory inspection has no animated lid operation. Choose one of four
  // qualified external approaches, so the rear row of a stack does not nominate
  // an impossible standing point inside its lower supporting frame.
  const offsets: readonly (readonly [number, number])[] = [
    [0.5, -0.325],
    [width + 0.325, 0.5],
    [width - 0.5, width + 0.325],
    [-0.325, width - 0.5],
  ];
  const candidates = [0, 1, 2, 3].map((i) => {
    const p = offsets[(q + i) % 4]!;
    return [
      origin[0] / 32 + p[0],
      origin[1] / 32 + p[1],
      (frame?.elevationM ?? 0) + 0.1875,
    ] as const;
  });
  if (actor)
    candidates.sort(
      (a, b) =>
        Math.hypot(a[0] - actor[0], a[1] - actor[1]) -
        Math.hypot(b[0] - actor[0], b[1] - actor[1]),
    );
  if (!frame) return candidates[0]!;
  const point = candidates.find((p) =>
    canOccupyDeck(
      frame,
      { shipId: frame.shipId, deckId: frame.deckId, position: [p[0], p[1]] },
      0.3,
    ),
  );
  if (!point) throw Error("Carrier has no qualified supported access approach");
  return point;
}
