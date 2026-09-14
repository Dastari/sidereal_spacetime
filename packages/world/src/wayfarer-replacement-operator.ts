import { SenderError } from "spacetimedb/server";
/** Deployment identity already owns this database. No game account can invoke maintenance. */
export const WAYFARER_REPLACEMENT_OPERATOR =
  "c2005c42b5bdfffcfba7f99d5313dc8b1a3a3db7b8ba5453cc010c39d50387be";
export function requireWayfarerReplacementOperator(ctx: {
  sender: { toHexString(): string };
}) {
  if (ctx.sender.toHexString() !== WAYFARER_REPLACEMENT_OPERATOR)
    throw new SenderError("Deployment operator required for ship replacement");
}
