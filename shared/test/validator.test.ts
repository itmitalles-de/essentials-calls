import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { hasErrors, validateTopology, validateTopologyShape, ValidationIssue } from '../src/validator';
import { extension, ivr, queue, ringGroup, topology, voicemailNode } from '../src/testFixtures';
import { Topology } from '../src/types';

function codes(issues: ValidationIssue[]): string[] {
  return issues.map((i) => i.code);
}

/** A minimal valid topology: IVR with one digit branch into a staffed ring group. */
function validTopology(): Topology {
  return topology({
    nodes: [extension('ext-a', '101'), extension('ext-b', '102'), ringGroup('rg'), ivr('ivr')],
    edges: [
      { id: 'e1', source: 'ivr', target: 'rg', condition: { type: 'digit', value: '1' } },
      { id: 'e2', source: 'ivr', target: 'ext-a', condition: { type: 'timeout' } },
    ],
    memberships: [
      { id: 'm1', groupId: 'rg', memberId: 'ext-a', role: 'member', position: 1 },
      { id: 'm2', groupId: 'rg', memberId: 'ext-b', role: 'member', position: 2 },
    ],
  });
}

describe('validateTopologyShape', () => {
  test('rejects non-objects without throwing', () => {
    for (const input of [null, undefined, 42, 'nope', []]) {
      const issues = validateTopologyShape(input);
      assert.ok(issues.length > 0, `expected issues for ${JSON.stringify(input)}`);
      assert.equal(issues[0].code, 'malformed-topology');
    }
  });

  test('rejects missing collections', () => {
    const issues = validateTopologyShape({ id: 'x', name: 'y' });
    assert.deepEqual(
      issues.map((i) => i.message),
      [
        'Feld "nodes" fehlt oder ist kein Array.',
        'Feld "edges" fehlt oder ist kein Array.',
        'Feld "memberships" fehlt oder ist kein Array.',
      ]
    );
  });

  test('rejects nodes missing required fields', () => {
    const issues = validateTopologyShape({ id: 'x', name: 'y', nodes: [{ id: 'n' }], edges: [], memberships: [] });
    assert.ok(codes(issues).includes('malformed-node'));
  });

  test('accepts a well-formed topology', () => {
    assert.deepEqual(validateTopologyShape(validTopology()), []);
  });
});

describe('validateTopology', () => {
  test('accepts a valid topology', () => {
    const issues = validateTopology(validTopology());
    assert.deepEqual(issues.filter((i) => i.severity === 'error'), []);
  });

  test('never throws on malformed input', () => {
    // The API hands untrusted JSON straight to the validator.
    assert.doesNotThrow(() => validateTopology({} as Topology));
    assert.ok(hasErrors(validateTopology({} as Topology)));
  });

  test('rejects duplicate extension numbers', () => {
    const t = topology({ nodes: [extension('a', '101'), extension('b', '101')] });
    assert.ok(codes(validateTopology(t)).includes('duplicate-extension-number'));
  });

  test('rejects duplicate mailboxes across extension and voicemail nodes', () => {
    const t = topology({
      nodes: [
        extension('a', '101', { voicemail: { enabled: true, mailbox: '900' } }),
        voicemailNode('vm', '900'),
      ],
    });
    assert.ok(codes(validateTopology(t)).includes('duplicate-mailbox'));
  });

  test('rejects two edges bound to the same IVR digit', () => {
    const t = topology({
      nodes: [ivr('ivr'), extension('a', '101'), extension('b', '102')],
      edges: [
        { id: 'e1', source: 'ivr', target: 'a', condition: { type: 'digit', value: '1' } },
        { id: 'e2', source: 'ivr', target: 'b', condition: { type: 'digit', value: '1' } },
      ],
    });
    assert.ok(codes(validateTopology(t)).includes('duplicate-digit-condition'));
  });

  test('rejects a second fallback edge on a ring group', () => {
    const t = topology({
      nodes: [ringGroup('rg'), extension('a', '101'), extension('b', '102')],
      edges: [
        { id: 'e1', source: 'rg', target: 'a', condition: { type: 'unconditional' } },
        { id: 'e2', source: 'rg', target: 'b', condition: { type: 'timeout' } },
      ],
      memberships: [{ id: 'm1', groupId: 'rg', memberId: 'a', role: 'member' }],
    });
    assert.ok(codes(validateTopology(t)).includes('ambiguous-fallback'));
  });

  test('rejects groups without members', () => {
    const t = topology({ nodes: [ringGroup('rg'), queue('q')] });
    const found = codes(validateTopology(t)).filter((c) => c === 'group-without-members');
    assert.equal(found.length, 2);
  });

  test('rejects voicemail nodes with outgoing edges', () => {
    const t = topology({
      nodes: [voicemailNode('vm', '900'), extension('a', '101')],
      edges: [{ id: 'e1', source: 'vm', target: 'a', condition: { type: 'unconditional' } }],
    });
    assert.ok(codes(validateTopology(t)).includes('voicemail-outgoing-edge'));
  });

  test('rejects disallowed transitions', () => {
    const t = topology({
      nodes: [queue('q'), queue('q2')],
      edges: [{ id: 'e1', source: 'q', target: 'q2', condition: { type: 'timeout' } }],
      memberships: [],
    });
    assert.ok(codes(validateTopology(t)).includes('invalid-transition'));
  });

  test('rejects self loops', () => {
    const t = topology({
      nodes: [ivr('ivr')],
      edges: [{ id: 'e1', source: 'ivr', target: 'ivr', condition: { type: 'timeout' } }],
    });
    assert.ok(codes(validateTopology(t)).includes('self-loop'));
  });

  test('warns when an extension number shadows a generated entry point', () => {
    const t = topology({ nodes: [extension('a', '600')] });
    assert.ok(codes(validateTopology(t)).includes('entrypoint-collision'));
  });
});

describe('cycle detection', () => {
  test('allows a cycle that has a timeout exit', () => {
    // IVR --digit--> Queue --timeout--> IVR is a legitimate retry loop.
    const t = topology({
      nodes: [ivr('ivr'), queue('q'), extension('a', '101')],
      edges: [
        { id: 'e1', source: 'ivr', target: 'q', condition: { type: 'digit', value: '1' } },
        { id: 'e2', source: 'q', target: 'ivr', condition: { type: 'timeout' } },
      ],
      memberships: [{ id: 'm1', groupId: 'q', memberId: 'a', role: 'agent' }],
    });
    assert.ok(!codes(validateTopology(t)).includes('infinite-cycle'));
  });

  test('rejects a cycle with no exit condition', () => {
    const t = topology({
      nodes: [ivr('ivr1'), ivr('ivr2')],
      edges: [
        { id: 'e1', source: 'ivr1', target: 'ivr2', condition: { type: 'digit', value: '1' } },
        { id: 'e2', source: 'ivr2', target: 'ivr1', condition: { type: 'digit', value: '1' } },
      ],
    });
    assert.ok(codes(validateTopology(t)).includes('infinite-cycle'));
  });

  test('finds an exit-less cycle hiding behind a sibling cycle that has an exit', () => {
    // a->b->a has a timeout exit, a->c->a does not. A plain back-edge DFS
    // reports only one cycle per back edge and can miss the second one.
    const t = topology({
      nodes: [ivr('a'), ivr('b'), ivr('c')],
      edges: [
        { id: 'ab', source: 'a', target: 'b', condition: { type: 'digit', value: '1' } },
        { id: 'ba', source: 'b', target: 'a', condition: { type: 'timeout' } },
        { id: 'ac', source: 'a', target: 'c', condition: { type: 'digit', value: '2' } },
        { id: 'ca', source: 'c', target: 'a', condition: { type: 'digit', value: '3' } },
      ],
    });
    const cycleIssues = validateTopology(t).filter((i) => i.code === 'infinite-cycle');
    assert.equal(cycleIssues.length, 1);
    assert.match(cycleIssues[0].message, /ac|ca/);
  });

  test('reports an acyclic graph as clean', () => {
    assert.ok(!codes(validateTopology(validTopology())).includes('infinite-cycle'));
  });
});
