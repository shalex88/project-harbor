import { WorkspaceEntry } from "../../workspace-entry";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <WorkspaceEntry
      initialRoute="project"
      initialProjectId={projectId}
      returnTo={`/projects/${encodeURIComponent(projectId)}`}
    />
  );
}
