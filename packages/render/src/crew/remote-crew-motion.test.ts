import { describe, expect, it } from "vitest";
import {
  REMOTE_CREW_DELAY_MS,
  createRemoteCrewMotion,
} from "./remote-crew-motion";

const standing = {
  seated: false,
  dead: false,
  aimActive: false,
  aimAngle: 0,
  seatFacing: 0,
};

describe("remote crew motion (presentation of accepted positions)", () => {
  it("glides between 20 Hz world ticks a little behind the newest position", () => {
    const m = createRemoteCrewMotion();
    // Walking +Y at 2.5 m/s: 0.125 m per 50 ms tick.
    for (let i = 0; i <= 4; i++) m.push(i * 50, 0, i * 0.125, 0.1875);
    const d = m.sample(200 + REMOTE_CREW_DELAY_MS - 25, standing);
    expect(d.y).toBeCloseTo(0.4375, 6);
    expect(d.z).toBeCloseTo(0.1875, 6);
    expect(d.speed).toBeCloseTo(2.5, 6);
    expect(d.moving).toBe(true);
    // Heading convention of the local character: atan2(dx, dy), yaw = -heading.
    expect(d.yaw).toBeCloseTo(-0, 6);
    // Never ahead of the server: holds the newest accepted position.
    expect(m.sample(10_000, standing)).toMatchObject({
      y: 0.5,
      moving: false,
    });
  });

  it("stands still when positions stop, and turns towards travel smoothly", () => {
    const m = createRemoteCrewMotion();
    m.push(0, 0, 0, 0);
    expect(m.sample(1000, standing)).toMatchObject({
      x: 0,
      y: 0,
      moving: false,
    });
    // Setting off along +X after standing: glide starts one tick before the new position.
    m.push(2000, 0.125, 0, 0);
    m.push(2050, 0.25, 0, 0);
    let d = m.sample(2050 + REMOTE_CREW_DELAY_MS - 30, standing);
    expect(d.moving).toBe(true);
    expect(d.x).toBeGreaterThan(0);
    expect(d.x).toBeLessThan(0.25);
    // Turning is eased, not snapped.
    expect(d.yaw).toBeLessThan(0);
    expect(d.yaw).toBeGreaterThan(-Math.PI / 2);
    for (let t = 2100; t < 2130; t += 5) d = m.sample(t, standing);
    expect(d.yaw).toBeCloseTo(-Math.PI / 2, 1);
  });

  it("snaps a relocation (respawn) instead of walking through walls", () => {
    const m = createRemoteCrewMotion();
    m.push(0, 0, 0, 0);
    m.push(50, 0.1, 0, 0);
    m.push(100, 6, 4, 0);
    const d = m.sample(100 + REMOTE_CREW_DELAY_MS / 2, standing);
    expect([d.x, d.y]).toEqual([6, 4]);
    expect(d.moving).toBe(false);
  });

  it("faces the aim while aiming, the seat while seated, and does not walk seated or dead", () => {
    const m = createRemoteCrewMotion();
    for (let i = 0; i <= 3; i++) m.push(i * 50, i * 0.125, 0, 0);
    const t = 150 + REMOTE_CREW_DELAY_MS - 20;
    expect(
      m.sample(t, { ...standing, aimActive: true, aimAngle: 1.2 }).yaw,
    ).toBe(-1.2);
    const seated = m.sample(t, { ...standing, seated: true, seatFacing: 0.7 });
    expect(seated).toMatchObject({ yaw: 0.7, moving: false });
    const dead = m.sample(t, { ...standing, dead: true });
    expect(dead.moving).toBe(false);
    expect(dead.yaw).toBe(0.7);
  });

  it("ignores repeated identical positions (no timing without a server change)", () => {
    const m = createRemoteCrewMotion();
    m.push(0, 1, 1, 0);
    m.push(40, 1, 1, 0);
    m.push(500, 1, 1, 0);
    expect(m.sample(600, standing)).toMatchObject({ x: 1, y: 1, speed: 0 });
  });
});
