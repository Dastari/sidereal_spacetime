import { expect, test } from "vitest";
import source from "./wayfarer-rebuild-r002.json";
import { WAYFARER_V1_NOZZLES } from "./wayfarer-nozzles";
import { wayfarerFlightInput } from "./wayfarer-flight-definition";
import { WAYFARER_PHYSICAL_CATALOG } from "./physical-definitions";
import { compileFlightDefinition } from "@sidereal/sim/flight-definition";
import type { ConstructionDocument } from "./construction";

test("retained visual nozzle references equal compiled v1 placed-part mounts", () => {
  const fittings = source.layout.assembly.parts.flatMap((p) => {
    const d = WAYFARER_PHYSICAL_CATALOG.definitions.find(
      (d) => d.id === "physical:" + p.assetId,
    );
    return d && "fittingDefinitionId" in d
      ? [
          {
            id: p.id,
            placedObjectId: p.id,
            definitionId: d.fittingDefinitionId,
            definitionRevision: d.revision,
            installed: true,
            powered: true,
            availability: 1,
          },
        ]
      : [];
  });
  const compiled = compileFlightDefinition(
    wayfarerFlightInput(
      source as unknown as ConstructionDocument,
      { variant: "r002" },
      { fittings },
    ),
  );
  expect(compiled.status).toBe("ready");
  if (compiled.status !== "ready") throw Error(compiled.reason);
  expect(WAYFARER_V1_NOZZLES).toHaveLength(9);
  expect(
    WAYFARER_V1_NOZZLES.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      height: n.height,
    })),
  ).toEqual(
    compiled.actuators
      .map((a) => ({ id: a.id, x: a.nozzleX, y: a.nozzleY, height: a.height }))
      .sort(
        (a, b) =>
          WAYFARER_V1_NOZZLES.findIndex((n) => n.id === a.id) -
          WAYFARER_V1_NOZZLES.findIndex((n) => n.id === b.id),
      ),
  );
});
