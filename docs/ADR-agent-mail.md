# ADR: shared local Rust Agent Mail

Status: Accepted for requested tooling setup
Date: 2026-09-15

## Context

Independent coding sessions and worktrees need durable visibility into overlapping
edits. The owner requested mcp_agent_mail_rust integration and agent guidance.

## Decision

Use a pinned, signature-verified release as a shared loopback HTTP MCP service,
managed by a project npm lifecycle command with settings in dev.toml. Store all
mail state outside Git. Use one canonical project identity across worktrees.
Put the workflow in AGENTS.md and import it from CLAUDE.md, rather than relying
on a skill whose trigger may never fire. Configure installed Codex and Claude.
See [operations/specification](agent_mail.md) for acceptance and recovery.

## Consequences

Mail survives sessions and worktree deletion. Host-local processes are trusted;
remote hosting would need a separate authentication decision. Reservations remain
advisory. Agent clients need a reload and project trust/enablement. No application
runtime dependency, auto-updater or Git hook is introduced.
