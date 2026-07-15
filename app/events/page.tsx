import { WorkspaceEntry } from "../workspace-entry";

export const dynamic = "force-dynamic";

export default function EventsPage() {
  return <WorkspaceEntry initialRoute="events" returnTo="/events" />;
}
