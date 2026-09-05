/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
/*!
 * @license
 * Lyceum Placements - Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 * Unauthorised copying, modification or distribution of this software is prohibited.
 */
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/fonts.css";
import "./styles/app.css";
import App from "./App";

/**
 * Last line of defence: a render error in one view must never leave a blank page. The
 * boundary offers a way back to the start of the application and a reload.
 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("Unrecoverable render error", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="loading" role="alert" id="main">
        <div className="panel" style={{ maxWidth: 520, padding: "26px 28px" }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong on this screen</h1>
          <p className="muted mt2">The rest of your work is safe. Go back to the start, or reload the page.</p>
          <p className="xs muted mt2 mono" style={{ wordBreak: "break-word" }}>{this.state.error.message}</p>
          <div className="flex wrap g2 mt4">
            <button type="button" className="btn btn-primary" onClick={() => { window.location.hash = "#/"; this.setState({ error: null }); }}>Back to start</button>
            <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </main>
    );
  }
}

// The notice survives minification and is visible to any developer opening the console or the source.
declare global { interface Window { __LPL_PMS__?: { product: string; copyright: string; author: string } } }
window.__LPL_PMS__ = { product: "Lyceum Placements - Placement Management System", copyright: "Copyright (c) 2026 Bhanu Mendis. All rights reserved.", author: "Bhanu Mendis, Group IT, Lyceum Global Holdings" };
console.info("%cLyceum Placements - Placement Management System\n%cCopyright (c) 2026 Bhanu Mendis. All rights reserved.", "font-weight:600", "font-weight:400");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
