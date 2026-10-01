/** Pure resource ownership rules; admission and actual readiness belong to the scene adapter. */
export interface CompleteOperatorAssets {
  /** Supplied only by an adapter that verified every requested visual and material. */
  state: "verified-complete";
  requestedKey: string;
  associationKey: string;
  activate(): void;
  dispose(): void;
}

export interface OperatorAssetTicket {
  readonly generation: number;
  readonly requestedKey: string;
  readonly associationKey: string;
}

export interface OperatorAcceptedState {
  associationKey: string;
  pose: "none" | "occupied" | "recovering";
  dead: boolean;
  connected: boolean;
  /** Accepted coordinates from the same outer server row as pose. */
  acceptedX: number;
  acceptedY: number;
}

export interface OperatorRecoveryReceipt {
  readonly transferred: boolean;
  assertCurrent(): void;
  /** Mark a successful independently complete ordinary ownership transfer before callbacks/cleanup. */
  transfer(): void;
}

/** No scene, global cache, inventory identity, Promise-based readiness or geometry mutation. */
export function createOperatorAssetTransaction(
  options: {
    restoreAtAcceptedRecovery?: (
      handle: CompleteOperatorAssets,
      position: readonly [number, number],
      receipt: OperatorRecoveryReceipt,
    ) => void;
  } = {},
) {
  let generation = 0;
  let wanted: OperatorAssetTicket | null = null;
  let staged: CompleteOperatorAssets | null = null;
  let committed: CompleteOperatorAssets | null = null;
  let committedGeneration: number | null = null;
  let accepted: OperatorAcceptedState | null = null;
  let error: { generation: number; message: string } | null = null;
  let withdrawn = false;
  const disposed = new WeakSet<CompleteOperatorAssets>();
  const release = (handle: CompleteOperatorAssets | null) => {
    if (!handle || disposed.has(handle)) return;
    disposed.add(handle);
    handle.dispose();
  };
  const current = (ticket: OperatorAssetTicket) =>
    !withdrawn &&
    wanted?.generation === ticket.generation &&
    wanted.requestedKey === ticket.requestedKey &&
    wanted.associationKey === ticket.associationKey &&
    accepted?.associationKey === ticket.associationKey &&
    accepted.pose === "occupied" &&
    !accepted.dead &&
    accepted.connected;
  function cancel() {
    generation++;
    wanted = null;
    error = null;
    const obsolete = staged;
    staged = null;
    release(obsolete);
  }
  return {
    /** New association cancels old fitted ownership; never re-parent old station transforms. */
    accept(state: OperatorAcceptedState) {
      if (
        !state.associationKey ||
        !Number.isFinite(state.acceptedX) ||
        !Number.isFinite(state.acceptedY)
      )
        throw Error("Coherent accepted operator state required");
      withdrawn = false;
      const changed =
        accepted && accepted.associationKey !== state.associationKey;
      if (changed) {
        cancel();
        const obsolete = committed;
        committed = null;
        committedGeneration = null;
        release(obsolete);
      }
      accepted = { ...state };
      if (state.pose !== "occupied" || state.dead || !state.connected) cancel();
      // Invalidated/recovering resources remain visible. Restore only at coherent recovery XY.
      if (state.pose === "none" && committed) {
        const handle = committed;
        const recoveryGeneration = generation;
        const ownsRecovery = () =>
          !withdrawn &&
          generation === recoveryGeneration &&
          accepted?.associationKey === state.associationKey &&
          accepted.pose === "none" &&
          accepted.dead === state.dead &&
          accepted.connected === state.connected &&
          accepted.acceptedX === state.acceptedX &&
          accepted.acceptedY === state.acceptedY;
        let transferred = false;
        const receipt: OperatorRecoveryReceipt = {
          get transferred() {
            return transferred;
          },
          assertCurrent() {
            if (!ownsRecovery() || (!transferred && committed !== handle))
              throw Error("Operator recovery superseded");
          },
          transfer() {
            this.assertCurrent();
            if (transferred) return;
            transferred = true;
            committed = null;
            committedGeneration = null;
          },
        };
        try {
          options.restoreAtAcceptedRecovery?.(
            handle,
            [state.acceptedX, state.acceptedY],
            receipt,
          );
          if (!transferred) receipt.transfer();
        } catch (cause) {
          if (ownsRecovery())
            error = {
              generation: recoveryGeneration,
              message:
                cause instanceof Error
                  ? cause.message
                  : "Crew equipment unavailable",
            };
        } finally {
          if (transferred) {
            try {
              release(handle);
            } catch (cause) {
              if (ownsRecovery())
                error = {
                  generation: recoveryGeneration,
                  message:
                    cause instanceof Error
                      ? cause.message
                      : "Crew equipment cleanup unavailable",
                };
            }
          }
        }
      }
    },
    request(requestedKey: string) {
      if (
        withdrawn ||
        !accepted ||
        accepted.pose !== "occupied" ||
        accepted.dead ||
        !accepted.connected
      )
        throw Error("Occupied coherent operator association required");
      if (!requestedKey) throw Error("Canonical requested visual key required");
      if (
        wanted?.requestedKey === requestedKey &&
        wanted.associationKey === accepted.associationKey
      )
        return wanted;
      cancel();
      wanted = {
        generation,
        requestedKey,
        associationKey: accepted.associationKey,
      };
      return wanted;
    },
    /** Adapter completeness is explicit; a resolved Promise or pending=0 is insufficient. */
    complete(ticket: OperatorAssetTicket, handle: CompleteOperatorAssets) {
      if (
        !current(ticket) ||
        handle.state !== "verified-complete" ||
        handle.requestedKey !== ticket.requestedKey ||
        handle.associationKey !== ticket.associationKey ||
        disposed.has(handle)
      ) {
        // A duplicate completion cannot dispose the already committed handle.
        if (handle !== committed) release(handle);
        return false;
      }
      if (committed === handle) {
        committedGeneration = ticket.generation;
        error = null;
        return true;
      }
      if (staged === handle) return false;
      const previousCommitted = committed;
      const previousStaged = staged;
      staged = handle;
      release(previousStaged);
      if (!current(ticket) || staged !== handle || disposed.has(handle)) {
        if (staged === handle) staged = null;
        release(handle);
        return false;
      }
      try {
        handle.activate();
      } catch (cause) {
        const ownsFailure =
          current(ticket) &&
          staged === handle &&
          committed === previousCommitted;
        if (staged === handle) staged = null;
        release(handle);
        if (
          ownsFailure &&
          current(ticket) &&
          committed === previousCommitted &&
          staged === null
        )
          error = {
            generation: ticket.generation,
            message: cause instanceof Error ? cause.message : String(cause),
          };
        return false;
      }
      // Activation can synchronously trigger a newer row/request or withdrawal.
      if (
        !current(ticket) ||
        staged !== handle ||
        committed !== previousCommitted ||
        disposed.has(handle)
      ) {
        release(handle);
        if (staged === handle) staged = null;
        return false;
      }
      const old = committed;
      committed = handle;
      committedGeneration = ticket.generation;
      staged = null;
      error = null;
      release(old);
      return true;
    },
    fail(ticket: OperatorAssetTicket, message: string) {
      if (!current(ticket)) return false;
      error = { generation: ticket.generation, message };
      return true;
    },
    /** Qualification stops immediately; same-association stationary resources stay owned. */
    invalidate() {
      cancel();
    },
    /** Filtered body withdrawal owns immediate resource/blocker cleanup. */
    withdraw() {
      withdrawn = true;
      accepted = null;
      cancel();
      const obsolete = committed;
      committed = null;
      committedGeneration = null;
      release(obsolete);
    },
    get committed() {
      return committed;
    },
    get qualifiesCurrentRequest() {
      return (
        !!wanted &&
        current(wanted) &&
        committedGeneration === wanted.generation &&
        committed?.requestedKey === wanted.requestedKey &&
        committed.associationKey === wanted.associationKey &&
        !error
      );
    },
    get pending() {
      return !!wanted && !this.qualifiesCurrentRequest && !error;
    },
    get error() {
      return error && error.generation === generation ? error.message : null;
    },
    /** Future scene adapter may feed this into the existing loading predicate. */
    get blocksLateFirstOrError() {
      return !!this.error || (this.pending && !committed);
    },
  };
}
