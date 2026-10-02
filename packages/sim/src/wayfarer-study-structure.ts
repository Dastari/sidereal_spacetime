/** Private study voxel pipeline. Synthetic removal never writes gameplay state. */
import { readWayfarerStudySamples } from "@sidereal/content/wayfarer-study-kit";
import type { ShipVisualLayer } from "@sidereal/content/ship-visual";
import {
  sampleShipVisualLayers,
  removeShipVisualCells,
} from "./ship-visual-sampler";

export function compileWayfarerStudyStructure(
  value: unknown,
  removed?: ReadonlySet<string>,
) {
  const source = readWayfarerStudySamples(value);
  const layers: ShipVisualLayer[] = source.runs.map(
    ([x0, y, z, x1, owner], index) => {
      const duty = source.duties[owner];
      return {
        id: `${duty.id}:run:${index}`,
        role: duty.role,
        slot: duty.slot,
        bounds: [x0, y, z, x1, y + 1, z + 1],
        support: duty.id,
      };
    },
  );
  const intact = sampleShipVisualLayers(layers);
  if (intact.size !== source.summary.cells)
    throw Error("Study union changed in normal sampler");
  const cells = removed?.size ? removeShipVisualCells(intact, removed) : intact;
  const sourceMaterialByFamily = new Map(
    source.duties.map((d) => [d.id, d.sourceMaterial]),
  );
  return {
    layers,
    intact,
    cells,
    palette: source.palette,
    sourceMaterialByFamily,
    source,
  };
}
