import { describe, it, expect } from 'vitest';
import { CRDTEngine } from '../src/crdt/engine';
import { CRDTOperation } from '../src/crdt/types';
import { SyncSpaceRoom, validateOperation } from '../src/server/room';

describe('CRDTEngine Total-Order & Safety Guarantees', () => {
  it('converges identically across all operation arrival permutations including delete and recreate', () => {
    const ops: CRDTOperation[] = [
      {
        type: 'CREATE',
        elementId: 'shape-1',
        clock: { counter: 1, peerId: 'peer-A' },
        payload: { x: 10, y: 20, width: 100, height: 80, fill: '#ff0000' },
      },
      {
        type: 'DELETE',
        elementId: 'shape-1',
        clock: { counter: 2, peerId: 'peer-B' },
      },
      {
        type: 'UPDATE',
        elementId: 'shape-1',
        clock: { counter: 5, peerId: 'peer-C' },
        payload: { x: 250, fill: '#10b981' },
      },
    ];

    const permutations = [
      [ops[0], ops[1], ops[2]],
      [ops[0], ops[2], ops[1]],
      [ops[1], ops[0], ops[2]],
      [ops[1], ops[2], ops[0]],
      [ops[2], ops[0], ops[1]],
      [ops[2], ops[1], ops[0]],
    ];

    for (const seq of permutations) {
      const peer = new CRDTEngine('test-peer');
      for (const op of seq) {
        peer.applyOperation(op);
      }
      const elem = peer.getElement('shape-1');
      expect(elem).toBeDefined();
      expect(elem?.x).toBe(250);
      expect(elem?.fill).toBe('#10b981');
      expect(elem?.clock).toEqual({ counter: 5, peerId: 'peer-C' });
      expect(peer.getCounter()).toBe(5);
    }
  });

  it('preserves explicit zero dimensions and coordinates instead of falling back to defaults', () => {
    const engine = new CRDTEngine('peer-zero');
    engine.applyOperation({
      type: 'CREATE',
      elementId: 'arrow-1',
      clock: engine.nextClock(),
      payload: { type: 'arrow', x: 0, y: 0, width: 0, height: 0, zIndex: 0 },
    });

    const el = engine.getElement('arrow-1');
    expect(el?.x).toBe(0);
    expect(el?.y).toBe(0);
    expect(el?.width).toBe(0);
    expect(el?.height).toBe(0);
    expect(el?.zIndex).toBe(0);
  });

  it('protects immutable element metadata from payload tampering and external mutation', () => {
    const engine = new CRDTEngine('peer-sec');
    engine.applyOperation({
      type: 'CREATE',
      elementId: 'card-1',
      clock: { counter: 1, peerId: 'peer-sec' },
      payload: { x: 10, y: 20, width: 100, height: 50 },
    });

    // Attempt to overwrite id, clock, or tombstone via update payload
    engine.applyOperation({
      type: 'UPDATE',
      elementId: 'card-1',
      clock: { counter: 2, peerId: 'peer-sec' },
      payload: {
        id: 'hijacked-id',
        tombstone: true,
        clock: { counter: 999, peerId: 'attacker' },
        x: 50,
      } as Partial<ReturnType<CRDTEngine['exportSnapshot']>[number]>,
    });

    const fetched = engine.getElement('card-1');
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe('card-1');
    expect(fetched?.tombstone).toBe(false);
    expect(fetched?.clock).toEqual({ counter: 2, peerId: 'peer-sec' });
    expect(fetched?.x).toBe(50);

    // Verify mutating returned clone does not alter internal engine state
    fetched!.x = 99999;
    expect(engine.getElement('card-1')?.x).toBe(50);
  });

  it('supports idempotent snapshot merging, delta extraction, and tombstone compaction', () => {
    const peerA = new CRDTEngine('A');
    const peerB = new CRDTEngine('B');

    peerA.applyOperation({
      type: 'CREATE',
      elementId: 'e1',
      clock: peerA.nextClock(), // 1
      payload: { x: 10, y: 10 },
    });
    peerA.applyOperation({
      type: 'DELETE',
      elementId: 'e1',
      clock: peerA.nextClock(), // 2
    });
    peerA.applyOperation({
      type: 'CREATE',
      elementId: 'e2',
      clock: peerA.nextClock(), // 3
      payload: { x: 300, y: 400 },
    });

    const delta = peerA.getOperationsSince(1);
    expect(delta.length).toBe(2);

    // Peer B has a newer update on e2 and older state on e1
    peerB.applyOperation({
      type: 'CREATE',
      elementId: 'e2',
      clock: { counter: 10, peerId: 'B' },
      payload: { x: 999, y: 999 },
    });

    const firstMerge = peerB.mergeSnapshot(peerA.exportSnapshot());
    expect(firstMerge).toBe(1); // Only e1 tombstone imported; e2 at clock 10 wins over 3
    expect(peerB.getElement('e1')).toBeUndefined();
    expect(peerB.getElement('e2')?.x).toBe(999);

    // Repeating mergeSnapshot is strictly idempotent
    expect(peerB.mergeSnapshot(peerA.exportSnapshot())).toBe(0);

    // Compaction purges tombstones older than watermark counter
    expect(peerB.compactTombstones(3)).toBe(1);
    expect(peerB.exportSnapshot().length).toBe(1);
  });
});

describe('SyncSpaceRoom Validation & Presence Lifecycle', () => {
  it('rejects malformed WebSocket operations and cleans up peer presence on disconnect', () => {
    expect(validateOperation({ type: 'INVALID', elementId: 'x', clock: { counter: 1, peerId: 'a' } })).toBeNull();
    expect(validateOperation({ type: 'CREATE', elementId: 'x', clock: { counter: -1, peerId: 'a' } })).toBeNull();

    const room = new SyncSpaceRoom('authority');
    const socket = {};

    const bad = room.handleMessage(socket, JSON.stringify({ type: 'OPERATION', operation: { type: 'DELETE' } }));
    expect(bad.error).toBe('Invalid CRDT operation payload');

    const join = room.handleMessage(
      socket,
      JSON.stringify({
        type: 'PRESENCE',
        presence: { peerId: 'peer-1', username: 'Alice', color: '#3b82f6', cursorX: 10, cursorY: 20 },
      })
    );
    expect(join.broadcast?.type).toBe('PRESENCE');
    expect(room.getPresences().length).toBe(1);

    const leave = room.handleDisconnect(socket);
    expect(leave).toEqual({ type: 'PRESENCE_LEAVE', peerId: 'peer-1' });
    expect(room.getPresences().length).toBe(0);
  });
});
