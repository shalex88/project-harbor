# GitHub Actions Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing `npm test` command in GitHub Actions and display its status at the top of the README.

**Architecture:** A single GitHub Actions workflow owns CI test execution. It targets the repository's required Node.js major version, relies on the checked-in lockfile, and delegates all build-and-test behavior to `npm test`. The README only links to and displays that workflow's status.

**Tech Stack:** GitHub Actions, Node.js 22, npm, Markdown.

## Global Constraints

- Trigger CI on pushes to `main` and pull requests whose base is `main`.
- Use Node.js `22` with npm dependency caching.
- Install exactly the locked dependency graph with `npm ci`.
- Run the existing `npm test` script without duplicating its build or test commands.
- Use `test.yml` as the workflow filename and a `Tests` badge for the `main` branch.

---

### Task 1: Add the test workflow and README status badge

**Files:**
- Create: `.github/workflows/test.yml`
- Modify: `README.md:1-3`

**Interfaces:**
- Consumes: `package-lock.json`, the Node requirement in `package.json`, and the existing `npm test` script.
- Produces: a GitHub Actions workflow named `Tests` and a README badge pointing to its `main`-branch run history.

- [ ] **Step 1: Add the workflow definition**

Create `.github/workflows/test.yml` with this complete content:

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Add the README badge**

Insert this Markdown directly after `# Project Harbor` in `README.md`:

```md
[![Tests](https://github.com/shalex88/project-harbor/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/shalex88/project-harbor/actions/workflows/test.yml?query=branch%3Amain)
```

- [ ] **Step 3: Inspect the configuration and Markdown references**

Run: `sed -n '1,160p' .github/workflows/test.yml && sed -n '1,8p' README.md && git diff --check`

Expected: the workflow name is `Tests`; its only triggers are push and pull request events for `main`; Node is set to `22`; the workflow runs `npm ci` then `npm test`; the README contains a linked `Tests` badge; and `git diff --check` exits 0 without output.

- [ ] **Step 4: Run the full local validation command**

Run: `npm test`

Expected: the build completes and the Node test runner reports zero failures.

- [ ] **Step 5: Commit the CI implementation**

```bash
git add .github/workflows/test.yml README.md docs/superpowers/plans/2026-07-23-github-actions-tests.md
git commit -m "ci: run tests in GitHub Actions"
```

### Task 2: Completion audit

**Files:**
- Verify: `.github/workflows/test.yml`, `README.md`, and `package.json`

**Interfaces:**
- Consumes: Task 1 implementation and fresh local test output.
- Produces: evidence that every requested deliverable is present and matches the existing test command.

- [ ] **Step 1: Compare the implementation to the intended commands and badge**

Run:

```bash
rg -n '^name: Tests$|^  push:$|^  pull_request:$|branches: \[main\]|node-version: 22|cache: npm|npm ci|npm test' .github/workflows/test.yml
rg -n 'actions/workflows/test\.yml/badge\.svg\?branch=main|actions/workflows/test\.yml\?query=branch%3Amain' README.md
rg -n '"test"' package.json
git status --short
```

Expected: the workflow uses the existing `npm test` entry point, the badge image and link target `test.yml` on `main`, and no unrelated files are modified.
