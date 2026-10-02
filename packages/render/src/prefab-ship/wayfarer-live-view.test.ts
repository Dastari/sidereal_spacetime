import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readWayfarerAuthoredStudy } from "@sidereal/content/wayfarer-authored-study";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import { wayfarerVisiblePlacements } from "./wayfarer-live-view";
import {
  authoredInstanceMatrix,
  readAuthoredGlb,
} from "./wayfarer-authored-study";
import { transformPoint } from "./frames";

const base = new URL(
  "../../../../assets/runtime/ship-study/wayfarer-authored-r001/",
  import.meta.url,
);
const json = (name: string) =>
  JSON.parse(readFileSync(new URL(name, base), "utf8"));
const study = readWayfarerAuthoredStudy(
  json("manifest.json"),
  json("layout.json"),
  json("descriptor.json"),
);

describe("live authored Wayfarer presentation contract", () => {
  it("replaces the source mannequin and ring with the actual player while retaining the frozen source", () => {
    const original = JSON.stringify(study.instances);
    const local = wayfarerVisiblePlacements(study.instances, false);
    expect(local).toHaveLength(457);
    expect(
      local.some((row) => /Hall_(crew_chibi|selection_ring)/.test(row.object)),
    ).toBe(false);
    expect(local.some((row) => row.object === "Cargo_crate_small_white")).toBe(
      true,
    );
    expect(JSON.stringify(study.instances)).toBe(original);
  });

  it("never renders another ship's furniture, floor tiles, bedrooms or lamps", () => {
    const remote = wayfarerVisiblePlacements(study.instances, true);
    expect(remote.length).toBeGreaterThan(0);
    expect(
      remote.some((row) =>
        [
          "room-content",
          "floor",
          "wall-dressing",
          "partition",
          "door-light",
          "header-light",
        ].includes(row.role),
      ),
    ).toBe(false);
    expect(remote.filter((row) => row.role === "engine-pod")).toHaveLength(3);
  });

  it("puts the widened doorway surfaces on exactly the same authority bounds and floor datum", () => {
    const local = wayfarerVisiblePlacements(study.instances, false);
    for (const name of [
      "POST_far_-9.75",
      "POST_far_-8.95",
      "PART_far_0",
      "PART_far_1",
    ]) {
      const row = local.find((row) => row.object === name)!;
      const piece = study.pieces.find((piece) => piece.id === row.piece)!;
      const physical = WAYFARER_GAMEPLAY_OBJECTS.find(
        (row) => row.object === name,
      )!;
      const matrix = authoredInstanceMatrix(row.frame, row.matrix, [0, 0]);
      const bounds = [piece.boundsMin[0], piece.boundsMax[0]].flatMap((x) =>
        [piece.boundsMin[1], piece.boundsMax[1]].flatMap((y) =>
          [piece.boundsMin[2], piece.boundsMax[2]].map((z) =>
            transformPoint(matrix, [x, z, -y]),
          ),
        ),
      );
      expect(Math.min(...bounds.map((p) => p[0]))).toBeCloseTo(
        -physical.max[1],
      );
      expect(Math.max(...bounds.map((p) => p[0]))).toBeCloseTo(
        -physical.min[1],
      );
      expect(Math.min(...bounds.map((p) => p[1])) + 0.1875).toBeCloseTo(
        physical.min[2],
      );
      expect(Math.max(...bounds.map((p) => p[2]))).toBeCloseTo(
        -physical.min[0],
      );
    }
  });

  it("admits the exact reviewed matching RCS with retained material-family metadata", () => {
    const asset = readAuthoredGlb(
      Uint8Array.from(readFileSync(new URL("rcs.md.glb", base))),
      "9e7f2d54f90e3d5f0cd0e1900b6d76f9534e33c9552abe21ce6dd7e7b50eda51",
    );
    const materials = asset.json.materials as {
      extras: { sr_family: string };
    }[];
    expect(materials).toHaveLength(7);
    expect(
      materials.every(
        (material) => typeof material.extras.sr_family === "string",
      ),
    ).toBe(true);
  });
});
