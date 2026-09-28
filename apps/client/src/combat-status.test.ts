import { expect, test, vi } from "vitest";
import { inventoryDefinition } from "@sidereal/content/inventory";
import { combatNote, trackReload } from "./combat-status";
import { createCombatInput, type CombatInputState } from "./combat-input";

test("R reloads a reloadable, not-full weapon at most once a second", async () => {
  let time = 0;
  const state: CombatInputState = {
    active: true,
    allowed: true,
    blocked: false,
    weapon: {
      itemId: "gun",
      revision: 3n,
      energy: 40,
      shotCost: 10,
      cooldownMs: 250,
      capacity: 120,
      canReload: true,
    },
  };
  const reload = vi.fn(async () => {});
  const input = createCombatInput({
    state: () => state,
    aim: () => 0,
    sendAim: async () => {},
    fire: async () => {},
    reload,
    error: () => {},
    now: () => time,
  });
  expect(await input.reload()).toBe(true);
  expect(reload).toHaveBeenCalledWith("gun", 3n);
  expect(await input.reload()).toBe(false);
  time = 1500;
  state.weapon!.energy = 120;
  expect(await input.reload()).toBe(false); // full
  state.weapon!.energy = 0;
  state.weapon!.canReload = false;
  expect(await input.reload()).toBe(false); // baton, grenade
  input.dispose();
});

test("pulling the trigger on an empty weapon reloads it instead of firing", async () => {
  const state: CombatInputState = {
    active: true,
    allowed: true,
    blocked: false,
    weapon: {
      itemId: "gun",
      revision: 1n,
      energy: 2,
      shotCost: 10,
      cooldownMs: 0,
      capacity: 100,
      canReload: true,
    },
  };
  const fire = vi.fn(async () => {}),
    reload = vi.fn(async () => {});
  const input = createCombatInput({
    state: () => state,
    aim: () => 0.5,
    sendAim: async () => {},
    fire,
    reload,
    error: () => {},
  });
  input.trigger(true);
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(fire).not.toHaveBeenCalled();
  input.dispose();
});

test("the HUD says reloading, the weapon mode, or 'not yet usable' for held tools", () => {
  const until = { current: 0 },
    seen = { current: undefined as bigint | undefined };
  const action = { definitionId: "rifle", reloadSequence: 1n };
  trackReload(action, until, seen, 1000); // baseline
  expect(until.current).toBe(0);
  trackReload({ ...action, reloadSequence: 2n }, until, seen, 1000);
  expect(until.current).toBe(3000);
  expect(combatNote("rifle", undefined, action, until.current, 2000)).toBe(
    "Reloading…",
  );
  expect(combatNote("rifle", undefined, action, until.current, 3500)).toBe(
    "R reload",
  );
  expect(combatNote("grenade", undefined, undefined, 0)).toMatch(/Throw/);
  expect(combatNote("baton", undefined, undefined, 0)).toMatch(/Melee/);
  expect(
    combatNote(undefined, inventoryDefinition("repair-tool"), undefined, 0),
  ).toMatch(/Tool · not yet usable/);
  expect(
    combatNote(undefined, inventoryDefinition("medkit"), undefined, 0),
  ).toMatch(/Medical · not yet usable/);
  expect(combatNote(undefined, undefined, undefined, 0)).toBeUndefined();
});
