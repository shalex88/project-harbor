import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(
  new URL("../lib/repository.ts", import.meta.url),
  "utf8",
);

test("duplicate pending invitations produce a conflict", () => {
  assert.match(
    repository,
    /That email already has a pending invitation/,
  );
  assert.match(repository, /status = 'pending'/);
});
