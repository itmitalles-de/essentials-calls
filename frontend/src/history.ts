import { useCallback, useMemo, useState } from 'react';
import {
  acceptSavedHistory,
  emptyHistory,
  isHistoryDirty,
  redoHistory,
  resetHistory,
  undoHistory,
  updateHistory,
} from './historyState';

export function useBoundedHistory<T>(limit = 50) {
  const [state, setState] = useState(() => emptyHistory<T>());

  const reset = useCallback((next: T) => {
    setState(resetHistory(next));
  }, []);

  const update = useCallback(
    (updater: (current: T) => T) => {
      setState((current) => updateHistory(current, updater, limit));
    },
    [limit]
  );

  const undo = useCallback(() => {
    setState((current) => undoHistory(current, limit));
  }, [limit]);

  const redo = useCallback(() => {
    setState((current) => redoHistory(current, limit));
  }, [limit]);

  const acceptSaved = useCallback((next: T) => {
    setState((current) => acceptSavedHistory(current, next));
  }, []);

  return useMemo(
    () => ({
      value: state.value,
      reset,
      update,
      undo,
      redo,
      acceptSaved,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      dirty: isHistoryDirty(state),
    }),
    [state, reset, update, undo, redo, acceptSaved]
  );
}
