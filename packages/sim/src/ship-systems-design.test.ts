import { describe, expect, it } from "vitest";
import { HULL_ACCESS_SOURCE } from "@sidereal/content/hull-access-profile";
import {
  buildSystemsDesign,
  validateServiceRouteProposal,
  type ServiceRouteProposal,
} from "./ship-systems-design";
import { prefabShipSystemsInput } from "./prefab-ship-systems";
import { autoWireShipComponents, shipPortsCompatible } from "./ship-systems";
const revision = "ship-components-v1@4";
describe("read-only systems design", () => {
  it("exposes the actual seven under-floor mounts without changing the blueprint", () => {
    const before = JSON.stringify(HULL_ACCESS_SOURCE),
      m = buildSystemsDesign(HULL_ACCESS_SOURCE, revision);
    expect(
      m.components
        .filter((c) => c.belowDeck)
        .map((c) => [c.id, c.placement.position[2]]),
    ).toEqual([
      ["mount:battery", -1.25],
      ["mount:coolant", -1.25],
      ["mount:core", -1.25],
      ["mount:fuel", -1.25],
      ["mount:rad-a", -1],
      ["mount:rad-b", -1],
      ["mount:reactor", -1.25],
    ]);
    expect(JSON.stringify(HULL_ACCESS_SOURCE)).toBe(before);
    expect(m.routing).toBe("saved-proposal");
  });
  it("every saved route connects compatible transformed ports, including side-mounted radiators", () => {
    const m = buildSystemsDesign(HULL_ACCESS_SOURCE, revision),
      ports = new Map(
        m.components.flatMap((c) => c.ports.map((p) => [p.key, p] as const)),
      );
    expect(m.routes.length).toBeGreaterThan(30);
    expect(m.unconnected).toEqual([]);
    for (const r of m.routes) {
      const a = ports.get(r.from)!,
        b = ports.get(r.to)!;
      expect(shipPortsCompatible(a, b).ok).toBe(true);
      expect(r.points[0]).toEqual(a.position);
      expect(r.points.at(-1)).toEqual(b.position);
      expect(r.channel).toBe(a.channel);
      expect(r.channel).toBe(b.channel);
      expect(r.points.every((p) => p.every(Number.isFinite))).toBe(true);
    }
    expect(m.routes.some((r) => r.to.startsWith("mount:rad-a/"))).toBe(true);
    expect(m.routes.some((r) => r.to.startsWith("mount:rad-b/"))).toBe(true);
  });
  it("is deterministic and retains the explicit proposal distinction for unsaved layouts", () => {
    const a = buildSystemsDesign(HULL_ACCESS_SOURCE, revision, null),
      b = buildSystemsDesign(HULL_ACCESS_SOURCE, revision, null);
    expect(a).toEqual(b);
    expect(a.routing).toBe("generated-proposal");
  });
  it("reports ammunition channels outside the five-channel view without breaking supported routing", () => {
    const doc = structuredClone(HULL_ACCESS_SOURCE);
    delete doc.authoredGameplay;
    doc.id = "test.generic";
    doc.mounts.push(
      {
        id: "magazine",
        attach: "interior",
        component: "magazine.ballistic.md",
        at: [0, 0],
      },
      { id: "weapon", attach: "top", component: "autocannon.md", at: [0, 0] },
    );
    const m = buildSystemsDesign(doc, revision);
    expect(m.unsupportedChannels).toEqual(["ammo"]);
    expect(m.routes.length).toBeGreaterThan(0);
    expect(m.routes.every((r) => r.channel !== ("ammo" as string))).toBe(true);
    expect(
      m.routes.every((r) => r.points.every((p) => p.every(Number.isFinite))),
    ).toBe(true);
  });
  it("rejects stale pins, wrong endpoint positions and incompatible/duplicate links", () => {
    const m = buildSystemsDesign(HULL_ACCESS_SOURCE, revision),
      i = prefabShipSystemsInput(HULL_ACCESS_SOURCE, revision),
      links = autoWireShipComponents(i.catalog, i.hull, i.components ?? []),
      ports = new Map(
        m.components.flatMap((c) => c.ports.map((p) => [p.key, p] as const)),
      );
    const base: ServiceRouteProposal = {
      schema: "sidereal.service-route-proposal.v1",
      sourceHash: m.sourceHash,
      routes: m.routes,
    };
    expect(() =>
      validateServiceRouteProposal(
        { ...base, sourceHash: "0".repeat(64) },
        m.sourceHash,
        ports,
        links,
      ),
    ).toThrow(/match/);
    const moved = structuredClone(base);
    moved.routes[0].points[0][0] += 1;
    expect(() =>
      validateServiceRouteProposal(moved, m.sourceHash, ports, links),
    ).toThrow(/geometry/);
    const wrong = structuredClone(base);
    wrong.routes[0].to = wrong.routes[0].from;
    expect(() =>
      validateServiceRouteProposal(wrong, m.sourceHash, ports, links),
    ).toThrow(/endpoints/);
    const duplicate = structuredClone(base);
    duplicate.routes[1] = duplicate.routes[0];
    expect(() =>
      validateServiceRouteProposal(duplicate, m.sourceHash, ports, links),
    ).toThrow(/endpoints/);
  });
});
