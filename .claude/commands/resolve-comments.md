# Resolve PR Comments

Fetch all open review comments on the current PR and address them systematically.

## Step 1 — identify the PR

```bash
gh pr view --json number,title,url
```

If on a branch with no open PR, list recent PRs:
```bash
gh pr list --state open
```

## Step 2 — fetch all review comments

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  --jq '.[] | {id: .id, path: .path, line: .original_line, body: .body, resolved: .resolved}'
```

Also check PR-level (non-inline) comments:
```bash
gh api repos/{owner}/{repo}/issues/{pr_number}/comments \
  --jq '.[] | {id: .id, body: .body}'
```

## Step 3 — interpret comments as project-wide directives

**Critical rule:** A comment on a single file is a directive for the **entire project**.
- A comment on `resolvers/query.ts` about return types means *all resolver files*
- A comment on one test file about missing tests means *all similar query files*
- A comment on one story about using the addon means *all stories*

Never address a comment only in the specific file it was left on without auditing the rest of the codebase for the same issue.

## Step 4 — implement changes

Work through each comment. For each:
1. Read the comment carefully
2. Identify the full scope (which files are affected)
3. Implement the change across all affected files
4. **Post a GH reply on the thread** explaining what was done and in which commit — this is mandatory, not optional. Do not mark a comment as resolved without replying.
5. Do not mark a comment as resolved until the change and the reply are both complete

## Step 5 — reply and resolve

After implementing, leave a reply comment explaining what was done (project-wide):

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies \
  --method POST \
  --field body="Done — applied project-wide. <brief summary of what changed>"
```

To resolve a review thread (requires review ID):
```bash
gh api graphql -f query='
  mutation ResolveThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { isResolved }
    }
  }
' -f threadId="<thread_id>"
```

## Tips

- Address all comments before creating a new commit — batch the changes
- Run tests and lint after addressing all comments before pushing
- If a comment is unclear, reply asking for clarification before implementing
