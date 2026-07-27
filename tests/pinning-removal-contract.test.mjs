import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const paths = [
  "db/schema.ts",
  "lib/domain.ts",
  "lib/repository.ts",
  "app/api/files/route.ts",
  "app/components/harbor-app.tsx",
  "app/components/item-sheet.tsx",
];
const sources = await Promise.all(
  paths.map((path) => readFile(new URL(path, root), "utf8")),
);
const activeSource = sources.join("\n");

test("active application layers do not expose attachment pinning", () => {
  assert.doesNotMatch(
    activeSource,
    /\bpinned\b|togglePin|onTogglePin|setItemFilePinned|Pin file|Unpin file/,
  );
  assert.doesNotMatch(sources[3], /export async function PATCH/);
});
