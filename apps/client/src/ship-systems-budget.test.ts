import { expect, test } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { compilePrefabShipSystems } from "@sidereal/sim/prefab-ship-systems";
import {
  budgetLines,
  budgetOfReport,
  budgetStatus,
  estimateShipSystems,
} from "./ship-systems-budget";

const catalog = defaultPrefabComponentCatalog().revision;
const instanceJson = (document: unknown) =>
  JSON.stringify({ prefab: { document, catalog } });

test("the client estimate is the shared compile over the visited instance document (12 prefabs)", () => {
  for (const p of PREFAB_SHIPS) {
    const estimate = estimateShipSystems(instanceJson(p));
    const shared = compilePrefabShipSystems(p, catalog);
    expect(estimate?.inputHash, p.id).toBe(shared.inputHash);
    expect(JSON.stringify(estimate?.report), p.id).toBe(
      JSON.stringify(shared.report),
    );
  }
  expect(estimateShipSystems(undefined)).toBeUndefined();
  expect(estimateShipSystems("{}")).toBeUndefined();
});

test("the estimate follows the owner's damage rows", () => {
  const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
  const reactor = wren.mounts.find((m) => m.component.startsWith("reactor."))!;
  const hit = estimateShipSystems(instanceJson(wren), [
    { objectId: `mount:${reactor.id}`, performance: 0 },
  ])!;
  expect(hit.destroyed).toBe(1);
  expect(hit.report.power.generationKw).toBe(0);
  const budget = budgetOfReport(hit.report, hit.damaged, hit.destroyed);
  expect(budget.cruiseBrownout).toBe(true);
  expect(budgetLines(budget).map((l) => l.label)).toEqual([
    "Power",
    "Heat",
    "Coolant",
    "Fuel",
    "Data",
    "Life support",
    "Mass",
    "Damage",
  ]);
  expect(budgetLines(budget)[0].value).toContain("(brownout)");
  expect(budgetStatus(budget)).toMatch(
    /^Outside catalogue budget: \d+ errors?/,
  );
  expect(budgetStatus({ ...budget, status: "ok" })).toBe(
    "All systems within budget",
  );
});
