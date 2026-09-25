import { expect, it } from "vitest";
import { LAB_FLIGHT_ACTUATORS } from "@sidereal/content/flight";
import {
  supportsAuthoredFlightPresentation,
  QUALIFIED_FLIGHT_PREVIEW_SHA256,
  authoredFlightPresentation,
  authoredExhaustTelemetry,
  type AuthoredFlightStatus,
} from "./construction-flight-presentation";
const actor = { id: "actor", shipId: "instance" };
const visit = {
  characterId: "actor",
  instanceId: "instance",
  deckId: "deck",
  visitId: "visit",
  revision: 2n,
};
const admission = { characterId: "actor", shipId: "instance", revision: 3n };
const ship = { id: "instance", x: 100, y: -200, heading: 0.7, vx: 4, vy: 5 };
const status: AuthoredFlightStatus = {
  shipId: "instance",
  stationId: "station",
  stationRevision: 1n,
  deckId: "deck",
  lifecycle: "active",
  revision: 1n,
  active: true,
  flightAdmitted: true,
  visitId: "visit",
  visitRevision: 2n,
  admissionRevision: 3n,
  seatState: "none",
  seatRevision: 0n,
};
it("uses accepted world motion only for the exact active flight admission", () => {
  const result = authoredFlightPresentation(
    actor,
    visit,
    true,
    [admission],
    [status],
    ship,
  );
  expect(result.admitted).toBe(true);
  expect(result.motion).toEqual({
    x: 100,
    y: -200,
    heading: 0.7,
    vx: 4,
    vy: 5,
  });
  for (const patch of [
    { flightAdmitted: false },
    { active: false },
    { lifecycle: "installed-dormant" },
    { visitId: "old" },
    { visitRevision: 1n },
    { admissionRevision: 2n },
    { deckId: "other" },
  ]) {
    const result = authoredFlightPresentation(
      actor,
      visit,
      true,
      [admission],
      [{ ...status, ...patch }],
      ship,
    );
    expect(result.admitted).toBe(false);
    expect(result.motion).toEqual({ x: 0, y: 0, heading: 0, vx: 0, vy: 0 });
  }
  expect(
    authoredFlightPresentation(actor, visit, false, [admission], [status], ship)
      .admitted,
  ).toBe(false);
  expect(
    authoredFlightPresentation(
      actor,
      visit,
      true,
      [{ ...admission, shipId: "original" }],
      [status],
      ship,
    ).admitted,
  ).toBe(false);
  expect(
    authoredFlightPresentation(actor, visit, true, [admission], [status], {
      ...ship,
      x: NaN,
    }).admitted,
  ).toBe(false);
});
it("maps fresh owned actuator telemetry to known visual mount names without mutating identity", () => {
  const fittings = LAB_FLIGHT_ACTUATORS.map((d, i) => ({
    id: `uuid-${i}`,
    placedObjectId: `placement-${i}`,
    shipId: "instance",
    sourceDeviceId: d.id,
    kind: "actuator",
  }));
  const outputs = [
    { shipId: "instance", actuatorId: "uuid-0", throttle: 0.5 },
    { shipId: "foreign", actuatorId: "uuid-1", throttle: 1 },
  ];
  expect(authoredExhaustTelemetry("instance", fittings, outputs)).toEqual([
    { actuatorId: LAB_FLIGHT_ACTUATORS[0].id, throttle: 0.5 },
  ]);
  expect(outputs[0].actuatorId).toBe("uuid-0");
  expect(
    authoredExhaustTelemetry("instance", fittings.slice(1), outputs),
  ).toEqual([]);
  expect(
    authoredExhaustTelemetry(
      "instance",
      [...fittings.slice(1), fittings[1]],
      outputs,
    ),
  ).toEqual([]);
  expect(
    authoredExhaustTelemetry(
      "instance",
      fittings.map((f, i) => (i ? f : { ...f, sourceDeviceId: "unknown" })),
      outputs,
    ),
  ).toEqual([]);
  expect(
    authoredExhaustTelemetry("instance", fittings, [
      { ...outputs[0], throttle: NaN },
    ]),
  ).toEqual([]);
  expect(
    authoredExhaustTelemetry("instance", fittings, [outputs[0], outputs[0]]),
  ).toEqual([]);
});

it("admits flight presentation for both exact Wayfarers and rejects unknown sources", () => {
  expect(
    supportsAuthoredFlightPresentation(QUALIFIED_FLIGHT_PREVIEW_SHA256),
  ).toBe(true);
  expect(
    supportsAuthoredFlightPresentation(
      "56e485c9a9d49b5aa0c5e44a47f88916296896717df386b7240baf408e28ae44",
    ),
  ).toBe(true);
  expect(supportsAuthoredFlightPresentation("edited-source")).toBe(false);
  expect(supportsAuthoredFlightPresentation(undefined)).toBe(false);
});
