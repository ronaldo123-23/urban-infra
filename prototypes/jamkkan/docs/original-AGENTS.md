# Project rules

- This file is the shared authority for Claude Code and Codex. Change project rules here and mention rule changes in the PR.
- Start from the current GitHub main. Read this file and PROGRESS.md before editing. Stop and report any open PR touching the same files.
- Use an owner/short-task branch. Keep one task per PR and use a type: short description commit message. Keep changes in the assigned area and disclose any shared-file changes.
- Build and test before opening a PR. Update PROGRESS.md in the same PR. Explain what changed, the affected files, how to test, and any decisions or unfinished work.
- A human reviews and merges. Keep overlapping work to one open PR. Never push directly to main, force-push shared history, or silently resolve a conflict. Report the conflicting files and both versions.
- Use Node.js 22 or later, JavaScript ES modules, and the existing HTML and CSS. Put UI files in public/, Worker code in worker/, and build and test scripts in scripts/. Reuse CSS variables in public/index.html and preserve readable Korean labels. Record new dependencies in PROGRESS.md.
- Treat dist/ as generated output. Keep deployment configuration and secrets outside the shared GitHub source.
- Explain each completed task in plain language. Raise conflicts between a user request and these rules before proceeding.
