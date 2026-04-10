# Create Pull Request

Create a pull request for the current branch against `main`.

## Steps

1. Check what's on this branch vs main:
   ```bash
   git log main..HEAD --oneline
   git diff main...HEAD --stat
   ```

2. Verify CI-relevant state:
   - Are there unstaged changes? (`git status`)
   - Do all tests pass? (`bun test` in server/, `bun test` in client/)
   - Does lint pass? (`bun run lint` in server/, `bun run lint` in client/)

3. Draft the PR title (≤ 70 chars) and body using this template:
   ```
   ## Summary
   - <what changed and why, 1–3 bullets>

   ## Test plan
   - [ ] Server tests pass (`bun test` in server/)
   - [ ] Client tests pass (`bun test` in client/)
   - [ ] Lint passes in both packages
   - [ ] <any manual verification steps specific to this change>

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```

4. Push the branch if not already pushed:
   ```bash
   git push -u origin HEAD
   ```

5. Create the PR:
   ```bash
   gh pr create --title "<title>" --body "<body>"
   ```

6. Return the PR URL.

## Rules

- **Never force-push** to main or master — warn the user if requested
- **Never open a PR from main** — always from a feature or fix branch
- Title uses imperative mood: "Add X", "Fix Y", "Refactor Z"
- Body focuses on *why*, not just *what* — reviewers can read the diff
- If there are open issues this PR closes, add `Closes #N` to the body
