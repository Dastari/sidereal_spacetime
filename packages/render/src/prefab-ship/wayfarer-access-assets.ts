import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  SHIP_ACCESS_DOOR_PACK,
  type ShipAccessDoorPiece,
} from "@sidereal/content/ship-access-doors";
import { WAYFARER_ACCESS_PHYSICAL } from "@sidereal/content/wayfarer-access-profile";

const cache = new Map<string, Promise<Uint8Array>>();

/** Only immutable published native parts; catalogue bytes never authorize live access. */
export function publishedShipAccessBytes(
  piece: ShipAccessDoorPiece,
): Promise<Uint8Array> {
  const inPack = (pieces: readonly { file: string; sha256: string }[]) =>
    pieces.some((p) => p.file === piece.file && p.sha256 === piece.sha256);
  const prefix = inPack(WAYFARER_ACCESS_PHYSICAL.pieces)
    ? "/assets/wayfarer-access/r002"
    : inPack(SHIP_ACCESS_DOOR_PACK.pieces)
      ? "/assets/ship-access/r002"
      : undefined;
  if (!prefix)
    return Promise.reject(Error("Unpublished access model revision"));
  let pending = cache.get(piece.sha256);
  if (!pending) {
    pending = fetch(`${prefix}/${piece.file}`)
      .then(async (response) => {
        if (!response.ok) throw Error("Published access model unavailable");
        const data = new Uint8Array(await response.arrayBuffer());
        if (bytesToHex(sha256(data)) !== piece.sha256)
          throw Error("Changed pinned access model");
        return data;
      })
      .catch((error) => {
        cache.delete(piece.sha256);
        throw error;
      });
    cache.set(piece.sha256, pending);
  }
  return pending;
}
