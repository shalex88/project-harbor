# Agenda text alignment design

## Goal

Align the visible start of agenda item titles and their metadata for both tasks and events, including right-to-left and mixed-language content.

## Approach

Each agenda row retains its leading status or event label. The title and metadata become children of one shared content container in the second grid column. The container uses automatic text direction so its two text lines follow the same bidirectional layout rules.

## Scope

- Update only agenda-mode timeline markup and styles.
- Preserve existing status chips, event labels, attachments, item opening, filters, and calendar views.
- Add a source-level regression test that requires the shared content container and its direction handling.

## Verification

Run the focused contract test, the complete test suite/build, linting, and inspect the rendered agenda at desktop width.
