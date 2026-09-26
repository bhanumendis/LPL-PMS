/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * First paint before the workspace has loaded: the bar and dock outline, then a page
 * skeleton shaped like the route that will appear.
 */
import { Wordmark } from "@/App";
import { PageSkeleton, Skeleton } from "@/lib/ui";

export function skeletonVariantFor(hash: string): "dashboard" | "list" | "workspace" | "settings" {
  const page = (hash || "#/").replace(/^#\/?/, "").split("/")[0];
  if (page === "case") return "workspace";
  if (["cases", "staff", "audit", "approvals", "escalations", "documents", "journey"].includes(page)) return "list";
  if (["settings", "roles", "dataprotection", "prompts", "profile"].includes(page)) return "settings";
  return "dashboard";
}

export function ShellSkeleton() {
  const variant = skeletonVariantFor(typeof window !== "undefined" ? window.location.hash : "");
  return (
    <div className="app shell-skeleton" aria-hidden="false">
      <header className="topbar">
        <div className="topbar-l"><Wordmark size="sm" sub={false} /></div>
        <div className="topbar-c"><span className="skeleton sk-dock" aria-hidden="true" /></div>
        <div className="topbar-r"><Skeleton kind="avatar" width={34} /></div>
      </header>
      <div className="frame">
        <main className="page" id="main">
          <PageSkeleton variant={variant} label="Opening the workspace" />
        </main>
      </div>
    </div>
  );
}
