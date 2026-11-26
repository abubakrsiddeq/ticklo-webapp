"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Undo/redo for the ticket editor. `commit(next, key)` with the same key
 * within 800 ms replaces the last step (typing in a text box is one step).
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const last = useRef<{ key: string; at: number } | null>(null);

  const commit = useCallback((next: T, key?: string) => {
    const now = Date.now();
    const merge = Boolean(key && last.current && last.current.key === key && now - last.current.at < 800);
    last.current = key ? { key, at: now } : null;
    setState((s) => ({
      past: merge ? s.past : [...s.past, s.present].slice(-100),
      present: next,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    last.current = null;
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    last.current = null;
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  return { value: state.present, commit, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
