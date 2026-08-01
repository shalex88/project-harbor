export const ALL_CONTACT_PROJECTS = "all";

export function contactsForProject<T extends { projectId: string }>(
  contacts: T[],
  selectedProjectId: string,
): T[] {
  return selectedProjectId === ALL_CONTACT_PROJECTS
    ? contacts
    : contacts.filter((contact) => contact.projectId === selectedProjectId);
}

export function normalizeContactProjectFilter(
  selectedProjectId: string,
  projects: Array<{ id: string }>,
): string {
  return selectedProjectId === ALL_CONTACT_PROJECTS ||
    projects.some((project) => project.id === selectedProjectId)
    ? selectedProjectId
    : ALL_CONTACT_PROJECTS;
}

export function contactProjectForCreate(
  selectedProjectId: string,
  projects: Array<{ id: string }>,
): string | undefined {
  const normalized = normalizeContactProjectFilter(selectedProjectId, projects);
  return normalized === ALL_CONTACT_PROJECTS ? projects[0]?.id : normalized;
}

export function contactProjectFilterAfterNavigation(
  selectedProjectId: string,
  nextRoute: string,
): string {
  return nextRoute === "contacts" ? ALL_CONTACT_PROJECTS : selectedProjectId;
}
