import { WorkspaceEntry } from "../workspace-entry";

export const dynamic = "force-dynamic";

export default function ContactsPage() {
  return <WorkspaceEntry initialRoute="contacts" returnTo="/contacts" />;
}
