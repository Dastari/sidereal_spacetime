import { mkdirSync, writeFileSync } from "node:fs";

type PartMesh = {
  name: string;
  vertices: number[][];
  faces: number[][];
  materials: number[];
};
/** Small vector projections of the actual part geometry, not generic category icons. */
export function writeAssemblyThumbnails(meshes: PartMesh[], palette: string[]) {
  const groups = new Map<string, PartMesh[]>();
  for (const mesh of meshes) {
    const id = mesh.name.split("--")[0];
    groups.set(id, [...(groups.get(id) ?? []), mesh]);
  }
  mkdirSync("assets/runtime/assembly/thumbnails", { recursive: true });
  for (const [id, parts] of groups) {
    const polygons: { points: number[][]; color: string; depth: number }[] = [];
    for (const mesh of parts)
      for (let i = 0; i < mesh.faces.length; i++) {
        const points = mesh.faces[i].map((v) => mesh.vertices[v]);
        const a = points[1].map((n, j) => n - points[0][j]);
        const b = points[2].map((n, j) => n - points[0][j]);
        const normal = [
          a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0],
        ];
        if (normal[0] * 0.6 - normal[1] * 0.8 + normal[2] * 0.7 <= 0) continue;
        const shade = normal[2] > 0 ? 1 : normal[0] > 0 ? 0.82 : 0.67;
        const source = palette[mesh.materials[i]];
        const color =
          "#" +
          [1, 3, 5]
            .map((j) =>
              Math.round(parseInt(source.slice(j, j + 2), 16) * shade)
                .toString(16)
                .padStart(2, "0"),
            )
            .join("");
        polygons.push({
          points: points.map(([x, y, z]) => [
            0.8 * x + 0.6 * y,
            0.577 * (0.6 * x - 0.8 * y) - 0.816 * z,
          ]),
          color,
          depth:
            points.reduce(
              (n, [x, y, z]) => n + 0.6 * x - 0.8 * y + 0.7 * z,
              0,
            ) / points.length,
        });
      }
    const all = polygons.flatMap((p) => p.points),
      xs = all.map((p) => p[0]),
      ys = all.map((p) => p[1]);
    const minX = Math.min(...xs),
      minY = Math.min(...ys),
      width = Math.max(...xs) - minX,
      height = Math.max(...ys) - minY;
    const scale = 56 / Math.max(width, height, 0.01),
      xOffset = (64 - width * scale) / 2,
      yOffset = (64 - height * scale) / 2;
    const body = polygons
      .sort((a, b) => a.depth - b.depth)
      .map(
        (p) =>
          `<polygon fill="${p.color}" points="${p.points.map(([x, y]) => `${((x - minX) * scale + xOffset).toFixed(2)},${((y - minY) * scale + yOffset).toFixed(2)}`).join(" ")}"/>`,
      )
      .join("");
    writeFileSync(
      `assets/runtime/assembly/thumbnails/${id}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`,
    );
  }
}
