import { describe, expect, it } from "vitest";
import template from "./templates/wayfarer-r001.json";
import {
  createWayfarerTemplateDraft,
  preserveBeforeTemplate,
  WAYFARER_TEMPLATE_HASH,
  WAYFARER_TEMPLATE_ID,
} from "./wayfarer-template";
import { DEFAULT_VIEW, recoveryKey, type Checkpoint } from "./state";
const id = "682210ab-dae9-4f53-bb31-c8bb5617d4e1";
const checkpoint = (): Checkpoint => ({
  schema: "sidereal.layout-recovery.v1",
  sequence: 2,
  writer: "review",
  history: {
    past: [],
    present: createWayfarerTemplateDraft(template, id),
    future: [],
  },
  view: { ...DEFAULT_VIEW, deckId: "wayfarer-main-deck" },
});
const storage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
describe("pinned Wayfarer editable template", () => {
  it("forks document identity while retaining every native placement and source provenance", () => {
    const draft = createWayfarerTemplateDraft(template, id);
    expect(draft.id).toBe(id);
    expect(draft.source).toBeNull();
    expect(draft.dependencies).toContainEqual({
      id: `template-origin:${WAYFARER_TEMPLATE_ID}`,
      revision: WAYFARER_TEMPLATE_HASH,
    });
    expect(draft.tiles).toEqual(template.layout.tiles);
    expect(draft.assembly).toEqual(template.layout.assembly);
    expect(draft.decks).toEqual(template.layout.decks);
    expect(draft.tiles.length + (draft.assembly?.parts.length ?? 0)).toBe(262);
    draft.tiles[0].vertices[0][0] += 1;
    expect(draft.tiles).not.toEqual(template.layout.tiles);
    expect(createWayfarerTemplateDraft(template, id).tiles).toEqual(
      template.layout.tiles,
    );
  });
  it("rejects changed source or reused canonical identity before adoption", () => {
    const altered = structuredClone(template);
    altered.layout.name = "Different source";
    expect(() => createWayfarerTemplateDraft(altered, id)).toThrow(
      "revision differs",
    );
    expect(() =>
      createWayfarerTemplateDraft(template, WAYFARER_TEMPLATE_ID),
    ).toThrow("fresh local draft UUID");
  });
  it("checkpoints current unsaved history and leaves other saved drafts intact", () => {
    const local = storage(),
      current = checkpoint(),
      key = recoveryKey("account", current.history.present);
    local.setItem(key, "previous-own-revision");
    local.setItem("other-draft", "keep");
    current.history.present.name = "Unsaved proposal";
    const result = preserveBeforeTemplate(
      local,
      "account",
      "previous-own-revision",
      current,
      false,
    );
    expect(JSON.parse(result).history.present.name).toBe("Unsaved proposal");
    expect(local.getItem(key)).toBe(result);
    expect(local.getItem("other-draft")).toBe("keep");
  });
  it("refuses conflict/recovery and never overwrites concurrent saves", () => {
    const local = storage(),
      current = checkpoint(),
      key = recoveryKey("account", current.history.present);
    local.setItem(key, "another-editor");
    expect(() =>
      preserveBeforeTemplate(local, "account", null, current, false),
    ).toThrow("Another editor");
    expect(() =>
      preserveBeforeTemplate(local, "account", "another-editor", current, true),
    ).toThrow("conflicting/recovery");
    expect(local.getItem(key)).toBe("another-editor");
  });
  it("propagates quota failures so the caller retains its current draft", () => {
    const current = checkpoint();
    expect(() =>
      preserveBeforeTemplate(
        {
          getItem: () => null,
          setItem: () => {
            throw Error("quota");
          },
        },
        "account",
        null,
        current,
        false,
      ),
    ).toThrow("quota");
    expect(current.history.present.id).toBe(id);
  });
});
