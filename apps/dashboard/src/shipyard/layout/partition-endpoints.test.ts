import { expect, it } from "vitest";
import { createDoorway250ReviewLayout } from "@sidereal/content/doorway250-review-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { movePartitionEndpoint, movePartitions } from "./partition-endpoints";
import { DEFAULT_VIEW, push, undo, redo, readCheckpoint } from "./state";

function fixture() {
  const doc = createDoorway250ReviewLayout();
  doc.rooms = [];
  return doc;
}
it("moves the whole wall with its door and treatments in one undo step and rejects unsupported destinations", () => {
  const doc = fixture(),
    id = doc.partitions[0].id,
    before = structuredClone(doc);
  const next = movePartitions(doc, [id], [0, 32]);
  expect(next.partitions[0]).toMatchObject({ a: [0, 96], b: [192, 96] });
  expect(next.openings[0]).toEqual({
    ...doc.openings[0],
    a: [76, 96],
    b: [116, 96],
  });
  if (next.structure?.schema !== "sidereal.layout-structure.v2") throw Error();
  expect(next.structure.boundaryTreatments).toMatchObject([
    { a: [0, 96], b: [76, 96] },
    { a: [116, 96], b: [192, 96] },
  ]);
  expect(compileLayout(next).valid).toBe(true);
  expect(
    undo(push({ past: [], present: doc, future: [] }, next)).present,
  ).toEqual(doc);
  expect(() => movePartitions(doc, [id], [0, 64])).toThrow(
    /supported internal/,
  );
  expect(() => movePartitions(doc, [id], [32, 0])).toThrow(
    /supported internal/,
  );
  expect(doc).toEqual(before);
});
it("resizes either endpoint, preserving the opposite end, door IDs, split treatments and face finishes through undo and recovery", () => {
  const doc = fixture(),
    id = doc.partitions[0].id;
  doc.structure!.wallFaces[id] = { left: "pale", right: "dark" };
  const before = structuredClone(doc);
  const shorter = movePartitionEndpoint(doc, id, "a", [32, 64]);
  expect(shorter.partitions[0]).toEqual({ ...doc.partitions[0], a: [32, 64] });
  expect(shorter.openings).toEqual(doc.openings);
  if (shorter.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error();
  expect(shorter.structure.boundaryTreatments).toMatchObject([
    { a: [32, 64], b: [76, 64], reservationSide: "center" },
    { a: [116, 64], b: [192, 64] },
  ]);
  expect(shorter.structure.wallFaces).toEqual(doc.structure!.wallFaces);
  const shorterBoth = movePartitionEndpoint(shorter, id, "b", [160, 64]);
  expect(shorterBoth.partitions[0]).toMatchObject({
    a: [32, 64],
    b: [160, 64],
  });
  const restored = movePartitionEndpoint(shorterBoth, id, "b", [192, 64]);
  expect(restored).toEqual(shorter);
  expect(compileLayout(restored).valid).toBe(true);
  const history = push({ past: [], present: doc, future: [] }, shorter);
  const checkpoint = readCheckpoint(
    JSON.stringify({
      schema: "sidereal.layout-recovery.v1",
      sequence: 1,
      writer: "review",
      view: { ...DEFAULT_VIEW, deckId: doc.playableDeckId },
      history,
    }),
  );
  expect(undo(checkpoint.history).present).toEqual(doc);
  expect(redo(undo(checkpoint.history)).present).toEqual(shorter);
  expect(doc).toEqual(before);
});
it("rejects detached doors, insufficient jamb clearance, unsupported slopes, outside floor and zero-length edits without touching the draft", () => {
  const doc = fixture();
  doc.openings[0].setback = 16;
  const id = doc.partitions[0].id,
    before = structuredClone(doc);
  expect(() => movePartitionEndpoint(doc, id, "a", [96, 64])).toThrow(
    /detach a door/,
  );
  expect(() => movePartitionEndpoint(doc, id, "a", [64, 64])).toThrow();
  expect(() => movePartitionEndpoint(doc, id, "a", [0, 32])).toThrow(
    /supported/,
  );
  expect(() => movePartitionEndpoint(doc, id, "a", [-32, 64])).toThrow(
    /supported/,
  );
  expect(() => movePartitionEndpoint(doc, id, "a", [192, 64])).toThrow(
    /non-zero/,
  );
  expect(() => movePartitionEndpoint(doc, id, "a", [1, 64])).toThrow(
    /supported/,
  );
  expect(doc).toEqual(before);
});
it("preserves reversed treatment direction and prevents silent native resizing or crossing a finish seam", () => {
  const doc = fixture(),
    id = doc.partitions[0].id;
  if (doc.structure?.schema !== "sidereal.layout-structure.v2") throw Error();
  const treatment = doc.structure.boundaryTreatments[0];
  [treatment.a, treatment.b] = [treatment.b, treatment.a];
  const shorter = movePartitionEndpoint(doc, id, "a", [32, 64]);
  if (shorter.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error();
  expect(shorter.structure.boundaryTreatments[0]).toMatchObject({
    a: [76, 64],
    b: [32, 64],
  });
  treatment.native = {
    id: "fixed-art",
    revision: "r001",
    sha256: "0".repeat(64),
  };
  expect(() => movePartitionEndpoint(doc, id, "a", [32, 64])).toThrow(
    /pinned native/,
  );
  delete treatment.native;
  doc.openings = [];
  expect(() => movePartitionEndpoint(doc, id, "a", [80, 64])).toThrow(
    /treatment/,
  );
});
