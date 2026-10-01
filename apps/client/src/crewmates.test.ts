import { describe, expect, it } from "vitest";
import {
  crewmatesFromViews,
  operatorRowsFromView,
  type CrewPresentationRow,
  type InteriorCrewRow,
} from "./crewmates";

const body = (id: string, over: Partial<InteriorCrewRow> = {}) => ({
  characterId: id,
  name: id.toUpperCase(),
  shipId: "ship",
  deckId: "deck",
  localX: 1,
  localY: 2,
  standingElevationM: 0.1875,
  connected: true,
  sprinting: false,
  ...over,
});
const look = (
  id: string,
  over: Partial<CrewPresentationRow> = {},
): CrewPresentationRow => ({
  characterId: id,
  shipId: "ship",
  deckId: "deck",
  appearanceJson: '{"bodyType":"female","hairStyle":"swept"}',
  equipmentJson: '{"hand":"carbine","helmet":"crew-medic-helmet"}',
  dead: false,
  seated: false,
  aimActive: false,
  aimAngle: 0,
  shotSequence: 0n,
  shotX: 0,
  shotY: 0,
  shotStruck: false,
  ...over,
});

describe("crewmates from the two server views", () => {
  it("keeps candidate coherent rows separate without inventing an epoch for older/default rows", () => {
    expect(operatorRowsFromView([body("mate")])).toEqual([]);
    const row = body("mate", {
      visitId: "accepted-visit",
      locationRevision: "9007199254740993",
      dead: false,
      operatorPoseState: "recovering",
    });
    expect(operatorRowsFromView([row])).toEqual([
      {
        characterId: "mate",
        shipId: "ship",
        deckId: "deck",
        visitId: "accepted-visit",
        locationRevision: "9007199254740993",
        localX: 1,
        localY: 2,
        standingElevationM: 0.1875,
        connected: true,
        dead: false,
        operatorPoseState: "recovering",
        operatorSnapshot: undefined,
      },
    ]);
    expect(crewmatesFromViews([row], [look("mate")], "self")).toEqual(
      crewmatesFromViews([body("mate")], [look("mate")], "self"),
    );
  });
  it("unregistered coherent fields leave all legacy render/controller inputs identical", () => {
    const presentations = [
      look("mate", {
        seated: true,
        dead: false,
        aimActive: true,
        shotSequence: 7n,
      }),
    ];
    const legacy = crewmatesFromViews([body("mate")], presentations, "self");
    const additive = crewmatesFromViews(
      [
        body("mate", {
          dead: true,
          operatorPoseState: "recovering",
          operatorSnapshot: undefined,
          visitId: "new-current-visit",
          locationRevision: "9007199254740993",
        }),
      ],
      presentations,
      "self",
    );
    expect(additive).toEqual(legacy);
    expect(additive[0].seated).toBe(true);
    expect(additive[0].dead).toBe(false);
    expect(additive[0].aimActive).toBe(true);
    expect(additive[0].heldItem).toBe("compact-carbine");
  });
  it("draws other bodies only, and only where both views agree on ship and deck", () => {
    const out = crewmatesFromViews(
      [body("self"), body("mate"), body("moving-deck"), body("no-look")],
      [look("self"), look("mate"), look("moving-deck", { deckId: "other" })],
      "self",
    );
    expect(out.map((c) => c.id)).toEqual(["mate"]);
    expect(out[0]).toMatchObject({
      name: "MATE",
      localX: 1,
      localY: 2,
      elevation: 0.1875,
      // the legacy carbine shows its r001 art (inventory crewItemId, the only mapping)
      heldItem: "compact-carbine",
      shot: undefined,
    });
  });

  it("maps worn catalogue ids to the same look as the local character", () => {
    const [mate] = crewmatesFromViews([body("mate")], [look("mate")], "self");
    expect(mate.appearance).toMatchObject({
      bodyType: "female",
      hairStyle: "swept",
      weapon: "rifle",
      equippedComponents: { helmet: expect.any(String) },
    });
  });

  it("survives malformed documents with a default look and empty hands", () => {
    const [mate] = crewmatesFromViews(
      [body("mate")],
      [look("mate", { appearanceJson: "{", equipmentJson: '["hand"]' })],
      undefined,
    );
    expect(mate.heldItem).toBeNull();
    expect(mate.appearance.weapon).toBe("none");
  });

  it("carries pose and the latest shot end point", () => {
    const [mate] = crewmatesFromViews(
      [body("mate", { sprinting: true })],
      [
        look("mate", {
          aimActive: true,
          aimAngle: 0.4,
          shotSequence: 3n,
          shotX: 4,
          shotY: -2,
          shotStruck: true,
          dead: true,
        }),
      ],
      "self",
    );
    expect(mate).toMatchObject({
      sprinting: true,
      aimActive: true,
      aimAngle: 0.4,
      dead: true,
      shotSequence: 3n,
      shot: { x: 4, y: -2, struck: true },
    });
  });
});
