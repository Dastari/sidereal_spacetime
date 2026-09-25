import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
import { PRESERVED_MAP_TABLES, WIPED_SHIP_TABLES } from "./ship-wipe";

const snake = (name: string) => name.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const pythonList = (source: string, name: string) => {
  const match = new RegExp(`^${name} = \\[([\\s\\S]*?)\\]`, "m").exec(source);
  if (!match) throw Error("Missing " + name);
  return [...match[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
};

test("operator export/verify tooling covers exactly the tables the reducer wipes and preserves", () => {
  const source = readFileSync(join(__dirname, "../../../scripts/ship_wipe.py"), "utf8");
  expect(pythonList(source, "WIPED_SHIP_TABLES")).toEqual(WIPED_SHIP_TABLES.map(snake));
  expect(pythonList(source, "MAP_TABLES")).toEqual(PRESERVED_MAP_TABLES.map(snake));
});

test("wipe scope never includes map, authoring, auth or ledger tables", () => {
  const wiped = new Set<string>(WIPED_SHIP_TABLES);
  for (const table of [
    ...PRESERVED_MAP_TABLES,
    "constructionDraft",
    "constructionBlueprint",
    "constructionGrant",
    "authSession",
    "identityLink",
    "character",
    "characterAppearance",
    "constructionReceipt",
    "shipOperatorOperation",
    "shipWipeArchive",
    "movementTimer",
    "constructionAtmosphereClock",
    "constructionTraversalClock",
  ])
    expect(wiped.has(table)).toBe(false);
});
