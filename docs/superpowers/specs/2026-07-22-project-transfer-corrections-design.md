# Project Transfer Corrections Design

**Date:** 2026-07-22
**Status:** Approved as corrective work for the existing project import/export feature

## Goal

Make the project export menu visually opaque and verify that project archives
preserve exactly the payment and attachment state captured at export time.
Repair the local browser fixture so it compares the current source with a fresh
import instead of two copies made from an older archive.

## Root Causes

- `.project-context-menu` uses `var(--panel-strong)`, but `--panel-strong` is
  not defined. The browser therefore discards the background declaration and
  shows the sidebar through the menu.
- The two imported Q3 Planning projects were created from an older archive that
  contains a €123.45 test payment, one unpinned `file.svg` attachment, and a
  receipt. The source project was cleaned after that archive was created. A
  fresh source export contains no payments, attachments, or receipts.
- The paperclip beside a task means that the task has at least one attachment.
  It does not represent attachment pin state. The archived attachments in the
  two imported projects have `pinned: false`.

## Product Decisions

- Use the existing opaque `--card` surface for the project context menu. Keep
  its current border, shadow, interaction, and accessibility behavior.
- Keep archives as immutable point-in-time snapshots. Import must reproduce the
  archive contents, even if the live source project changes later.
- Preserve the complete archive contract: payments, ordinary attachments,
  receipts, and attachment pin state must round-trip exactly.
- Do not change the paperclip indicator or call an unpinned attachment pinned.
- Replace only the two identified stale local imported copies with one fresh
  import of the current source during browser verification. Do not modify the
  source project.

## Verification

- A focused UI contract test must fail while the menu uses the undefined token
  and pass when it uses `var(--card)`.
- Transfer-service tests must compare exported payments, attachments, receipts,
  payload bytes, and `pinned: false` against the source fixture.
- A zero-asset export characterization must prove that a fresh source export
  cannot acquire payment or file records from an older archive.
- Browser verification must confirm that the menu is opaque and that the fresh
  import has the same €0 actual spend and no task attachment as the source.
- Run lint, the complete test suite, and the production artifact build.

## Out of Scope

- Synchronizing an existing import with a live project.
- Updating an archive after it has been downloaded.
- Removing payment or file data that is legitimately present in an archive.
