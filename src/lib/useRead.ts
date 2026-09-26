/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * React bindings for the read model (src/lib/queries.ts). Every hook re-reads when the store
 * says what it answers may have changed (store.readVersion), keeps what it showed while it
 * re-reads so a list never blanks under the reader, and ignores answers that arrive after a
 * newer request was made.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { store } from "./store";
import type { CaseFilter, CaseQuery, CaseRow, Dashboard, GateQuery, GateRow, GateStats, Page, RegisterCursor, TransferQuery, TransferRow, UserCursor, UserQuery, UserRow } from "./queries";
import { PAGE_LIMIT_MAX } from "./queries";
import type { CaseRecord } from "./types";

export function useReadVersion(): number {
  return useSyncExternalStore((fn) => store.onRead(fn), () => store.readVersion, () => store.readVersion);
}

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "The list could not be loaded.");

export interface Paged<T> {
  rows: T[];
  /** No answer yet for the current query. */
  loading: boolean;
  /** Re-reading after a change; the rows shown are the previous answer. */
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  reload: () => void;
}

/**
 * Keyset paging. `key` identifies the query (null: nothing to load). After a change the pages
 * already shown are re-read as one page (up to the maximum), so the reader keeps their place.
 */
export function usePaged<T extends { cursor: C }, C>(key: string | null, fetchPage: (after: C | null, limit: number) => Promise<Page<T, C>>, pageSize = 50): Paged<T> {
  const version = useReadVersion();
  const [state, setState] = useState<{ key: string | null; rows: T[]; next: C | null; loading: boolean; refreshing: boolean; loadingMore: boolean; error: string | null }>(
    { key: null, rows: [], next: null, loading: key !== null, refreshing: false, loadingMore: false, error: null });
  const seq = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const shown = useRef(0);
  shown.current = state.key === key ? state.rows.length : 0;
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (key === null) { setState({ key, rows: [], next: null, loading: false, refreshing: false, loadingMore: false, error: null }); return; }
    const mine = ++seq.current;
    const same = state.key === key;
    setState((s) => (same ? { ...s, refreshing: true } : { key, rows: [], next: null, loading: true, refreshing: false, loadingMore: false, error: null }));
    const limit = Math.min(Math.max(pageSize, shown.current), PAGE_LIMIT_MAX);
    fetchRef.current(null, limit).then(
      (p) => { if (mine === seq.current) setState({ key, rows: p.rows, next: p.next, loading: false, refreshing: false, loadingMore: false, error: null }); },
      (e) => { if (mine === seq.current) setState((s) => ({ ...s, key, loading: false, refreshing: false, loadingMore: false, error: message(e) })); },
    );
    // state.key is read to tell a re-read from a new query; it is not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, nonce, pageSize]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (!s.next || s.loadingMore || s.key === null) return;
    const mine = ++seq.current;
    setState((t) => ({ ...t, loadingMore: true }));
    fetchRef.current(s.next, pageSize).then(
      (p) => { if (mine === seq.current) setState((t) => ({ ...t, rows: [...t.rows, ...p.rows], next: p.next, loadingMore: false })); },
      (e) => { if (mine === seq.current) setState((t) => ({ ...t, loadingMore: false, error: message(e) })); },
    );
  }, [pageSize]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = state.key === key;
  return {
    rows: current ? state.rows : [],
    loading: key !== null && (!current || state.loading),
    refreshing: current && state.refreshing,
    loadingMore: current && state.loadingMore,
    hasMore: current && state.next != null,
    error: current ? state.error : null,
    loadMore, reload,
  };
}

/** One page of cases (and more on request). `q` null loads nothing. */
export function useCasePage(q: Omit<CaseQuery, "after" | "limit"> | null, pageSize = 50): Paged<CaseRow> {
  const key = q ? JSON.stringify(q) : null;
  return usePaged<CaseRow, CaseRow["cursor"]>(key, (after, limit) => store.read.casesPage({ ...(q ?? {}), after, limit }), pageSize);
}

export function useTransfersPage(q: Omit<TransferQuery, "after" | "limit"> | null, pageSize = 50): Paged<TransferRow> {
  const key = q ? JSON.stringify(q) : null;
  return usePaged<TransferRow, RegisterCursor>(key, (after, limit) => store.read.transfersPage({ ...(q ?? {}), after, limit }), pageSize);
}

export function useGatesPage(q: Omit<GateQuery, "after" | "limit"> | null, pageSize = 50): Paged<GateRow> {
  const key = q ? JSON.stringify(q) : null;
  return usePaged<GateRow, RegisterCursor>(key, (after, limit) => store.read.gatesPage({ ...(q ?? {}), after, limit }), pageSize);
}

export function useUsersPage(q: Omit<UserQuery, "after" | "limit"> | null, pageSize = 50): Paged<UserRow> {
  const key = q ? JSON.stringify(q) : null;
  return usePaged<UserRow, UserCursor>(key, (after, limit) => store.read.usersPage({ ...(q ?? {}), after, limit }), pageSize);
}

export interface Loaded<T> { data: T | null; loading: boolean; error: string | null; reload: () => void }

/** A single answer (a dashboard, a count, statistics), re-read on change. `key` null loads nothing. */
export function useLoaded<T>(key: string | null, load: () => Promise<T>): Loaded<T> {
  const version = useReadVersion();
  const [state, setState] = useState<{ key: string | null; data: T | null; loading: boolean; error: string | null }>({ key: null, data: null, loading: key !== null, error: null });
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (key === null) { setState({ key, data: null, loading: false, error: null }); return; }
    const mine = ++seq.current;
    setState((s) => (s.key === key ? { ...s, loading: s.data === null } : { key, data: null, loading: true, error: null }));
    loadRef.current().then(
      (data) => { if (mine === seq.current) setState({ key, data, loading: false, error: null }); },
      (e) => { if (mine === seq.current) setState((s) => ({ ...s, key, loading: false, error: message(e) })); },
    );
  }, [key, version, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = state.key === key;
  return { data: current ? state.data : null, loading: key !== null && (!current || state.loading), error: current ? state.error : null, reload };
}

export function useDashboard(enabled = true): Loaded<Dashboard> {
  return useLoaded(enabled ? "dashboard" : null, () => store.read.dashboard());
}

export function useCaseCount(f: (CaseFilter & { now?: string }) | null, cap?: number): Loaded<number> {
  return useLoaded(f ? JSON.stringify([f, cap]) : null, () => store.read.casesCount(f ?? {}, cap));
}

export function useGateStats(enabled = true): Loaded<GateStats> {
  return useLoaded(enabled ? "gate-stats" : null, () => store.read.gateStats());
}

/**
 * One case document: from the session's snapshot when it is there, otherwise fetched. While
 * mounted the case is watched, so a change saved elsewhere is re-read.
 */
export function useCase(id: string | undefined, cases: Record<string, CaseRecord>): { c: CaseRecord | null; loading: boolean; error: string | null } {
  const cached = id ? cases[id] ?? null : null;
  const [state, setState] = useState<{ id?: string; loading: boolean; error: string | null }>({ loading: false, error: null });
  useEffect(() => (id ? store.watchCase(id) : undefined), [id]);
  useEffect(() => {
    if (!id || cached) return;
    let live = true;
    setState({ id, loading: true, error: null });
    store.openCase(id).then(
      () => { if (live) setState({ id, loading: false, error: null }); },
      (e) => { if (live) setState({ id, loading: false, error: message(e) }); },
    );
    return () => { live = false; };
  }, [id, cached]);
  return { c: cached, loading: !cached && !!id && (state.id !== id || state.loading), error: state.id === id ? state.error : null };
}
