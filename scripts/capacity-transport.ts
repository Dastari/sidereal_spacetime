import type { DbConnection } from "../packages/net/src/generated";
import type { ByteCounters } from "./capacity-metrics";
type Factory = Parameters<
  ReturnType<typeof DbConnection.builder>["withWSFn"]
>[0];

/** SDK2.10.2 gzip tag handling. Delivery uses the shipped FIFO promise
 * reservation while inflates run concurrently. Meter payloads without rewriting
 * the generated SDK, auth exchange or production transport. */
export async function decodeCapacityFrame(frame: Uint8Array<ArrayBuffer>) {
  if (frame[0] === 0) return frame.subarray(1);
  if (frame[0] !== 2) throw new Error("CAPACITY_FRAME_TAG");
  const buffer = frame.subarray(1);
  let offset = 0;
  const input = new ReadableStream<BufferSource>({
    pull(controller) {
      if (offset < buffer.length) {
        const next = Math.min(offset + 128 * 1024, buffer.length);
        controller.enqueue(buffer.subarray(offset, next));
        offset = next;
      } else controller.close();
    },
  });
  const reader = input.pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    length += next.value.length;
  }
  const result = new Uint8Array(length);
  offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function meteredWebSocket(counters: ByteCounters): Factory {
  return async ({
    url,
    nameOrAddress,
    wsProtocol,
    authToken,
    compression,
    lightMode,
    confirmedReads,
  }) => {
    if (compression !== "gzip") throw new Error("CAPACITY_COMPRESSION");
    const endpoint = new URL(`v1/database/${nameOrAddress}/subscribe`, url);
    if (authToken) {
      const exchange = new URL("v1/identity/websocket-token", url);
      exchange.protocol = url.protocol === "wss:" ? "https:" : "http:";
      let response: Response;
      try {
        response = await fetch(exchange, {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` },
        });
      } catch {
        throw new Error("CAPACITY_TOKEN_EXCHANGE");
      }
      if (!response.ok) throw new Error("CAPACITY_TOKEN_EXCHANGE");
      const value: unknown = await response.json();
      if (
        !value ||
        typeof value !== "object" ||
        !("token" in value) ||
        typeof value.token !== "string"
      )
        throw new Error("CAPACITY_TOKEN_EXCHANGE");
      endpoint.searchParams.set("token", value.token);
    }
    endpoint.searchParams.set("compression", "Gzip");
    if (lightMode) endpoint.searchParams.set("light", "true");
    if (confirmedReads !== undefined)
      endpoint.searchParams.set("confirmed", String(confirmedReads));
    const socket = new WebSocket(endpoint, wsProtocol);
    socket.binaryType = "arraybuffer";
    let serial = 0,
      lastDelivered = 0;
    return {
      get protocol() {
        return socket.protocol;
      },
      get readyState() {
        return socket.readyState;
      },
      send(data: Uint8Array<ArrayBuffer>) {
        socket.send(data);
        counters.outgoingPayloadBytes += data.byteLength;
        counters.outgoingFrames++;
      },
      close() {
        socket.close();
      },
      set onopen(handler: () => void) {
        socket.onopen = handler;
      },
      set onclose(handler: (event: CloseEvent) => void) {
        socket.onclose = handler;
      },
      set onerror(handler: (event: ErrorEvent) => void) {
        socket.onerror = handler as (event: Event) => void;
      },
      set onmessage(handler: (message: { data: Uint8Array }) => void) {
        let tail: Promise<void> = Promise.resolve();
        socket.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
          const received = ++serial;
          counters.incomingFrames++;
          counters.incomingPayloadBytes += event.data.byteLength;
          const pending = decodeCapacityFrame(new Uint8Array(event.data));
          pending.catch(() => {});
          const previous = tail;
          let release!: () => void;
          tail = new Promise<void>((resolve) => {
            release = resolve;
          });
          try {
            await previous;
            let data: Uint8Array;
            try {
              data = await pending;
            } catch {
              counters.decodeErrors++;
              socket.close();
              return;
            }
            counters.decodedBytes += data.byteLength;
            if (received < lastDelivered) counters.deliveryInversions++;
            lastDelivered = Math.max(received, lastDelivered);
            handler({ data });
          } finally {
            release();
          }
        };
      },
    };
  };
}
