import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readWayfarerAuthoredStudy } from "@sidereal/content/wayfarer-authored-study";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import { FURNISHING_DEFAULT } from "@sidereal/content/wayfarer-furnishings";
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
  it("uses the same accepted rotated/moved fixture matrix for mesh and local socket, and drops deleted fixtures", () => {
    const object = "Quarters_A_locker_lit";
    const source = study.instances.find((row) => row.object === object)!;
    const corrected = wayfarerVisiblePlacements(study.instances, false).find(
      (row) => row.object === object,
    )!;
    const physical = WAYFARER_GAMEPLAY_OBJECTS.find(
      (row) => row.object === object,
    )!;
    const row = wayfarerVisiblePlacements(study.instances, false, {
      [object]: { ...FURNISHING_DEFAULT, dx: 1.25, dy: -0.5, yaw: Math.PI / 2 },
    }).find((row) => row.object === object)!;
    const socket: [number, number, number] = [0.1, 0.7, -0.3]; // Independent glTF Y-up witness.
    const before = transformPoint(
      authoredInstanceMatrix(corrected.frame, corrected.matrix, [0, 0]),
      socket,
    );
    const after = transformPoint(
      authoredInstanceMatrix(row.frame, row.matrix, [0, 0]),
      socket,
    );
    const cx = (physical.min[0] + physical.max[0]) / 2;
    const cy = (physical.min[1] + physical.max[1]) / 2;
    // Renderer(x,y,z)=(-sourceY,sourceZ,-sourceX). Rotate original source XY about immutable centre.
    const sourceX = -before[2],
      sourceY = -before[0];
    expect(after[0]).toBeCloseTo(-(cy + (sourceX - cx) - 0.5));
    expect(after[2]).toBeCloseTo(-(cx - (sourceY - cy) + 1.25));
    expect(after[1]).toBeCloseTo(before[1]);
    expect(
      wayfarerVisiblePlacements(study.instances, false, {
        [object]: { ...FURNISHING_DEFAULT, deleted: true },
      }).some((row) => row.object === object),
    ).toBe(false);
    expect(study.instances.find((row) => row.object === object)?.matrix).toBe(
      source.matrix,
    );
  });
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
