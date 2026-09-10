/** Review entry uses current collision, including doors and placed cargo. */
import {
  canOccupyDeck,
  type DeckCollisionFrame,
} from "@sidereal/sim/construction-collision";
import { CARGO_HANDLING_FIXTURE } from "@sidereal/content/cargo-handling-fixture";
import type { Point } from "@sidereal/content/ship-layout";

export function qualifiedConstructionReviewEntry(
  frame: DeckCollisionFrame,
  instance: {
    id: string;
    blueprintSha256: string;
    spawnDeckId: string;
    spawnX: number;
    spawnY: number;
  },
): Point {
  // The dedicated fixture reserves its perimeter for approach/entry. This is an
  // explicit gameplay socket; no art, cargo placement or historical spawn is moved.
  const point: Point =
    instance.blueprintSha256 === CARGO_HANDLING_FIXTURE.sha256
      ? [...CARGO_HANDLING_FIXTURE.entryPointM]
      : [instance.spawnX, instance.spawnY];
  if (
    frame.shipId !== instance.id ||
    frame.deckId !== instance.spawnDeckId ||
    !canOccupyDeck(
      frame,
      { shipId: instance.id, deckId: instance.spawnDeckId, position: point },
      0.3,
    )
  )
    throw Error("Review entry is blocked by current structure or equipment");
  return point;
}
