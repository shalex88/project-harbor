import { WorkspaceEntry } from "../workspace-entry";

export const dynamic = "force-dynamic";

export default function SpendingPage() {
  return <WorkspaceEntry initialRoute="spending" returnTo="/spending" />;
}
