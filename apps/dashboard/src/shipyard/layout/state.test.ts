import { it, expect } from "vitest";
import {
  emptyLayout,
  stampTile,
  migrateAssembly,
} from "../../../../../packages/content/src/ship-layout";
import {
  DEFAULT_VIEW,
  push,
  undo,
  redo,
  placeTiles,
  transformTiles,
  readCheckpoint,
  recoveryKey,
  writeCheckpoint,
  type Checkpoint,
} from "./state";
it("symmetry placement, replacement and group transforms undo in one command with retained IDs", () => {
  const original = emptyLayout("doc", "deck");
  let n = 0;
  const placed = placeTiles(
    original,
    [[64, 64]],
    "trapezoid",
    "deck",
    0,
    true,
    true,
    () => `uuid-${++n}`,
  );
  expect(placed.tiles).toHaveLength(4);
  const h = push({ past: [], present: original, future: [] }, placed);
  expect(undo(h).present).toEqual(original);
  expect(redo(undo(h)).present).toEqual(placed);
  const rotated = transformTiles(
    placed,
    placed.tiles.map((t) => t.id),
    "rotate",
  );
  expect(rotated.tiles.map((t) => t.id)).toEqual(placed.tiles.map((t) => t.id));
  const replacement = {
    ...placed,
    tiles: placed.tiles.map((t, i) =>
      i === 0 ? { ...stampTile(t.id, t.deckId, "rectangle", [64, 64]) } : t,
    ),
  };
  expect(undo(push(h, replacement)).present).toEqual(placed);
});
it("scopes recovery by local identity, document and original live revision, and detects two-editor races", () => {
  const doc = emptyLayout("doc", "deck");
  doc.source = { liveId: "ship", expectedRevision: "10" };
  const values = new Map<string, string>(),
    storage = {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        values.set(k, v);
      },
    };
  const c: Checkpoint = {
    schema: "sidereal.layout-recovery.v1",
    sequence: 1,
    writer: "a",
    history: { past: [], present: doc, future: [] },
    view: { ...DEFAULT_VIEW, deckId: "deck" },
  };
  const key = recoveryKey("user-a", doc),
    raw = writeCheckpoint(storage, key, null, c);
  expect(key).not.toBe(recoveryKey("user-b", doc));
  expect(readCheckpoint(raw).history.present.source?.expectedRevision).toBe(
    "10",
  );
  expect(() =>
    writeCheckpoint(storage, key, null, { ...c, writer: "b" }),
  ).toThrow("Another editor");
  expect(storage.getItem(key)).toBe(raw);
  const stale = JSON.parse(raw);
  stale.history.present.compiler = "future";
  expect(() => readCheckpoint(JSON.stringify(stale))).toThrow("Unsupported");
  expect(storage.getItem(key)).toBe(raw);
});
it("legacy bytes survive migration, history, export and refresh without editing legacy storage", () => {
  const raw = JSON.stringify({
    schema: "sidereal.assembly-draft.v1",
    id: "old",
    name: "Legacy",
    parts: [{ id: "part", assetId: "missing" }],
  });
  const doc = migrateAssembly(raw, "new", "deck"),
    h = push(
      { past: [], present: doc, future: [] },
      { ...doc, name: "Changed" },
    );
  const c: Checkpoint = {
    schema: "sidereal.layout-recovery.v1",
    sequence: 1,
    writer: "a",
    history: h,
    view: { ...DEFAULT_VIEW, deckId: "deck" },
  };
  const refreshed = readCheckpoint(JSON.stringify(c));
  expect(undo(refreshed.history).present.legacy?.sourceRaw).toBe(raw);
  expect(refreshed.history.present.legacy?.placements[0]).toEqual({
    id: "part",
    assetId: "missing",
  });
});
