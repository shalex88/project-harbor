import assert from "node:assert/strict";
import test from "node:test";

import { MAX_UPLOAD_BYTES } from "../lib/chunked-upload.ts";
import {
  renameUploadedFile,
  uploadFileInChunks,
} from "../lib/upload-client.ts";

const uploadId = "5a6cf3ea-1cee-4e33-9486-80e3f03db343";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("uploads a file as sequential chunks and completes at 100 percent", async () => {
  const calls = [];
  const progress = [];
  let active = 0;
  let maximumActive = 0;
  const file = new File([new Uint8Array(1_172_000)], "plans.pdf", {
    type: "application/pdf",
  });
  const request = async (url, init = {}) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    const bodySize =
      init.body instanceof Blob
        ? init.body.size
        : typeof init.body === "string"
          ? init.body.length
          : 0;
    calls.push({ url: String(url), method: init.method, bodySize });
    await Promise.resolve();
    active -= 1;
    if (String(url).includes("stage=init")) {
      return json({ uploadId, chunkSize: 512 * 1024 }, 201);
    }
    if (String(url).includes("stage=complete")) {
      return json({ generatedAt: "2026-07-27T12:00:00.000Z" }, 201);
    }
    return json({ ok: true });
  };

  const snapshot = await uploadFileInChunks({
    target: { itemId: "item-1" },
    file,
    request,
    onProgress: (value) => progress.push(value),
  });

  assert.deepEqual(snapshot, {
    generatedAt: "2026-07-27T12:00:00.000Z",
  });
  assert.equal(maximumActive, 1);
  assert.match(calls[0].url, /stage=init/);
  assert.deepEqual(
    calls
      .filter((call) => call.url.includes("stage=chunk"))
      .map((call) => call.bodySize),
    [524_288, 524_288, 123_424],
  );
  assert.match(calls.at(-1).url, /stage=complete/);
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.slice(0, -1).every((value) => value < 100));
});

test("renaming sends only the base name and returns the refreshed snapshot", async () => {
  const calls = [];
  const snapshot = await renameUploadedFile({
    fileObjectId: "file/1",
    baseName: "Quarterly plan",
    request: async (url, init = {}) => {
      calls.push({
        url: String(url),
        method: init.method,
        contentType: new Headers(init.headers).get("Content-Type"),
        body: JSON.parse(String(init.body)),
      });
      return json({ generatedAt: "2026-07-27T12:00:00.000Z" });
    },
  });

  assert.deepEqual(calls, [
    {
      url: "/api/files?id=file%2F1",
      method: "PATCH",
      contentType: "application/json",
      body: { baseName: "Quarterly plan" },
    },
  ]);
  assert.deepEqual(snapshot, {
    generatedAt: "2026-07-27T12:00:00.000Z",
  });
});

test("rename gateway failures use a rename-specific fallback", async () => {
  await assert.rejects(
    () =>
      renameUploadedFile({
        fileObjectId: "file-1",
        baseName: "Quarterly plan",
        request: async () => new Response("Bad gateway", { status: 502 }),
      }),
    /could not be renamed/i,
  );
});

test("a failed chunk prevents completion and cancels the session", async () => {
  const calls = [];
  let chunk = 0;
  const request = async (url) => {
    calls.push(String(url));
    if (String(url).includes("stage=init")) {
      return json({ uploadId, chunkSize: 512 * 1024 }, 201);
    }
    if (String(url).includes("stage=chunk")) {
      chunk += 1;
      return chunk === 2
        ? json({ error: "Chunk storage failed" }, 500)
        : json({ ok: true });
    }
    if (String(url).includes("uploadId=")) return json({ ok: true });
    throw new Error("unexpected request");
  };
  await assert.rejects(
    () =>
      uploadFileInChunks({
        target: { itemId: "item-1" },
        file: new File([new Uint8Array(600_000)], "plans.pdf", {
          type: "application/pdf",
        }),
        request,
        onProgress: () => {},
      }),
    /Chunk storage failed/,
  );
  assert.equal(calls.some((url) => url.includes("stage=complete")), false);
  assert.equal(
    calls.some(
      (url) => url.includes("uploadId=") && !url.includes("stage=chunk"),
    ),
    true,
  );
});

test("a completion conflict does not cancel the claimed session", async () => {
  const calls = [];
  const request = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method });
    if (String(url).includes("stage=init")) {
      return json({ uploadId, chunkSize: 512 * 1024 }, 201);
    }
    if (String(url).includes("stage=chunk")) {
      return json({ ok: true });
    }
    if (String(url).includes("stage=complete")) {
      return json({ error: "Upload is already being completed" }, 409);
    }
    return json({ ok: true });
  };

  await assert.rejects(
    () =>
      uploadFileInChunks({
        target: { itemId: "item-1" },
        file: new File([new Uint8Array(10)], "plans.pdf", {
          type: "application/pdf",
        }),
        request,
        onProgress: () => {},
      }),
    /already being completed/,
  );
  assert.equal(
    calls.some((call) => call.method === "DELETE"),
    false,
  );
});

test("preserves JSON errors and explains non-JSON gateway failures", async () => {
  const file = new File([new Uint8Array(10)], "plans.pdf", {
    type: "application/pdf",
  });
  await assert.rejects(
    () =>
      uploadFileInChunks({
        target: { itemId: "item-1" },
        file,
        request: async () => json({ error: "Not allowed" }, 403),
        onProgress: () => {},
      }),
    /Not allowed/,
  );
  await assert.rejects(
    () =>
      uploadFileInChunks({
        target: { itemId: "item-1" },
        file,
        request: async () => new Response("", { status: 413 }),
        onProgress: () => {},
      }),
    /too large for Project Harbor/,
  );
  await assert.rejects(
    () =>
      uploadFileInChunks({
        target: { itemId: "item-1" },
        file,
        request: async () => new Response("Bad gateway", { status: 502 }),
        onProgress: () => {},
      }),
    /could not be completed/,
  );
});

test("rejects files above 5 MiB before making a request", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      uploadFileInChunks({
        target: { itemId: "item-1" },
        file: new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "large.pdf", {
          type: "application/pdf",
        }),
        request: async () => {
          calls += 1;
          return json({});
        },
        onProgress: () => {},
      }),
    /5 MB/,
  );
  assert.equal(calls, 0);
});
