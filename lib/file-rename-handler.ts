import { DomainError } from "./domain.ts";
import { parseFileRenameInput } from "./file-renaming.ts";

type FileRenameHandlerDependencies<TIdentity, TSnapshot> = {
  requireUser(): Promise<TIdentity>;
  renameFile(
    identity: TIdentity,
    fileId: string,
    baseName: string,
  ): Promise<TSnapshot>;
  handleError(error: unknown): Response;
};

export function createFileRenameHandler<TIdentity, TSnapshot>({
  requireUser,
  renameFile,
  handleError,
}: FileRenameHandlerDependencies<TIdentity, TSnapshot>) {
  return async function renameFileHandler(request: Request): Promise<Response> {
    try {
      const identity = await requireUser();
      const fileId = new URL(request.url).searchParams.get("id");
      if (!fileId) throw new DomainError("File is required");
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new DomainError("Request body must be valid JSON");
      }
      const { baseName } = parseFileRenameInput(body);
      return Response.json(await renameFile(identity, fileId, baseName), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      return handleError(error);
    }
  };
}
