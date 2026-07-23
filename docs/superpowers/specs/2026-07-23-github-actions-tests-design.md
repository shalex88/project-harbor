# GitHub Actions Tests Design

## Goal

Run the repository's existing automated test command in GitHub Actions and
surface its status in the README.

## Workflow

Add `.github/workflows/test.yml` with a single `test` job. The workflow runs
when changes are pushed to `main` and when pull requests target `main`.

The job runs on Ubuntu, checks out the repository, configures Node.js 22 with
npm dependency caching, installs locked dependencies with `npm ci`, and runs
the existing `npm test` command. This keeps the CI validation path identical to
the local project command, including its build and Node test execution.

## README

Place a `Tests` status badge immediately below the `Project Harbor` title. The
badge uses GitHub's workflow-badge endpoint for `test.yml` on `main` and links
to the workflow's run history in this repository.

## Failure Behavior and Verification

Any dependency-install or test failure fails the GitHub Actions job. Locally,
verify the workflow definition's expected commands by running `npm test`, then
inspect the final diff to confirm the workflow, triggers, Node version, test
command, badge image URL, and badge link match this design.
