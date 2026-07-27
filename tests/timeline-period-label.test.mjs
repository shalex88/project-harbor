import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function renderLabel(anchor, mode) {
  const renderScript = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { TimelinePeriodLabel } from "./app/components/timeline-period-label.tsx";

    process.stdout.write(renderToStaticMarkup(
      React.createElement(TimelinePeriodLabel, {
        anchor: ${JSON.stringify(anchor)},
        mode: ${JSON.stringify(mode)},
      }),
    ));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", renderScript],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function renderControls(anchor, mode) {
  const renderScript = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { TimelinePeriodControls } from "./app/components/timeline-period-label.tsx";

    const noop = () => {};
    process.stdout.write(renderToStaticMarkup(
      React.createElement(TimelinePeriodControls, {
        anchor: ${JSON.stringify(anchor)},
        mode: ${JSON.stringify(mode)},
        onPrevious: noop,
        onToday: noop,
        onNext: noop,
      }),
    ));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", renderScript],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("renders the active timeline period as visible live text", () => {
  const monthHtml = renderLabel("2026-08-15", "month");
  const weekHtml = renderLabel("2026-08-15", "week");

  assert.match(
    monthHtml,
    /<strong class="timeline-period-label" aria-live="polite">August 2026<\/strong>/,
  );
  assert.match(weekHtml, />August 9–15, 2026<\/strong>/);
});

test("renders month and week labels inside the timeline period controls", () => {
  for (const [anchor, mode, label] of [
    ["2026-08-15", "month", "August 2026"],
    ["2026-08-15", "week", "August 9–15, 2026"],
  ]) {
    const html = renderControls(anchor, mode);

    assert.match(html, /<div class="timeline-period-controls">/);
    assert.match(html, new RegExp(`>${label}</strong>`));
    assert.match(html, /aria-label="Previous period"/);
    assert.match(html, />Today</);
    assert.match(html, /aria-label="Next period"/);
  }
});
