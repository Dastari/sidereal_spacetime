import source from "./wayfarer-rebuild-r002.json";
import { WAYFARER_ACTUATOR_DEFINITIONS } from "./physical-definitions";
import { transformFlightVector } from "@sidereal/sim/flight-definition";

/** Historical shell authoring references only. Live rendering reads the ship's
 * compiled projection; these mounts keep the retained generator on the same v1
 * placed-part transforms and versioned definitions, without stock flight inputs. */
export const WAYFARER_V1_NOZZLES = Object.freeze(
  source.layout.assembly.parts.flatMap((part) => {
    const definition = WAYFARER_ACTUATOR_DEFINITIONS.find(
      (d) => d.id === "physical:" + part.assetId && d.revision === 1,
    );
    if (!definition) return [];
    const offset = transformFlightVector(
      definition.nozzleOffset,
      part.rotation,
      part.flipped,
    );
    return [
      Object.freeze({
        id: part.id,
        definitionId: definition.fittingDefinitionId,
        x: part.position[0] + offset[0],
        y: part.position[1] + offset[1],
        height: part.position[2] + definition.nozzleHeight,
      }),
    ];
  }),
);
