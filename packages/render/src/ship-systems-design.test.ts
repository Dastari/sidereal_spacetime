import { expect, test } from "vitest";
import { HULL_ACCESS_SOURCE } from "@sidereal/content/hull-access-profile";
import { buildSystemsDesign } from "@sidereal/sim/ship-systems-design";
import {
  componentVertexToRender,
  componentAccessPlacement,
  componentIndicesToRender,
} from "./ship-systems-design";
test("model vertices and port overlays use the same saved yaw/socket and ship-to-render frame", () => {
  const m = buildSystemsDesign(HULL_ACCESS_SOURCE, "ship-components-v1@4");
  for (const c of m.components)
    for (const port of c.ports) {
      const p = c.definition.ports.find((p) => p.id === port.id)!;
      const vertex = componentVertexToRender(c, [
        p.position[0],
        p.position[2],
        -p.position[1],
      ]);
      expect(vertex).toEqual([
        port.position[0],
        port.position[2],
        -port.position[1],
      ]);
      const n = componentVertexToRender(
        c,
        [p.normal[0], p.normal[2], -p.normal[1]],
        true,
      );
      expect(n).toEqual([port.normal[0], port.normal[2], -port.normal[1]]);
    }
});
test("reflected equipment keeps outward triangle winding aligned with its transformed normals", () => {
  const base = buildSystemsDesign(HULL_ACCESS_SOURCE, "ship-components-v1@4")
    .components[0];
  const c = { ...base, placement: { ...base.placement, reflected: true } };
  const triangle = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ];
  const original = new Uint32Array([0, 1, 2]);
  const indices = componentIndicesToRender(c, original);
  const [a, b, d] = [...indices].map((i) =>
    componentVertexToRender(c, triangle[i]),
  );
  const u = b.map((v, i) => v - a[i]),
    v = d.map((n, i) => n - a[i]);
  const cross = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const normal = componentVertexToRender(c, [0, 0, 1], true);
  expect(
    cross.reduce((sum, value, i) => sum + value * normal[i], 0),
  ).toBeCloseTo(1);
  expect([...original]).toEqual([0, 1, 2]);
  expect(componentIndicesToRender(base, original)).toBe(original);
});
test("current native hatches keep saved centers, outward facing and the deck datum once", () => {
  const m = buildSystemsDesign(HULL_ACCESS_SOURCE, "ship-components-v1@4");
  const doors = m.components.filter((c) => c.id.endsWith("-outer"));
  expect(doors.map(componentAccessPlacement)).toEqual([
    {
      id: "mount:cargo-outer",
      variant: "cargo.4m",
      center: [-6.5, -7],
      normal: [-1, 0],
      floorM: 0.1875,
    },
    {
      id: "mount:personnel-outer",
      variant: "personnel",
      center: [-6.5, 3],
      normal: [-1, 0],
      floorM: 0.1875,
    },
  ]);
});
