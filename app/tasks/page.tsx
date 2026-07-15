import { WorkspaceEntry } from "../workspace-entry";

export const dynamic = "force-dynamic";

export default function TasksPage() {
  return <WorkspaceEntry initialRoute="tasks" returnTo="/tasks" />;
}
