import { WorkspaceEntry } from "../workspace-entry";

export const dynamic = "force-dynamic";

export default function TimelinePage() {
  return <WorkspaceEntry initialRoute="timeline" returnTo="/timeline" />;
}
