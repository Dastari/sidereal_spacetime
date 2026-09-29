/** RFC 4122 v4 UUID for operation IDs; falls back where randomUUID is unavailable. */
export function uuid() {
  return (
    crypto.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      return (c === "x" ? r : (r & 3) | 8).toString(16);
    })
  );
}
