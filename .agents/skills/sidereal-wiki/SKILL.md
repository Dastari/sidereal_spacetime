---
name: "sidereal-wiki"
description: "Use whenever a Sidereal task needs or changes documentation: design, contracts, specs, ADRs, decisions, plans, handoffs, runbooks, playbooks, art direction, art-library ledgers, reference boards, review evidence or release notes. The Sidereal wiki is the source of truth; this repository keeps no project documents. Covers reading and writing pages through the sidereal-wiki MCP server or the Dastari/sidereal-wiki git repo."
---

# Sidereal wiki (source of truth)

The Sidereal wiki, https://wiki.sidereal.dastari.net/, is the **source of truth for every project
document** (owner direction, 2026-09-26 and 2026-09-29). Design, data and authority contracts, specs,
ADRs, decisions, plans, handoffs, runbooks, playbooks, art direction, art-library ledgers, reference
boards, progress reviews and release notes all live there.

This repository keeps only Markdown that tools or agents load: `AGENTS.md`, `CLAUDE.md`, `README.md`,
the `PIVOT.md` root-marker stub, `.agents/skills/**` (mirrored in `.claude/skills/`),
`docs/public/shipyard.md` (served as dashboard help), hash-pinned art-library notes, and licenses.
`scripts/check_docs.py` (in `npm run check` and CI) fails when any other `.md` file, review media or a log is tracked.

## Read first

Start at these pages:
- [Home](https://wiki.sidereal.dastari.net/Home)
- [Agents](https://wiki.sidereal.dastari.net/Agents)
- [What lives where](https://wiki.sidereal.dastari.net/Agents/What%20Lives%20Where)
- [Wiki MCP](https://wiki.sidereal.dastari.net/Agents/Wiki%20MCP)

Before changing code that a contract governs, search for the page. Contract pages list the code paths
they govern in their `governs:` frontmatter.

## The `sidereal-wiki` MCP server (preferred)

The server is registered at user scope on CT107 (`http://127.0.0.1:3312/mcp`, loopback only). Check
it with `claude mcp list` or `curl -fsS http://127.0.0.1:3312/healthz`.

| Tool | Use |
|---|---|
| `search` | Full-text search. Every term must match; supports `"quoted phrases"` and an optional `prefix` such as `Systems/`. |
| `read_page` | Returns the Markdown, the parsed frontmatter, the blob `sha` (keep it for writing) and the last commit. |
| `list_pages` | Lists page names under a prefix. |
| `backlinks` | Lists pages that link to a page or attachment. |
| `write_page` | Commits and pushes a whole page. Always pass `expected_sha` from `read_page`; use `create_only` for new pages. |
| `list_attachments` | Lists non-Markdown files. |

To edit a page safely, run `search` or `list_pages`, then `read_page` (note the `sha`), then
`write_page` with `expected_sha`.

- If a write conflicts, the server saves your version as `<page>.conflict-<UTC>.md`. Merge it by hand.
- The server has no delete or rename tool; use git for those.

## Git fallback (bulk changes, images, deletes)

1. Clone `Dastari/sidereal-wiki` (`gh repo clone Dastari/sidereal-wiki`) into your own scratch
   directory. Never edit the live checkout `/var/lib/sidereal-wiki/live`.
2. Put each page at `space/<Section>/<Page>.md`.
3. Commit content directly to the wiki's `main`, then run `git pull --rebase && git push`. The PR-only
   rule applies to the wiki's `mcp/`, `ops/` and `tools/` code, not to its pages.
4. Run `node tools/lint-wiki.mjs` before pushing bulk changes.

## Conventions (see the wiki repo's `AGENTS.md`)

- **Page paths and links.** Use full-path links (`[[Systems/Construction]]`, `[[Ships/Wayfarer|the Wayfarer]]`).
  Page names are Title Case and must not end in a `.xyz`-looking suffix.
- **Frontmatter.** Include `tags`, `status` (`current`, `proposal`, `planned`, `superseded` or
  `historical`), `sources` or `migrated_from`, `governs` (for contracts) and `updated`. End each page
  with a `## Sources` section.
- **Approval status.** Keep **proposed**, **owner-approved** and **implemented** separate. Only the
  owner's explicit approval of an exact revision counts as approval. Record owner decisions verbatim
  and dated on `Decisions/…` pages.
- **Images.** Use WebP, about 1600 px and under 500 KB, stored in `space/attachments/<section>/`.
  Exact originals go to `/root/sidereal-art-archive` with a SHA-256 manifest. Renders and logs in
  `/root/sidereal-progress/<lane>/` are published to the wiki automatically every 15 minutes.
- **Never write** secrets, tokens, passwords, e-mail addresses, private player data or anything from
  `dev.toml`.

## In a game-repo PR

- Never add a Markdown document, handoff, plan, review, screenshot or evidence dump to this repo.
  Write the wiki page instead and link it in the PR description.
- When code changes a contract, update its wiki page in the same piece of work and list the changed
  pages in the PR.
- Retired material gets one line on `History/Retired Documents`. Exact originals go to
  `/root/sidereal-art-archive/sidereal_spacetime/<repo path>`, with a SHA-256 manifest under
  `manifests/`.
