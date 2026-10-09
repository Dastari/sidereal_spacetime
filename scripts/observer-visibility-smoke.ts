/** Real websocket membership/delivery proof using a reserved smoke-only world fixture.
 * The fixture seeds accepted state; this tests replication, not EVA flight physics. */
import assert from "node:assert/strict";
import { bindSharedWorld } from "../packages/net/src/bind-shared-world";
import { createConnectionResources } from "../packages/net/src/connection-resources";
import type { DbConnection } from "../packages/net/src/generated";

async function wait(test: () => boolean, label: string) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (test()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Error("Timeout: " + label);
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function observerVisibilitySmoke(
  c: any,
  Connection: any,
  host: string,
  database: string,
) {
  assert(
    database.endsWith("-smoke") && new URL(host).port !== "3100",
    "Isolated fixture required",
  );
  const resources = createConnectionResources();
  const failures: string[] = [];
  const binding = bindSharedWorld({
    connection: c as DbConnection,
    resources,
    onError: (message) => failures.push(message),
  });
  let crewApplied = false;
  const crew = c
    .subscriptionBuilder()
    .onApplied(() => {
      crewApplied = true;
    })
    .subscribe([
      "SELECT * FROM current_interior_crew",
      "SELECT * FROM visible_crew_presentation",
    ]);
  let prepared = false;
  let stranger: any;
  try {
    await wait(
      () => crewApplied && binding.store.getSnapshot().admission.length === 1,
      "own membership scopes",
    );
    await c.reducers.exerciseObserverVisibilitySmoke({ phase: "prepare" });
    prepared = true;
    await wait(
      () =>
        c.db.currentInteriorCrew.count() === 301n &&
        c.db.visibleCrewPresentation.count() === 300n,
      "complete 300-body deck despite 300 other-deck bodies",
    );
    const own = [...c.db.ownCharacters.iter()][0];
    // Stable fixture UUIDs are reserved by the smoke-only module, not inferred
    // from a coincidentally matching position or a broadly subscribed row.
    const homeId = "00000000-0000-4000-8000-000000000001";
    const positiveId = "00000000-0000-4000-8000-000000000002";
    const negativeId = "00000000-0000-4000-8000-000000000003";
    const hasContact = (id: string) =>
      binding.store.getSnapshot().shipMotion.some((row) => row.shipId === id);
    await wait(
      () =>
        hasContact(homeId) &&
        !hasContact(positiveId) &&
        !hasContact(negativeId),
      "home-side contacts",
    );
    assert.equal(
      [...c.db.currentInteriorCrew.iter()].filter((row: any) => !row.connected)
        .length,
      300,
    );
    const positions = [...c.db.currentInteriorCrew.iter()]
      .map((row: any) => row.characterId)
      .filter((id: string) => id !== own.id)
      .sort();
    assert.deepEqual(
      [...c.db.visibleCrewPresentation.iter()]
        .map((row: any) => row.characterId)
        .sort(),
      positions,
    );

    let outsiderApplied = false;
    stranger = Connection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((s: any) => {
        s.subscriptionBuilder()
          .onApplied(() => {
            outsiderApplied = true;
          })
          .subscribe([
            "SELECT * FROM own_eva_body",
            "SELECT * FROM current_interior_crew",
            "SELECT * FROM visible_crew_presentation",
          ]);
      })
      .build();
    await wait(() => outsiderApplied, "unadmitted outsider views");
    assert.equal(stranger.db.ownEvaBody.count(), 0n);
    assert.equal(stranger.db.currentInteriorCrew.count(), 0n);
    assert.equal(stranger.db.visibleCrewPresentation.count(), 0n);
    let rejected = false;
    const attack = stranger
      .subscriptionBuilder()
      .onError(() => {
        rejected = true;
      })
      .subscribe("SELECT * FROM eva_body");
    await wait(() => rejected, "private EVA base rejection");
    if (!attack.isEnded()) attack.unsubscribe();

    for (const [phase, contactId, absentId, expectedCellX] of [
      ["positive", positiveId, negativeId, 3n],
      ["negative", negativeId, positiveId, -3n],
    ] as const) {
      await c.reducers.exerciseObserverVisibilitySmoke({ phase });
      await wait(
        () =>
          hasContact(contactId) && !hasContact(homeId) && !hasContact(absentId),
        `${phase} EVA cell delivery`,
      );
      assert.equal(
        BigInt(Math.floor([...c.db.ownEvaBody.iter()][0].x / 400)),
        expectedCellX,
      );
      assert.equal(stranger.db.ownEvaBody.count(), 0n);
      assert(
        binding.subscriptions.getState().cellSets <= 2,
        "bounded pending/retiring cell sets",
      );
      await wait(
        () =>
          c.db.currentInteriorCrew.count() === 0n &&
          c.db.visibleCrewPresentation.count() === 0n,
        "EVA removes interior membership",
      );
    }
    await c.reducers.exerciseObserverVisibilitySmoke({ phase: "return" });
    await wait(
      () =>
        hasContact(homeId) &&
        !hasContact(positiveId) &&
        !hasContact(negativeId),
      "return to accepted ship scope",
    );
    await wait(
      () => c.db.currentInteriorCrew.count() === 301n,
      "crew restored on accepted re-entry",
    );
    assert.deepEqual(failures, []);
    return {
      sameDeckBodies: 301,
      otherDeckBodies: 300,
      retainedDisconnectedBodies: 300,
      positiveAndNegativeEvaCells: true,
      return: true,
      outsiderDenied: true,
      privateEvaDenied: true,
    };
  } finally {
    try {
      if (prepared)
        await c.reducers.exerciseObserverVisibilitySmoke({ phase: "cleanup" });
    } finally {
      stranger?.disconnect();
      crew.unsubscribe();
      resources.dispose();
    }
  }
}
