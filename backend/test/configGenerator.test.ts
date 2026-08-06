import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { fixtures, Topology } from '@visual-pbx/shared';
import {
  generateAll,
  generateExtensionsConf,
  generatePjsipConf,
  generateQueuesConf,
  generateVoicemailConf,
} from '../src/asterisk/configGenerator';

const { extension, ivr, queue, ringGroup, topology, voicemailNode } = fixtures;

function officeTopology(): Topology {
  return topology({
    nodes: [
      extension('ext-101', '101', { voicemail: { enabled: true, mailbox: '101', pin: '1234' } }),
      extension('ext-102', '102'),
      ringGroup('rg-support'),
      ivr('ivr-welcome'),
    ],
    edges: [
      { id: 'e1', source: 'ivr-welcome', target: 'ext-101', condition: { type: 'digit', value: '1' } },
      { id: 'e2', source: 'ivr-welcome', target: 'rg-support', condition: { type: 'digit', value: '2' } },
      { id: 'e3', source: 'ivr-welcome', target: 'ext-102', condition: { type: 'timeout' } },
    ],
    memberships: [
      { id: 'm1', groupId: 'rg-support', memberId: 'ext-101', role: 'member', position: 1 },
      { id: 'm2', groupId: 'rg-support', memberId: 'ext-102', role: 'member', position: 2 },
    ],
  });
}

describe('generatePjsipConf', () => {
  test('emits aor, auth and endpoint per extension', () => {
    const conf = generatePjsipConf(officeTopology());
    assert.match(conf, /\[101\]\ntype=aor/);
    assert.match(conf, /\[101\]\ntype=auth\nauth_type=userpass\nusername=101\npassword=pw-101/);
    assert.match(conf, /\[101\]\ntype=endpoint/);
    assert.match(conf, /callerid="Ext 101" <101>/);
  });

  test('names endpoints after the SIP user, not the node id', () => {
    // Asterisk matches an incoming registration against the endpoint *name*
    // (identify_by defaults to username,ip). Naming endpoints after the node id
    // made every REGISTER fail with "No matching endpoint found".
    const t = topology({ nodes: [extension('some-node-id', '101', { sipUser: '101' })] });
    const conf = generatePjsipConf(t);
    assert.match(conf, /\[101\]/);
    assert.ok(!conf.includes('[some_node_id]'), 'must not name the endpoint after the node id');
  });

  test('cross-references auth and aors by the same endpoint name', () => {
    const conf = generatePjsipConf(officeTopology());
    assert.match(conf, /auth=101\naors=101/);
  });

  test('lets a phone re-register from a new port', () => {
    // Without remove_existing, max_contacts=1 makes Asterisk reject a restarted
    // phone with "will exceed max contacts" until the stale contact expires.
    assert.match(generatePjsipConf(officeTopology()), /max_contacts=1\nremove_existing=yes/);
  });

  test('sanitizes SIP users that are not valid Asterisk section names', () => {
    const conf = generatePjsipConf(topology({ nodes: [extension('n1', '101', { sipUser: 'user with spaces!' })] }));
    assert.match(conf, /\[user_with_spaces_\]/);
    assert.ok(!conf.includes('[user with spaces!]'));
  });
});

describe('generateExtensionsConf', () => {
  test('makes test entry points reachable from the endpoint context', () => {
    // Endpoints register into [internal]; without the include the generated
    // 600+ entry points cannot be dialled at all.
    const conf = generateExtensionsConf(officeTopology());
    const internal = conf.slice(conf.indexOf('[internal]'), conf.indexOf('[entrypoints]'));
    assert.match(internal, /include => entrypoints/);
    assert.match(conf, /\[entrypoints\]\nexten => 600,1,Goto\(callflow,node_ext_101,1\)/);
  });

  test('initialises the IVR retry counter and re-prompts via the menu label', () => {
    // Asterisk has no ${VAR:-default}; and jumping back to priority 1 would
    // reset the counter, letting a caller loop forever.
    const conf = generateExtensionsConf(officeTopology());
    assert.match(conf, /same => n,Set\(RETRY_ivr_welcome=0\)/);
    assert.match(conf, /same => n\(menu\),Background\(hello-world\)/);
    // The `0` prefix keeps `$[...]` parseable when the variable is unset —
    // Asterisk's expression parser rejects a bare `$[ + 1]`.
    assert.match(conf, /exten => i,1,Set\(RETRY_ivr_welcome=\$\[0\$\{RETRY_ivr_welcome\} \+ 1\]\)/);
    assert.match(conf, /same => n,Goto\(ivr_ivr_welcome,s,menu\)/);
    assert.ok(!conf.includes(':-0'), 'must not use shell-style default syntax');
  });

  test('routes IVR digits, timeout and invalid to their targets', () => {
    const t = officeTopology();
    t.edges.push({ id: 'e4', source: 'ivr-welcome', target: 'ext-102', condition: { type: 'invalid' } });
    const conf = generateExtensionsConf(t);
    assert.match(conf, /exten => 1,1,Goto\(callflow,node_ext_101,1\)/);
    assert.match(conf, /exten => 2,1,Goto\(callflow,node_rg_support,1\)/);
    assert.match(conf, /exten => t,1,NoOp\(IVR timeout\)\n same => n,Goto\(callflow,node_ext_102,1\)/);
    assert.match(conf, /GotoIf\(\$\[0\$\{RETRY_ivr_welcome\} >= 2\]\?callflow,node_ext_102,1\)/);
  });

  test('falls back to voicemail when an extension has no fallback edge', () => {
    const conf = generateExtensionsConf(officeTopology());
    assert.match(conf, /exten => 101,1,NoOp\(Calling Ext 101\)/);
    assert.match(conf, /same => n,VoiceMail\(101@default,u\)/);
  });

  test('dials ring group members in parallel for ringall', () => {
    const conf = generateExtensionsConf(officeTopology());
    assert.match(conf, /same => n,Dial\(PJSIP\/101&PJSIP\/102,15\)/);
  });

  test('dials ring group members sequentially for ordered strategies', () => {
    // Plain Dial() cannot express roundrobin; ignoring the strategy silently
    // would make the field meaningless.
    const t = officeTopology();
    (t.nodes[2] as ReturnType<typeof ringGroup>).properties.strategy = 'roundrobin';
    const conf = generateExtensionsConf(t);
    assert.match(conf, /same => n,Dial\(PJSIP\/101,15\)\n same => n,Dial\(PJSIP\/102,15\)/);
  });

  test('never emits a Dial() with an empty target for an empty group', () => {
    const conf = generateExtensionsConf(topology({ nodes: [ringGroup('rg-empty')] }));
    assert.ok(!/Dial\(,/.test(conf), 'must not emit Dial with empty target');
    assert.ok(!conf.includes('Dial(Hangup'), 'must not emit Dial(Hangup)');
    assert.match(conf, /NoOp\(Ring group has no members\)/);
  });

  test('passes maxWaitTime to the Queue application', () => {
    // queues.conf `timeout` is only the per-agent ring time; the overall wait
    // limit is the 5th Queue() argument.
    const t = topology({
      nodes: [queue('q-sales', { maxWaitTime: 90 }), extension('ext-a', '101')],
      memberships: [{ id: 'm1', groupId: 'q-sales', memberId: 'ext-a', role: 'agent' }],
    });
    assert.match(generateExtensionsConf(t), /same => n,Queue\(q_sales,,,,90\)/);
  });
});

describe('generateQueuesConf', () => {
  test('translates the removed roundrobin strategy to rrmemory', () => {
    // roundrobin was removed in Asterisk 12; app_queue would fall back silently.
    const t = topology({
      nodes: [queue('q', { strategy: 'roundrobin' }), extension('ext-a', '101')],
      memberships: [{ id: 'm1', groupId: 'q', memberId: 'ext-a', role: 'agent' }],
    });
    const conf = generateQueuesConf(t);
    assert.match(conf, /strategy=rrmemory/);
    assert.ok(!conf.includes('strategy=roundrobin'));
  });

  test('keeps strategies that Asterisk still supports', () => {
    const t = topology({
      nodes: [queue('q', { strategy: 'leastrecent' }), extension('ext-a', '101')],
      memberships: [{ id: 'm1', groupId: 'q', memberId: 'ext-a', role: 'agent' }],
    });
    assert.match(generateQueuesConf(t), /strategy=leastrecent/);
  });

  test('emits members in membership position order', () => {
    const t = topology({
      nodes: [queue('q'), extension('ext-a', '101'), extension('ext-b', '102')],
      memberships: [
        { id: 'm2', groupId: 'q', memberId: 'ext-b', role: 'agent', position: 1 },
        { id: 'm1', groupId: 'q', memberId: 'ext-a', role: 'agent', position: 2 },
      ],
    });
    const conf = generateQueuesConf(t);
    assert.ok(conf.indexOf('PJSIP/102') < conf.indexOf('PJSIP/101'));
  });
});

describe('generateVoicemailConf', () => {
  test('emits mailboxes for enabled extension voicemail and voicemail nodes', () => {
    const t = officeTopology();
    t.nodes.push(voicemailNode('vm-general', '900'));
    const conf = generateVoicemailConf(t);
    assert.match(conf, /^101 => 1234,Ext 101,$/m);
    assert.match(conf, /^900 => 0000,VM 900,$/m);
  });

  test('skips extensions with voicemail disabled', () => {
    const conf = generateVoicemailConf(officeTopology());
    assert.ok(!/^102 =>/m.test(conf));
  });

  test('does not re-open the [default] context that voicemail.conf already opens', () => {
    assert.ok(!generateVoicemailConf(officeTopology()).includes('[default]'));
  });
});

describe('generateAll', () => {
  test('produces all four config files', () => {
    const configs = generateAll(officeTopology());
    for (const [name, content] of Object.entries(configs)) {
      assert.ok(content.length > 0, `${name} must not be empty`);
      assert.match(content, /^; AUTO-GENERATED/);
    }
  });
});
