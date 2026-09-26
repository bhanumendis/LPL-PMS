/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { toneIcon, type Tone } from "./core";
import { useReducedMotion } from "../hooks";
import { EXIT_MS, leavingAttrs } from "./presence";

interface ToastMsg { id: number; text: string; tone: Tone; leaving?: boolean }
const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});
export function useToast() { return useContext(ToastCtx); }
/** How long a message stays before it leaves. */
const SHOW_MS = 4200;
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<ToastMsg[]>([]);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const push = useCallback((text: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-3), { id, text, tone }]);
    window.setTimeout(() => {
      const drop = () => setList((l) => l.filter((t) => t.id !== id));
      if (reducedRef.current) { drop(); return; }
      setList((l) => l.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      window.setTimeout(drop, EXIT_MS.toast);
    }, SHOW_MS);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {list.map((t) => <div key={t.id} className={`toast ${t.tone}${t.leaving ? " is-leaving" : ""}`} {...leavingAttrs(!!t.leaving)}>{toneIcon[t.tone]}<span>{t.text}</span></div>)}
      </div>
    </ToastCtx.Provider>
  );
}
