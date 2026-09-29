import { describe, expect, it } from "vitest";
import { FED_WREN } from "./prefabs/federation";
import { PREFAB_SHIPS } from "./prefabs";
import { defaultPrefabComponentCatalog } from "./ship-prefab-catalog";
import {
  canonicalShipPrefabJson,
  deriveInterior,
  fixtureSize,
  readShipPrefab,
  validatePrefabFixtures,
  validateShipPrefab,
  type PrefabFixture,
} from "./ship-prefab";

const catalog = defaultPrefabComponentCatalog();
const locker = FED_WREN.fixtures![0];
const withFixtures = (fixtures: unknown) =>
  JSON.parse(JSON.stringify({ ...FED_WREN, fixtures })) as unknown;

describe("prefab storage fixtures (hand-placed storage sockets)", () => {
  it("only current Wren carries fixtures; documents without them keep no key", () => {
    expect(
      PREFAB_SHIPS.filter((p) => p.fixtures).map((p) => [p.id, p.revision]),
    ).toEqual([["fed.s.wren", 9]]);
    const { fixtures: _, ...bare } = FED_WREN;
    expect(canonicalShipPrefabJson(bare)).not.toContain("fixtures");
    expect(
      readShipPrefab(JSON.parse(canonicalShipPrefabJson(FED_WREN))),
    ).toEqual(FED_WREN);
  });

  it("admits designs on the 0.05 m grid and refuses anything else", () => {
    const bad: [unknown, string][] = [
      [[{ ...locker, at: [6.93, 1.2] }], "0.05 m grid"],
      [[{ ...locker, design: "crew-bunk.sm" }], "expected one of"],
      [[{ ...locker, facing: "up" }], "expected one of"],
      [[{ ...locker, deck: 0 }], "unknown field deck"],
      [[locker, locker], "duplicate id suit-locker"],
      [{}, "expected an array"],
    ];
    for (const [fixtures, why] of bad)
      expect(() => readShipPrefab(withFixtures(fixtures)), why).toThrow(why);
  });

  it("derives a storage socket exactly where authored; its width runs along its wall", () => {
    const socket = deriveInterior(FED_WREN, 0, catalog).sockets.find(
      (s) => s.fixture === "suit-locker",
    );
    expect(socket).toEqual({
      designId: "shipyard.equipment.wall-locker",
      room: "hold",
      at: [6.95, 1.2],
      size: [0.75, 0.5],
      heightTexels: 32,
      facing: "starboard",
      control: false,
      fixture: "suit-locker",
    });
    expect(fixtureSize({ ...locker, facing: "fore" })).toEqual([0.5, 0.75]);
  });

  it("room furniture gives way to a fixture on its footprint", () => {
    const crate = deriveInterior(FED_WREN, 0, catalog).sockets.find(
      (s) => s.designId === "cargo.standard.medium",
    )!;
    const onCrate: PrefabFixture = {
      id: "box",
      design: "shipyard.equipment.wall-locker",
      at: [crate.at[0], crate.at[1]],
      facing: "fore",
    };
    const sockets = deriveInterior(
      { ...FED_WREN, fixtures: [onCrate] },
      0,
      catalog,
    ).sockets.filter((s) => s.room === "hold");
    expect(sockets.map((s) => s.fixture ?? s.designId)).toEqual(["box"]);
  });

  it("refuses fixtures off the floor, against a wall, in an approach, on a button, module or fixture", () => {
    const codes = (fixtures: PrefabFixture[]) =>
      validatePrefabFixtures({ ...FED_WREN, fixtures }, catalog).map(
        (i) => i.code,
      );
    const at = (x: number, y: number, facing = locker.facing) => ({
      ...locker,
      at: [x, y] as [number, number],
      facing,
    });
    expect(codes([locker])).toEqual([]);
    expect(codes([at(20, 20)])).toEqual(["fixture.room"]);
    expect(codes([at(7.1, 1.2)])).toEqual(["fixture.wall"]);
    expect(codes([at(5.5, 1.2)])).toEqual(["fixture.approach"]);
    expect(codes([at(7.1, 0.25)])).toContain("fixture.button");
    // The medium fuel tank module stands in the engine room's starboard corner.
    expect(codes([at(0.3, 0.3)])).toContain("fixture.module");
    expect(codes([locker, { ...locker, id: "twin" }])).toContain(
      "fixture.overlap",
    );
    // Reported through the document validation, referenced by fixture id.
    expect(
      validateShipPrefab({ ...FED_WREN, fixtures: [at(5.5, 1.2)] }, catalog)
        .filter((i) => i.ref.kind === "fixture")
        .map((i) => [i.code, i.ref]),
    ).toEqual([["fixture.approach", { kind: "fixture", id: "suit-locker" }]]);
  });
});
