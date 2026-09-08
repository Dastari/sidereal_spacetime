import { expect, test } from "vitest";
import { nextLifecycle, validateScriptRevision } from "./index";
const revision = {
  id: "door.airlock",
  revision: 1n,
  apiVersion: 1,
  contentHash: "a".repeat(64),
  runtime: "compiled-typescript",
  hooks: ["actor.interacted"],
  capabilities: ["door.request"],
};
test("restoring a persistent object does not repeat creation", () => {
  expect(nextLifecycle("active", "object.restored")).toBe("active");
  expect(() => nextLifecycle("active", "object.created")).toThrow();
});
test("suspension and despawn preserve reactivation; destruction is final", () => {
  expect(nextLifecycle("suspended", "object.activated")).toBe("active");
  expect(nextLifecycle("despawned", "object.activated")).toBe("active");
  expect(() => nextLifecycle("destroyed", "object.activated")).toThrow();
});
test("script manifests reject unknown hooks and direct authority capabilities", () => {
  expect(validateScriptRevision(revision).id).toBe("door.airlock");
  expect(() =>
    validateScriptRevision({ ...revision, hooks: ["world.read_all"] }),
  ).toThrow();
  expect(() =>
    validateScriptRevision({ ...revision, capabilities: ["db.write"] }),
  ).toThrow();
  expect(() =>
    validateScriptRevision({
      ...revision,
      hooks: ["actor.interacted", "actor.interacted"],
    }),
  ).toThrow();
});
