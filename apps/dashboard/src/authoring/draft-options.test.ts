import { describe, expect, it } from "vitest";
import { draftOptionsKey, readDraftOptions } from "./draft-options";

describe("workspace draft option recovery", () => {
  it("retains exact previous revision and independent kit selections", () => {
    expect(
      readDraftOptions('{"boundary":"r004","roofs":true,"revision":"18"}'),
    ).toEqual({ boundary: "r004", roofs: true, revision: "18" });
    expect(
      readDraftOptions('{"boundary":"none","roofs":false,"revision":"0"}'),
    ).toEqual({ boundary: "none", roofs: false, revision: "0" });
  });
  it("rejects unknown options and invalid authority revisions", () => {
    for (const raw of [
      "{",
      "null",
      '{"boundary":"r099","roofs":true,"revision":"1"}',
      '{"boundary":"r001","roofs":true,"revision":"-1"}',
      '{"boundary":"r001","roofs":true,"revision":"18446744073709551616"}',
    ])
      expect(readDraftOptions(raw)).toBeNull();
  });
  it("separates account, workspace and document recovery", () => {
    const key = draftOptionsKey("actor:a", "b", "draft");
    expect(key).not.toBe(draftOptionsKey("actor", "a:b", "draft"));
    expect(key).not.toBe(draftOptionsKey("actor:a", "b", "other"));
  });
});
