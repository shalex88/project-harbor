import type { AppRoute } from "./app-shell";

export type HeaderActionKind = "project" | "task" | "event";

export type HeaderActions = {
  primary?: HeaderActionKind;
  secondary?: HeaderActionKind;
};

export function headerActionsForRoute(route: AppRoute): HeaderActions {
  if (route === "spending") return {};
  if (route === "timeline") {
    return { secondary: "task", primary: "event" };
  }
  if (route === "tasks" || route === "project") {
    return { primary: "task" };
  }
  if (route === "events") return { primary: "event" };
  return { primary: "project" };
}
