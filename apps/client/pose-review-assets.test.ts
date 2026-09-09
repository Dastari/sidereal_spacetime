import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { poseReviewAssets, readPoseReviewAssets } from "./pose-review-assets";

const root = resolve(import.meta.dirname, "../..");
const temporary: string[] = [];
afterEach(() =>
  temporary
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);

it("serves the exact paired runtime files and excludes native sources/reference evidence", () => {
  const assets = readPoseReviewAssets(root);
  expect(assets.size).toBe(11);
  expect([...assets.keys()].every((file) => /\.(glb|json)$/.test(file))).toBe(
    true,
  );
  expect(assets.get("crew-poses.glb")?.subarray(0, 4).toString()).toBe("glTF");
  expect(poseReviewAssets(root).apply).toBe("serve");
});

it("rejects a geometry/metadata pair when any delivered bytes were changed", () => {
  const copy = mkdtempSync(join(tmpdir(), "sidereal-pose-pair-"));
  temporary.push(copy);
  const revision =
    "assets/art-library/designs/crew.animation.aim/revisions/r002";
  mkdirSync(join(copy, revision, "equipment"), { recursive: true });
  for (const file of ["delivery-manifest.json", "asset-validation.json"])
    writeFileSync(
      join(copy, revision, file),
      readFileSync(join(root, revision, file)),
    );
  for (const [file, bytes] of readPoseReviewAssets(root))
    writeFileSync(join(copy, revision, file), bytes);
  writeFileSync(
    join(copy, revision, "equipment/carbine.glb"),
    "mismatched canonical geometry",
  );
  expect(() => readPoseReviewAssets(copy)).toThrow(
    "hash mismatch: equipment/carbine.glb",
  );
});
