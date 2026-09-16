/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Skeletons: the shape of the content before the content. Decorative (aria-hidden); the
 * region that contains them carries role="status" and aria-busy.
 */
import React from "react";

export function Skeleton({ kind = "text", width, height, lines = 1, className = "" }: { kind?: "text" | "block" | "avatar" | "ring" | "row"; width?: number | string; height?: number; lines?: number; className?: string }) {
  if (kind === "text") {
    return (
      <span className={`sk-lines ${className}`} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => <span key={i} className="skeleton sk-text" style={{ width: i === lines - 1 && lines > 1 ? "62%" : width ?? "100%" }} />)}
      </span>
    );
  }
  if (kind === "avatar") return <span className={`skeleton sk-avatar ${className}`} style={{ width: width ?? 32, height: height ?? width ?? 32 }} aria-hidden="true" />;
  if (kind === "ring") return <span className={`skeleton sk-ring ${className}`} style={{ width: width ?? 116, height: height ?? width ?? 116 }} aria-hidden="true" />;
  if (kind === "row") {
    return (
      <span className={`sk-row ${className}`} aria-hidden="true">
        <span className="skeleton sk-avatar" style={{ width: 32, height: 32 }} />
        <span className="sk-lines grow"><span className="skeleton sk-text" style={{ width: "48%" }} /><span className="skeleton sk-text" style={{ width: "28%" }} /></span>
      </span>
    );
  }
  return <span className={`skeleton sk-block ${className}`} style={{ width: width ?? "100%", height: height ?? 120 }} aria-hidden="true" />;
}

/** Route-shaped placeholders for the first paint. */
export function PageSkeleton({ variant, label = "Loading" }: { variant: "dashboard" | "list" | "workspace" | "settings"; label?: string }) {
  let body: React.ReactNode;
  if (variant === "list") {
    body = (
      <>
        <Skeleton kind="block" height={56} />
        <div className="surface sk-pad"><Skeleton kind="row" /><Skeleton kind="row" /><Skeleton kind="row" /><Skeleton kind="row" /><Skeleton kind="row" /></div>
      </>
    );
  } else if (variant === "workspace") {
    body = (
      <>
        <div className="surface sk-pad sk-hero"><Skeleton kind="ring" /><span className="grow sk-lines"><Skeleton kind="text" width="40%" /><Skeleton kind="text" lines={2} /></span></div>
        <div className="sk-cols"><Skeleton kind="block" height={420} /><Skeleton kind="block" height={420} /></div>
      </>
    );
  } else if (variant === "settings") {
    body = (<div className="sk-cols"><Skeleton kind="block" height={260} /><Skeleton kind="block" height={260} /><Skeleton kind="block" height={200} /><Skeleton kind="block" height={200} /></div>);
  } else {
    body = (
      <>
        <Skeleton kind="block" height={84} />
        <div className="sk-cols wide"><Skeleton kind="block" height={320} /><Skeleton kind="block" height={320} /></div>
      </>
    );
  }
  return (
    <div className="stack page-skeleton" role="status" aria-busy="true" aria-label={label}>
      <span className="sk-lines" style={{ maxWidth: 420 }}><Skeleton kind="text" width="46%" /><Skeleton kind="text" width="72%" /></span>
      {body}
    </div>
  );
}
