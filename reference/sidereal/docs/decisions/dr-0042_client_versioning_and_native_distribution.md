# DR-0042: Client Versioning and Native Distribution

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-08-31
Owners: architecture
Scope: DR-0042: Client Versioning and Native Distribution.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-05-30
Owners: gateway + client runtime + release engineering

Primary references:
- `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md`
- `docs/decisions/dr-0047_webtransport_first_browser_transport.md`
- `crates/sidereal-net/src/lightyear_protocol/messages.rs`
- `bins/sidereal-client/Cargo.toml`
- `dashboard/scripts/build-game-client-wasm.mjs`
- `dashboard/vite.config.ts`
- `Cargo.toml` (`[workspace.package] version`)
- `scripts/publish_client.py`

## 0. Status Notes

2026-08-31 — protocol v17:

- `LIGHTYEAR_PROTOCOL_VERSION` is 17 after adding shaped-zone
  `falloff_width_m`, replicated zone-layer shader parameter sets, full-state velocity
  replication, and the pinned Lightyear server-conditioner propagation fix. Client and
  server must be rebuilt/deployed together; the release version remains independent and is
  advanced only by the publish workflow. Native and WASM builds use the same protocol constant.

2026-05-30 — first slice implemented (publish + authenticated download; **no
connect-time gate or launcher yet**):

- Publish: `scripts/publish_client.py` (wrapped by `make publish-client-windows`)
  bumps `[workspace.package].version`, builds `--profile dist` (size-optimized,
  Cargo.toml), and writes the binary + `manifest.json` to the release dir. It is
  the only writer of the manifest.
- Release dir: dev.toml SoT `SIDEREAL_CLIENT_RELEASE_DIR` (gateway service,
  default `dist/client`), per DR-0043. Gateway serves auth-gated `GET
  /client/manifest` and `GET /client/download` (any valid account session).
- Dashboard: `/api/desktop-client/{manifest,download}` proxy routes attach the
  bearer token server-side; the app-bar `DownloadClientButton` shows the version.
- Manifest schema currently emitted: `{version, filename, platform, size_bytes,
  published_at}`. The `sha256` / `minimum_supported_version` fields described in
  §2.4 are **not yet** emitted (deferred with the launcher and connect gate).
- Gateway URL is baked into the published binary from dev.toml
  `[vars].gateway_public_url` (`SIDEREAL_BAKED_GATEWAY_URL` →
  `option_env!` in `platform/native/config.rs`; `bins/sidereal-client/build.rs`
  tracks the env for rebuilds). Runtime `GATEWAY_URL`/`--gateway-url` still
  override. First publish: v0.1.1, `dist` profile, ~49 MiB Windows `.exe`.
- Size profiles are dedicated: `[profile.dist]` (native exe) and
  `[profile.dist-wasm]` (production WASM); `[profile.release]` is untouched. The
  dashboard production WASM build (`pnpm build` → `build:game-client-wasm:dist`)
  adds a `wasm-opt -Oz --strip-debug` pass; dev build stays on `--release`.
- Still open (this DR's remaining scope): the §2.2 connect-time
  protocol/version gate, the §2.3 launcher, and integrity/signing.

## 1. Context

Sidereal is moving from local-development-only toward a remote server with remotely
updatable clients. Today there is no client release, versioning, or distribution
contract, and the pieces that exist disagree about what "the client version" is:

1. The Rust workspace pins a single shared `version = "0.1.0"` in
   `[workspace.package]`; `sidereal-client` consumes it via `version.workspace = true`.
2. The dashboard carries an independent `package.json` `version` (`0.0.0`), surfaced
   to the SPA as `VITE_APP_VERSION` in `dashboard/vite.config.ts`. This is unrelated
   to the game client version.
3. The game client (`sidereal-client`) already builds to **two targets** from one
   crate: a native binary (the rlib/cdylib split in `bins/sidereal-client/Cargo.toml`
   reserves a future native packaging step) and a `wasm32-unknown-unknown` build that
   `dashboard/scripts/build-game-client-wasm.mjs` emits into
   `dashboard/public/wasm/sidereal-client/` and the dashboard serves.
4. There is a wire/protocol version, `LIGHTYEAR_PROTOCOL_VERSION: u32 = 17`
   (`crates/sidereal-net/src/lightyear_protocol/messages.rs:5`), and the server already
   **reports** it back in `ServerSessionReadyMessage.protocol_version`. But
   `ClientAuthMessage` sends **no** client version or protocol version, so the gateway
   and replication shard cannot reject a stale client *before* session binding. A
   protocol-incompatible client today connects and silently desyncs rather than being
   told to update. The repo already uses per-message `*_PROTOCOL_VERSION` gating as an
   idiom (`bins/sidereal-replication/src/replication/migration_commands.rs`), so a
   connect-time client gate follows an established pattern.

The product decision (2026-05-30): **native desktop is the primary client form factor
for remote players.** The WASM/dashboard build remains a secondary "play in browser"
path. The project is in development phase: **no CDN**; artifacts are served from the
gateway, which is already the trusted origin clients consult for auth, bootstrap, and
shard routing (DR-0040 §2.6).

This DR fixes the versioning contract, the connect-time compatibility gate, and the
native distribution + update mechanism, and records the policy so all contributors and
agents apply it consistently.

## 2. Decision

### 2.1 One canonical version, one protocol version

1. The workspace `[workspace.package] version` is the **canonical client release
   version** (semver). It is bumped only by the release process (§2.5). No
   per-crate divergent client versions are introduced.
2. `LIGHTYEAR_PROTOCOL_VERSION` remains the **canonical wire/protocol compatibility
   version**, bumped whenever the replication wire format or protocol messages change.
   It is decoupled from the marketing semver but always recorded alongside it in the
   manifest (§2.4).
3. The dashboard `package.json` version / `VITE_APP_VERSION` is **display/build
   metadata only**. It is not the client version of record and must not be consulted
   for compatibility decisions.

### 2.2 Connect-time compatibility gate (close the silent-desync gap)

1. `ClientAuthMessage` gains a `protocol_version: u32` field (the client's compiled
   `LIGHTYEAR_PROTOCOL_VERSION`) and a `client_version: String` field (the client's
   compiled workspace semver). Both are additive; the field is `#[serde(default)]` for
   one transition release so older clients deserialize as protocol `0`.
2. At replication auth, the shard rejects a `ClientAuthMessage` whose
   `protocol_version` does not equal the server's `LIGHTYEAR_PROTOCOL_VERSION` with a
   typed **"update required"** denial reason, distinct from auth failure, carrying the
   minimum-supported and current versions so the client/launcher can present an update
   prompt instead of connecting into a desync.
3. The gate is authoritative on the server/shard, never client-trusted. The client
   self-check against the manifest (§2.4) is a UX optimization, not the enforcement
   point.

### 2.3 Native desktop is primary; updates are launcher-owned (not self-update, not Electron)

1. The shipped product for remote players is the **native `sidereal-client`
   binary** per platform (`windows-x86_64`, `macos-aarch64`, `macos-x86_64`,
   `linux-x86_64`). Native uses the UDP transport; WASM uses WebTransport (DR-0029).
2. A new thin binary, `sidereal-launcher`, **owns updates**. It: reads the gateway
   manifest (§2.4), compares the installed version, downloads the matching platform
   artifact into a **versioned install directory** (`.../sidereal/versions/<version>/`),
   verifies its `sha256` (signature later — §5), launches the game binary, and exits or
   stays resident. Game binaries are content-addressed by version directory; rollback is
   launching a prior version directory.
3. Update plumbing is kept **out of the Bevy game binary**. Rationale: a running
   executable cannot reliably replace itself in place on Windows/macOS; the launcher
   downloads side-by-side and switches, and the heavyweight client stays free of update
   code. The launcher is the only piece the user installs once.
4. **Electron is rejected** (a second runtime and a Node toolchain Sidereal does not
   otherwise need for the native client). If a desktop chrome/wrapper is ever wanted, the
   choice is **Tauri** (Rust-native), but the native Bevy binary is the product, so a
   webview wrapper is not part of this decision.

### 2.4 Gateway is the release origin (no CDN); machine-readable manifest is the source of truth

1. The gateway serves a build-generated, never-hand-edited manifest:
   `GET /client/manifest.json` →
   ```json
   {
     "version": "0.1.0",
     "protocol_version": 13,
     "minimum_supported_version": "0.1.0",
     "released_at": "2026-05-30T00:00:00Z",
     "artifacts": {
       "windows-x86_64": { "path": "/client/download/0.1.0/windows-x86_64/sidereal-client.exe", "size": 0, "sha256": "" },
       "macos-aarch64":  { "path": "/client/download/0.1.0/macos-aarch64/sidereal-client",      "size": 0, "sha256": "" },
       "linux-x86_64":   { "path": "/client/download/0.1.0/linux-x86_64/sidereal-client",       "size": 0, "sha256": "" }
     }
   }
   ```
2. The gateway serves artifact bytes from disk via `tower-http` `ServeDir`
   (`tower-http` is already a gateway dependency; add the `fs` feature) rooted at a
   release directory configured by `SIDEREAL_CLIENT_RELEASE_DIR`, laid out as
   `<release_dir>/<version>/<platform>/<artifact>`.
3. The manifest is the single source of truth for "what is current"; the connect gate
   (§2.2) is the single source of truth for "what is allowed to play". They are kept
   consistent by the publish process (§2.5).
4. **CDN is a later swap, not a redesign**: when scale warrants it, manifest artifact
   `path`s become absolute CDN URLs and the launcher contract is unchanged; only the
   origin moves.

### 2.5 Release / publish process

1. A single scripted release task — `scripts/publish_client.py`, wrapped by
   `make publish-client-windows` — is the **only** writer of releases and the
   manifest. It:
   1. bumps the workspace `version` (`--bump patch|minor|major` / `--set X.Y.Z` /
      `--no-bump`);
   2. builds the native binary with the size-optimized `dist` profile;
   3. writes the binary + `manifest.json` into the release dir;
   4. (target state, not yet implemented — see §0) `sha256` per artifact,
      per-`<version>/<platform>/` layout, atomic manifest rewrite recording
      `LIGHTYEAR_PROTOCOL_VERSION`, and a `vX.Y.Z` git tag.
2. The protocol version is **not** auto-bumped by the release task. Bumping
   `LIGHTYEAR_PROTOCOL_VERSION` is a deliberate, reviewed change in `sidereal-net`; the
   release task only records its current value.
3. The WASM/dashboard build is published by the existing dashboard build/deploy
   (`build:game-client-wasm` + `vite build`); it must be built from the same workspace
   `version` and `LIGHTYEAR_PROTOCOL_VERSION` as the native release so both channels
   gate identically. Browser cache-busting uses the wasm-bindgen hashed output (or a
   versioned `/wasm/<version>/` path); "update the browser client" = redeploy.

### 2.6 Versioning policy contributors and agents must respect

1. There is exactly **one** client version of record: the workspace `version`. Do not
   add divergent per-crate client versions; the dashboard version is display-only.
2. Any change to the replication wire format or protocol messages **must** bump
   `LIGHTYEAR_PROTOCOL_VERSION` in the same change and note the bump in the change
   description (new `AGENTS.md` rule, §5).
3. The publish task (§2.5) is the **only** writer of `manifest.json` and the release
   directory. Never hand-edit the manifest; never serve an artifact whose embedded
   version/protocol disagrees with its manifest entry.

### 2.7 What this DR does not decide

1. Code signing / notarization (macOS Gatekeeper, Windows SmartScreen): required before
   a public launch, deferred during development phase (§5).
2. Delta/patch downloads: out of scope; full-artifact download in V1.
3. CDN selection and edge caching: deferred (§2.4 keeps the swap cheap).
4. Auto-update of the launcher itself: V1 launcher is updated by re-download; a
   launcher self-update channel is a future increment.

## 3. Alternatives Considered

### 3.1 Build self-update into the Bevy client
Rejected. A running executable cannot reliably replace itself in place on Windows/macOS;
correct in-place update needs side-by-side download and a switch step anyway. Embedding
that plus signing/rollback into the heavyweight game binary couples update reliability to
client crashes and bloats the client. A thin launcher isolates the concern.

### 3.2 Electron launcher
Rejected. Adds a second runtime and a Node toolchain the native client does not need,
for a client whose renderer is native Bevy, not a webview.

### 3.3 Tauri wrapper around the WASM build, shipped as the desktop client
Rejected as the primary path. It would defeat the point of "native desktop primary"
(native rendering/transport performance) by running the WASM client in a webview. The
WASM build remains the browser path; Tauri stays available only if a desktop *chrome*
is later wanted around the native binary.

### 3.4 Serve artifacts directly from the dashboard host or an object store now
Deferred. The gateway is already the client's trusted origin for auth/bootstrap/routing
(DR-0040 §2.6) and the connect gate lives there, so colocating the release origin keeps
one trust boundary during development. §2.4 makes moving to a CDN/object store a URL swap.

### 3.5 GitHub Releases as the runtime distribution origin
Rejected for the player update path. It couples client updates to GitHub
availability/auth/rate limits and splits the origin from the connect gate. GitHub
Releases is fine as a *build artifact store*, not the runtime origin the launcher polls.

### 3.6 Marketing semver as the compatibility key (drop the separate protocol version)
Rejected. Many client releases do not change the wire format; gating on semver would
force needless forced-update churn or silent under-gating. Keeping
`LIGHTYEAR_PROTOCOL_VERSION` as the compatibility key (already present and server-reported)
and semver as the human/display version matches how the code already works.

## 4. Consequences

### Positive
- A single, enforceable answer to "what version is the client" and "is this client
  allowed to play", closing the current silent-desync-on-stale-client gap.
- Native desktop distribution and update without a CDN, reusing the gateway as origin;
  CDN promotion later is a URL swap, not a redesign.
- Update reliability (side-by-side, hash-verified, rollback) lives in a small launcher,
  keeping the game binary free of update plumbing.
- Browser and native channels gate identically because both derive version/protocol from
  the same workspace constants.

### Negative
- New surface area: a `sidereal-launcher` crate, a gateway manifest + `ServeDir`
  endpoint, a release/publish task, and a `ClientAuthMessage` field plus a connect-gate
  denial path across client, gateway, and replication.
- Releases now require per-platform builds and an atomic manifest publish; ad-hoc
  "just run the client" local flows must keep working as an unversioned dev path.
- The gateway's responsibility set grows again (after DR-0040's routing growth); if it
  becomes a bottleneck, the release origin can be split out behind the same manifest
  contract.

### Neutral
- Existing local development (`make run-client`) continues to work unversioned and
  ungated for dev builds; the connect gate is additive and `#[serde(default)]` for one
  transition release.
- The dashboard keeps its own `VITE_APP_VERSION`; this DR only reclassifies it as
  display-only.

## 5. Follow-up

Required as part of, or immediately after, this DR landing:

1. Implementation plan under `docs/plans/` covering: `ClientAuthMessage` version fields
   + connect gate; `sidereal-launcher` crate; gateway manifest endpoint + `ServeDir`
   (`tower-http` `fs` feature) + `SIDEREAL_CLIENT_RELEASE_DIR`; release/publish task.
2. Decision register entry pointing at this DR.
3. Add an `AGENTS.md` rule: any PR that changes the replication wire format or protocol
   messages **must** bump `LIGHTYEAR_PROTOCOL_VERSION` and state the bump in the change
   description; the client version of record is the workspace `version` (dashboard
   version is display-only); `manifest.json` is written only by the publish task.
4. Update `docs/architecture/sidereal_design_document.md` with the client versioning + native
   distribution model.

Deferred to subsequent DRs / increments:

1. Code signing and notarization (macOS Gatekeeper, Windows SmartScreen) before public
   launch.
2. Delta/patch downloads.
3. CDN/object-store origin promotion.
4. Launcher self-update channel.

## 6. Migration / Compatibility Notes

1. The workspace `version` is reaffirmed as the canonical client version; no code change
   needed beyond keeping `version.workspace = true` consumers.
2. `ClientAuthMessage.protocol_version` / `client_version` are additive and
   `#[serde(default)]` for one transition release. While defaulted, a missing field reads
   as protocol `0`; the gate treats `0` as "legacy/unknown" and may be run in a
   warn-only grace mode (env toggle) before it hard-rejects, so existing connected dev
   clients are not abruptly locked out.
3. `ServerSessionReadyMessage.protocol_version` (already present) is unchanged; this DR
   adds the *client→server* direction the gate needs, it does not remove the existing
   server→client report.
4. No release directory or manifest exists yet; the publish task creates them. Until the
   first published release, the launcher/download path is inert and local dev is
   unaffected.

## 7. Native and WASM Impact

- **Native**: introduces the primary distribution channel — per-platform release
  binaries, the `sidereal-launcher`, hash-verified side-by-side install/rollback, and
  the UDP-transport connect gate. Signing/notarization deferred (§5).
- **WASM**: the dashboard build remains the secondary browser channel; it must be built
  from the same workspace `version` and `LIGHTYEAR_PROTOCOL_VERSION` as the native
  release and is subject to the same connect gate over WebTransport (DR-0029). Browser
  "update" stays "redeploy + cache-bust"; no launcher applies.
- The `ClientAuthMessage` field addition and connect-gate denial path must be validated
  on **both** transports (native UDP and WASM WebTransport) before V1 declares done.
