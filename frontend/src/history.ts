import { useCallback, useMemo, useRef, useState } from 'react';

function same<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useBoundedHistory<T>(limit = 50) {
  const [value, setValue] = useState<T | null>(null);
  const [version, setVersion] = useState(0);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const saved = useRef<T | null>(null);

  const reset = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    saved.current = next;
    setValue(next);
    setVersion((current) => current + 1);
  }, []);

  const update = useCallback(
    (updater: (current: T) => T) => {
      setValue((current) => {
        if (current === null) return current;
        const next = updater(current);
        if (same(current, next)) return current;
        past.current = [...past.current.slice(-(limit - 1)), current];
        future.current = [];
        setVersion((entry) => entry + 1);
        return next;
      });
    },
    [limit]
  );

  const undo = useCallback(() => {
    setValue((current) => {
      const previous = past.current.at(-1);
      if (current === null || !previous) return current;
      past.current = past.current.slice(0, -1);
      future.current = [current, ...future.current].slice(0, limit);
      setVersion((entry) => entry + 1);
      return previous;
    });
  }, [limit]);

  const redo = useCallback(() => {
    setValue((current) => {
      const next = future.current[0];
      if (current === null || !next) return current;
      future.current = future.current.slice(1);
      past.current = [...past.current.slice(-(limit - 1)), current];
      setVersion((entry) => entry + 1);
      return next;
    });
  }, [limit]);

  const acceptSaved = useCallback((next: T) => {
    saved.current = next;
    setValue(next);
    setVersion((entry) => entry + 1);
  }, []);

  return useMemo(
    () => ({
      value,
      reset,
      update,
      undo,
      redo,
      acceptSaved,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
      dirty: value !== null && saved.current !== null && !same(value, saved.current),
    }),
    [value, reset, update, undo, redo, acceptSaved, version]
  );
}
