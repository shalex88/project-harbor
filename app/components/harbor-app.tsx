"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type {
  WorkspaceMutation,
  WorkspaceMutationResult,
  WorkspaceSnapshot,
} from "@/lib/domain";
import { AppShell, type AppRoute } from "./app-shell";
import {
  EventsDashboard,
  OverviewDashboard,
  SpendingDashboard,
  TasksDashboard,
  TimelineDashboard,
} from "./dashboards";
import { ItemSheet, type ItemSheetMode } from "./item-sheet";
import { ProjectWorkspace } from "./project-workspace";
import {
  Field,
  FormActions,
  Modal,
  SubmitForm,
  ToastRegion,
  type ToastMessage,
} from "./ui";

type CreateLocation = {
  type: "task" | "event";
  projectId: string;
  collectionId: string;
} | null;

export function HarborApp({
  initialSnapshot,
  initialRoute = "overview",
  initialProjectId,
  initialCollectionId,
}: {
  initialSnapshot: WorkspaceSnapshot;
  initialRoute?: AppRoute;
  initialProjectId?: string;
  initialCollectionId?: string;
}) {
  const startingProjectId =
    initialProjectId &&
    initialSnapshot.projects.some((project) => project.id === initialProjectId)
      ? initialProjectId
      : initialSnapshot.projects[0]?.id ?? null;
  const startingCollectionId =
    initialCollectionId &&
    initialSnapshot.collections.some(
      (collection) =>
        collection.id === initialCollectionId &&
        collection.projectId === startingProjectId,
    )
      ? initialCollectionId
      : initialSnapshot.collections.find(
          (collection) => collection.projectId === startingProjectId,
        )?.id ?? null;
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(startingProjectId);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(startingCollectionId);
  const [itemMode, setItemMode] = useState<ItemSheetMode>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [createLocation, setCreateLocation] = useState<CreateLocation>(null);
  const [pending, setPending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportingProjectId, setExportingProjectId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);

  const activeProject =
    snapshot.projects.find((project) => project.id === activeProjectId) ?? null;
  const activeCollections = snapshot.collections.filter(
    (collection) => collection.projectId === activeProjectId,
  );

  useEffect(() => {
    const restoreLocation = () => {
      const location = appLocation(window.location.pathname);
      setRoute(location.route);
      if (location.projectId) {
        setActiveProjectId(location.projectId);
        setActiveCollectionId(
          location.collectionId &&
            snapshot.collections.some(
              (collection) =>
                collection.id === location.collectionId &&
                collection.projectId === location.projectId,
            )
            ? location.collectionId
            : snapshot.collections.find(
                (collection) => collection.projectId === location.projectId,
              )?.id ?? null,
        );
      }
    };
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [snapshot.collections]);

  const pushToast = (
    message: string,
    tone: ToastMessage["tone"] = "success",
  ) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(
      () =>
        setToasts((current) =>
          current.filter((toast) => toast.id !== id),
        ),
      3_800,
    );
  };

  const readResponse = async (
    response: Response,
  ): Promise<WorkspaceSnapshot> => {
    const data = (await response.json()) as
      | WorkspaceSnapshot
      | { error?: string };
    if (!response.ok) {
      throw new Error(
        "error" in data && data.error
          ? data.error
          : "The request could not be completed",
      );
    }
    return data as WorkspaceSnapshot;
  };

  const readMutationResponse = async (
    response: Response,
  ): Promise<WorkspaceMutationResult> => {
    const data = (await response.json()) as
      | WorkspaceMutationResult
      | { error?: string };
    if (!response.ok) {
      throw new Error(
        "error" in data && data.error
          ? data.error
          : "The request could not be completed",
      );
    }
    return data as WorkspaceMutationResult;
  };

  const acceptSnapshot = (next: WorkspaceSnapshot) => {
    setSnapshot(next);
    const nextProjectId = next.projects.some(
      (project) => project.id === activeProjectId,
    )
      ? activeProjectId
      : next.projects[0]?.id ?? null;
    const nextCollectionId = next.collections.some(
      (collection) =>
        collection.id === activeCollectionId &&
        collection.projectId === nextProjectId,
    )
      ? activeCollectionId
      : next.collections.find(
          (collection) => collection.projectId === nextProjectId,
        )?.id ?? null;
    setActiveProjectId(nextProjectId);
    setActiveCollectionId(nextCollectionId);
    if (
      itemMode?.kind === "existing" &&
      !next.items.some((item) => item.id === itemMode.itemId)
    ) {
      setItemMode(null);
    }
  };

  const mutate = async (
    mutation: WorkspaceMutation,
  ): Promise<WorkspaceSnapshot> => {
    setPending(true);
    try {
      const result = await readMutationResponse(
        await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mutation),
        }),
      );
      acceptSnapshot(result.snapshot);
      if (
        mutation.action === "create_follow_up_task" &&
        result.createdItemId
      ) {
        setItemMode({ kind: "existing", itemId: result.createdItemId });
      }
      pushToast(successMessage(mutation));
      return result.snapshot;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save changes";
      pushToast(message, "error");
      throw error;
    } finally {
      setPending(false);
    }
  };

  const upload = async (
    target: { itemId?: string; paymentId?: string },
    file: File,
  ) => {
    setPending(true);
    try {
      const query = target.itemId
        ? `itemId=${encodeURIComponent(target.itemId)}`
        : `paymentId=${encodeURIComponent(target.paymentId ?? "")}`;
      const body = new FormData();
      body.set("file", file);
      const next = await new Promise<WorkspaceSnapshot>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", `/api/files?${query}`);
        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        });
        request.addEventListener("load", () => {
          let data: WorkspaceSnapshot | { error?: string };
          try {
            data = JSON.parse(request.responseText) as
              | WorkspaceSnapshot
              | { error?: string };
          } catch {
            reject(new Error("The upload returned an invalid response"));
            return;
          }
          if (request.status < 200 || request.status >= 300) {
            reject(
              new Error(
                "error" in data && data.error ? data.error : "Upload failed",
              ),
            );
            return;
          }
          setUploadProgress(100);
          resolve(data as WorkspaceSnapshot);
        });
        request.addEventListener("error", () =>
          reject(new Error("The upload could not reach Project Harbor")),
        );
        setUploadProgress(0);
        request.send(body);
      });
      acceptSnapshot(next);
      pushToast(target.paymentId ? "Receipt uploaded" : "File uploaded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      pushToast(message, "error");
      throw error;
    } finally {
      setPending(false);
      setUploadProgress(null);
    }
  };

  const togglePin = async (itemFileId: string, pinned: boolean) => {
    setPending(true);
    try {
      const next = await readResponse(
        await fetch("/api/files", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemFileId, pinned }),
        }),
      );
      acceptSnapshot(next);
      pushToast(pinned ? "File pinned" : "File unpinned");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update the file";
      pushToast(message, "error");
      throw error;
    } finally {
      setPending(false);
    }
  };

  const deleteFile = async (fileObjectId: string) => {
    setPending(true);
    try {
      const next = await readResponse(
        await fetch(`/api/files?id=${encodeURIComponent(fileObjectId)}`, {
          method: "DELETE",
        }),
      );
      acceptSnapshot(next);
      pushToast("File removed");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to remove the file";
      pushToast(message, "error");
      throw error;
    } finally {
      setPending(false);
    }
  };

  const navigate = (nextRoute: AppRoute) => {
    setRoute(nextRoute);
    window.history.pushState({}, "", routePath(nextRoute));
  };

  const selectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setActiveCollectionId(
      snapshot.collections.find(
        (collection) => collection.projectId === projectId,
      )?.id ?? null,
    );
    setRoute("project");
    window.history.pushState(
      {},
      "",
      `/projects/${encodeURIComponent(projectId)}`,
    );
  };

  const selectCollection = (collectionId: string) => {
    setActiveCollectionId(collectionId);
    if (!activeProjectId) return;
    window.history.pushState(
      {},
      "",
      `/projects/${encodeURIComponent(activeProjectId)}/collections/${encodeURIComponent(collectionId)}`,
    );
  };

  const exportProject = async (projectId: string) => {
    setExportingProjectId(projectId);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/archive`,
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null) as
          | { error?: string }
          | null;
        throw new Error(data?.error || "Unable to export project");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const project = snapshot.projects.find((entry) => entry.id === projectId);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = archiveDownloadFilename(
          response.headers.get("Content-Disposition"),
          project?.name ?? "project",
        );
        document.body.append(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      pushToast("Project exported");
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "Unable to export project",
        "error",
      );
    } finally {
      setExportingProjectId(null);
    }
  };

  const openCreate = (type: "task" | "event") => {
    const projectId = activeProjectId ?? snapshot.projects[0]?.id ?? "";
    const collectionId =
      snapshot.collections.find(
        (collection) => collection.projectId === projectId,
      )?.id ?? "";
    if (!projectId || !collectionId) {
      pushToast("Create a project and collection first", "info");
      setNewProjectOpen(true);
      return;
    }
    setCreateLocation({ type, projectId, collectionId });
  };

  const primaryAction = () => {
    if (route === "tasks") return openCreate("task");
    if (route === "events" || route === "timeline") {
      return openCreate("event");
    }
    if (route === "project") {
      const collectionId = activeCollectionId ?? activeCollections[0]?.id;
      if (collectionId) {
        setItemMode({ kind: "new", type: "task", collectionId });
        return;
      }
    }
    setNewProjectOpen(true);
  };

  const actionLabel =
    route === "tasks" || route === "project"
      ? "New task"
      : route === "events" || route === "timeline"
        ? "New event"
        : "New project";
  const title =
    route === "overview"
      ? `Good morning, ${snapshot.user.displayName.split(" ")[0]}`
      : route === "tasks"
        ? "Tasks"
        : route === "events"
          ? "Events"
          : route === "timeline"
            ? "Timeline"
            : route === "spending"
              ? "Spending"
              : activeProject?.name ?? "Project";

  const dashboardProps = {
    snapshot,
    onOpenItem: (itemId: string) =>
      setItemMode({ kind: "existing", itemId }),
    onNavigate: navigate,
  };

  const content = useMemo(() => {
    if (route === "tasks") return <TasksDashboard {...dashboardProps} />;
    if (route === "events") return <EventsDashboard {...dashboardProps} />;
    if (route === "timeline") {
      return <TimelineDashboard {...dashboardProps} />;
    }
    if (route === "spending") {
      return <SpendingDashboard {...dashboardProps} />;
    }
    if (route === "project" && activeProjectId) {
      return (
        <ProjectWorkspace
          snapshot={snapshot}
          projectId={activeProjectId}
          activeCollectionId={activeCollectionId}
          pending={pending}
          onSelectCollection={selectCollection}
          onCreateItem={(type, collectionId) =>
            setItemMode({ kind: "new", type, collectionId })
          }
          onOpenItem={(itemId) =>
            setItemMode({ kind: "existing", itemId })
          }
          onMutate={async (mutation) => {
            await mutate(mutation);
          }}
        />
      );
    }
    return <OverviewDashboard {...dashboardProps} />;
    // Snapshot changes intentionally rebuild the composed route view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, snapshot, activeProjectId, activeCollectionId, pending]);

  const submitProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const previousProjectIds = new Set(
      snapshot.projects.map((project) => project.id),
    );
    const data = new FormData(event.currentTarget);
    const next = await mutate({
      action: "create_project",
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
      currency: String(data.get("currency") ?? "USD"),
    });
    const created = next.projects.find(
      (project) => !previousProjectIds.has(project.id),
    );
    if (created) {
      setActiveProjectId(created.id);
      setActiveCollectionId(
        next.collections.find(
          (collection) => collection.projectId === created.id,
        )?.id ?? null,
      );
      setRoute("project");
      window.history.pushState(
        {},
        "",
        `/projects/${encodeURIComponent(created.id)}`,
      );
    }
    setNewProjectOpen(false);
  };

  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file || pending || importing) return;
    setImporting(true);
    try {
      const response = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      const data = await response.json().catch(() => null) as
        | { snapshot?: WorkspaceSnapshot; projectId?: string; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(data?.error || "Unable to import project");
      }
      if (!data?.snapshot || typeof data.projectId !== "string") {
        throw new Error("Unable to import project");
      }
      acceptSnapshot(data.snapshot);
      setActiveProjectId(data.projectId);
      setActiveCollectionId(
        data.snapshot.collections.find(
          (collection) => collection.projectId === data.projectId,
        )?.id ?? null,
      );
      setRoute("project");
      window.history.pushState(
        {},
        "",
        `/projects/${encodeURIComponent(data.projectId)}`,
      );
      setNewProjectOpen(false);
      pushToast("Project imported");
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "Unable to import project",
        "error",
      );
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
      setImporting(false);
    }
  };

  return (
    <>
      <AppShell
        user={snapshot.user}
        projects={snapshot.projects}
        route={route}
        activeProjectId={activeProjectId}
        title={title}
        actionLabel={actionLabel}
        onRouteChange={navigate}
        onProjectSelect={selectProject}
        onProjectExport={exportProject}
        exportingProjectId={exportingProjectId}
        onPrimaryAction={primaryAction}
      >
        {content}
      </AppShell>

      <ItemSheet
        snapshot={snapshot}
        mode={itemMode}
        pending={pending}
        uploadProgress={uploadProgress}
        onClose={() => setItemMode(null)}
        onMutate={mutate}
        onOpenItem={(itemId) => setItemMode({ kind: "existing", itemId })}
        onStartFollowUp={(sourceEventId, collectionId) =>
          setItemMode({ kind: "follow-up", sourceEventId, collectionId })
        }
        onUpload={upload}
        onTogglePin={togglePin}
        onDeleteFile={deleteFile}
      />

      <Modal
        open={newProjectOpen}
        title="New project"
        description="Create a shared workspace with one fixed currency."
        onClose={() => {
          if (!importing) setNewProjectOpen(false);
        }}
      >
        <SubmitForm onSubmit={submitProject}>
          <Field label="Project name">
            <input
              name="name"
              required
              maxLength={120}
              placeholder="Mobile Launch"
              disabled={importing}
            />
          </Field>
          <Field label="Description" hint="Optional">
            <textarea
              name="description"
              maxLength={1000}
              placeholder="What is this project coordinating?"
              disabled={importing}
            />
          </Field>
          <Field
            label="Project currency"
            hint="All estimates and payments in this project use this currency."
          >
            <select name="currency" defaultValue="USD" disabled={importing}>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
              <option value="ILS">ILS — Israeli New Shekel</option>
              <option value="CAD">CAD — Canadian Dollar</option>
              <option value="AUD">AUD — Australian Dollar</option>
              <option value="JPY">JPY — Japanese Yen</option>
            </select>
          </Field>
          <FormActions
            submitLabel="Create project"
            pending={pending || importing}
            onCancel={() => setNewProjectOpen(false)}
          />
        </SubmitForm>
        <section
          className="project-import-section"
          aria-labelledby="project-import-title"
        >
          <div>
            <h3 id="project-import-title">Import project</h3>
            <p>A Harbor archive creates a new project owned by you.</p>
          </div>
          <button
            className="button button-secondary archive-picker"
            type="button"
            disabled={pending || importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? "Importing…" : "Choose project archive"}
          </button>
          <input
            ref={importInputRef}
            className="sr-only"
            type="file"
            accept=".harbor.zip,.zip,application/zip"
            disabled={pending || importing}
            onChange={importProject}
          />
        </section>
      </Modal>

      <Modal
        open={Boolean(createLocation)}
        title={`New ${createLocation?.type ?? "item"}`}
        description="Choose where this item belongs."
        onClose={() => setCreateLocation(null)}
        size="small"
      >
        {createLocation ? (
          <div className="form-grid">
            <Field label="Project">
              <select
                value={createLocation.projectId}
                onChange={(event) => {
                  const projectId = event.target.value;
                  setCreateLocation({
                    ...createLocation,
                    projectId,
                    collectionId:
                      snapshot.collections.find(
                        (collection) => collection.projectId === projectId,
                      )?.id ?? "",
                  });
                }}
              >
                {snapshot.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Collection">
              <select
                value={createLocation.collectionId}
                onChange={(event) =>
                  setCreateLocation({
                    ...createLocation,
                    collectionId: event.target.value,
                  })
                }
              >
                {snapshot.collections
                  .filter(
                    (collection) =>
                      collection.projectId === createLocation.projectId,
                  )
                  .map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="form-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setCreateLocation(null)}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={!createLocation.collectionId}
                onClick={() => {
                  setItemMode({
                    kind: "new",
                    type: createLocation.type,
                    collectionId: createLocation.collectionId,
                  });
                  setCreateLocation(null);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ToastRegion messages={toasts} />
    </>
  );
}

function routePath(route: AppRoute): string {
  if (route === "overview") return "/";
  if (route === "project") return "/";
  return `/${route}`;
}

function archiveDownloadFilename(
  contentDisposition: string | null,
  projectName: string,
): string {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.replace(/^"|"$/g, ""));
    } catch {
      // Fall through to the plain filename and then the local fallback.
    }
  }
  const plain = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
  if (plain) return plain;
  const safeName = projectName
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .trim()
    .slice(0, 80) || "project";
  return `${safeName}.harbor.zip`;
}

function appLocation(pathname: string): {
  route: AppRoute;
  projectId?: string;
  collectionId?: string;
} {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments[0] === "projects" && segments[1]) {
    return {
      route: "project",
      projectId: segments[1],
      collectionId:
        segments[2] === "collections" ? segments[3] : undefined,
    };
  }
  if (
    segments[0] === "tasks" ||
    segments[0] === "events" ||
    segments[0] === "timeline" ||
    segments[0] === "spending"
  ) {
    return { route: segments[0] };
  }
  return { route: "overview" };
}

function successMessage(mutation: WorkspaceMutation): string {
  switch (mutation.action) {
    case "create_project":
      return "Project created";
    case "update_project":
      return "Project updated";
    case "delete_project":
      return "Project deleted";
    case "invite_member":
      return "Invitation saved";
    case "remove_member":
      return "Member removed";
    case "create_collection":
      return "Collection created";
    case "update_collection":
      return "Collection updated";
    case "reorder_collections":
      return "Collections reordered";
    case "delete_collection":
      return "Collection deleted";
    case "create_item":
      return mutation.type === "task" ? "Task created" : "Event created";
    case "update_item":
      return mutation.type === "task" ? "Task updated" : "Event updated";
    case "delete_item":
      return "Item deleted";
    case "create_follow_up_task":
      return "Follow-up task created";
    case "create_relation":
      return "Relationship added";
    case "delete_relation":
      return "Relationship removed";
    case "create_payment":
      return "Payment added";
    case "update_payment":
      return "Payment updated";
    case "delete_payment":
      return "Payment deleted";
  }
}
