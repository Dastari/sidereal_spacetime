import { describe, it, expect } from "vitest";
import { characterPresentationStatus as status } from "./character-preview-state";
const ready = {
  status: "ready" as const,
  frameReady: true,
  pending: 0,
  equipmentRequested: true,
  equipmentReady: true,
  equipmentFailed: false,
};
describe("personalized portrait first frame", () => {
  it("keeps the model covered until selected equipment and shaders finish", () => {
    expect(status({ ...ready, status: "loading" })).toBe("loading");
    expect(status({ ...ready, equipmentReady: false, pending: 1 })).toBe(
      "loading",
    );
    expect(status({ ...ready, frameReady: false })).toBe("loading");
    expect(status(ready)).toBe("ready");
  });
  it("covers a replacement appearance and stale outstanding equipment load without showing a preset", () => {
    expect(status({ ...ready, frameReady: false, pending: 1 })).toBe("loading");
    expect(status({ ...ready, pending: 1 })).toBe("loading");
    expect(
      status({ ...ready, equipmentRequested: false, equipmentReady: false }),
    ).toBe("ready");
  });
  it("reports selected item failure and disposal instead of showing default gear", () => {
    expect(
      status({ ...ready, equipmentFailed: true, equipmentReady: false }),
    ).toBe("error");
    expect(status({ ...ready, status: "error" })).toBe("error");
    expect(status({ ...ready, status: "disposed" })).toBe("disposed");
  });
});
