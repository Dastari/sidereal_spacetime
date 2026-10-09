/** Private profile2 rehearsal; only the isolated module's code-owned admission flag changes. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WAYFARER_ACCESS_SOURCE as source } from "../packages/content/src/wayfarer-access-profile";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { prefabWalkRoute } from "../packages/sim/src/prefab-construction";
import { shipLogicModel } from "../packages/sim/src/ship-logic-model";
import {
  acquireNativePilot,
  nextSequence,
  walkNative,
} from "./native-starter-smoke";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { prefabPilotPose } from "../packages/sim/src/construction-pilot";
import { firstInventoryPlacement } from "../packages/sim/src/inventory";
import {
  INVENTORY_DEFINITIONS,
  LIQUID_DENSITY_KG_PER_LITRE,
} from "../packages/content/src/inventory";

/* eslint-disable @typescript-eslint/no-explicit-any */
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function wait(check: () => boolean, label: string, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await pause(25);
  }
  throw Error(`Access qualification timeout: ${label}`);
}

export async function shipAccessSmoke(c: any) {
  const catalog = defaultPrefabComponentCatalog(),
    model = shipLogicModel(source, catalog)!;
  const actor = () => [...c.db.ownCharacters.iter()][0] as any;
  const before = actor().shipId;
  const inventory = () =>
    [...c.db.ownInventoryItems.iter()]
      .map((i: any) => [i.id, i.definitionId, i.containerId, i.equipmentSlot])
      .sort();
  const originalItems = inventory();
  await c.reducers.assignWayfarerAccessSmokeShip({});
  await wait(
    () => actor()?.shipId !== before,
    "trusted candidate installation",
  );
  const shipId = actor().shipId;
  const location = () => [...c.db.ownConstructionLocation.iter()][0] as any;
  await wait(
    () => location()?.instanceId === shipId,
    "accepted candidate location",
  );
  const accepted = {
    instanceId: location().instanceId,
    deckId: location().deckId,
  };
  const device = (id: string) =>
    [...c.db.visibleShipLogic.iter()].find(
      (r: any) => r.shipId === shipId && r.deviceId === id,
    ) as any;
  await wait(
    () => !!device("personnel-controller") && !!device("cargo-controller"),
    "both controller projections",
  );
  assert.deepEqual(
    inventory(),
    originalItems,
    "install preserves carried item UUIDs and state",
  );
  const receipts: any[] = [];
  const flightModel = prefabFlightModel(source, catalog);
  await wait(
    () => c.db.ownAuthoredFlightPhysics.shipId.find(shipId)?.status === "ready",
    "candidate compiled physics",
  );
  const rcsParts = flightModel.parts.filter(
    (p) =>
      flightModel.fittings.some(
        (f) => f.sourceId === p.sourceId && f.role === "actuator",
      ) && p.sourceId.includes("rcs-stern-p"),
  );
  assert.equal(
    rcsParts.length,
    3,
    "same stern-port source mount supplies three real quad nozzles",
  );
  const acceptedRcs = rcsParts.map((part) => {
    const fitting = [...c.db.ownAuthoredFlightFittings.iter()].find(
      (f: any) => f.shipId === shipId && f.sourceDeviceId === part.sourceId,
    ) as any;
    assert(fitting, "accepted same-source-ID RCS fitting");
    const actuator = [...c.db.ownAuthoredFlightActuators.iter()].find(
      (a: any) => a.shipId === shipId && a.id === fitting.id,
    ) as any;
    assert(actuator, "accepted compiled RCS nozzle");
    assert(
      Math.hypot(actuator.x - part.position[0], actuator.y - part.position[1]) <
        1e-6,
      "compiled nozzle uses proposed code-owned mount pose",
    );
    return {
      sourceDeviceId: part.sourceId,
      fittingId: fitting.id,
      placedObjectId: actuator.placedObjectId,
      x: actuator.x,
      y: actuator.y,
      expected: part.position.slice(0, 2),
    };
  });
  receipts.push({
    label: "accepted-rcs-relocation",
    mount: source.mounts.find((m) => m.id === "rcs-stern-p"),
    actuators: acceptedRcs,
  });
  const capture = (label: string) =>
    receipts.push({
      label,
      actor: { x: actor().localX, y: actor().localY },
      states: [...c.db.visibleShipLogic.iter()]
        .filter((r: any) => r.shipId === shipId)
        .map((r: any) => ({
          deviceId: r.deviceId,
          state: r.state,
          open: r.open,
          locked: r.locked,
        })),
    });
  const walk = async (target: readonly [number, number]) => {
    for (const [x, y] of prefabWalkRoute(
      source,
      catalog,
      [actor().localX, actor().localY],
      target,
    ))
      await walkNative(c, x, y);
  };
  const panel = (id: string) => {
    const p = model.panels.find((p) => p.deviceId === id);
    assert(p, id);
    return p;
  };
  const press = (id: string) =>
    c.reducers.pressShipButton({ shipId, deviceId: id });
  const crew = (phase: string, x = 0, y = 0) =>
    c.reducers.exerciseWayfarerAccessSmokeCrew({ phase, x, y });
  const intent = (dx = 0, dy = 0) =>
    c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 0,
      turn: 0,
      dx,
      dy,
      sprint: false,
    });
  const body = () => [...c.db.ownEvaBody.iter()][0] as any;
  const timedOpening = async (name: string) => {
    const controller = `${name}-controller`,
      outer = `${name}-outer-actuator`,
      inner = `${name}-inner-actuator`;
    await wait(
      () =>
        !device(inner)?.open &&
        !device(outer)?.open &&
        device(controller)?.endsMicros > 0n,
      "fresh accepted timed stage",
      3000,
    );
    const stageStart = Date.now(),
      remainingMs = Number(device(controller).endsMicros) / 1000 - stageStart;
    assert(
      remainingMs > 2700 && remainingMs <= 3100,
      `actual fresh three-second timer (${remainingMs}ms)`,
    );
    capture(`${name}-cycling-both-sealed`);
    await pause(2600);
    assert.equal(
      device(outer).open,
      false,
      "outer remains closed during active three-second cycle",
    );
    await wait(() => device(outer)?.open, "timed stage completes", 5000);
    const elapsedMs = Date.now() - stageStart;
    assert(elapsedMs >= 2700);
    receipts.push({
      label: `${name}-active-cycle-timing`,
      remainingMs,
      elapsedMs,
    });
  };
  try {
    capture("initial-pressurised");
    for (const name of ["personnel", "cargo"]) {
      const controller = `${name}-controller`,
        inner = `${name}-inner-actuator`,
        outer = `${name}-outer-actuator`;
      assert.equal(device(controller).state, "pressurised");
      assert.equal(device(inner).open, true);
      assert.equal(device(outer).open, false);
      // Distant presses are rejected by the real proximity/access reducer.
      await assert.rejects(press(`${name}-outside-button`));
      await walk(panel(`${name}-chamber-outer-button`).front);
      if (name === "personnel") {
        await assert.rejects(
          press(`${name}-chamber-outer-button`),
          /pressure suit, helmet and EVA jetpack/,
        );
        assert.equal(device(controller).state, "pressurised");
        await c.reducers.wearPrefabSmokeEvaSuit({});
        await wait(
          () =>
            [...c.db.ownInventoryItems.iter()].filter(
              (i: any) =>
                /^wardrobe-suit-/.test(i.definitionId) && i.equipmentSlot,
            ).length === 4,
          "real suit equipment fixture",
        );
      }
      const center = name === "personnel" ? 3 : -7;
      // A suited crew body holds the inner leaf. Becoming unsuited and moving
      // into the chamber cannot turn pending-close into an unsafe vacuum commit.
      if (name === "personnel") await crew("spawn", -3, center);
      await press(`${name}-chamber-outer-button`);
      await wait(
        () => device(controller)?.state === "depressurising",
        "depressurisation begins",
        3000,
      );
      assert.equal(device(outer).open, false);
      if (name === "personnel") {
        assert.equal(device(inner).open, true, "crew blocks inner closure");
        await crew("unsuit");
        await crew("move", -5, center);
        await pause(3500);
        assert.equal(
          device(outer).open,
          false,
          "late unsuited entrant prevents vacuum while closure is pending",
        );
        capture("personnel-late-unsuited-denied");
        await crew("clear");
        await timedOpening(name);
      } else {
        // Remove the caller's helmet through the real inventory transaction during
        // the countdown, including revision/replay checks and actual pocket fit.
        const helmet = [...c.db.ownInventoryItems.iter()].find(
          (i: any) => i.equipmentSlot === "helmet",
        );
        assert(helmet);
        const state = () => [...c.db.ownInventoryState.iter()][0];
        const fit = firstInventoryPlacement(
          {
            items: [...c.db.ownInventoryItems.iter()],
            containers: [...c.db.ownInventoryContainers.iter()],
          },
          INVENTORY_DEFINITIONS,
          LIQUID_DENSITY_KG_PER_LITRE,
          state().pocketsId,
          32,
          helmet.id,
          state().pocketsId,
        );
        assert(fit, "real pocket placement for helmet");
        const command = {
          itemId: helmet.id,
          containerId: state().pocketsId,
          x: fit.x,
          y: fit.y,
          rotated: fit.rotated,
          expectedRevision: state().revision,
          operationId: crypto.randomUUID(),
        };
        await c.reducers.moveInventoryItem(command);
        await pause(3500);
        assert.equal(
          device(outer).open,
          false,
          "equipment loss prevents delayed vacuum commit",
        );
        capture("cargo-countdown-suit-loss-denied");
        const revision = state().revision;
        await c.reducers.moveInventoryItem(command);
        assert.equal(
          state().revision,
          revision,
          "replayed inventory operation is idempotent",
        );
        await assert.rejects(
          c.reducers.equipInventoryItem({
            itemId: helmet.id,
            expectedRevision: command.expectedRevision,
            operationId: crypto.randomUUID(),
          }),
          /revision/i,
        );
        await c.reducers.equipInventoryItem({
          itemId: helmet.id,
          expectedRevision: state().revision,
          operationId: crypto.randomUUID(),
        });
      }
      await wait(
        () => device(outer)?.open,
        "outer hatch opens after timed interlock",
        10000,
      );
      assert.equal(device(inner).open, false);
      assert.equal(device(controller).state, "vacuum");
      capture(`${name}-vacuum-open`);
      // Walk across the real exterior aperture and return through the same
      // authoritative EVA entry gate, retaining the accepted original deck.
      await walk([-6.65, center]);
      const exitEnd = Date.now() + 8000;
      while (!body() && Date.now() < exitEnd) {
        await intent(-1, 0);
        await pause(50);
      }
      assert(body(), "real same-plane EVA exit");
      await intent();
      assert.equal(body().anchorShipId, shipId);
      assert.equal(body().exitShipId, shipId);
      assert.equal(body().deckId, accepted.deckId);
      const exitPoint = [body().localX, body().localY];
      capture(`${name}-eva-exit`);
      const entryEnd = Date.now() + 10000;
      while (body() && Date.now() < entryEnd) {
        await intent(0.6, 0);
        await pause(50);
      }
      await intent();
      await wait(
        () =>
          !body() &&
          location()?.instanceId === accepted.instanceId &&
          location()?.deckId === accepted.deckId,
        "real same-deck EVA return",
      );
      assert(Math.abs(actor().localY - center) < 0.35);
      receipts.push({
        label: `${name}-eva-return`,
        exitPoint,
        entryPoint: [actor().localX, actor().localY],
      });
      await walk(panel(`${name}-chamber-inner-button`).front);
      await crew("spawn", -6.65, center);
      await press(`${name}-chamber-inner-button`);
      await pause(500);
      assert.equal(
        device(outer).open,
        true,
        "threshold occupant prevents closing",
      );
      assert.equal(device(inner).open, false);
      capture(`${name}-obstructed-outer-held`);
      await crew("clear");
      await wait(
        () =>
          device(controller)?.state === "pressurised" && device(inner)?.open,
        "return pressure after obstruction clears",
        10000,
      );
      assert.equal(device(outer).open, false);
      capture(`${name}-returned-pressurised`);
      if (name === "cargo") {
        await walk(panel(`${name}-chamber-outer-button`).front);
        await press(`${name}-chamber-outer-button`);
        await timedOpening(name);
        await walk(panel(`${name}-chamber-inner-button`).front);
        await press(`${name}-chamber-inner-button`);
        await wait(
          () =>
            device(controller)?.state === "pressurised" && device(inner)?.open,
          "normal timed cargo cycle returns pressure",
          10000,
        );
      }
      await walk(panel(`${name}-hall-button`).front);
    }
    const pose = prefabPilotPose(flightModel.station!);
    await walk(pose.approach);
    await acquireNativePilot(c);
    const initialHeading = [...c.db.ownShips.iter()].find(
      (s: any) => s.id === shipId,
    ).heading;
    for (let i = 0; i < 10; i++) {
      await c.reducers.setIntent({
        sequence: nextSequence(c),
        throttle: 0,
        turn: 0.5,
        dx: 0,
        dy: 0,
        sprint: false,
      });
      await pause(60);
    }
    const flown = [...c.db.ownShips.iter()].find((s: any) => s.id === shipId);
    assert(
      Math.abs(flown.heading - initialHeading) > 1e-5,
      "real pilot intent rotates candidate through compiled actuators",
    );
    receipts.push({
      label: "powered-compiled-pilot-intent",
      initialHeading,
      finalHeading: flown.heading,
      physics: c.db.ownAuthoredFlightPhysics.shipId.find(shipId)?.status,
      corePowered: c.db.ownShipPower.shipId.find(shipId)?.corePowered,
    });
    await c.reducers.leaveAuthoredPilot({});
    await wait(
      () =>
        [...c.db.ownAuthoredFlights.iter()].find(
          (f: any) => f.shipId === shipId,
        )?.seatState === "none",
      "candidate pilot release",
    );
    await c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    const receipt = {
      shipId,
      accepted,
      profile: 2,
      productionAdmission: false,
      fixtureAdmissionOnly: true,
      controllers: 2,
      apertures: 4,
      inventoryUuidPreserved: true,
      receipts,
    };
    const evidence = process.env.SIDEREAL_SMOKE_EVIDENCE_DIR;
    if (evidence)
      await writeFile(
        join(evidence, "ship-access-wire-receipt.json"),
        JSON.stringify(receipt, null, 2) + "\n",
      );
    return receipt;
  } finally {
    await intent().catch(() => {});
    await crew("clear").catch(() => {});
  }
}
