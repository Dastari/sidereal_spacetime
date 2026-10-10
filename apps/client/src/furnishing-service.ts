import {
  createServiceWindow,
  type ServiceRow,
} from "@sidereal/canvas-ui/service-window";
import {
  furnishingRequest,
  type FurnishingRequest,
} from "./furnishing-command";
export function openFurnishingConfirmation(
  readInstance: () => {
    id: string;
    furnishingsJson?: string;
    furnishingRevision?: bigint;
  },
  placementId: string,
  name: string,
  submit: (request: FurnishingRequest) => Promise<unknown>,
  close: () => void,
  invalidate: () => void,
) {
  let pending = false,
    error = "",
    previous: FurnishingRequest | undefined,
    disposed = false;
  const apply = async (retry = false) => {
    if (disposed || pending) return;
    const request =
      retry && previous
        ? previous
        : furnishingRequest(readInstance(), placementId, "delete");
    previous = request;
    pending = true;
    error = "";
    invalidate();
    try {
      await submit(request);
      if (!disposed) close();
    } catch (e) {
      if (!disposed) error = String(e);
    } finally {
      pending = false;
      if (!disposed) invalidate();
    }
  };
  const display = createServiceWindow(() => {
    const rows: ServiceRow[] = [
      {
        kind: "text",
        text: "Remove this furnishing from your ship?",
        tone: "normal",
      },
      {
        kind: "text",
        text: "Occupied seats and storage with items or liquids must be cleared first.",
      },
      {
        kind: "button",
        id: "delete-cancel",
        text: "Cancel",
        disabled: pending,
        run: close,
      },
      {
        kind: "button",
        id: "delete-furnishing",
        text: pending ? "Deleting…" : "Delete furnishing",
        danger: true,
        disabled: pending || !!error,
        pending,
        run: () => void apply(),
      },
    ];
    if (error)
      rows.push(
        { kind: "text", text: error, tone: "error" },
        {
          kind: "button",
          id: "delete-retry",
          text: "Retry same request",
          disabled: pending,
          run: () => void apply(true),
        },
        {
          kind: "button",
          id: "delete-new",
          text: "Use current placement",
          disabled: pending,
          run: () => {
            previous = undefined;
            error = "";
            invalidate();
          },
        },
      );
    return { title: `Delete ${name}`, rows, pending };
  }, close);
  return {
    display,
    dispose() {
      disposed = true;
    },
  };
}
