import assert from "node:assert/strict";
import test from "node:test";

import {
  parseFileRenameInput,
  renamedFilename,
  splitFilename,
} from "../lib/file-renaming.ts";

test("filename splitting locks only the final non-empty extension", () => {
  assert.deepEqual(splitFilename("report.pdf"), {
    baseName: "report",
    extension: ".pdf",
  });
  assert.deepEqual(splitFilename("archive.tar.GZ"), {
    baseName: "archive.tar",
    extension: ".GZ",
  });
  assert.deepEqual(splitFilename("README"), {
    baseName: "README",
    extension: "",
  });
  assert.deepEqual(splitFilename(".env"), {
    baseName: ".env",
    extension: "",
  });
  assert.deepEqual(splitFilename("report."), {
    baseName: "report.",
    extension: "",
  });
});

test("rename input accepts exactly one string baseName field", () => {
  assert.deepEqual(parseFileRenameInput({ baseName: "Quarterly plan" }), {
    baseName: "Quarterly plan",
  });
  assert.throws(() => parseFileRenameInput(null), /object/i);
  assert.throws(() => parseFileRenameInput({}), /file name is required/i);
  assert.throws(
    () => parseFileRenameInput({ baseName: "plan", extension: ".txt" }),
    /unsupported field/i,
  );
});

test("renaming trims the base and preserves the exact stored extension", () => {
  assert.equal(
    renamedFilename("archive.tar.GZ", "  final.archive  "),
    "final.archive.GZ",
  );
  assert.equal(renamedFilename("README", " Release notes "), "Release notes");
  assert.equal(renamedFilename(".env", "production"), "production");
});

test("renaming rejects empty, unsafe, and overlong final names", () => {
  assert.throws(() => renamedFilename("report.pdf", "   "), /required/i);
  assert.throws(() => renamedFilename("report.pdf", "../secret"), /unsafe/i);
  assert.throws(() => renamedFilename("report.pdf", "bad\u0000name"), /unsafe/i);
  assert.throws(
    () => renamedFilename("report.pdf", "x".repeat(157)),
    /160 characters or less/i,
  );
  assert.equal(
    renamedFilename("report.pdf", "x".repeat(156)),
    `${"x".repeat(156)}.pdf`,
  );
});
