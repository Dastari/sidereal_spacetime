import { expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { decodeCapacityFrame } from "./capacity-transport";
it("decodes actual SDK gzip/tagged binary payloads without altering bytes", async () => {
  const plain = Uint8Array.from({ length: 300_000 }, (_, i) => i % 251);
  const compressed = gzipSync(plain);
  const frame = new Uint8Array(compressed.length + 1);
  frame[0] = 2;
  frame.set(compressed, 1);
  expect(await decodeCapacityFrame(frame)).toEqual(plain);
  expect(await decodeCapacityFrame(Uint8Array.of(0, 1, 2, 3))).toEqual(
    Uint8Array.of(1, 2, 3),
  );
  await expect(decodeCapacityFrame(Uint8Array.of(9, 1))).rejects.toThrow(
    "CAPACITY_FRAME_TAG",
  );
  await expect(decodeCapacityFrame(Uint8Array.of(2, 1, 2))).rejects.toThrow();
});

import { vi } from "vitest";
import { byteCounters } from "./capacity-metrics";
import { meteredWebSocket } from "./capacity-transport";

it("matches SDK2.10.2 delivery order for large gzip followed by small uncompressed frames", async () => {
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    protocol = "v2.bsatn.spacetimedb";
    readyState = 1;
    binaryType = "arraybuffer";
    onmessage: ((event: MessageEvent<ArrayBuffer>) => Promise<void>) | null =
      null;
    send = vi.fn();
    close = vi.fn();
    constructor() {
      sockets.push(this);
    }
  }
  vi.stubGlobal("WebSocket", FakeSocket);
  try {
    const counters = byteCounters();
    const adapter = await meteredWebSocket(counters)({
      url: new URL("http://127.0.0.1:3151"),
      nameOrAddress: "fixture-smoke",
      wsProtocol: ["v2.bsatn.spacetimedb"],
      compression: "gzip",
      lightMode: false,
    });
    const plain = new Uint8Array(1_000_000).fill(7),
      compressed = gzipSync(plain);
    const large = new Uint8Array(compressed.length + 1);
    large[0] = 2;
    large.set(compressed, 1);
    const small = Uint8Array.of(0, 9);
    const received: number[] = [];
    adapter.onmessage = ({ data }) => {
      received.push(data[0]);
    };
    await Promise.all([
      sockets[0].onmessage!({
        data: large.buffer,
      } as MessageEvent<ArrayBuffer>),
      sockets[0].onmessage!({
        data: small.buffer,
      } as MessageEvent<ArrayBuffer>),
    ]);
    expect(received).toEqual([7, 9]);
    expect(counters.incomingPayloadBytes).toBe(
      large.byteLength + small.byteLength,
    );
    expect(counters.decodedBytes).toBe(plain.byteLength + 1);
    expect(counters.incomingFrames).toBe(2);
    expect(counters.deliveryInversions).toBe(0);
    expect(counters.decodeErrors).toBe(0);
    adapter.send(Uint8Array.of(1, 2, 3));
    expect(counters.outgoingPayloadBytes).toBe(3);
    expect(counters.outgoingFrames).toBe(1);
    adapter.onmessage = () => {
      throw Error("intentional consumer exception");
    };
    const rejected = await Promise.allSettled([
      sockets[0].onmessage!({
        data: small.buffer,
      } as MessageEvent<ArrayBuffer>),
      sockets[0].onmessage!({
        data: small.buffer,
      } as MessageEvent<ArrayBuffer>),
    ]);
    expect(rejected.every((result) => result.status === "rejected")).toBe(true);
    expect(counters.decodeErrors).toBe(0);
    adapter.onmessage = ({ data }) => {
      received.push(data[0]);
    };
    await sockets[0].onmessage!({
      data: Uint8Array.of(2, 1, 2).buffer,
    } as MessageEvent<ArrayBuffer>);
    expect(counters.decodeErrors).toBe(1);
    expect(sockets[0].close).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
