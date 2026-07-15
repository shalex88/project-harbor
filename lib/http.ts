import { AuthenticationError } from "./auth";
import { DomainError } from "./domain";

export function errorResponse(error: unknown): Response {
  if (error instanceof AuthenticationError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof DomainError) {
    const status =
      error.code === "forbidden"
        ? 403
        : error.code === "not_found"
          ? 404
          : error.code === "conflict"
            ? 409
            : 400;
    return Response.json({ error: error.message }, { status });
  }
  console.error(error);
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}
