import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { WAYFARER_CONVERSION_PIN as PIN } from "@sidereal/content/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "@sidereal/sim/wayfarer-conversion-candidate";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import { qualifiedWayfarerWalkingBindings } from "@sidereal/sim/wayfarer-walking-bindings";
import { createConstructionStandingSupport } from "./construction-standing-support";

function fixture() {
  const c = createWayfarerConversionCandidate(
    Object.fromEntries(
      Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
    ) as WayfarerPinnedInputs,
  );
  let id = 0;
  const plan = planConstructionInstance(
    c.snapshot,
    {
      blueprintRevisionId: "support-test",
      expectedBlueprintSha256: c.snapshot.sha256,
      sourceDeckId: PIN.deckId,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: qualifiedWayfarerWalkingBindings(
        c.snapshot,
        0.3,
        1.8,
      ),
    },
    () => `00000000-0000-4000-8000-${(++id).toString(16).padStart(12, "0")}`,
  );
  return {
    actor: { id: "actor", shipId: plan.instanceId, localX: 0, localY: 8.99 },
    location: {
      characterId: "actor",
      instanceId: plan.instanceId,
      deckId: plan.spawn.deckId,
    },
    deck: { id: plan.spawn.deckId, instanceId: plan.instanceId, elevation: 0 },
    instance: {
      id: plan.instanceId,
      blueprintSha256: plan.blueprintSha256,
      documentJson: JSON.stringify(plan.document),
      idMapJson: JSON.stringify(plan.mappings),
    },
  };
}

test("accepted marker support reconstructs after reconnect without mutating saved state", () => {
  const scope = fixture(),
    before = JSON.stringify(scope);
  const height = createConstructionStandingSupport();
  expect(height(scope)).toBeCloseTo(0.2375);
  for (let i = 0; i < 20; i++) expect(height(scope)).toBeCloseTo(0.2375);
  expect(createConstructionStandingSupport()(JSON.parse(before))).toBeCloseTo(
    0.2375,
  );
  expect(JSON.stringify(scope)).toBe(before);
  scope.actor.localY = 8.8;
  expect(height(scope)).toBeCloseTo(0.21875);
  scope.actor.localY = 9.1;
  expect(height(scope)).toBe(0.1875);
});

test("a warm proof cache cannot authorize changed native transforms or a missing UUID map", () => {
  const scope = fixture(),
    height = createConstructionStandingSupport();
  height(scope);
  const document = JSON.parse(scope.instance.documentJson);
  document.layout.assembly.parts[0].position[0] += 0.1;
  expect(() =>
    height({
      ...scope,
      instance: { ...scope.instance, documentJson: JSON.stringify(document) },
    }),
  ).toThrow();
  expect(() =>
    height({ ...scope, instance: { ...scope.instance, idMapJson: "{}" } }),
  ).toThrow();
  expect(height(scope)).toBeCloseTo(0.2375);
});

test("own support rejects cross-actor, cross-instance, cross-deck and invalid datums", () => {
  const scope = fixture(),
    height = createConstructionStandingSupport();
  expect(() =>
    height({ ...scope, actor: { ...scope.actor, id: "other" } }),
  ).toThrow("matching");
  expect(() =>
    height({ ...scope, actor: { ...scope.actor, shipId: "other" } }),
  ).toThrow("matching");
  expect(() =>
    height({ ...scope, location: { ...scope.location, deckId: "other" } }),
  ).toThrow("matching");
  expect(() =>
    height({ ...scope, deck: { ...scope.deck, instanceId: "other" } }),
  ).toThrow("matching");
  expect(() =>
    height({ ...scope, deck: { ...scope.deck, elevation: 1 } }),
  ).toThrow("datum");
  expect(() =>
    height({ ...scope, actor: { ...scope.actor, localX: NaN } }),
  ).toThrow("matching");
});

test("generic deck support uses the accepted deck datum in meters", () => {
  const scope = fixture();
  scope.instance.blueprintSha256 = "another-qualified-layout";
  scope.deck.elevation = 3.1875;
  expect(createConstructionStandingSupport()(scope)).toBe(3.375);
});
