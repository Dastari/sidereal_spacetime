import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readWayfarerAuthoredStudy } from "./wayfarer-authored-study";

const directory = new URL(
  "../../../assets/runtime/ship-study/wayfarer-authored-r001/",
  import.meta.url,
);
const json = (name: string) =>
  JSON.parse(readFileSync(new URL(name, directory), "utf8"));
const load = () => ({
  manifest: json("manifest.json"),
  layout: json("layout.json"),
  descriptor: json("descriptor.json"),
});

describe("private completed authored study", () => {
  it("retains all188 pieces/all459 mesh instances and explicitly omits only6 FX rows", () => {
    const { manifest, layout, descriptor } = load();
    const study = readWayfarerAuthoredStudy(manifest, layout, descriptor);
    expect(study.pieces).toHaveLength(188);
    expect(study.instances).toHaveLength(459);
    expect(study.omittedFX).toHaveLength(6);
    expect(Object.keys(study.palette)).toHaveLength(77);
    expect(
      study.instances.filter((row) => row.role === "header-light"),
    ).toHaveLength(1);
    expect(
      study.instances.find((row) => row.piece === "unique.DECK_floor_base")
        ?.role,
    ).toBe("floor");
  });

  it("uses true-scale72 prop matrices, retains signed mirrors and never reapplies11 baked node matrices", () => {
    const { manifest, layout, descriptor } = load();
    const study = readWayfarerAuthoredStudy(manifest, layout, descriptor);
    for (const row of study.instances) {
      const original = layout.placements.find(
        (value: { object: string }) => value.object === row.object,
      );
      expect(row.originalMatrix).toEqual(original.matrix);
      expect(row.matrix).toEqual(
        row.frame === "ship-node-baked"
          ? [
              [1, 0, 0, 0],
              [0, 1, 0, 0],
              [0, 0, 1, 0],
              [0, 0, 0, 1],
            ]
          : (original.matrix_true_scale ?? original.matrix),
      );
    }
    expect(study.instances.filter((row) => row.trueScale)).toHaveLength(72);
    expect(study.instances.filter((row) => row.mirrored)).toHaveLength(14);
    expect(
      study.instances.filter((row) => row.frame === "ship-node-baked"),
    ).toHaveLength(11);
    const bulkhead = study.instances.find(
      (row) => row.object === "BULKHEAD_cockpit",
    );
    expect(bulkhead?.originalMatrix[0][3]).toBe(4.75);
    expect(bulkhead?.matrix[0][3]).toBe(0);
  });

  it("rejects unknown or partial cohorts atomically instead of dropping unrecognized objects", () => {
    const partial = load();
    partial.layout.placements.pop();
    expect(() =>
      readWayfarerAuthoredStudy(
        partial.manifest,
        partial.layout,
        partial.descriptor,
      ),
    ).toThrow("complete layout cohort");
    const unknown = load();
    unknown.layout.placements[0].piece = "fx.unapproved";
    expect(() =>
      readWayfarerAuthoredStudy(
        unknown.manifest,
        unknown.layout,
        unknown.descriptor,
      ),
    ).toThrow("unknown piece");
    const duplicate = load();
    duplicate.layout.placements[1].object =
      duplicate.layout.placements[0].object;
    expect(() =>
      readWayfarerAuthoredStudy(
        duplicate.manifest,
        duplicate.layout,
        duplicate.descriptor,
      ),
    ).toThrow("duplicate placement");
    const unplaced = load();
    unplaced.manifest.pieces[0].placements += 1;
    expect(() =>
      readWayfarerAuthoredStudy(
        unplaced.manifest,
        unplaced.layout,
        unplaced.descriptor,
      ),
    ).toThrow("placement count");
  });

  it("rejects invalid frames, singular matrices, unsafe paths and unknown material families", () => {
    const bad = load();
    bad.layout.placements[0].matrix[2][2] = 0;
    expect(() =>
      readWayfarerAuthoredStudy(bad.manifest, bad.layout, bad.descriptor),
    ).toThrow("nonsingular");
    const baked = load();
    baked.manifest.unique[0].frame = "piece-local";
    expect(() =>
      readWayfarerAuthoredStudy(baked.manifest, baked.layout, baked.descriptor),
    ).toThrow("baked node frame");
    const path = load();
    path.manifest.pieces[0].file = "glb/../unsafe.glb";
    expect(() =>
      readWayfarerAuthoredStudy(path.manifest, path.layout, path.descriptor),
    ).toThrow("local GLB path");
    const family = load();
    family.manifest.palette.primary.family = "unknown";
    expect(() =>
      readWayfarerAuthoredStudy(
        family.manifest,
        family.layout,
        family.descriptor,
      ),
    ).toThrow("known palette");
  });

  it("requires the exact frozen metadata descriptor and returns copied placement values", () => {
    const bad = load();
    bad.descriptor.manifestSha256 = "0".repeat(64);
    expect(() =>
      readWayfarerAuthoredStudy(bad.manifest, bad.layout, bad.descriptor),
    ).toThrow("manifestSha256");
    const { manifest, layout, descriptor } = load();
    const study = readWayfarerAuthoredStudy(manifest, layout, descriptor);
    const first = study.instances[0];
    const x = first.matrix[0][3];
    layout.placements[0].matrix[0][3] = 999;
    expect(first.matrix[0][3]).toBe(x);
    expect(first.originalMatrix[0][3]).toBe(x);
  });
});
