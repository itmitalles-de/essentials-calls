import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import {
  acceptSavedHistory,
  emptyHistory,
  isHistoryDirty,
  redoHistory,
  resetHistory,
  undoHistory,
  updateHistory,
} from '../src/historyState';

interface Document {
  nodes: string[];
  name: string;
}

const limit = 50;

describe('bounded editor history', () => {
  test('node creation remains undoable and redoable after save', () => {
    let state = resetHistory<Document>({ nodes: [], name: 'Initial' });
    state = updateHistory(state, (current) => ({ ...current, nodes: ['extension-1'] }), limit);
    state = acceptSavedHistory(state, state.value!);

    assert.equal(state.past.length, 1, 'save must preserve the undo stack');
    assert.equal(isHistoryDirty(state), false);

    state = undoHistory(state, limit);
    assert.deepEqual(state.value?.nodes, []);
    assert.equal(isHistoryDirty(state), true);

    state = redoHistory(state, limit);
    assert.deepEqual(state.value?.nodes, ['extension-1']);
    assert.equal(isHistoryDirty(state), false);
  });

  test('multiple changes before save remain individual history entries', () => {
    let state = resetHistory<Document>({ nodes: [], name: 'A' });
    state = updateHistory(state, (current) => ({ ...current, name: 'B' }), limit);
    state = updateHistory(state, (current) => ({ ...current, name: 'C' }), limit);
    state = acceptSavedHistory(state, state.value!);

    state = undoHistory(state, limit);
    assert.equal(state.value?.name, 'B');
    state = undoHistory(state, limit);
    assert.equal(state.value?.name, 'A');
    state = redoHistory(state, limit);
    assert.equal(state.value?.name, 'B');
    state = redoHistory(state, limit);
    assert.equal(state.value?.name, 'C');
    assert.equal(isHistoryDirty(state), false);
  });

  test('changes after save track dirty state without erasing the saved baseline', () => {
    let state = resetHistory<Document>({ nodes: ['extension-1'], name: 'Saved' });
    state = updateHistory(state, (current) => ({ ...current, name: 'Draft' }), limit);
    assert.equal(isHistoryDirty(state), true);

    state = undoHistory(state, limit);
    assert.equal(state.value?.name, 'Saved');
    assert.equal(isHistoryDirty(state), false);

    state = redoHistory(state, limit);
    assert.equal(state.value?.name, 'Draft');
    assert.equal(isHistoryDirty(state), true);
  });

  test('reload and rollback deliberately reset both history directions', () => {
    let state = emptyHistory<Document>();
    state = resetHistory({ nodes: ['persisted'], name: 'Revision 2' });
    state = updateHistory(state, (current) => ({ ...current, name: 'Unsaved' }), limit);
    state = undoHistory(state, limit);
    assert.equal(state.future.length, 1);

    state = resetHistory({ nodes: ['rolled-back'], name: 'Revision 1' });
    assert.equal(state.past.length, 0);
    assert.equal(state.future.length, 0);
    assert.equal(isHistoryDirty(state), false);
  });

  test('the configured limit bounds both undo and redo stacks', () => {
    let state = resetHistory<Document>({ nodes: [], name: '0' });
    state = updateHistory(state, (current) => ({ ...current, name: '1' }), 1);
    state = updateHistory(state, (current) => ({ ...current, name: '2' }), 1);
    assert.equal(state.past.length, 1);
    state = undoHistory(state, 1);
    assert.equal(state.value?.name, '1');
    assert.equal(state.future.length, 1);
  });
});
