import type { IdentityUser } from "./auth.ts";
import { DomainError, type WorkspaceSnapshot } from "./domain.ts";
import {
  MAX_ARCHIVE_BYTES,
  parseProjectArchiveManifest,
  projectArchiveFilename,
  sha256Hex,
  validateArchivePayloads,
  type ProjectArchiveManifestV1,
} from "./project-archive.ts";
import {
  decodeProjectArchive,
  encodeProjectArchive,
} from "./project-archive-zip.ts";
import type {
  PlannedProjectImport,
  ProjectArchiveSource,
} from "./project-transfer-repository.ts";

export type ProjectTransferDependencies = {
  now: () => Date;
  loadSource: (
    identity: IdentityUser,
    projectId: string,
  ) => Promise<ProjectArchiveSource>;
  readObjectBytes: (key: string) => Promise<Uint8Array | null>;
  planImport: (
    identity: IdentityUser,
    manifest: ProjectArchiveManifestV1,
  ) => Promise<PlannedProjectImport>;
  putObjectBytes: (
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ) => Promise<void>;
  persistImport: (plan: PlannedProjectImport) => Promise<string>;
  deleteObjectsBestEffort: (keys: string[]) => Promise<void>;
  loadSnapshot: (identity: IdentityUser) => Promise<WorkspaceSnapshot>;
};

export type ProjectTransferService = {
  exportProjectArchive: (
    identity: IdentityUser,
    projectId: string,
  ) => Promise<{ bytes: Uint8Array; filename: string }>;
  importProjectArchive: (
    identity: IdentityUser,
    bytes: Uint8Array,
  ) => Promise<{ snapshot: WorkspaceSnapshot; projectId: string }>;
};

export function createProjectTransferService(
  dependencies: ProjectTransferDependencies,
): ProjectTransferService {
  return {
    async exportProjectArchive(identity, projectId) {
      const source = await dependencies.loadSource(identity, projectId);
      const payloads = new Map<string, Uint8Array>();
      const attachments = [];
      for (const entry of source.attachments) {
        const bytes = await dependencies.readObjectBytes(entry.r2Key);
        if (!bytes || bytes.byteLength !== entry.sizeBytes) {
          throw new DomainError("An archived project file is unavailable");
        }
        payloads.set(entry.path, bytes);
        const { r2Key: _r2Key, ...manifestEntry } = entry;
        attachments.push({
          ...manifestEntry,
          sha256: await sha256Hex(bytes),
        });
      }
      const receipts = [];
      for (const entry of source.receipts) {
        const bytes = await dependencies.readObjectBytes(entry.r2Key);
        if (!bytes || bytes.byteLength !== entry.sizeBytes) {
          throw new DomainError("An archived project file is unavailable");
        }
        payloads.set(entry.path, bytes);
        const { r2Key: _r2Key, ...manifestEntry } = entry;
        receipts.push({
          ...manifestEntry,
          sha256: await sha256Hex(bytes),
        });
      }
      const manifest = parseProjectArchiveManifest({
        format: "project-harbor-project",
        version: 1,
        exportedAt: dependencies.now().toISOString(),
        project: source.project,
        collections: source.collections,
        items: source.items,
        relations: source.relations,
        payments: source.payments,
        attachments,
        receipts,
      });
      await validateArchivePayloads(manifest, payloads);
      return {
        bytes: encodeProjectArchive(manifest, payloads),
        filename: projectArchiveFilename(manifest.project.name),
      };
    },

    async importProjectArchive(identity, bytes) {
      const decoded = await decodeProjectArchive(bytes);
      const plan = await dependencies.planImport(identity, decoded.manifest);
      const declarations = new Map(
        [...decoded.manifest.attachments, ...decoded.manifest.receipts].map(
          (entry) => [entry.path, entry],
        ),
      );
      const uploadedKeys: string[] = [];
      try {
        for (const payload of plan.payloads) {
          const declaration = declarations.get(payload.archivePath);
          const payloadBytes = decoded.payloads.get(payload.archivePath);
          if (!declaration || !payloadBytes) {
            throw new DomainError("This archive is damaged or incomplete");
          }
          uploadedKeys.push(payload.r2Key);
          try {
            await dependencies.putObjectBytes(
              payload.r2Key,
              payloadBytes,
              declaration.contentType,
            );
          } catch {
            throw new DomainError(
              "Project Harbor could not store the imported files",
            );
          }
        }
        try {
          await dependencies.persistImport(plan);
        } catch {
          throw new DomainError(
            "Project Harbor could not create the imported project",
          );
        }
      } catch (error) {
        await dependencies.deleteObjectsBestEffort(uploadedKeys);
        throw error;
      }
      return {
        snapshot: await dependencies.loadSnapshot(identity),
        projectId: plan.projectId,
      };
    },
  };
}

async function productionDependencies(): Promise<ProjectTransferDependencies> {
  const [transferRepository, repository, storage] = await Promise.all([
    import("./project-transfer-repository.ts"),
    import("./repository.ts"),
    import("./storage.ts"),
  ]);
  return {
    now: () => new Date(),
    loadSource: transferRepository.loadProjectArchiveSource,
    readObjectBytes: storage.readObjectBytes,
    planImport: transferRepository.planProjectImport,
    putObjectBytes: storage.putObjectBytes,
    persistImport: transferRepository.persistProjectImport,
    deleteObjectsBestEffort: storage.deleteObjectsBestEffort,
    loadSnapshot: repository.loadWorkspaceSnapshot,
  };
}

export async function exportProjectArchive(
  identity: IdentityUser,
  projectId: string,
): Promise<{ bytes: Uint8Array; filename: string }> {
  return createProjectTransferService(
    await productionDependencies(),
  ).exportProjectArchive(identity, projectId);
}

export async function importProjectArchive(
  identity: IdentityUser,
  bytes: Uint8Array,
): Promise<{ snapshot: WorkspaceSnapshot; projectId: string }> {
  return createProjectTransferService(
    await productionDependencies(),
  ).importProjectArchive(identity, bytes);
}

export async function readRequestBytes(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes = MAX_ARCHIVE_BYTES,
): Promise<Uint8Array> {
  if (!stream) throw new DomainError("Choose a Harbor ZIP archive");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new DomainError("This archive is too large");
    }
    chunks.push(value);
  }
  if (size === 0) throw new DomainError("Choose a Harbor ZIP archive");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
