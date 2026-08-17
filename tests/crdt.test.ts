import { describe, it, expect } from 'vitest';
import { CRDTEngine } from '../src/crdt/engine';
import { QuadTree } from '../src/spatial/quadtree';

describe('CRDTEngine Convergence Tests', () => {
  it('should converge to the same state regardless of operation arrival order', () => {
    const peerA = new CRDTEngine('peer-A');
    const peerB = new CRDTEngine('peer-B');

    // Peer A creates a shape
    const op1 = {
      type: 'CREATE' as const,
      elementId: 'elem-1',
      clock: peerA.nextClock(),
      payload: { x: 100, y: 100, width: 50, height: 50, fill: '#ff0000' },
    };

    // Peer B concurrently updates the shape with higher Lamport clock
    const clockB = peerB.nextClock();
    clockB.counter = 10; // Later in logical time
    const op2 = {
      type: 'UPDATE' as const,
      elementId: 'elem-1',
      clock: clockB,
      payload: { fill: '#00ff00' },
    };

    // Peer A applies Op1 then Op2
    peerA.applyOperation(op1);
    peerA.applyOperation(op2);

    // Peer B receives Op2 then Op1
    peerB.applyOperation(op2);
    peerB.applyOperation(op1);

    // Both peers MUST have the identical state
    const elemA = peerA.getElement('elem-1');
    const elemB = peerB.getElement('elem-1');

    expect(elemA).toBeDefined();
    expect(elemB).toBeDefined();
    expect(elemA?.fill).toBe('#00ff00');
    expect(elemB?.fill).toBe('#00ff00');
    expect(elemA?.clock.counter).toBe(elemB?.clock.counter);
  });

  it('should handle deletion tombstones correctly', () => {
    const engine = new CRDTEngine('node-1');
    const id = 'delete-target';

    engine.applyOperation({
      type: 'CREATE',
      elementId: id,
      clock: engine.nextClock(),
      payload: { x: 0, y: 0, width: 20, height: 20 },
    });

    expect(engine.getElement(id)).toBeDefined();

    engine.applyOperation({
      type: 'DELETE',
      elementId: id,
      clock: engine.nextClock(),
    });

    expect(engine.getElement(id)).toBeUndefined();
    expect(engine.getActiveElements().length).toBe(0);
  });
});

describe('QuadTree Spatial Index Tests', () => {
  it('should cull elements outside viewport', () => {
    const quad = new QuadTree({ x: 0, y: 0, width: 1000, height: 1000 });

    const elemInView = {
      id: '1',
      type: 'rectangle' as const,
      x: 50,
      y: 50,
      width: 40,
      height: 40,
      fill: '',
      stroke: '',
      zIndex: 1,
      tombstone: false,
      clock: { counter: 1, peerId: 'p1' },
    };

    const elemOutOfView = {
      id: '2',
      type: 'rectangle' as const,
      x: 800,
      y: 800,
      width: 40,
      height: 40,
      fill: '',
      stroke: '',
      zIndex: 1,
      tombstone: false,
      clock: { counter: 1, peerId: 'p1' },
    };

    quad.insert(elemInView);
    quad.insert(elemOutOfView);

    const queryResults = quad.queryRange({ x: 0, y: 0, width: 200, height: 200 });
    expect(queryResults.length).toBe(1);
    expect(queryResults[0].id).toBe('1');
  });
});
