import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { readWayfarerAuthoredStudy } from "@sidereal/content/wayfarer-authored-study";
import {
  WAYFARER_POST_APERTURES,
  wayfarerNearWallPlacements,
} from "./wayfarer-authored-details";
import {
  authoredInstanceMatrix,
  readAuthoredGlb,
} from "./wayfarer-authored-study";
import { transformPoint } from "./frames";

const base = new URL("../../../../assets/runtime/ship-study/", import.meta.url);
const json = (file: string) =>
  JSON.parse(readFileSync(new URL(file, base), "utf8"));

test("near-wall source panels cover the omitted long face at metre scale within its wall envelope", () => {
  const study = readWayfarerAuthoredStudy(
    json("wayfarer-authored-r001/manifest.json"),
    json("wayfarer-authored-r001/layout.json"),
    json("wayfarer-authored-r001/descriptor.json"),
  );
  const rows = wayfarerNearWallPlacements(study.pieces);
  expect(rows).toHaveLength(32);
  const ranges: number[][] = [];
  for (const row of rows.filter((row) => row.object.startsWith("WALL_"))) {
    const piece = study.pieces.find((piece) => piece.id === row.piece)!;
    expect(row.matrix.slice(0, 3).map((r) => r.slice(0, 3))).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    // Independent source-frame bounds: translation only; inward dressing never enters
    // the approach cells at y<=5.125m. No copied far-room built-in fixture cohort.
    const minX = piece.boundsMin[0] + row.matrix[0][3];
    const maxX = piece.boundsMax[0] + row.matrix[0][3];
    ranges.push([minX, maxX]);
    const yMin = piece.boundsMin[1] + row.matrix[1][3];
    const yMax = piece.boundsMax[1] + row.matrix[1][3];
    expect(yMin).toBeGreaterThanOrEqual(5.2385);
    expect(yMax).toBeLessThanOrEqual(5.5);
    const projected = transformPoint(
      authoredInstanceMatrix(row.frame, row.matrix, [0, 0]),
      [piece.boundsMin[0], piece.boundsMin[2], -piece.boundsMin[1]],
    );
    expect(projected[0]).toBeCloseTo(-yMin);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  expect(ranges[0][0]).toBe(-10.75);
  expect(ranges.at(-1)![1]).toBe(4.5);
  for (let i = 1; i < ranges.length; i++)
    expect(ranges[i][0]).toBeLessThanOrEqual(ranges[i - 1][1] + 1e-8);
});

test("post derivatives bind actual bytes/counts while original material definitions stay exact", () => {
  const manifest = json("wayfarer-authored-r001/manifest.json");
  for (const [id, piece] of Object.entries(WAYFARER_POST_APERTURES)) {
    const data = new Uint8Array(
      readFileSync(new URL(`wayfarer-details-r001/${piece.file}`, base)),
    );
    const derivative = readAuthoredGlb(data, piece.sha256).json as any;
    const originalPiece = manifest.pieces.find((p: any) => p.id === id);
    const original = readAuthoredGlb(
      new Uint8Array(
        readFileSync(
          new URL(`wayfarer-authored-r001/${originalPiece.file}`, base),
        ),
      ),
      originalPiece.sha256,
    ).json;
    expect(derivative.materials).toEqual(original.materials);
    expect(derivative.nodes).toEqual(original.nodes);
    expect(
      derivative.meshes[0].primitives.reduce(
        (sum: number, p: any) =>
          sum + derivative.accessors[p.indices].count / 3,
        0,
      ),
    ).toBe(piece.triangles);
  }
});
