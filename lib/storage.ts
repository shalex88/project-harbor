import { getPlatformEnv } from "./platform-env";

function bucket(): R2Bucket {
  const { BUCKET } = getPlatformEnv();
  if (!BUCKET) {
    throw new Error("Cloudflare R2 binding `BUCKET` is unavailable");
  }
  return BUCKET;
}

export async function putObject(
  key: string,
  file: File,
  contentType: string,
): Promise<void> {
  await bucket().put(key, file.stream(), {
    httpMetadata: { contentType },
  });
}

export async function getObject(key: string): Promise<R2ObjectBody | null> {
  return bucket().get(key);
}

export async function deleteObject(key: string): Promise<void> {
  await bucket().delete(key);
}

export async function deleteObjectsBestEffort(keys: string[]): Promise<void> {
  let pending = [...new Set(keys)];
  for (let attempt = 0; attempt < 2 && pending.length; attempt += 1) {
    const results = await Promise.allSettled(
      pending.map((key) => deleteObject(key)),
    );
    pending = pending.filter((_, index) => results[index]?.status === "rejected");
  }
}

export function downloadHeaders(input: {
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Headers {
  const headers = new Headers({
    "Content-Type": input.contentType || "application/octet-stream",
    "Content-Length": String(input.sizeBytes),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const ascii = input.filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  headers.set(
    "Content-Disposition",
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(input.filename)}`,
  );
  return headers;
}
