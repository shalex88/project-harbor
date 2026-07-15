import { requireAppUser } from "@/lib/auth";
import { DomainError } from "@/lib/domain";
import { errorResponse } from "@/lib/http";
import { parseMutation } from "@/lib/mutations";
import {
  applyWorkspaceMutation,
  listMutationFileKeys,
  loadWorkspaceSnapshot,
} from "@/lib/repository";
import { deleteObjectsBestEffort } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const identity = await requireAppUser();
    return Response.json(await loadWorkspaceSnapshot(identity), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireAppUser();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new DomainError("Request body must be valid JSON");
    }
    const mutation = parseMutation(body);
    const deletedObjectKeys = await listMutationFileKeys(identity, mutation);
    const snapshot = await applyWorkspaceMutation(identity, mutation);
    await deleteObjectsBestEffort(deletedObjectKeys);
    const created = mutation.action.startsWith("create_");
    return Response.json(snapshot, {
      status: created ? 201 : 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
