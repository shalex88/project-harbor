import { getAppUser } from "@/lib/auth";
import { DomainError, validateWorkspaceRoute } from "@/lib/domain";
import { loadWorkspaceSnapshot } from "@/lib/repository";
import Link from "next/link";
import { notFound } from "next/navigation";
import { chatGPTSignInPath } from "./chatgpt-auth";
import type { AppRoute } from "./components/app-shell";
import { HarborApp } from "./components/harbor-app";

export async function WorkspaceEntry({
  initialRoute = "overview",
  initialProjectId,
  initialCollectionId,
  returnTo = "/",
}: {
  initialRoute?: AppRoute;
  initialProjectId?: string;
  initialCollectionId?: string;
  returnTo?: string;
}) {
  const identity = await getAppUser();
  if (!identity) return <SignInLanding returnTo={returnTo} />;

  let snapshot;
  try {
    snapshot = await loadWorkspaceSnapshot(identity);
    validateWorkspaceRoute(
      snapshot.projects,
      snapshot.collections,
      initialProjectId,
      initialCollectionId,
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "not_found") notFound();
    console.error(error);
    return <WorkspaceLoadError returnTo={returnTo} />;
  }

  return (
    <HarborApp
      initialSnapshot={snapshot}
      initialRoute={initialRoute}
      initialProjectId={initialProjectId}
      initialCollectionId={initialCollectionId}
    />
  );
}

function WorkspaceLoadError({
  returnTo,
}: {
  returnTo: string;
}) {
  return (
    <main className="entry-screen">
      <section className="entry-card entry-error">
        <span className="entry-mark" aria-hidden="true">⚓</span>
        <p className="eyebrow">Project Harbor</p>
        <h1>The workspace could not be loaded.</h1>
        <p>Try refreshing the page. If the problem continues, sign in again.</p>
        <Link className="button button-primary" href={returnTo}>Try again</Link>
      </section>
    </main>
  );
}

function SignInLanding({ returnTo }: { returnTo: string }) {
  return (
    <main className="entry-screen">
      <section className="entry-card">
        <div className="entry-brand">
          <span className="entry-mark" aria-hidden="true">⚓</span>
          <strong>Project Harbor</strong>
        </div>
        <p className="eyebrow">Shared operations workspace</p>
        <h1>Projects, dates, files, and spending—held together.</h1>
        <p className="entry-lead">
          Organize work into collections, track actionable tasks and independent
          events, store the files that matter, and compare estimates with actual
          spend.
        </p>
        <a className="button button-primary entry-action" href={chatGPTSignInPath(returnTo)}>
          Sign in with ChatGPT
        </a>
        <div className="entry-features" aria-label="Project Harbor capabilities">
          <span><strong>Tasks</strong><small>Three clear workflow states</small></span>
          <span><strong>Events</strong><small>Dated, non-actionable records</small></span>
          <span><strong>Spending</strong><small>Estimates and auditable payments</small></span>
        </div>
      </section>
      <aside className="entry-preview" aria-hidden="true">
        <div className="preview-top"><span /><span /><span /></div>
        <div className="preview-metrics">
          <span>8<small>open tasks</small></span>
          <span>4<small>upcoming events</small></span>
        </div>
        <div className="preview-lines"><span /><span /><span /><span /></div>
      </aside>
    </main>
  );
}
