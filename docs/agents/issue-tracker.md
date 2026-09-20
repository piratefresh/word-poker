# Issue tracker: Linear

Issues and specs for this repo live as Linear issues in the **Word Poker Native** project — workspace `magnus-adhd-brain`, team **Story Time**. Identifiers read `STO-<n>`: a bare `STO-334` is what a skill means by "the ticket".

Reach Linear through the `mcp__linear_*` tools; there is no CLI for this tracker, and no markdown file in this repo is the tracker (`AGENTS.md` §Story tracker).

## Conventions

- **Create an issue**: `save_issue` with `team: "Story Time"`, `project: "Word Poker Native"`, `title`, and a markdown `description` (literal newlines, no escape sequences). Add `labels`, `priority` (0 None, 1 Urgent, 2 High, 3 Medium, 4 Low), and `parentId` when the ticket belongs under an epic or story. The call returns the identifier, the URL, and the `gitBranchName` to branch from.
- **Read an issue**: `get_issue` with `STO-<n>` (id, uuid, or slug also resolve). Comments come back with it; `list_comments` pages them where there are many.
- **List issues**: `list_issues` with `project: "Word Poker Native"` plus any of `state`, `label`, `assignee` (`"me"` for mine, `"null"` for unassigned), `parentId`, `priority`, `query`. Pass `fields` — `["url", "status", "labels", "priority", "parentId"]` — to keep the response small; `cursor` pages it.
- **Comment on an issue**: `save_comment` with `issueId: "STO-<n>"` and `body`. Passing `id` edits an existing comment instead.
- **Apply / remove labels**: `save_issue` with `addLabels` / `removeLabels`. `labels` replaces the whole set, so use it only when that is the intent.
- **Move state**: `save_issue` with `state` — `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`.
- **Close**: the move to `Done` (or `Canceled`), after the comment that says why.
- **Link**: `parentId` for epic → story → sub-issue, `blockedBy` / `blocks` for dependencies, `relatedTo`, `duplicateOf`. Relations are append-only; the `remove*` fields undo one.

## Commits and PRs

`save_issue` returns `gitBranchName` (`sto-334-offline-free-play-deals-the-same-hand-every-visit-fixed-seed`); name the identifier in the commit subject, as recent history does. Linear links a GitHub PR to its ticket when the PR title or body names `STO-<n>`.

## Pull requests as a request surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`: PRs are triaged through the same roles as issues — the Linear tools for the issue side, `gh pr view` / `gh pr diff` for the code. Linear carries no author-association field, so "external" is read off the PR's author on GitHub.

## When a skill says "publish to the issue tracker"

Create a Linear issue in **Word Poker Native**, per the create convention above. Not a markdown file in this repo, and not a GitHub issue in `piratefresh/word-poker` — `gh` is for PRs and workflow runs here.

## When a skill says "fetch the relevant ticket"

`get_issue` with the `STO-<n>` identifier.

## Wayfinding operations

Used by `/wayfinder`. The **map** is one issue and its **tickets** are Linear sub-issues (`save_issue` with `parentId: <map>`), so the map's children are Linear's own sub-issue list. Blocking is the `blockedBy` relation rather than a line in the body; a ticket is unblocked when every blocker is `Done` or `Canceled`. Claim by setting `assignee: "me"` — the session's first write; resolve with `save_comment`, then `state: "Done"`.
