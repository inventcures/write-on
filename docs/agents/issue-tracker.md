# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues on `inventcures/write-on`. That repo is public: never put Jason Fried's video, frames or other private material in an issue.

## Conventions

- **Create, read, list, comment, label, close**: the `gh` CLI where it is available (`gh issue create`, `gh issue view <n> --json number,title,body,labels,comments`, `gh issue list`, `gh issue comment`, `gh issue edit --add-label`, `gh issue close`). In Claude cloud sessions, where `gh` is limited to search, use the GitHub MCP tools for the same operations (`issue_write`, `issue_read`, `list_issues`, `add_issue_comment`).
- **Sub-issues**: tickets are sub-issues of their spec issue (`gh issue edit <parent> --add-sub-issue <child>`, or the MCP `sub_issue_write` tool). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Blocking**: GitHub's native issue dependencies where available (`gh issue edit <child> --add-blocked-by <blocker>`); otherwise a `## Blocked by` section listing `#<n>`. A ticket is unblocked when every blocker is closed.
- **Close**: comment with what was done (link the commit or PR), then close.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as above.
