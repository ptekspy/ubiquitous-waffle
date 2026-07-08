import type { AnalyzeResponse } from "@/lib/types";

export function WorkspaceHeader({ data }: { data: AnalyzeResponse | null }) {
  const username = data?.profile.username;

  return (
    <section className="workspace-header" id="overview">
      <div>
        <p className="ui-eyebrow">Workspace</p>
        <h2>{username ? `u/${username}` : "Connect a Reddit account"}</h2>
        <p className="text-muted">
          {username ? "Refresh when you want new account signals." : "Scan a Reddit account to build subreddit, format, timing, and next-post intelligence."}
        </p>
      </div>
      <div className="workspace-header__meta">
        <span className="status-pill status-pill--success">Workspace ready</span>
        <span className="status-pill">v0.3.0</span>
      </div>
    </section>
  );
}
