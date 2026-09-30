import { expect, it } from "vitest";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { sampleShipVisualLayers } from "@sidereal/sim/ship-visual-compiler";
import { sampledCornerLight } from "./sampled-ao";
import { meshSampledStructure } from "./sampled-structure";
import { appendTransformed, type MergeGroup } from "./batch";
import { resolveCoplanarLayers } from "./coplanar";

it("darkens real concave occupancy while retaining exposed and removed corners", () => {
  const cells = sampleShipVisualLayers([
    { id: "floor", role: "floor", slot: "primary", bounds: [0, 0, 0, 3, 3, 1] },
  ]);
  const light = () => sampledCornerLight(cells, [1, 1, 0], 2, 1, 0, 0);
  expect(light()).toBe(1);
  const wall = sampleShipVisualLayers([
    { id: "wall", role: "core", slot: "secondary", bounds: [0, 0, 1, 1, 2, 2] },
  ]);
  for (const [k, c] of wall) cells.set(k, c);
  expect(light()).toBeCloseTo(0.8);
  const corner = sampleShipVisualLayers([
    {
      id: "corner",
      role: "core",
      slot: "secondary",
      bounds: [1, 0, 1, 2, 1, 2],
    },
  ]);
  for (const [k, c] of corner) cells.set(k, c);
  expect(light()).toBeCloseTo(0.7);
  for (const k of [...wall.keys(), ...corner.keys()]) cells.delete(k);
  expect(light()).toBe(1);
});

it("keeps layer roles and ownership separate, default buffers absent and occupancy immutable", () => {
  const cells = sampleShipVisualLayers([
    {
      id: "deck",
      role: "plate",
      slot: "primary",
      surfaceRole: "floor",
      bounds: [0, 0, 0, 2, 2, 1],
    },
    {
      id: "hull",
      role: "plate",
      slot: "primary",
      surfaceRole: "hull",
      bounds: [2, 0, 0, 3, 2, 1],
    },
    {
      id: "corner",
      role: "core",
      slot: "secondary",
      bounds: [0, 0, 1, 1, 2, 2],
    },
  ]);
  const before = JSON.stringify([...cells]);
  const plain = meshSampledStructure(cells);
  expect(plain).toEqual(
    meshSampledStructure(cells, { ambientOcclusion: false }),
  );
  expect(plain.every((g) => g.colors === undefined)).toBe(true);
  expect(
    plain
      .filter((g) => g.role === "plate")
      .map((g) => g.surfaceRole)
      .sort(),
  ).toEqual(["floor", "hull"]);
  const shaded = meshSampledStructure(cells, { ambientOcclusion: true });
  expect(shaded.some((g) => g.colors!.some((c) => c < 1))).toBe(true);
  for (const g of shaded) {
    expect(g.colors!.length).toBe((g.positions.length / 3) * 4);
    for (let i = 0; i < g.colors!.length; i++)
      expect(g.colors![i]).toBeGreaterThanOrEqual(0.699);
  }
  expect(JSON.stringify([...cells])).toBe(before);
});

it("transports AO through mixed batches and coplanar vertex duplication without recolouring plain inputs", () => {
  const p = [0, 0, 0, 1, 0, 0, 0, 1, 0],
    n = [0, 0, 1, 0, 0, 1, 0, 0, 1],
    ix = [0, 1, 2];
  const group: MergeGroup = {
    key: "mixed",
    positions: [],
    normals: [],
    indices: [],
  };
  appendTransformed(group, p, n, ix, Matrix.Identity().asArray());
  expect(group.colors).toBeUndefined();
  const colors = [0.7, 0.7, 0.7, 1, 0.8, 0.8, 0.8, 1, 1, 1, 1, 1];
  appendTransformed(group, p, n, ix, Matrix.Translation(2, 0, 0).asArray(), {
    colors,
  });
  expect(group.colors!.slice(0, 12)).toEqual(Array(12).fill(1));
  expect(group.colors!.slice(12)).toEqual(colors);
  appendTransformed(group, p, n, ix, Matrix.Translation(4, 0, 0).asArray());
  expect(group.colors!.slice(24)).toEqual(Array(12).fill(1));
  const low = {
    positions: [...p],
    normals: [...n],
    colors: [...colors],
    indices: [...ix],
    first: 0,
    count: 3,
    priority: 1,
    material: "low",
  };
  const high = {
    positions: [...p],
    normals: [...n],
    colors: [...colors],
    indices: [...ix],
    first: 0,
    count: 3,
    priority: 2,
    material: "high",
  };
  expect(resolveCoplanarLayers([low, high])).toBe(1);
  const moved = low.positions.length > p.length ? low : high;
  expect(moved.positions.length).toBe(p.length * 2);
  expect(moved.colors.length).toBe((moved.positions.length / 3) * 4);
  for (let i = 0; i < 3; i++)
    expect(
      moved.colors.slice(moved.indices[i] * 4, moved.indices[i] * 4 + 4),
    ).toEqual(colors.slice(i * 4, i * 4 + 4));
});

it("uses the brighter diagonal at an asymmetric cavity and retains winding on both signed faces", () => {
  for (const side of [-1, 1]) {
    const cells = sampleShipVisualLayers([
      {
        id: "plate",
        role: "floor",
        slot: "primary",
        bounds: [1, 1, 0, 2, 2, 1],
      },
      {
        id: "occluder",
        role: "core",
        slot: "secondary",
        bounds: [0, 0, side > 0 ? 1 : -1, 1, 1, side > 0 ? 2 : 0],
      },
    ]);
    const g = meshSampledStructure(cells, { ambientOcclusion: true }).find(
      (g) => g.slot === "primary",
    )!;
    const triangles: number[][] = [];
    for (let t = 0; t < g.indices.length; t += 3) {
      const tri = Array.from(g.indices.slice(t, t + 3));
      if (tri.every((i) => g.normals[i * 3 + 2] === side)) triangles.push(tri);
    }
    expect(triangles.length).toBe(2);
    const shared = triangles[0].filter((i) => triangles[1].includes(i));
    expect(shared.length).toBe(2);
    for (const i of shared) expect(g.colors![i * 4]).toBe(1);
    for (const tri of triangles) {
      const [a, b, c] = tri.map((i) =>
        Array.from(g.positions.slice(i * 3, i * 3 + 3)),
      );
      const crossZ =
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      expect(crossZ * side).toBeGreaterThan(0);
    }
  }
});

it("merges a long straight contact strip along its invariant axis without smearing its cavity gradient", () => {
  const cells = sampleShipVisualLayers([
    {
      id: "floor",
      role: "floor",
      slot: "primary",
      bounds: [0, 0, 0, 64, 8, 1],
    },
    {
      id: "wall",
      role: "core",
      slot: "secondary",
      bounds: [0, 0, 1, 64, 1, 4],
    },
  ]);
  const meshes = meshSampledStructure(cells, { ambientOcclusion: true });
  expect(meshes.reduce((n, g) => n + g.triangles, 0)).toBeLessThan(100);
  const g = meshes.find((g) => g.slot === "primary")!;
  let found = false;
  for (let i = 0; i < g.positions.length / 3; i += 4) {
    const x0 = g.positions[i * 3],
      x1 = g.positions[(i + 1) * 3];
    if (g.normals[i * 3 + 2] !== 1 || x1 - x0 < 3) continue;
    const brightness = [0, 1, 2, 3].map((c) => g.colors![(i + c) * 4]);
    if (brightness[0] >= brightness[3]) continue;
    expect(brightness[0]).toBe(brightness[1]);
    expect(brightness[2]).toBe(brightness[3]);
    expect(brightness[0]).toBeLessThan(1);
    expect(brightness[3]).toBe(1);
    found = true;
  }
  expect(found).toBe(true);
});
