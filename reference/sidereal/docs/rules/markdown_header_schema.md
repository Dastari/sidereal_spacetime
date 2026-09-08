# Markdown Header Schema

Status: Active
Lifecycle: source-of-truth
Category: rule
Last updated: 2026-06-04
Owners: documentation + agent workflow
Scope: Markdown Header Schema.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 1. Required Header

Every non-exempt project-authored Markdown file begins with `# Title`, a blank line, then this visible metadata block:

```md
Status: Active | Proposed | Deferred | Implemented | Superseded | Archived | Reference | Template
Lifecycle: source-of-truth | active-reference | proposed | deferred | completed | superseded | historical-report | reusable-prompt | handoff-open | handoff-completed | guide | index | template
Category: architecture | system | guide | decision | feature | plan | report | prompt | rule | data-reference | root
Last updated: YYYY-MM-DD
Owners: owner role or n/a
Scope: one sentence
Source of truth: yes | no
Supersedes: path or n/a
Superseded by: path or n/a
Primary references:
- path or n/a
```

## 2. Exemptions

The docs checker intentionally exempts:
- `.art-tools/**` (2026-09-06) because it is an ignored Python dependency environment, including upstream licence files.
- `.agents/skills/**` because those files are vendored/tool-managed skill content.
- `.github/pull_request_template.md` because it is a functional GitHub template.

## 3. Skill Files

Project rule packs under `.claude/skills/*/SKILL.md` keep their required YAML front matter first. The visible Markdown header appears immediately after the YAML block and before the operational rule text.

## 4. Filename Convention

Project-authored Markdown filenames use lowercase letters, numbers, underscores, and hyphens only. `README.md`, `AGENTS.md`, and `.claude/skills/*/SKILL.md` keep their conventional names.
