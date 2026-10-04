import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  readWayfarerAuthoredFlight,
  WAYFARER_AUTHORED_FLIGHT_PINS,
} from "./wayfarer-authored-flight";

const base = new URL(
  "../../../assets/runtime/ship-study/wayfarer-dorsal-r001/",
  import.meta.url,
);
const raw = readFileSync(new URL("descriptor.json", base));
const descriptor = JSON.parse(raw.toString());
const flight = readWayfarerAuthoredFlight(descriptor);

describe("pinned Wayfarer dorsal exterior", () => {
  it("binds every actual complete source GLB and placed triangle without admitting the interior", () => {
    expect(createHash("sha256").update(raw).digest("hex")).toBe(
      WAYFARER_AUTHORED_FLIGHT_PINS.descriptorSha256,
    );
    for (const piece of flight.pieces) {
      const data = readFileSync(new URL(piece.file, base));
      expect(createHash("sha256").update(data).digest("hex")).toBe(
        piece.sha256,
      );
      expect(data.readUInt32LE(0)).toBe(0x46546c67);
      expect(data.readUInt32LE(8)).toBe(data.length);
      const gltf = JSON.parse(
        data.subarray(20, 20 + data.readUInt32LE(12)).toString(),
      );
      const triangles = gltf.meshes
        .flatMap((m: { primitives: { indices: number }[] }) => m.primitives)
        .reduce(
          (sum: number, p: { indices: number }) =>
            sum + gltf.accessors[p.indices].count / 3,
          0,
        );
      expect(triangles).toBe(piece.triangles);
    }
    expect(
      flight.instances.some((row) =>
        /^(floor|partition|room-content|wall-dressing|door-light|header-light)$/.test(
          row.role,
        ),
      ),
    ).toBe(false);
    expect(
      flight.instances.filter((row) => row.role === "engine-pod"),
    ).toHaveLength(3);
    expect(
      flight.instances.filter((row) => row.role === "roof-skin"),
    ).toHaveLength(271);
  });
  it("retains reusable placements and applies unique GLB node transforms exactly once", () => {
    for (const row of flight.instances) {
      expect(row.matrix).toEqual(
        row.frame === "ship-node-baked"
          ? [
              [1, 0, 0, 0],
              [0, 1, 0, 0],
              [0, 0, 1, 0],
              [0, 0, 0, 1],
            ]
          : row.originalMatrix,
      );
    }
    const raised = flight.instances.filter((row) => row.role === "roof-module");
    expect(raised.some((row) => row.matrix[2][3] >= 2.5)).toBe(true);
    expect(flight.instances.some((row) => row.mirrored)).toBe(true);
  });
  it.each([
    (d: typeof descriptor) => d.instances.pop(),
    (d: typeof descriptor) => (d.instances[0].role = "room-content"),
    (d: typeof descriptor) => (d.instances[0].matrix[0][0] = NaN),
    (d: typeof descriptor) => (d.pieces[0].file = "glb/../escape.glb"),
    (d: typeof descriptor) => (d.pieces[0].sha256 = "changed"),
    (d: typeof descriptor) => (d.instances[0].object = d.instances[1].object),
    (d: typeof descriptor) =>
      (d.instances.find(
        (row: { frame: string }) => row.frame === "ship-node-baked",
      ).matrix[0][3] = 1),
  ])(
    "refuses incomplete, private, ambiguous or invalid placement admission",
    (change) => {
      const altered = structuredClone(descriptor);
      change(altered);
      expect(() => readWayfarerAuthoredFlight(altered)).toThrow(
        /Invalid authored flight exterior/,
      );
    },
  );
});
