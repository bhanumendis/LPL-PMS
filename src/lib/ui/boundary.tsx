/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Region boundary: a failing page, rail or panel shows a recovery surface without taking
 * the shell down with it. The root ErrorBoundary in main.tsx remains the last resort.
 */
import React from "react";
import { reportError } from "@/lib/errors";

export class RegionBoundary extends React.Component<{ label: string; children: React.ReactNode; compact?: boolean }, { error: Error | null; ref: string }> {
  state: { error: Error | null; ref: string } = { error: null, ref: "" };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { this.setState({ ref: reportError(error, `render error in ${this.props.label}`) }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`surface region-error ${this.props.compact ? "compact" : ""}`} role="alert">
        <p className="ui strong">This section could not be drawn</p>
        <p className="small muted mt1">The rest of your work is unaffected. Try again, or reload the page if it keeps happening.</p>
        {this.state.ref && <p className="xs muted mt1">Reference <span className="mono">{this.state.ref}</span></p>}
        <div className="flex g2 mt3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => this.setState({ error: null, ref: "" })}>Try again</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
