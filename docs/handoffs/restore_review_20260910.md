# Isolated cold-backup recovery verification — 2026-09-10

Status: passed for the archived normal database and its stable gameplay records. The recovery instance was stopped; its disposable extracted working copy was removed after verification on 2026-09-10. The live server, data directory, module, public client and provider routes were not replaced, reset or restarted by this exercise.

## Recovery set and isolation

Restored the exact private archive `.runtime/recovery-20260910-001924.tar`, SHA256 `a76a1f0cb1670ea736acb6b549976f122e3a58f002a5af79257abad4be2dd21f`:24,977,530,880 bytes and6,983 archive members. The archive contains the control database, replica snapshots/logs, program bytes, server configuration, signing key pair, CLI configuration and the matching old public-client release metadata.

The recovery helper rehashed the entire archive before extraction, required the signing keys/control database, rejected unsafe paths, symlinks and special files, and permitted internal hard links only to archived regular files. It refused an existing destination and required enough free space for the full logical file payload plus an8GiB reserve. About53GiB was available before extraction; the separate copy remained within that budget. Extraction took20.163seconds after hash verification.

During the exercise, restored data and keys were held under private `.runtime/recovery-review/`. The pinned2.10.0 standalone binary was started only through the managed lifecycle on `127.0.0.1:3190`, with the restored signing keys and a512MiB page pool. The recovered operator CLI configuration was also used for privileged verification queries; no new operator credential or identity reassignment was required. The historical matching client `2affa484dc8bc4cf457ad4f7baa68f756ae0919e986ade98ae87d3497b88f048` remains available and hash-valid, but was not served publicly or exercised in a browser during recovery.

## Verified results

- Normal database identity remained `c2005c24147323197826efa22f24e30d2d99a93a5a5091949f2ad25fa2127572`. The restored signing public key matched the original server.
- Snapshot/commit-log replay loaded the archived program `4aba1dd12a658c9d055a3ddd1e78ecf312bd7d6363ed6ae9bd7b2ace9a2d5bb4`; preserved program-byte SHA256 is `fb46173302350372acbed5e4b5733ac4a8090460151b25705e61554cd6bec67e`. This is the pre-audit module in the backup, not the latest corrected public module.
- All25 ships and25 characters retained their identities, owners and stable fields. Character deck positions matched. All603 items,165 containers,17 inventory-state rows,85 hotbar entries,40 storage bindings, three appearances, six weapon-energy records and25 stations matched the saved stable records. Construction instance/location counts were zero in this normal database.
- Eight ships' dynamic world positions/headings differed from the SQL snapshot taken before the archive; those ships had nonzero velocities. The SQL baseline and cold archive are not an atomic pair, and a booted simulation continues advancing. Therefore ship world `x/y/heading/tick`, character connection/sprint flags and weapon timestamp fields are explicitly excluded from stable-state equality. This is not a claim of bit-identical simulation state at different times.
- Stable records survived two isolated process stop/start cycles. Neither cycle published a module. The helper's address probe uses address reuse for closed HTTP connections while still rejecting any active listener; a focused test covers occupied-port rejection.
- All44 restored tables remained private. An anonymous direct `inventory_item` query was denied, while the anonymous `own_characters` view returned zero rows. These probes do not substitute for the complete cross-account authorization test suite.
- Recovery service stopped successfully and port3190 no longer listened. Live database PID3772055 and public-client PID3795398 stayed unchanged throughout; the public game still returned200. No credentials or gameplay row contents were published.

## Repeatable managed commands

Preparation intentionally refuses to overwrite an existing recovery directory. Preserve or explicitly archive/remove a prior review copy before preparing another; never point it at `.spacetime-data`.

```sh
python3 scripts/dev.py restore-review-prepare \
  --archive .runtime/recovery-20260910-001924.tar.gz \
  --expected-sha256 288c8b83a4128a633855e9a235dfafe5c15d2812ee1f299c2ea42828a9fd7b0f
python3 scripts/dev.py restore-review-up
python3 scripts/dev.py restore-review-restart
python3 scripts/dev.py restore-review-stop
```

The review address comes from `[restore_review]` in `dev.toml`; the helper requires loopback and rejects the live server port. It never invokes `publish`, selects the live data directory, or changes app routing.

## Evidence and limits

Private evidence: `.runtime/releases/world-network-20260910/restore-acceptance.json`, initial/restart SQL snapshots and comparisons, schema/privacy probes, extraction/start/restart/stop logs and the recovered operator-client query. The source archive and original proof evidence remain preserved. The stopped extracted copy was subsequently removed as recorded below. `npm run test:python` passed27 lifecycle/publication tests plus nine art tests, including seven recovery-helper tests; documentation/provenance checks also passed.

This verifies restoring a cold archive into an isolated same-host2.10 server and reading/restarting its normal database. Other archived review databases were retained but not individually exercised. It does not establish off-host disaster recovery, point-in-time recovery, replication/failover, restoration onto a different server version, browser acceptance of the historical game client, or reapplication of subsequent authority migrations. Later production writes are outside this backup and must never be silently discarded by an application rollback.

## Disposable copy cleanup before the next release

The owner-authorized coordinator removed only `/root/sidereal_spacetime/.runtime/recovery-review` after checking that its managed process was inactive, loopback port3190 had no listener, and no process argument referenced its database directory. Both original archives were re-read in full and matched their recorded SHA-256 values: `a76a1f0cb1670ea736acb6b549976f122e3a58f002a5af79257abad4be2dd21f` for00:19 and `81e5f0e3b3935da15b35ddf6c45ed0f0dc923b85513ef36517bfb86eefe5ae03` for03:13. Archive member validation retained the required database, signing keys and configuration; the original acceptance evidence and recovery manifest were retained separately.

Private disposal evidence is `.runtime/releases/world-network-20260910/restore-copy-disposal.json`. No backup archive, source or immutable client release was removed. Repeating the recovery test now requires the managed prepare command to extract a new isolated copy. The03:13 archive has not itself been restore-tested; its full digest/member checks are distinct from the00:19 archive's actual boot/restart proof.


## Lossless archive compaction before native-starter release

The00:19 recovery set is now stored as `.runtime/recovery-20260910-001924.tar.gz`, SHA-256 `288c8b83a4128a633855e9a235dfafe5c15d2812ee1f299c2ea42828a9fd7b0f`,12,059,916,422 bytes. Its full decompressed stream was rehashed and exactly matches the original raw archive SHA-256 `a76a1f0cb1670ea736acb6b549976f122e3a58f002a5af79257abad4be2dd21f` and24,977,530,880 bytes. All6,983 members, required signing keys/configuration and safe internal hard links were validated before the redundant raw representation was removed. The original historical metadata and all restore evidence remain; the additional0600 manifest is `.runtime/recovery-20260910-001924.tar.gz.json`.

`scripts/compress_recovery.py` never operates a service or edits live database data. It creates a new0600 artifact exclusively, bounds output size and free-space reserve, hashes the original stream, rereads the complete decompressed stream, validates recovery members and fsyncs the compressed artifact and manifest before an explicitly requested raw replacement. Hash/budget/disk failures preserve the raw source and remove partial output. The initial8GiB cap was too small for this data; it aborted safely. A16GiB cap with4GiB reserve succeeded in300.929seconds.

`restore-review-prepare` now accepts compressed tar input with the same exact artifact-hash, member-safety and extraction-space checks. A focused test restores the verified compressed fixture and confirms private key-file permissions. Together with the existing recovery tests, ten focused Python tests pass. This is lossless representation verification and restore-helper coverage, not a repeat server boot of the production-sized compressed artifact. The earlier actual same-host boot/restart proof remains attached to the identical decompressed bytes.
