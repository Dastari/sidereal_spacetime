# ADR: Immutable, demand-loaded game assets with independent delivery

Date: 2026-09-21. Status: Proposed. Author: GrayLotus (Codex).

## Context

The installed release contains approximately 1.71 GB of original files. Actual HTTPS GETs still use gzip and revalidation, despite newer precompression code in another branch. Some renderer paths serialize distinct library loads. Increasing the full art catalog must not proportionally increase time-to-play. See the [investigation, evidence and proposed acceptance criteria](../asset_delivery_investigation.md).

## Proposed decision

Publish explicitly approved, content-addressed runtime objects and immutable manifests independently of client and dashboard releases. Pin each client to compatible manifest revisions, resolve scene dependencies from permitted state and schedule bounded fetch/parse/upload work. Use HTTP cache reuse first, then qualify CDN/object-storage delivery with provider selection based on measured workload. SpacetimeDB remains the sole world authority and never serves bulk art.

Finish and qualify existing compression/delivery work first. No deployment, art revision, provider purchase or implementation acceptance is implied by this proposal.

## Alternatives and rationale

- **CDN over existing mutable paths only:** useful for origin offload, but revalidation, release compatibility and unnecessarily broad loads remain. It can be a transition, not the complete design.
- **One downloadable universe pack:** fewer requests, but poor first-entry latency, update invalidation and memory use. Dependency-sized packs remain possible where benchmarks support them.
- **Service worker first:** provides explicit cache control, but adds quota, eviction and upgrade failure modes before establishing whether normal immutable HTTP caching is sufficient.
- **Self-hosted production static origin:** valid for a regional workload and the initial stage. Global cache misses still consume origin bandwidth and availability; compare its operational cost with managed object storage plus CDN.
- **Compression alone:** an immediate measurable saving that preserves decoded assets, but does not eliminate CPU/GPU setup, redundant content or sequential loading.

## Consequences

Stable objects permit cross-release cache reuse and independent app releases. Scene-bounded loading constrains the effect of catalog growth. The design requires publication manifests, dependency validation, retained old objects, cache-safe encoding negotiation, cancellation/retry behavior and GPU lifetime accounting. Optimized art representations remain separately qualified derivatives of preserved Blender sources. Public asset distribution never grants access to private game state.
