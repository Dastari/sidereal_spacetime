import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  SOLAR_SYSTEM,
  SHARED_SYSTEM_SEED,
  SHARED_SYSTEM_SEED_SHA256,
  LEGACY_SYSTEM_SEED,
  SOLAR_SYSTEM_BODY_LIMIT,
  solarBodyForLegacyKey,
} from "./shared-system";
it("keeps owner scenic radii and separates 29 celestial bodies beneath the playable plane", () => {
  const bodies = SOLAR_SYSTEM.bodies,
    star = bodies.find((b) => b.kind === "star")!,
    pelagic = bodies.find((b) => b.key === "pelagic")!,
    gas = bodies.find((b) => b.key === "amethyst")!;
  expect(bodies).toHaveLength(29);
  expect(new Set(bodies.map((b) => b.id)).size).toBe(29);
  expect(pelagic.radius).toBe(36);
  expect(star.radius).toBe(pelagic.radius * 2);
  expect(gas.radius).toBe(pelagic.radius * 1.5);
  expect(pelagic.x).toBe(-120);
  expect(pelagic.y).toBe(210);
  for (const b of bodies) {
    expect(b.height + b.radius * 1.3).toBeLessThan(-20);
    expect(Math.max(Math.abs(b.x), Math.abs(b.y))).toBeLessThan(1e9);
  }
  expect(SHARED_SYSTEM_SEED.bodies.length).toBeLessThanOrEqual(
    SOLAR_SYSTEM_BODY_LIMIT,
  );
  expect(
    SHARED_SYSTEM_SEED.bodies.filter((b) => b.kind === "asteroid"),
  ).toEqual(LEGACY_SYSTEM_SEED.bodies.filter((b) => b.kind === "asteroid"));
});
it("uses three-minute inner travel and ten-to-fifteen-second parent/moon gaps", () => {
  const bodies = SOLAR_SYSTEM.bodies,
    star = bodies.find((b) => b.kind === "star")!;
  const planets = bodies
    .filter((b) => b.parentId === star.id)
    .sort((a, b) => a.orbitRadius - b.orbitRadius);
  expect(planets[0].appearance).toBe("volcanic-r023");
  const gap = (a: typeof star, b: typeof star) =>
    Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
  expect(gap(star, planets[0]) / SOLAR_SYSTEM.cruiseSpeed).toBeCloseTo(180, 8);
  expect(planets.findIndex((b) => b.key === "amethyst")).toBeGreaterThan(
    planets.findIndex((b) => b.key === "pelagic"),
  );
  expect(planets.at(-1)?.appearance).toBe("ice-r026");
  for (const moon of bodies.filter(
    (b) => b.parentId && b.parentId !== star.id,
  )) {
    const parent = bodies.find((b) => b.id === moon.parentId)!;
    expect(moon.radius).toBeLessThan(parent.radius * 0.3);
    expect(gap(parent, moon) / 30000).toBeGreaterThanOrEqual(9.99999999);
    expect(gap(parent, moon) / 30000).toBeLessThanOrEqual(15.00000001);
  }
  for (let i = 0; i < bodies.length; i++)
    for (let j = 0; j < i; j++)
      expect(gap(bodies[i], bodies[j])).toBeGreaterThan(1000);
});
it("maps every legacy celestial explicitly without retaining its old placement ID", () => {
  for (const old of LEGACY_SYSTEM_SEED.bodies.filter(
    (b) => b.kind !== "asteroid",
  )) {
    const replacement = solarBodyForLegacyKey(old.key);
    expect(replacement?.kind).toBe(old.kind);
    expect(replacement?.id).not.toBe(old.id);
  }
});

it("pins the exact complete authored seed, including reviewed appearance revisions", () => {
  expect(createHash("sha256").update(JSON.stringify(SHARED_SYSTEM_SEED)).digest("hex")).toBe(SHARED_SYSTEM_SEED_SHA256);
});
