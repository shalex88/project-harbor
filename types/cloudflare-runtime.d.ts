interface D1Result<T = unknown> {
  results?: T[];
  success?: boolean;
  meta: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = D1Result>(statements: D1PreparedStatement[]): Promise<T[]>;
}

interface R2ObjectBody {
  body: ReadableStream<Uint8Array>;
}

interface R2Objects {
  objects: Array<{ key: string }>;
  truncated: boolean;
  cursor?: string;
}

interface R2Bucket {
  put(
    key: string,
    value: unknown,
    options?: {
      httpMetadata?: { contentType?: string };
      onlyIf?: { etagDoesNotMatch?: string };
    },
  ): Promise<unknown | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(options: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<R2Objects>;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
