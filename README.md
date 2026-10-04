# Sidereal Spacetime

Browser space RPG with one authoritative SpacetimeDB server, Babylon.js rendering, Blender-authored assets and React interfaces. The game client and Studio are independent applications.

The [Sidereal wiki](https://wiki.sidereal.dastari.net/Home) is the source of truth for design, implementation status, decisions and operations. Start with [Agents](https://wiki.sidereal.dastari.net/Agents), the [current roadmap](https://wiki.sidereal.dastari.net/Roadmap) and [releases](https://wiki.sidereal.dastari.net/History/Releases). A merged PR and a public deployment are separate events; check release receipts for deployed source pins.

```sh
git lfs pull
python3 scripts/prepare_ci_assets.py
npm ci
npm run setup
npm run dev
```

Setup uses `dev.toml`; secrets and local database state remain outside git. The managed client and Studio use ports 5173 and 5174 by default. See [same-box operations](https://wiki.sidereal.dastari.net/Operations/Documents/Same-box%20setup%2C%20lifecycle%20and%20recovery) for configuration and service lifecycle. `npm run status` and `npm run stop` manage this project.

The code includes account authentication, stable character identities, inventory and equipment, walking/EVA, control stations and component-based flight, ship construction, live furnishing edits, resource and logic foundations, and Studio authoring. The [systems roadmap](https://wiki.sidereal.dastari.net/Architecture/Game%20Systems%20Roadmap) separates implemented foundations from remaining gameplay. Current ship visuals follow the [authored surface trial](https://wiki.sidereal.dastari.net/Decisions/2026-10-02%20Authored%20Ship%20Surface%20Trial); occupancy and damage authority remain separate.

Before a PR, run `npm run check` and `npm run build`. Authority changes also require `npm run smoke` against an isolated database; UI changes require a browser review. Runtime art checks use `npm run art:check`. [CI bootstrap](https://wiki.sidereal.dastari.net/Architecture/Documents/CI%20reproducibility%20repair%20%E2%80%94%202026-09-15) verifies exact native asset hashes and refuses to overwrite local edits.

Keep source, runtime assets, tests and tooling in git. Project documents and release reports belong in the wiki; exact review originals are preserved in `/root/sidereal-art-archive` with hash receipts. Required machine fixtures live in `assets/ci/`, and generated reports in ignored `output/`. `scripts/check_docs.py` enforces these boundaries. See [what lives where](https://wiki.sidereal.dastari.net/Agents/What%20Lives%20Where).

The stopped Bevy project's design is preserved as [historical reference](https://wiki.sidereal.dastari.net/History/Bevy%20Era%20Reference). This repository has no blanket license grant over imported material; original and third-party asset and vendored skill terms remain attached to their sources.
