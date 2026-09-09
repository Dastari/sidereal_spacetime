import { describe, expect, it, vi } from "vitest";
import {
  createSharedWorldJoinAction,
  createSharedWorldJoinSession,
  decodeSharedJoinRequest,
  encodeSharedJoinRequest,
  sharedJoinJournalKey,
  type SharedJoinContext,
  type SharedJoinRequest,
} from "./shared-world-join-action";
const characterId = "8c01c482-bcf8-46c4-bad6-92c746b9b1ed";
const shipId = "fb1ddc75-9ffa-4807-80ad-38f59b0a4a11";
const operationId = "f9b5a331-9676-488c-86f1-3b685761aac7";
const nextOperationId = "69e3bcae-aa22-4266-96d3-c914a13539c6";
const context = (): SharedJoinContext => ({
  identity: "a".repeat(64),
  database: "review",
  active: true,
  admissionReady: true,
  inConstructionReview: false,
  characters: [{ id: characterId, shipId, connected: true }],
  ships: [{ id: shipId, revision: 4n }],
  admissions: [],
});
function fixture() {
  const current = context();
  const journalData = new Map<string, string>();
  const journal = {
    read: (key: string) => journalData.get(key) ?? null,
    write: vi.fn((key: string, value: string) => {
      journalData.set(key, value);
    }),
    remove: (key: string) => {
      journalData.delete(key);
    },
  };
  const send = vi
    .fn<(request: SharedJoinRequest) => Promise<unknown>>()
    .mockResolvedValue(undefined);
  const makeId = vi.fn(() => operationId);
  const make = () =>
    createSharedWorldJoinAction({
      readContext: () => current,
      journal,
      send,
      operationId: makeId,
    });
  return { current, journalData, journal, send, makeId, make };
}
describe("normal shared-world explicit join action", () => {
  it("does nothing on construction and waits for applied admission before explicit sending", async () => {
    const f = fixture(),
      action = f.make();
    expect(f.send).not.toHaveBeenCalled();
    f.current.admissionReady = false;
    expect((await action.join()).phase).toBe("blocked");
    expect(f.journal.write).not.toHaveBeenCalled();
    f.current.admissionReady = true;
    f.current.inConstructionReview = true;
    expect((await action.join()).phase).toBe("blocked");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("persists first and retries the exact operation after unknown response and reload", async () => {
    const f = fixture();
    f.send.mockImplementationOnce(async (request) => {
      expect(
        decodeSharedJoinRequest(
          f.journalData.get(sharedJoinJournalKey(f.current))!,
        ),
      ).toEqual(request);
      throw Error("Connection lost");
    });
    expect((await f.make().join()).phase).toBe("error");
    expect((await f.make().join()).phase).toBe("submitted");
    expect(f.send.mock.calls[1]![0]).toEqual(f.send.mock.calls[0]![0]);
    expect(f.makeId).toHaveBeenCalledOnce();
  });
  it("skips already accepted admission after reconnect and clears the journal", async () => {
    const f = fixture();
    await f.make().join();
    f.current.admissions = [
      { characterId, shipId, systemId: "system", revision: 1n },
    ];
    expect((await f.make().join()).phase).toBe("admitted");
    expect(f.send).toHaveBeenCalledOnce();
    expect(f.journalData.size).toBe(0);
  });
  it("requires an explicit fresh request after ship revisions change", async () => {
    const f = fixture(),
      action = f.make();
    await action.join();
    f.current.ships = [{ id: shipId, revision: 5n }];
    expect((await action.join()).phase).toBe("blocked");
    expect(f.send).toHaveBeenCalledOnce();
    expect(action.discardPending()).toBe(true);
    f.makeId.mockReturnValue(nextOperationId);
    await action.join();
    expect(f.send.mock.calls[1]![0]).toMatchObject({
      expectedShipRevision: 5n,
      operationId: nextOperationId,
    });
  });
  it("partitions pending requests by verified identity and database", async () => {
    const f = fixture();
    await f.make().join();
    f.current.identity = "b".repeat(64);
    f.makeId.mockReturnValue(nextOperationId);
    await f.make().join();
    expect(f.journalData.size).toBe(2);
    expect(f.send.mock.calls[1]![0].operationId).toBe(nextOperationId);
    expect(
      sharedJoinJournalKey({ identity: f.current.identity, database: "other" }),
    ).not.toBe(sharedJoinJournalKey(f.current));
  });
  it("coalesces repeated clicks and does not send if the journal cannot persist", async () => {
    const f = fixture();
    let finish: (() => void) | undefined;
    f.send.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const action = f.make(),
      first = action.join(),
      second = action.join();
    expect(first).toBe(second);
    expect(f.send).toHaveBeenCalledOnce();
    expect(action.discardPending()).toBe(false);
    finish!();
    await first;
    f.journal.write.mockImplementationOnce(() => {
      throw Error("Storage unavailable");
    });
    expect((await action.join()).phase).toBe("error");
    expect(f.send).toHaveBeenCalledOnce();
  });
  it("retains exact u64 revisions and rejects corrupted local requests", async () => {
    const request = {
      characterId,
      shipId,
      operationId,
      expectedShipRevision: 2n ** 63n + 1n,
      expectedAdmissionRevision: 0n,
    };
    expect(decodeSharedJoinRequest(encodeSharedJoinRequest(request))).toEqual(
      request,
    );
    expect(
      decodeSharedJoinRequest(
        encodeSharedJoinRequest({
          ...request,
          expectedShipRevision: 2n ** 64n,
        }),
      ),
    ).toBeUndefined();
    const f = fixture();
    f.journalData.set(sharedJoinJournalKey(f.current), "{}");
    expect((await f.make().join()).phase).toBe("blocked");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("disposal prevents stale request completion from notifying a replacement UI", async () => {
    const f = fixture();
    let finish: (() => void) | undefined;
    f.send.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const action = f.make(),
      changed = vi.fn();
    action.subscribe(changed);
    const request = action.join();
    expect(changed).toHaveBeenCalledOnce();
    action.dispose();
    finish!();
    await request;
    expect(changed).toHaveBeenCalledOnce();
  });
});

describe("account-scoped shared join lifecycle", () => {
  it("detaches an old in-flight account without changing the replacement UI or journal", async () => {
    const f = fixture();
    let resolve!: () => void;
    f.send.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const session = createSharedWorldJoinSession({
      readContext: () => f.current,
      journal: f.journal,
      send: f.send,
      operationId: f.makeId,
    });
    const oldKey = sharedJoinJournalKey(f.current);
    session.select(oldKey);
    const oldRequest = session.join();
    expect(session.getSnapshot().phase).toBe("pending");
    f.current.identity = "b".repeat(64);
    const nextKey = sharedJoinJournalKey(f.current);
    session.select(nextKey);
    expect(session.getSnapshot().phase).toBe("idle");
    await session.join();
    const nextJournal = f.journalData.get(nextKey);
    expect(session.getSnapshot().phase).toBe("submitted");
    resolve();
    await oldRequest;
    expect(session.getSnapshot().phase).toBe("submitted");
    expect(f.journalData.get(nextKey)).toBe(nextJournal);
    expect(f.journalData.has(oldKey)).toBe(true);
  });
  it("can detach and reactivate during effect cleanup while preserving durable retry", async () => {
    const f = fixture();
    const session = createSharedWorldJoinSession({
      readContext: () => f.current,
      journal: f.journal,
      send: f.send,
      operationId: f.makeId,
    });
    const key = sharedJoinJournalKey(f.current);
    session.select(key);
    await session.join();
    session.select(undefined);
    expect(session.getSnapshot().phase).toBe("idle");
    session.select(key);
    await session.join();
    expect(f.send.mock.calls[1]![0]).toEqual(f.send.mock.calls[0]![0]);
  });
});
