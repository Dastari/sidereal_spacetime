import { expect, it } from "vitest";
import { remoteExhaustByShip } from "./remote-exhaust";

it("groups firing thrusters per perceived ship and drops idle or invalid rows", () => {
  const byShip = remoteExhaustByShip([
    { shipId: "a", sourceId: "mount-main-c", throttle: 0.75 },
    { shipId: "a", sourceId: "mount-rcs-bow-s#fore", throttle: 0.125 },
    { shipId: "b", sourceId: "mount-main-c", throttle: 0 },
    { shipId: "b", sourceId: "mount-main-p", throttle: Number.NaN },
    { shipId: "c", sourceId: "mount-main-c", throttle: 3 },
  ]);
  expect([...byShip.keys()]).toEqual(["a", "c"]);
  expect(Object.fromEntries(byShip.get("a")!)).toEqual({
    "mount-main-c": 0.75,
    "mount-rcs-bow-s#fore": 0.125,
  });
  expect(byShip.get("c")!.get("mount-main-c")).toBe(1);
});
