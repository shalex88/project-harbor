import { WorkspaceEntry } from "../../../../workspace-entry";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ projectId: string; collectionId: string }>;
}) {
  const { projectId, collectionId } = await params;
  return (
    <WorkspaceEntry
      initialRoute="project"
      initialProjectId={projectId}
      initialCollectionId={collectionId}
      returnTo={`/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}`}
    />
  );
}
