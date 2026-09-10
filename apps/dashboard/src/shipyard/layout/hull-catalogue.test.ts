import { expect, it } from "vitest";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import {
  fittedHullEnvelope,
  readHullCatalogue,
  writeHullCatalogue,
} from "./hull-catalogue";
it("derives a fit around negative coordinates and all deck ceilings without moving the layout", () => {
  const d = emptyLayout("draft", "deck");
  d.tiles = [stampTile("t", "deck", "rectangle", [-96, -64])];
  d.decks.push({ ...d.decks[0], id: "upper", elevation: 128, ceiling: 96 });
  const original = structuredClone(d);
  expect(fittedHullEnvelope(d)).toEqual({
    origin: [-96, -64, 0],
    width: 64,
    length: 64,
    height: 224,
  });
  expect(d).toEqual(original);
});
it("persists bounded editable definitions separately and rejects competing catalogue writes", () => {
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
  };
  const entry = {
    id: "size",
    revision: "r1",
    name: "Custom hull",
    width: 640,
    length: 1024,
    height: 256,
  };
  const saved = writeHullCatalogue(storage, "key", null, [entry]);
  expect(readHullCatalogue(saved)).toEqual([entry]);
  expect(() =>
    writeHullCatalogue(storage, "key", null, [{ ...entry, revision: "r2" }]),
  ).toThrow("Another editor");
  expect(raw).toBe(saved);
  expect(() =>
    writeHullCatalogue(storage, "key", saved, [{ ...entry, width: 0 }]),
  ).toThrow("bounded positive");
  expect(raw).toBe(saved);
});
