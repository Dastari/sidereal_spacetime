import { distribution } from "./capacity-metrics";

// Pinned server 2.10.0 names. Values/labels outside these allowlists never enter
// a receipt; the managed harness starts one fresh database per owned process.
const histograms = {
  spacetime_reducer_wait_time_sec: "reducer",
  spacetime_reducer_plus_query_duration_sec: "reducer",
  spacetime_request_round_trip_time: "reducer_symbol",
  spacetime_scheduled_function_delay_seconds: "function",
  spacetime_websocket_serialize_secs: "aggregate",
  spacetime_subscription_query_execution_time_micros: "table",
  spacetime_subscription_rows_examined: "table",
} as const;
const counters = {
  reducer_wasm_time_usec: "reducer",
  reducer_abi_time_usec: "reducer",
  view_calls_triggered_by_reducer: "reducer",
  view_call_time_usec: "view",
  view_total_time_usec: "view",
  view_calls: "view",
} as const;
const gauges = new Set([
  "spacetime_worker_instance_operation_queue_length",
  "spacetime_worker_v8_request_queue_length",
  "spacetime_subscription_send_queue_length",
  "spacetime_total_incoming_queue_length",
  "spacetime_total_outgoing_queue_length",
  "spacetime_active_queries",
]);
const reducers = new Map([
  ["set_intent", "set_intent"],
  ["setIntent", "set_intent"],
  ["step_world", "step_world"],
  ["stepWorld", "step_world"],
]);
type Histogram = {
  count: number;
  sum: number;
  buckets: Record<string, number>;
};
type Snapshot = {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, Histogram>;
};

function labels(text: string) {
  const values: Record<string, string> = {};
  while (text) {
    const match =
      /^\s*([a-zA-Z_][\w]*)="((?:\\[\\"n]|[^"\\])*)"\s*(?:,|$)/.exec(text);
    if (!match) throw Error("CAPACITY_METRICS_PARSE");
    values[match[1]] = match[2].replace(/\\([\\"n])/g, (_, c: string) =>
      c === "n" ? "\n" : c,
    );
    text = text.slice(match[0].length);
  }
  return values;
}

export function parseServerMetrics(
  raw: string,
  tables: ReadonlySet<string>,
): Snapshot {
  const result: Snapshot = { gauges: {}, histograms: {}, counters: {} };
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const name = /^[a-zA-Z_:][\w:]*/.exec(line)?.[0];
    if (!name) continue;
    const base = name.replace(/_(bucket|sum|count)$/, "");
    if (
      !gauges.has(name) &&
      !Object.hasOwn(histograms, base) &&
      !Object.hasOwn(counters, name)
    )
      continue;
    const match = /^[a-zA-Z_:][\w:]*(?:\{(.*)\})?\s+(\S+)(?:\s+\d+)?$/.exec(
      line,
    );
    if (!match) throw Error("CAPACITY_METRICS_PARSE");
    const value = Number(match[2]);
    if (!Number.isFinite(value) || value < 0)
      throw Error("CAPACITY_METRICS_PARSE");
    const fields = labels(match[1] ?? "");
    if (Object.hasOwn(counters, name)) {
      const kind = counters[name as keyof typeof counters];
      const dimension =
        kind === "view"
          ? tables.has(fields.view)
            ? fields.view
            : undefined
          : reducers.get(fields.reducer);
      if (dimension) {
        const key = `${name}:${dimension}`;
        result.counters[key] = (result.counters[key] ?? 0) + value;
      }
      continue;
    }
    if (gauges.has(name)) {
      result.gauges[name] = (result.gauges[name] ?? 0) + value;
      continue;
    }
    const kind = histograms[base as keyof typeof histograms];
    let dimension = "all";
    if (kind === "table") {
      if (!tables.has(fields.table)) continue;
      dimension = fields.table;
    } else if (kind !== "aggregate") {
      const reducer = reducers.get(fields[kind]);
      if (!reducer || (kind === "function" && reducer !== "step_world"))
        continue;
      dimension = reducer;
    }
    const key = `${base}:${dimension}`;
    const row = (result.histograms[key] ??= {
      count: Number.NaN,
      sum: Number.NaN,
      buckets: {},
    });
    if (name.endsWith("_count"))
      row.count = (Number.isNaN(row.count) ? 0 : row.count) + value;
    else if (name.endsWith("_sum"))
      row.sum = (Number.isNaN(row.sum) ? 0 : row.sum) + value;
    else if (name.endsWith("_bucket")) {
      const bound = fields.le;
      if (
        bound !== "+Inf" &&
        (!Number.isFinite(Number(bound)) || Number(bound) < 0)
      )
        throw Error("CAPACITY_METRICS_PARSE");
      row.buckets[bound] = (row.buckets[bound] ?? 0) + value;
    }
  }
  return result;
}

function quantile(
  buckets: Record<string, number>,
  count: number,
  fraction: number,
) {
  if (!count) return null;
  let lower = 0;
  for (const [bound, cumulative] of Object.entries(buckets).sort(
    ([a], [b]) =>
      Number(a.replace("+Inf", "Infinity")) -
      Number(b.replace("+Inf", "Infinity")),
  )) {
    const upper = bound === "+Inf" ? null : Number(bound);
    if (cumulative >= Math.ceil(count * fraction)) return { lower, upper };
    if (upper !== null) lower = upper;
  }
  return null;
}

export function histogramDeltas(before: Snapshot, after: Snapshot) {
  const result: Record<string, unknown> = {};
  for (const key of new Set([
    ...Object.keys(before.histograms),
    ...Object.keys(after.histograms),
  ])) {
    const a = before.histograms[key] ?? { count: 0, sum: 0, buckets: {} };
    const b = after.histograms[key];
    if (!b) {
      result[key] = { valid: false, reason: "COUNTER_RESET" };
      continue;
    }
    const count = b.count - a.count,
      sum = b.sum - a.sum;
    const buckets = Object.fromEntries(
      Object.entries(b.buckets).map(([bound, n]) => [
        bound,
        n - (a.buckets[bound] ?? 0),
      ]),
    );
    const ordered = Object.entries(buckets).sort(
      ([x], [y]) =>
        Number(x.replace("+Inf", "Infinity")) -
        Number(y.replace("+Inf", "Infinity")),
    );
    const valid =
      count >= 0 &&
      sum >= 0 &&
      ordered.every(
        ([, n], i) => n >= 0 && (i === 0 || n >= ordered[i - 1][1]),
      ) &&
      buckets["+Inf"] === count &&
      Object.keys(a.buckets).every((bound) => bound in b.buckets);
    result[key] = valid
      ? {
          valid: true,
          count,
          sum,
          mean: count ? sum / count : null,
          p50Bucket: quantile(buckets, count, 0.5),
          p95Bucket: quantile(buckets, count, 0.95),
          p99Bucket: quantile(buckets, count, 0.99),
          unit: key.startsWith(
            "spacetime_subscription_query_execution_time_micros",
          )
            ? "microseconds"
            : key.startsWith("spacetime_subscription_rows_examined")
              ? "rows"
              : "seconds",
        }
      : { valid: false, reason: "COUNTER_RESET_OR_INVALID_BUCKETS" };
  }
  return result;
}

export function counterDeltas(before: Snapshot, after: Snapshot) {
  return Object.fromEntries(
    [
      ...new Set([
        ...Object.keys(before.counters),
        ...Object.keys(after.counters),
      ]),
    ].map((key) => {
      const value = after.counters[key] - (before.counters[key] ?? 0);
      return [
        key,
        Number.isFinite(value) && value >= 0
          ? {
              valid: true,
              value,
              unit: key.includes("time_usec:") ? "microseconds" : "calls",
            }
          : { valid: false, reason: "COUNTER_RESET_OR_MISSING" },
      ];
    }),
  );
}

export function metricsEndpoint(host: string) {
  let url: URL;
  try {
    url = new URL(host);
  } catch {
    throw Error("CAPACITY_METRICS_TARGET");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !url.port ||
    url.port === "3100" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("CAPACITY_METRICS_TARGET");
  return new URL("/v1/metrics", url);
}

export function createServerMetrics(
  host: string,
  tables: ReadonlySet<string>,
  request: typeof fetch = fetch,
) {
  const endpoint = metricsEndpoint(host);
  const reports: Record<string, unknown>[] = [];
  return {
    reports,
    async measure<T>(name: string, work: () => Promise<T>): Promise<T> {
      const durations: number[] = [],
        sampled: Snapshot[] = [];
      let failures = 0,
        busy = false,
        skippedPolls = 0;
      const scrape = async () => {
        if (busy) {
          skippedPolls++;
          return null;
        }
        busy = true;
        const start = performance.now();
        try {
          const response = await request(endpoint, {
            signal: AbortSignal.timeout(1500),
          });
          if (!response.ok) throw Error("CAPACITY_METRICS_HTTP");
          const text = await response.text();
          if (Buffer.byteLength(text) > 4 * 1024 * 1024)
            throw Error("CAPACITY_METRICS_SIZE");
          const snapshot = parseServerMetrics(text, tables);
          sampled.push(snapshot);
          return snapshot;
        } catch {
          failures++;
          return null;
        } finally {
          durations.push(performance.now() - start);
          busy = false;
        }
      };
      const before = await scrape();
      const timer = setInterval(() => {
        void scrape();
      }, 250);
      try {
        return await work();
      } finally {
        clearInterval(timer);
        // Finish the in-flight sample before the final boundary; no poll overlap.
        while (busy)
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        const after = await scrape();
        const deltas = before && after ? histogramDeltas(before, after) : {};
        const counterChanges =
          before && after ? counterDeltas(before, after) : {};
        const requiredCounters = [
          "reducer_wasm_time_usec:step_world",
          "view_calls_triggered_by_reducer:step_world",
          ...(name === "walking"
            ? [
                "reducer_wasm_time_usec:set_intent",
                "view_calls_triggered_by_reducer:set_intent",
              ]
            : []),
        ];
        const unavailableCounters = requiredCounters.filter(
          (key) => !(key in counterChanges),
        );
        // In 2.10.0 enqueue_main_operation emits reducer wait timers only
        // for WASM. The TypeScript/V8 path exposes execution and sampled queue
        // depth; never turn an absent timer into a measured zero wait.
        const required = [
          "spacetime_reducer_plus_query_duration_sec:step_world",
          "spacetime_scheduled_function_delay_seconds:step_world",
          "spacetime_websocket_serialize_secs:all",
          ...(name === "walking"
            ? ["spacetime_reducer_plus_query_duration_sec:set_intent"]
            : []),
        ];
        const unavailableHistograms = [
          ...required,
          "spacetime_reducer_wait_time_sec:step_world",
          "spacetime_reducer_wait_time_sec:set_intent",
          "spacetime_request_round_trip_time:step_world",
          "spacetime_request_round_trip_time:set_intent",
        ].filter((key) => !(key in deltas));
        const requiredQueues = [
          "spacetime_worker_v8_request_queue_length",
          "spacetime_subscription_send_queue_length",
          "spacetime_total_incoming_queue_length",
          "spacetime_total_outgoing_queue_length",
        ];
        const qualified =
          !failures &&
          requiredCounters.every((key) => counterChanges[key]?.valid) &&
          Object.values(counterChanges).every((row) => row.valid) &&
          required.every((key) => {
            const row = deltas[key] as
              { valid?: boolean; count?: number } | undefined;
            return row?.valid && (row.count ?? 0) > 0;
          }) &&
          requiredQueues.every((key) =>
            sampled.every((snapshot) => key in snapshot.gauges),
          ) &&
          Object.values(deltas).every(
            (row) => (row as { valid: boolean }).valid,
          );
        reports.push({
          name,
          qualified,
          coverage: "v8-execution-and-sampled-queues",
          unavailableHistograms,
          unavailableCounters,
          counters: counterChanges,
          samples: sampled.length,
          failures,
          skippedPolls,
          pollIntervalMs: 250,
          scrapeMs: distribution(durations),
          histograms: deltas,
          queues: Object.fromEntries(
            [...gauges].map((key) => [
              key,
              distribution(
                sampled.flatMap((snapshot) =>
                  key in snapshot.gauges ? [snapshot.gauges[key]] : [],
                ),
              ),
            ]),
          ),
        });
      }
    },
  };
}
