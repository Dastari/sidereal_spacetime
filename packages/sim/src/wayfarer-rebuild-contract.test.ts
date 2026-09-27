import { describe, it, expect } from "vitest";
import {
  WAYFARER_REBUILD_SOURCE,
  verifyWayfarerRebuildSource,
} from "./wayfarer-rebuild-contract";
import type { ConstructionDocument } from "@sidereal/content/construction";
const copy = () =>
  JSON.parse(JSON.stringify(WAYFARER_REBUILD_SOURCE)) as ConstructionDocument;
describe("exact rebuilt source admission", () => {
  it("accepts source but rejects geometry changes, missing native objects and stale references", () => {
    expect(verifyWayfarerRebuildSource(copy()).identities).toBeDefined();
    for (const edit of [
      (d: ConstructionDocument) => d.layout.tiles[0].vertices[0][0]++,
      (d: ConstructionDocument) => d.layout.assembly!.parts.pop(),
      (d: ConstructionDocument) =>
        (d.layout.openings[0].partitionId = "unknown"),
    ]) {
      const d = copy();
      edit(d);
      expect(() => verifyWayfarerRebuildSource(d)).toThrow("differs");
    }
  });
  it("requires a bijection and checks the actual mapped content", () => {
    const d = copy();
    const entries = Object.entries(d.wayfarerRebuild!.identities);
    const map = new Map(
      entries.map(([k], i) => [
        k,
        `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      ]),
    );
    const deck = d.layout.decks[0].id;
    const remapString = (v: string) =>
      map.get(v) ??
      (v.startsWith(deck + ":") ? map.get(deck) + v.slice(deck.length) : v);
    const remap = (v: any): any =>
      typeof v === "string"
        ? remapString(v)
        : Array.isArray(v)
          ? v.map(remap)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, x]) => [remapString(k), remap(x)]),
              )
            : v;
    const instance = remap(d) as ConstructionDocument;
    instance.wayfarerRebuild = {
      ...d.wayfarerRebuild!,
      identities: Object.fromEntries(map),
    };
    instance.layout.name = "Owner name";
    expect(() => verifyWayfarerRebuildSource(instance)).not.toThrow();
    instance.wayfarerRebuild.identities[entries[1][0]] =
      instance.wayfarerRebuild.identities[entries[0][0]];
    expect(() => verifyWayfarerRebuildSource(instance)).toThrow("unique");
  });
});
