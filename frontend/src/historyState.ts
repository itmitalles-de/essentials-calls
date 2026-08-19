export interface HistoryState<T> {
  value: T | null;
  past: T[];
  future: T[];
  saved: T | null;
}

function same<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function appendBounded<T>(entries: T[], value: T, limit: number): T[] {
  return [...entries, value].slice(-Math.max(1, limit));
}

export function emptyHistory<T>(): HistoryState<T> {
  return { value: null, past: [], future: [], saved: null };
}

export function resetHistory<T>(next: T): HistoryState<T> {
  return { value: next, past: [], future: [], saved: next };
}

export function updateHistory<T>(
  state: HistoryState<T>,
  updater: (current: T) => T,
  limit: number
): HistoryState<T> {
  if (state.value === null) return state;
  const next = updater(state.value);
  if (same(state.value, next)) return state;
  return {
    ...state,
    value: next,
    past: appendBounded(state.past, state.value, limit),
    future: [],
  };
}

export function undoHistory<T>(state: HistoryState<T>, limit: number): HistoryState<T> {
  if (state.value === null || state.past.length === 0) return state;
  return {
    ...state,
    value: state.past.at(-1)!,
    past: state.past.slice(0, -1),
    future: [state.value, ...state.future].slice(0, Math.max(1, limit)),
  };
}

export function redoHistory<T>(state: HistoryState<T>, limit: number): HistoryState<T> {
  if (state.value === null || state.future.length === 0) return state;
  return {
    ...state,
    value: state.future[0],
    past: appendBounded(state.past, state.value, limit),
    future: state.future.slice(1),
  };
}

/**
 * Saving updates the persisted baseline but deliberately preserves undo/redo.
 * It is an editor persistence action, not a history boundary.
 */
export function acceptSavedHistory<T>(state: HistoryState<T>, next: T): HistoryState<T> {
  return { ...state, value: next, saved: next };
}

export function isHistoryDirty<T>(state: HistoryState<T>): boolean {
  return state.value !== null && state.saved !== null && !same(state.value, state.saved);
}
