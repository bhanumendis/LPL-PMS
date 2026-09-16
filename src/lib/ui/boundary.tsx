/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Region boundary: a failing page, rail or panel shows a recovery surface without taking
 * the shell down with it. The root ErrorBoundary in main.tsx remains the last resort.
 */
import React from "react";

export class RegionBoundary extends React.Component<{ label: string; children: React.ReactNode; compact?: boolean }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(`Render error in ${this.props.label}`, error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`surface region-error ${this.props.compact ? "compact" : ""}`} role="alert">
        <p className="ui strong">This section could not be drawn</p>
        <p className="small muted mt1">The rest of your work is unaffected. Try again, or reload the page if it keeps happening.</p>
        <p className="xs muted mono mt1" style={{ wordBreak: "break-word" }}>{this.state.error.message}</p>
        <div className="flex g2 mt3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => this.setState({ error: null })}>Try again</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
