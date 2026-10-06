import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { readAuthoredTemplateKit } from "./authored-template-kit";
import {
  readAuthoredTemplateLod,
  AUTHORED_TEMPLATE_LOD_MANIFEST_SHA256,
} from "./authored-template-lod";

const root = new URL("../../../assets/runtime/ship-study/", import.meta.url);
const source = readAuthoredTemplateKit(
  JSON.parse(
    readFileSync(new URL("template-authored-r001/manifest.json", root), "utf8"),
  ),
);
const bytes = readFileSync(new URL("template-lod-r001/manifest.json", root));
const manifest = JSON.parse(bytes.toString());
describe("additive native exterior derivatives", () => {
  it("pins complete source-matched pieces without changing authoring identity", () => {
    expect(bytesToHex(sha256(bytes))).toBe(
      AUTHORED_TEMPLATE_LOD_MANIFEST_SHA256,
    );
    const pieces = readAuthoredTemplateLod(manifest, source);
    expect(pieces.map((p) => p.id)).toEqual(source.pieces.map((p) => p.id));
    expect(pieces.reduce((n, p) => n + p.triangles, 0)).toBeLessThan(
      source.pieces.reduce((n, p) => n + p.triangles, 0) * 0.4,
    );
    for (const [i, piece] of pieces.entries()) {
      expect(piece.sourceSha256).toBe(source.pieces[i].sha256);
      expect(piece.materials).toEqual(source.pieces[i].materials);
      expect(piece.boundsMin).toEqual(source.pieces[i].boundsMin);
      expect(
        bytesToHex(
          sha256(
            readFileSync(new URL(`template-lod-r001/${piece.file}`, root)),
          ),
        ),
      ).toBe(piece.sha256);
    }
  });
  it("refuses incomplete, duplicated, changed or repathed source bindings", () => {
    for (const change of [
      (d: typeof manifest) => {
        d.pieces.pop();
      },
      (d: typeof manifest) => {
        d.pieces[1] = d.pieces[0];
      },
      (d: typeof manifest) => {
        d.pieces[0].sourceSha256 = "0".repeat(64);
      },
      (d: typeof manifest) => {
        d.pieces[0].file = "../source.glb";
      },
      (d: typeof manifest) => {
        d.sourceManifestSha256 = "0".repeat(64);
      },
      (d: typeof manifest) => {
        d.pieces[0].triangles = 0;
      },
    ]) {
      const doc = structuredClone(manifest);
      change(doc);
      expect(() => readAuthoredTemplateLod(doc, source)).toThrow(/provenance/);
    }
  });
});
