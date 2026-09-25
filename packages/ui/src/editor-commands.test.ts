import { expect, test } from "vitest";
import { editorCommand } from "./editor-commands";
const key = (key: string, extras = {}) =>
  editorCommand({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...extras,
  });
test("portable studio commands preserve platform modifiers", () => {
  expect(key("v")).toBe("select");
  expect(key("a")).toBe("direct");
  expect(key("p")).toBe("draw");
  expect(key("h")).toBe("pan");
  expect(key("Z", { metaKey: true, shiftKey: true })).toBe("redo");
  expect(key("z", { ctrlKey: true })).toBe("undo");
  expect(key("d", { metaKey: true })).toBe("duplicate");
  expect(key("s", { ctrlKey: true })).toBe("save");
  expect(key("a", { metaKey: true })).toBeUndefined();
  expect(key("Delete")).toBe("delete");
  expect(key("ArrowUp", { shiftKey: true })).toBe("up");
  expect(key("v", { altKey: true })).toBeUndefined();
});
