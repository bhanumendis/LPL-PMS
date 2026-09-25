/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The states every paged list shares: the first load, a failed read, and the end of a page.
 */
import { RotateCw } from "lucide-react";
import { Notice } from "./core";
import { Skeleton } from "./skeleton";

/** Placeholder rows while the first page loads. */
export function ListSkeleton({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="surface sk-pad" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} kind="row" />)}
    </div>
  );
}

/** A read that failed, with the way to try again. */
export function ReadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Notice tone="bad" role="alert">
      <span className="flex aic wrap g2">
        <span className="grow">{error}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}><RotateCw aria-hidden />Try again</button>
      </span>
    </Notice>
  );
}

/** Below a list: how much is shown, and the next page on request. */
export function PageFooter({ shown, total, hasMore, loadingMore, onMore, noun }: {
  shown: number; total?: number | null; hasMore: boolean; loadingMore: boolean; onMore: () => void; noun: string;
}) {
  if (!hasMore && (total == null || total <= shown)) return null;
  return (
    <div className="page-footer flex aic jcb wrap g2">
      <span className="ui xs muted" aria-live="polite">Showing {shown.toLocaleString()}{total != null ? ` of ${total >= 10_000 ? "10,000+" : total.toLocaleString()}` : ""} {noun}</span>
      {hasMore && <button type="button" className="btn btn-secondary btn-sm" onClick={onMore} disabled={loadingMore} aria-busy={loadingMore}>{loadingMore ? "Loading…" : `Show more ${noun}`}</button>}
    </div>
  );
}
