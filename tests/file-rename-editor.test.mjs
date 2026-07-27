import assert from "node:assert/strict";
import test from "node:test";

import { cancelFileRename } from "../lib/file-rename-editor.ts";

test("canceling a failed file rename clears the editor and its error", () => {
  let error = "File name is required";
  let fileId = "file-1";

  cancelFileRename(
    (value) => {
      error = value;
    },
    (value) => {
      fileId = value;
    },
  );

  assert.equal(error, "");
  assert.equal(fileId, null);
});
