import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { describe, test } from 'node:test';
import { fixtures, Topology } from '@visual-pbx/shared';
import { AmiClient, AmiMessage } from '../src/asterisk/amiClient';
import { AmiStatusService } from '../src/asterisk/status';

class FakeAmi extends EventEmitter {
  connected = true;
  endpoints = [{ endpoint: '101', state: 'Not in use' }];
  queues = [{ queue: 'support', calls: 0 }];
  async getEndpointStatuses() { return this.endpoints; }
  async getQueueStatuses() { return this.queues; }
  async sendAction() { return [{ Response: 'Success' }]; }
  event(message: AmiMessage) { this.emit('message', message); }
}

function topology(): Topology {
  return fixtures.topology({
    nodes: [fixtures.extension('ext', '101'), fixtures.queue('support')],
    memberships: [{ id: 'member', groupId: 'support', memberId: 'ext', role: 'agent' }],
  });
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('long-lived AMI status events', () => {
  test('applies recorded endpoint, channel, bridge, hangup and queue events', async () => {
    const ami = new FakeAmi();
    const service = new AmiStatusService(() => topology(), async () => ami as unknown as AmiClient, {
      heartbeatMs: 60_000,
      pollMs: 60_000,
      maxBackoffMs: 5,
    });
    service.start();
    await tick();
    assert.equal(service.snapshot().connection.state, 'connected');
    assert.equal(service.snapshot().statuses.find((status) => status.nodeId === 'ext')?.availability, 'online');

    ami.event({ Event: 'Newstate', Uniqueid: 'call-1', Channel: 'PJSIP/101-0001', ChannelStateDesc: 'Ringing' });
    assert.equal(service.snapshot().statuses.find((status) => status.nodeId === 'ext')?.activity, 'ringing');
    ami.event({ Event: 'BridgeEnter', Uniqueid: 'call-1', Channel: 'PJSIP/101-0001' });
    assert.equal(service.snapshot().statuses.find((status) => status.nodeId === 'ext')?.activity, 'in_call');
    ami.event({ Event: 'QueueCallerJoin', Uniqueid: 'call-2', Queue: 'support', Count: '2' });
    assert.equal(service.snapshot().statuses.find((status) => status.nodeId === 'support')?.metrics?.waitingCalls, 2);
    ami.event({ Event: 'Hangup', Uniqueid: 'call-1', Channel: 'PJSIP/101-0001' });
    assert.equal(service.snapshot().statuses.find((status) => status.nodeId === 'ext')?.activity, 'idle');
    service.stop();
  });

  test('deduplicates repeated events and snapshots again after reconnect', async () => {
    const first = new FakeAmi();
    const second = new FakeAmi();
    second.endpoints = [{ endpoint: '101', state: 'Unavailable' }];
    let calls = 0;
    const service = new AmiStatusService(
      () => topology(),
      async () => (calls++ === 0 ? first : second) as unknown as AmiClient,
      { heartbeatMs: 60_000, pollMs: 60_000, maxBackoffMs: 5 }
    );
    let updates = 0;
    service.on('update', () => updates++);
    service.start();
    await tick();
    const message = { Event: 'ContactStatus', Endpoint: '101', ContactStatus: 'Removed', SequenceNumber: '7' };
    first.event(message);
    const afterFirst = updates;
    first.event(message);
    assert.equal(updates, afterFirst, 'duplicate event must not publish twice');
    first.emit('closed');
    assert.equal(service.snapshot().connection.state, 'reconnecting');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(service.snapshot().connection.state, 'connected');
    assert.equal(service.snapshot().statuses.find((status) => status.nodeId === 'ext')?.availability, 'offline');
    service.stop();
  });
});
