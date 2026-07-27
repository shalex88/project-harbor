import { canManagePayment, type ProjectActor } from "./authorization.ts";
import type { IdentityUser } from "./auth.ts";
import {
  DomainError,
  type AppUser,
  type WorkspaceSnapshot,
} from "./domain.ts";
import { renamedFilename } from "./file-renaming.ts";

type FileContext = {
  projectId: string;
  filename: string;
  paymentId: string | null;
};

type Dependencies = {
  prepare(): Promise<void>;
  getUser(identity: IdentityUser): Promise<AppUser>;
  getFileContext(fileId: string): Promise<FileContext>;
  requireProjectAccess(
    userId: string,
    projectId: string,
  ): Promise<ProjectActor & { projectId: string }>;
  getPaymentContext(
    paymentId: string,
  ): Promise<{ projectId: string; createdBy: string }>;
  updateFilename(fileId: string, filename: string): Promise<void>;
  loadSnapshot(identity: IdentityUser): Promise<WorkspaceSnapshot>;
};

export function createFileRenameService(dependencies: Dependencies) {
  async function rename(
    identity: IdentityUser,
    fileId: string,
    baseName: string,
  ): Promise<WorkspaceSnapshot> {
    await dependencies.prepare();
    const user = await dependencies.getUser(identity);
    const context = await dependencies.getFileContext(fileId);
    const actor = await dependencies.requireProjectAccess(
      user.id,
      context.projectId,
    );
    if (context.paymentId) {
      const payment = await dependencies.getPaymentContext(context.paymentId);
      if (!canManagePayment(actor, payment)) {
        throw new DomainError("You cannot rename this receipt", "forbidden");
      }
    }
    const filename = renamedFilename(context.filename, baseName);
    await dependencies.updateFilename(fileId, filename);
    return dependencies.loadSnapshot(identity);
  }

  return { rename };
}
