import { Identity } from "spacetimedb";
import { describe, expect, test, vi } from "vitest";

// Match the existing world authority fixtures: mock only the embedded SDK's
// schema descriptors, then exercise the real reducer and private-row adapter.
vi.mock("spacetimedb/server", () => ({
  SenderError: class extends Error {},
  t: new Proxy(
    {},
    {
      get: () => () => ({
        primaryKey() {
          return this;
        },
      }),
    },
  ),
}));
import { ownAppearance, setCharacterAppearance } from "./appearance";

type Actor = { id: string; owner: Identity; connected: boolean };
type Appearance = {
  characterId: string;
  revision: bigint;
  appearanceJson: string;
};
type Receipt = {
  id: string;
  characterId: string;
  request: string;
  revision: bigint;
};
type Context = Parameters<typeof setCharacterAppearance>[0];

function store<Row extends object>(key: (row: Row) => string) {
  const rows = new Map<string, Row>();
  return {
    rows,
    find: (id: string) => rows.get(id),
    insert: (row: Row) => {
      if (rows.has(key(row))) throw Error("Duplicate primary key");
      rows.set(key(row), { ...row });
    },
    update: (row: Row) => {
      if (!rows.has(key(row))) throw Error("Missing primary key");
      rows.set(key(row), { ...row });
    },
    delete: (id: string) => rows.delete(id),
  };
}

function fixture() {
  const alice = Identity.fromString("1".repeat(64));
  const bob = Identity.fromString("2".repeat(64));
  const actors = store<Actor>((row) => row.id);
  const appearances = store<Appearance>((row) => row.characterId);
  const receipts = store<Receipt>((row) => row.id);
  actors.insert({ id: "alice-character", owner: alice, connected: true });
  actors.insert({ id: "bob-character", owner: bob, connected: true });
  const db = {
    character: {
      by_owner: {
        filter: (owner: Identity) =>
          [...actors.rows.values()].filter(
            (row) => row.owner.toHexString() === owner.toHexString(),
          ),
      },
    },
    characterAppearance: {
      insert: appearances.insert,
      characterId: appearances,
    },
    appearanceReceipt: {
      insert: receipts.insert,
      id: receipts,
      by_character: {
        filter: (id: string) =>
          [...receipts.rows.values()].filter((row) => row.characterId === id),
      },
    },
  };
  const context = (sender: Identity) => ({ db, sender }) as unknown as Context;
  const a = context(alice),
    b = context(bob);
  let operation = 0;
  const save = (
    value: Record<string, unknown>,
    ctx = a,
    operationId = `face-${++operation}`,
    expectedRevision = ownAppearance(ctx)[0]?.revision ?? 0n,
  ) =>
    setCharacterAppearance(ctx, {
      appearanceJson: JSON.stringify(value),
      expectedRevision,
      operationId,
    });
  const snapshot = () => ({
    actors: [...actors.rows.values()],
    appearances: [...appearances.rows.values()],
    receipts: [...receipts.rows.values()],
  });
  return {
    alice,
    bob,
    a,
    b,
    context,
    actors,
    appearances,
    receipts,
    save,
    snapshot,
  };
}

// These are the delivery contract, independently pinned rather than generated
// from the allowlist under test, so omitted options fail their authority gate.
const faceOptions = {
  expression: [
    "neutral",
    "happy",
    "stern",
    "sad",
    "surprised",
    "wink",
    "grin",
    "determined",
  ],
  faceDetail: [
    "none",
    "freckles",
    "scar",
    "scratch",
    "tattoo",
    "bandage",
    "dirt",
    "warpaint",
    "cyber",
    "birthmark",
  ],
  facialHair: [
    "none",
    "stubble",
    "short",
    "full",
    "goatee",
    "moustache",
    "handlebar",
    "sideburns",
  ],
  faceAge: ["young", "adult", "mature", "elder"],
} as const;

describe("r009 character face appearance authority", () => {
  test("legacy empty and existing body/hair documents retain their stored meaning", () => {
    const f = fixture();
    expect(ownAppearance(f.a)).toEqual([
      { characterId: "alice-character", revision: 0n, appearanceJson: "{}" },
    ]);
    expect(f.appearances.rows.size).toBe(0);
    f.save({});
    expect(ownAppearance(f.a)[0]).toEqual({
      characterId: "alice-character",
      revision: 1n,
      appearanceJson: "{}",
    });
    const legacy = {
      outfit: "explorer",
      bodyType: "female",
      hairStyle: "braids",
      skin: "#Bc8C68",
      hair: "#Ff33Cc",
      helmet: "none",
    };
    f.save(legacy);
    const row = ownAppearance(f.a)[0];
    expect(row.revision).toBe(2n);
    expect(JSON.parse(row.appearanceJson)).toEqual({
      ...legacy,
      skin: "#bc8c68",
      hair: "#ff33cc",
    });
    expect(Object.keys(JSON.parse(row.appearanceJson))).toHaveLength(6);
  });

  test.each(
    Object.entries(faceOptions).flatMap(([field, values]) =>
      values.map((value) => [field, value]),
    ),
  )(
    "persists the delivered %s=%s choice without changing another character",
    (field, value) => {
      const f = fixture();
      f.save({ [field]: value });
      expect(ownAppearance(f.a)).toEqual([
        {
          characterId: "alice-character",
          revision: 1n,
          appearanceJson: JSON.stringify({ [field]: value }),
        },
      ]);
      expect(ownAppearance(f.b)[0].revision).toBe(0n);
      expect(f.receipts.rows.size).toBe(1);
    },
  );

  test("eyes and neon hair remain independent canonical colours in one full saved appearance", () => {
    const f = fixture();
    const appearance = {
      bodyType: "female",
      hairStyle: "ponytail",
      skin: "#764E3B",
      hair: "#Ff00Cc",
      eyes: "#00FfCC",
      expression: "wink",
      faceDetail: "cyber",
      facialHair: "none",
      faceAge: "mature",
    };
    f.save(appearance);
    const saved = JSON.parse(ownAppearance(f.a)[0].appearanceJson);
    expect(saved).toEqual({
      ...appearance,
      skin: "#764e3b",
      hair: "#ff00cc",
      eyes: "#00ffcc",
    });
    // The client merges patches into the latest accepted complete document.
    f.save({ ...saved, expression: "neutral" });
    expect(JSON.parse(ownAppearance(f.a)[0].appearanceJson)).toEqual({
      ...saved,
      expression: "neutral",
    });
    expect(f.actors.find("alice-character")?.id).toBe("alice-character");
  });

  test.each([
    { expression: "angry" },
    { faceDetail: "unknown" },
    { facialHair: "beard" },
    { faceAge: "ancient" },
    { hairStyle: "new-uninstalled-style" },
    { eyes: "#fff" },
    { eyes: "#12345678" },
    { eyes: "123456" },
    { eyes: "#zzzzzz" },
    { eyes: 123456 },
    { expression: null },
    { faceDetail: ["scar"] },
    { facialHair: { style: "full" } },
    { faceStyle: "alternate" },
    { eyeColor: "#aabbcc" },
    { characterId: "bob-character" },
    { owner: "forged-identity" },
    { equippedComponents: { helmet: "medic-helmet" } },
    { weapon: "rifle" },
  ])("rejects unsupported face/cosmetic input atomically: %j", (invalid) => {
    const f = fixture();
    f.save({ hair: "#ff33cc", eyes: "#55aaff", expression: "happy" });
    const before = f.snapshot();
    expect(() => f.save(invalid)).toThrow();
    expect(f.snapshot()).toEqual(before);
  });

  test.each(["{", "[]", "null", "42", '"face"', " ".repeat(2049)])(
    "rejects malformed or oversized full documents without a receipt",
    (appearanceJson) => {
      const f = fixture(),
        before = f.snapshot();
      expect(() =>
        setCharacterAppearance(f.a, {
          appearanceJson,
          expectedRevision: 0n,
          operationId: "bad-document",
        }),
      ).toThrow();
      expect(f.snapshot()).toEqual(before);
    },
  );

  test("stale writes cannot overwrite accepted face changes or issue receipts", () => {
    const f = fixture();
    f.save({ expression: "stern", eyes: "#123456" });
    const before = f.snapshot();
    for (const revision of [0n, 2n]) {
      expect(() =>
        f.save({ expression: "happy" }, f.a, `stale-${revision}`, revision),
      ).toThrow("Appearance revision conflict");
      expect(f.snapshot()).toEqual(before);
    }
  });

  test("canonical duplicate replay succeeds once and never rolls back a later revision", () => {
    const f = fixture();
    f.save({ expression: "happy", eyes: "#AaBBcC" }, f.a, "retry", 0n);
    const accepted = f.snapshot();
    f.save({ eyes: "#aabbcc", expression: "happy" }, f.a, "retry", 0n);
    expect(f.snapshot()).toEqual(accepted);
    f.save({ expression: "stern" });
    const newer = f.snapshot();
    f.save({ expression: "happy", eyes: "#AABBCC" }, f.a, "retry", 0n);
    expect(f.snapshot()).toEqual(newer);
    expect(() => f.save({ expression: "sad" }, f.a, "retry", 0n)).toThrow(
      "Operation ID reused with a different request",
    );
    expect(f.snapshot()).toEqual(newer);
  });

  test("sender identity selects both private rows and receipt namespace", () => {
    const f = fixture();
    f.save(
      { expression: "happy", eyes: "#55aaff" },
      f.a,
      "shared-operation",
      0n,
    );
    const aliceRow = { ...ownAppearance(f.a)[0] };
    f.save(
      { expression: "stern", eyes: "#ffaa55" },
      f.b,
      "shared-operation",
      0n,
    );
    expect(ownAppearance(f.a)).toEqual([aliceRow]);
    expect(ownAppearance(f.b)).toEqual([
      {
        characterId: "bob-character",
        revision: 1n,
        appearanceJson: '{"expression":"stern","eyes":"#ffaa55"}',
      },
    ]);
    expect([...f.receipts.rows.keys()].sort()).toEqual([
      "alice-character:shared-operation",
      "bob-character:shared-operation",
    ]);
    // A new SDK Identity object with equal bytes remains the same owner.
    expect(
      ownAppearance(f.context(Identity.fromString(f.alice.toHexString()))),
    ).toEqual([aliceRow]);
    const outsider = f.context(Identity.fromString("3".repeat(64)));
    expect(ownAppearance(outsider)).toEqual([]);
    const before = f.snapshot();
    expect(() => f.save({ expression: "sad" }, outsider)).toThrow(
      "Connected character required",
    );
    expect(f.snapshot()).toEqual(before);
  });

  test("disconnected actors and invalid operation IDs cannot change appearance", () => {
    const f = fixture();
    f.save({ eyes: "#aabbcc" });
    for (const id of ["", "contains space", "x".repeat(81)]) {
      const before = f.snapshot();
      expect(() => f.save({ expression: "grin" }, f.a, id)).toThrow(
        "Invalid appearance operation ID",
      );
      expect(f.snapshot()).toEqual(before);
    }
    f.actors.update({ ...f.actors.find("alice-character")!, connected: false });
    const before = f.snapshot();
    expect(() => f.save({ expression: "grin" })).toThrow(
      "Connected character required",
    );
    expect(f.snapshot()).toEqual(before);
  });

  test("new facial choices preserve bounded receipts and reject evicted stale replays", () => {
    const f = fixture();
    for (let i = 0; i < 129; i++)
      f.save({ faceAge: "adult" }, f.a, `bounded-${i}`);
    expect(f.receipts.rows.size).toBe(128);
    expect(f.receipts.find("alice-character:bounded-0")).toBeUndefined();
    expect(ownAppearance(f.a)[0].revision).toBe(129n);
    const before = f.snapshot();
    expect(() => f.save({ faceAge: "adult" }, f.a, "bounded-0", 0n)).toThrow(
      "Appearance revision conflict",
    );
    expect(f.snapshot()).toEqual(before);
  });
});
