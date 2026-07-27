import assert from "node:assert/strict";
import test from "node:test";

import { DomainError } from "../lib/domain.ts";
import { createFileRenameHandler } from "../lib/file-rename-handler.ts";

const identity = {
  email: "member@example.com",
  displayName: "Member",
};

function harness({ authenticationError = null } = {}) {
  const calls = [];
  const handler = createFileRenameHandler({
    requireUser: async () => {
      if (authenticationError) throw authenticationError;
      return identity;
    },
    renameFile: async (...args) => {
      calls.push(args);
      return { generatedAt: "2026-07-27T12:00:00.000Z" };
    },
    handleError: (error) => {
      const status =
        error === authenticationError
          ? 401
          : error instanceof DomainError
            ? 400
            : 500;
      return Response.json(
        { error: error instanceof Error ? error.message : "Unexpected error" },
        { status },
      );
    },
  });
  return { calls, handler };
}

test("rename handler authenticates before processing the request", async () => {
  const authenticationError = new Error("Sign in required");
  const { calls, handler } = harness({ authenticationError });

  const response = await handler(
    new Request("https://harbor.test/api/files?id=file-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseName: "Quarterly plan" }),
    }),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Sign in required" });
  assert.deepEqual(calls, []);
});

test("rename handler rejects missing ids, malformed JSON, and unknown fields", async () => {
  const { calls, handler } = harness();
  const cases = [
    {
      request: new Request("https://harbor.test/api/files", {
        method: "PATCH",
        body: JSON.stringify({ baseName: "Quarterly plan" }),
      }),
      message: /file is required/i,
    },
    {
      request: new Request("https://harbor.test/api/files?id=file-1", {
        method: "PATCH",
        body: "{",
      }),
      message: /valid JSON/i,
    },
    {
      request: new Request("https://harbor.test/api/files?id=file-1", {
        method: "PATCH",
        body: JSON.stringify({
          baseName: "Quarterly plan",
          extension: ".exe",
        }),
      }),
      message: /unsupported field/i,
    },
  ];

  for (const { request, message } of cases) {
    const response = await handler(request);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, message);
  }
  assert.deepEqual(calls, []);
});

test("rename handler passes only the decoded id and base name", async () => {
  const { calls, handler } = harness();

  const response = await handler(
    new Request("https://harbor.test/api/files?id=file%2F1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseName: "Quarterly plan" }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    generatedAt: "2026-07-27T12:00:00.000Z",
  });
  assert.deepEqual(calls, [[identity, "file/1", "Quarterly plan"]]);
});
