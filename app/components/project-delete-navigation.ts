import type { AppRoute } from "./app-shell";

export function shouldLeaveDeletedProjectRoute(
  route: AppRoute,
  activeProjectId: string | null,
  deletedProjectId: string,
): boolean {
  return route === "project" && activeProjectId === deletedProjectId;
}
