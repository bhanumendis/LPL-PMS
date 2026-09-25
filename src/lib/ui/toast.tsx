/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import React, { createContext, useCallback, useContext, useState } from "react";
import { toneIcon, type Tone } from "./core";

interface ToastMsg { id: number; text: string; tone: Tone }
const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});
export function useToast() { return useContext(ToastCtx); }
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-3), { id, text, tone }]);
    window.setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {list.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{toneIcon[t.tone]}<span>{t.text}</span></div>)}
      </div>
    </ToastCtx.Provider>
  );
}
