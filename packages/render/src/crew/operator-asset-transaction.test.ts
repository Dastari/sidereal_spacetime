import { expect, test, vi } from "vitest";
import {
  createOperatorAssetTransaction,
  type CompleteOperatorAssets,
  type OperatorAcceptedState,
} from "./operator-asset-transaction";

const occupied: OperatorAcceptedState = {
  associationKey: "actor/instance/visit/station/epoch",
  pose: "occupied",
  acceptedX: 0,
  acceptedY: 3.5,
  dead: false,
  connected: true,
};
function complete(requestedKey: string, activate: () => void = vi.fn()) {
  return {
    state: "verified-complete" as const,
    requestedKey,
    associationKey: occupied.associationKey,
    activate,
    dispose: vi.fn(),
  };
}

test("first loading blocks; a verified complete adapter handle commits atomically", () => {
  const owner = createOperatorAssetTransaction();
  owner.accept(occupied);
  const ticket = owner.request("pinned-body+all-requested-visuals");
  expect(owner.pending).toBe(true);
  expect(owner.blocksLateFirstOrError).toBe(true);
  const handle = complete(ticket.requestedKey);
  expect(owner.complete(ticket, handle)).toBe(true);
  expect(handle.activate).toHaveBeenCalledOnce();
  expect(owner.qualifiesCurrentRequest).toBe(true);
  expect(owner.blocksLateFirstOrError).toBe(false);
});

test("nested completion cannot be overwritten by the outer activation", () => {
  const owner = createOperatorAssetTransaction();
  owner.accept(occupied);
  const ticket = owner.request("same-key");
  const inner = complete("same-key");
  const outer = complete("same-key", () => {
    expect(owner.complete(ticket, inner)).toBe(true);
  });
  expect(owner.complete(ticket, outer)).toBe(false);
  expect(owner.committed).toBe(inner);
  expect(owner.qualifiesCurrentRequest).toBe(true);
  expect(outer.dispose).toHaveBeenCalledOnce();
  expect(inner.dispose).not.toHaveBeenCalled();
});

test("known pending replacement retains old visible ownership without global block", () => {
  const owner = createOperatorAssetTransaction();
  owner.accept(occupied);
  const first = owner.request("first"),
    old = complete("first");
  owner.complete(first, old);
  const next = owner.request("next");
  expect(owner.committed).toBe(old);
  expect(owner.pending).toBe(true);
  expect(owner.qualifiesCurrentRequest).toBe(false);
  expect(owner.blocksLateFirstOrError).toBe(false);
  expect(old.dispose).not.toHaveBeenCalled();
  owner.fail(next, "missing requested part");
  expect(owner.blocksLateFirstOrError).toBe(true);
  expect(owner.committed).toBe(old);
  const replacement = complete("next");
  owner.complete(next, replacement);
  expect(old.dispose).toHaveBeenCalledOnce();
  expect(owner.error).toBeNull();
  expect(owner.committed).toBe(replacement);
});

test("Promise/pending=0 or incomplete handle cannot establish completeness", () => {
  const owner = createOperatorAssetTransaction();
  owner.accept(occupied);
  const ticket = owner.request("first");
  const partial = { ...complete("first"), state: "pending", pending: 0 };
  expect(
    owner.complete(ticket, partial as unknown as CompleteOperatorAssets),
  ).toBe(false);
  expect(partial.activate).not.toHaveBeenCalled();
  expect(partial.dispose).toHaveBeenCalledOnce();
  expect(owner.qualifiesCurrentRequest).toBe(false);
});

test("stale completion releases its own handle once and cannot clear new errors", () => {
  const owner = createOperatorAssetTransaction();
  owner.accept(occupied);
  const stale = owner.request("old"),
    next = owner.request("new");
  owner.fail(next, "new error");
  const obsolete = complete("old");
  expect(owner.complete(stale, obsolete)).toBe(false);
  expect(owner.complete(stale, obsolete)).toBe(false);
  expect(obsolete.dispose).toHaveBeenCalledOnce();
  expect(owner.fail(stale, "old error")).toBe(false);
  expect(owner.error).toBe("new error");
});

test("invalidation retains stationary resources, not current qualification", () => {
  const restore = vi.fn(),
    owner = createOperatorAssetTransaction({
      restoreAtAcceptedRecovery: restore,
    });
  owner.accept(occupied);
  const ticket = owner.request("first"),
    handle = complete("first");
  owner.complete(ticket, handle);
  owner.invalidate();
  expect(owner.committed).toBe(handle);
  expect(owner.qualifiesCurrentRequest).toBe(false);
  expect(handle.dispose).not.toHaveBeenCalled();
  owner.accept({ ...occupied, pose: "recovering" });
  expect(restore).not.toHaveBeenCalled();
  owner.accept({ ...occupied, pose: "none", acceptedY: 2.625 });
  expect(restore).toHaveBeenCalledWith(
    handle,
    [0, 2.625],
    expect.objectContaining({ transferred: true }),
  );
  expect(handle.dispose).toHaveBeenCalledOnce();
  expect(owner.committed).toBeNull();
});

test("retained matching key does not qualify a fresh generation without completion", () => {
  const owner = createOperatorAssetTransaction();
  owner.accept(occupied);
  const ticket = owner.request("same"),
    handle = complete("same");
  owner.complete(ticket, handle);
  owner.invalidate();
  const rechecked = owner.request("same");
  expect(rechecked.generation).not.toBe(ticket.generation);
  expect(owner.qualifiesCurrentRequest).toBe(false);
  owner.complete(rechecked, handle);
  expect(owner.qualifiesCurrentRequest).toBe(true);
  expect(handle.dispose).not.toHaveBeenCalled();
});

test("changed association and access withdrawal cancel ownership without stale restore", () => {
  const restore = vi.fn(),
    owner = createOperatorAssetTransaction({
      restoreAtAcceptedRecovery: restore,
    });
  owner.accept(occupied);
  const first = owner.request("first"),
    old = complete("first");
  owner.complete(first, old);
  owner.accept({ ...occupied, associationKey: "new-instance/visit" });
  expect(old.dispose).toHaveBeenCalledOnce();
  expect(restore).not.toHaveBeenCalled();
  const next = owner.request("next");
  owner.withdraw();
  const late = { ...complete("next"), associationKey: "new-instance/visit" };
  expect(owner.complete(next, late)).toBe(false);
  expect(late.dispose).toHaveBeenCalledOnce();
  expect(owner.blocksLateFirstOrError).toBe(false);
});

test.each([{ dead: true }, { connected: false }])(
  "same-association life invalidation %j retains resources but cancels pending ownership",
  (change) => {
    const owner = createOperatorAssetTransaction();
    owner.accept(occupied);
    const ticket = owner.request("first"),
      handle = complete("first");
    owner.complete(ticket, handle);
    owner.accept({ ...occupied, ...change });
    expect(owner.qualifiesCurrentRequest).toBe(false);
    expect(owner.committed).toBe(handle);
    expect(() => owner.request("other")).toThrow();
  },
);

test("synchronous new row during activation cannot commit or clear a newer error", () => {
  const owner = createOperatorAssetTransaction();
  owner.accept(occupied);
  const ticket = owner.request("old");
  const handle = complete(
    "old",
    vi.fn(() => {
      const latest = owner.request("new");
      owner.fail(latest, "new error");
      throw Error("obsolete activation error");
    }),
  );
  expect(owner.complete(ticket, handle)).toBe(false);
  expect(handle.dispose).toHaveBeenCalledOnce();
  expect(owner.error).toBe("new error");
  expect(owner.committed).toBeNull();
});

test.each(["invalidate", "withdraw"] as const)(
  "synchronous %s during activation does not adopt the obsolete handle",
  (operation) => {
    const owner = createOperatorAssetTransaction();
    owner.accept(occupied);
    const ticket = owner.request("first");
    const handle = complete(
      "first",
      vi.fn(() => owner[operation]()),
    );
    expect(owner.complete(ticket, handle)).toBe(false);
    expect(handle.dispose).toHaveBeenCalledOnce();
    expect(owner.committed).toBeNull();
    expect(owner.qualifiesCurrentRequest).toBe(false);
  },
);

test("failed ordinary recovery before transfer retains resources and retries only the new coherent none tuple", () => {
  let ready = false;
  const restored: number[][] = [];
  const owner = createOperatorAssetTransaction({
    restoreAtAcceptedRecovery: (_handle, xy, receipt) => {
      if (!ready) throw Error("ordinary materials changed");
      receipt.assertCurrent();
      restored.push([...xy]);
      receipt.transfer();
    },
  });
  owner.accept(occupied);
  const ticket = owner.request("first"),
    handle = complete("first");
  owner.complete(ticket, handle);
  owner.accept({
    ...occupied,
    pose: "none",
    acceptedX: 3,
    acceptedY: 4,
    dead: true,
  });
  expect(owner.committed).toBe(handle);
  expect(handle.dispose).not.toHaveBeenCalled();
  expect(owner.qualifiesCurrentRequest).toBe(false);
  expect(owner.error).toBe("ordinary materials changed");
  ready = true;
  owner.accept({
    ...occupied,
    pose: "none",
    acceptedX: 5,
    acceptedY: 6,
    dead: true,
  });
  expect(restored).toEqual([[5, 6]]);
  expect(owner.committed).toBeNull();
  expect(handle.dispose).toHaveBeenCalledOnce();
  owner.withdraw();
  expect(handle.dispose).toHaveBeenCalledOnce();
});

test("an exception after ordinary transfer never recaptures or double-disposes the physical handle", () => {
  const owner = createOperatorAssetTransaction({
    restoreAtAcceptedRecovery: (_handle, _xy, receipt) => {
      receipt.transfer();
      throw Error("ordinary is already owned by the scene");
    },
  });
  owner.accept(occupied);
  const ticket = owner.request("first"),
    handle = complete("first");
  owner.complete(ticket, handle);
  owner.accept({ ...occupied, pose: "none" });
  expect(owner.committed).toBeNull();
  expect(handle.dispose).toHaveBeenCalledOnce();
  expect(owner.error).toBe("ordinary is already owned by the scene");
  owner.withdraw();
  expect(handle.dispose).toHaveBeenCalledOnce();
});

test("reentrant context replacement during ordinary activation cannot transfer stale recovery", () => {
  const owner = createOperatorAssetTransaction({
    restoreAtAcceptedRecovery: (_handle, _xy, receipt) => {
      owner.accept({ ...occupied, associationKey: "new-visit" });
      receipt.transfer();
    },
  });
  owner.accept(occupied);
  const ticket = owner.request("first"),
    handle = complete("first");
  owner.complete(ticket, handle);
  owner.accept({ ...occupied, pose: "none" });
  expect(owner.committed).toBeNull();
  expect(handle.dispose).toHaveBeenCalledOnce();
  expect(owner.error).toBeNull();
  const next = owner.request("current");
  expect(next.associationKey).toBe("new-visit");
});
