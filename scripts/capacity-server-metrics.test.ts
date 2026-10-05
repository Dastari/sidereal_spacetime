import { expect, it, vi } from "vitest";
import {
  createServerMetrics,
  counterDeltas,
  histogramDeltas,
  metricsEndpoint,
  parseServerMetrics,
} from "./capacity-server-metrics";

const tables = new Set(["own_characters"]);
function histogram(
  name: string,
  dimension: string,
  count: number,
  sum: number,
  bins: number[],
) {
  return [
    ...["0.001", "0.01", "0.1", "+Inf"].map(
      (le, i) =>
        `${name}_bucket{db="PRIVATE_ID",${dimension},le="${le}"} ${bins[i]}`,
    ),
    `${name}_sum{db="PRIVATE_ID",${dimension}} ${sum}`,
    `${name}_count{db="PRIVATE_ID",${dimension}} ${count}`,
  ].join("\n");
}
function sample(count: number) {
  return [
    ...["set_intent", "step_world"].flatMap((reducer) => [
      `reducer_wasm_time_usec{db="PRIVATE_ID",reducer="${reducer}"} ${count * 1000}`,
      `view_calls_triggered_by_reducer{db="PRIVATE_ID",reducer="${reducer}"} ${count * 20}`,
    ]),
    ...["set_intent", "step_world"].flatMap((reducer) =>
      [
        "spacetime_reducer_wait_time_sec",
        "spacetime_reducer_plus_query_duration_sec",
      ].map((metric) =>
        histogram(metric, `reducer="${reducer}"`, count, count * 0.005, [
          0,
          count,
          count,
          count,
        ]),
      ),
    ),
    histogram(
      "spacetime_scheduled_function_delay_seconds",
      'function="step_world"',
      count,
      count * 0.005,
      [0, count, count, count],
    ),
    histogram(
      "spacetime_websocket_serialize_secs",
      'db="PRIVATE_ID"',
      count,
      count * 0.005,
      [0, count, count, count],
    ),
    ...[
      "spacetime_worker_v8_request_queue_length",
      "spacetime_subscription_send_queue_length",
      "spacetime_total_incoming_queue_length",
      "spacetime_total_outgoing_queue_length",
    ].map((name) => `${name}{database_identity="PRIVATE_ID"} 3`),
    'spacetime_worker_instance_operation_queue_length{database_identity="PRIVATE_ID"} 3',
  ].join("\n");
}

it("strips private/escaped labels and unknown functions/tables before evidence construction", () => {
  const raw = [
    sample(5),
    histogram(
      "spacetime_reducer_wait_time_sec",
      'reducer="PRIVATE_REDUCER"',
      5,
      1,
      [0, 0, 5, 5],
    ),
    histogram(
      "spacetime_subscription_query_execution_time_micros",
      'table="PRIVATE_TABLE"',
      5,
      1,
      [0, 0, 5, 5],
    ),
    histogram(
      "spacetime_subscription_query_execution_time_micros",
      'table="own_characters",unindexed_columns="PRIVATE_COLUMNS"',
      5,
      1,
      [0, 0, 5, 5],
    ),
    'spacetime_total_incoming_queue_length{db="escaped\\\"private\\\\label\\nvalue"} 2',
    'arbitrary_secret_metric{secret="TOKEN"} NaN',
  ].join("\n");
  const parsed = parseServerMetrics(raw, tables);
  const encoded = JSON.stringify(parsed);
  for (const secret of [
    "PRIVATE",
    "TOKEN",
    "escaped",
    "private",
    "label",
    "value",
    "unindexed_columns",
    "database_identity",
  ])
    expect(encoded).not.toContain(secret);
  expect(Object.keys(parsed.histograms)).toHaveLength(7);
  expect(parsed.gauges.spacetime_total_incoming_queue_length).toBe(5);
});

it("reports delta means and percentile bucket intervals without fabricated exact percentiles", () => {
  const name = "spacetime_reducer_wait_time_sec";
  const before = parseServerMetrics(
    histogram(name, 'reducer="set_intent"', 20, 0.2, [10, 15, 20, 20]),
    tables,
  );
  const after = parseServerMetrics(
    histogram(name, 'reducer="set_intent"', 120, 6.45, [20, 75, 115, 120]),
    tables,
  );
  expect(histogramDeltas(before, after)[`${name}:set_intent`]).toEqual({
    valid: true,
    count: 100,
    sum: 6.25,
    mean: 0.0625,
    p50Bucket: { lower: 0.001, upper: 0.01 },
    p95Bucket: { lower: 0.01, upper: 0.1 },
    p99Bucket: { lower: 0.1, upper: null },
    unit: "seconds",
  });
  expect(histogramDeltas(after, after)[`${name}:set_intent`]).toMatchObject({
    count: 0,
    mean: null,
    p95Bucket: null,
  });
  expect(histogramDeltas(after, before)[`${name}:set_intent`]).toMatchObject({
    valid: false,
  });
});

it("rejects partial, nonmonotonic and missing histogram counters instead of reporting zeros", () => {
  const name = "spacetime_reducer_wait_time_sec";
  const empty = parseServerMetrics("", tables);
  for (const raw of [
    histogram(name, 'reducer="set_intent"', 5, 1, [0, 4, 3, 5]),
    histogram(name, 'reducer="set_intent"', 5, 1, [0, 3, 5, 4]),
    `${name}_bucket{reducer="set_intent",le="+Inf"} 0`,
  ]) {
    expect(
      histogramDeltas(empty, parseServerMetrics(raw, tables))[
        `${name}:set_intent`
      ],
    ).toMatchObject({ valid: false });
  }
  expect(() =>
    parseServerMetrics(`${name}_count{db="DO_NOT_PRINT"} NaN`, tables),
  ).toThrow("CAPACITY_METRICS_PARSE");
  expect(() =>
    parseServerMetrics(`${name}_count{db="unterminated} 3`, tables),
  ).toThrow("CAPACITY_METRICS_PARSE");
});

it("refuses main, remote, credential-bearing and ambiguous targets", () => {
  expect(metricsEndpoint("http://127.0.0.1:3153").pathname).toBe("/v1/metrics");
  for (const url of [
    "http://127.0.0.1:3100",
    "http://remote:3153",
    "https://127.0.0.1:3153",
    "http://secret@localhost:3153",
    "http://localhost:3153/?token=x",
    "http://localhost:3153/path",
    "http://localhost",
    "INVALID_SECRET_HOST",
  ]) {
    expect(() => metricsEndpoint(url)).toThrow("CAPACITY_METRICS_TARGET");
  }
});

it("bounds concurrent polls, cleans its timer and leaves workload return values unchanged", async () => {
  vi.useFakeTimers();
  try {
    let calls = 0,
      active = 0,
      maxActive = 0;
    const fetcher = vi.fn(async () => {
      const n = ++calls;
      maxActive = Math.max(maxActive, ++active);
      if (n === 2) await new Promise((resolve) => setTimeout(resolve, 400));
      active--;
      return new Response(sample(n));
    });
    const collector = createServerMetrics(
      "http://127.0.0.1:3153",
      tables,
      fetcher,
    );
    const result = collector.measure("walking", async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
      return 42;
    });
    await vi.advanceTimersByTimeAsync(1200);
    expect(await result).toBe(42);
    expect(maxActive).toBe(1);
    expect(collector.reports[0]).toMatchObject({
      qualified: true,
      samples: 3,
      failures: 0,
      skippedPolls: 1,
    });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("contains scrape exceptions and still records diagnostics when the game work fails", async () => {
  const collector = createServerMetrics(
    "http://127.0.0.1:3153",
    tables,
    vi.fn(async () => {
      throw Error("SECRET_RAW_FAILURE");
    }),
  );
  await expect(
    collector.measure("walking", async () => {
      throw Error("work failed");
    }),
  ).rejects.toThrow("work failed");
  expect(collector.reports[0]).toMatchObject({
    qualified: false,
    samples: 0,
    failures: 2,
  });
  expect(JSON.stringify(collector.reports)).not.toContain("SECRET");
});

it("qualifies V8 execution coverage while explicitly reporting unavailable wait timers", async () => {
  let calls = 0;
  const fetcher = vi.fn(
    async () =>
      new Response(
        sample(++calls)
          .split("\n")
          .filter((line) => !line.startsWith("spacetime_reducer_wait_time_sec"))
          .join("\n"),
      ),
  );
  const collector = createServerMetrics(
    "http://127.0.0.1:3153",
    tables,
    fetcher,
  );
  await collector.measure("walking", async () => {});
  expect(collector.reports[0]).toMatchObject({
    qualified: true,
    coverage: "v8-execution-and-sampled-queues",
    unavailableHistograms: expect.arrayContaining([
      "spacetime_reducer_wait_time_sec:step_world",
      "spacetime_reducer_wait_time_sec:set_intent",
    ]),
  });
  const missing = createServerMetrics(
    "http://127.0.0.1:3153",
    tables,
    vi.fn(
      async () =>
        new Response(
          sample(++calls)
            .split("\n")
            .filter(
              (line) =>
                !line.startsWith("spacetime_worker_v8_request_queue_length"),
            )
            .join("\n"),
        ),
    ),
  );
  await missing.measure("walking", async () => {});
  expect(missing.reports[0]).toMatchObject({ qualified: false });
});

it("whitelists VM/view counters and fails closed on missing or reset counters", () => {
  const raw = (n: number) =>
    [
      `view_call_time_usec{db="PRIVATE_ID",view="own_characters"} ${n}`,
      `view_total_time_usec{db="PRIVATE_ID",view="PRIVATE_VIEW"} ${n}`,
      `reducer_wasm_time_usec{db="PRIVATE_ID",reducer="step_world"} ${n}`,
      `reducer_wasm_time_usec{db="PRIVATE_ID",reducer="PRIVATE_REDUCER"} ${n}`,
    ].join("\n");
  const before = parseServerMetrics(raw(10), tables),
    after = parseServerMetrics(raw(30), tables);
  expect(JSON.stringify(after)).not.toContain("PRIVATE");
  expect(counterDeltas(before, after)).toEqual({
    "view_call_time_usec:own_characters": {
      valid: true,
      value: 20,
      unit: "microseconds",
    },
    "reducer_wasm_time_usec:step_world": {
      valid: true,
      value: 20,
      unit: "microseconds",
    },
  });
  expect(
    counterDeltas(after, before)["view_call_time_usec:own_characters"],
  ).toMatchObject({ valid: false });
  expect(
    counterDeltas(after, parseServerMetrics("", tables))[
      "reducer_wasm_time_usec:step_world"
    ],
  ).toMatchObject({ valid: false });
});
