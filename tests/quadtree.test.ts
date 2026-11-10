import { describe, it, expect, beforeEach } from 'vitest';
import { QuadTree, BoundingBox } from '../src/spatial/quadtree';
import { CanvasElement } from '../src/crdt/types';

describe('Spatial QuadTree & Viewport Pruning', () => {
  let quadTree: QuadTree;
  const worldBounds: BoundingBox = { x: 0, y: 0, width: 4000, height: 4000 };

  const createElement = (id: string, x: number, y: number, width: number, height: number): CanvasElement => ({
    id,
    type: 'rectangle',
    x,
    y,
    width,
    height,
    fill: '#4A90E2',
    stroke: '#000000',
    zIndex: 1,
    tombstone: false,
    clock: { counter: 1, peerId: 'peer-test' },
  });

  beforeEach(() => {
    quadTree = new QuadTree(worldBounds, 4, 4);
  });

  it('correctly inserts and queries elements within a specific viewport', () => {
    const elemA = createElement('shape-1', 100, 100, 50, 50);
    const elemB = createElement('shape-2', 500, 500, 100, 100);
    const elemC = createElement('shape-3', 3500, 3500, 200, 200);

    expect(quadTree.insert(elemA)).toBe(true);
    expect(quadTree.insert(elemB)).toBe(true);
    expect(quadTree.insert(elemC)).toBe(true);

    // Viewport encompassing only shape-1
    const viewport1: BoundingBox = { x: 0, y: 0, width: 300, height: 300 };
    const results1 = quadTree.queryRange(viewport1);
    expect(results1.map((e) => e.id)).toEqual(['shape-1']);

    // Viewport encompassing shape-1 and shape-2
    const viewport2: BoundingBox = { x: 0, y: 0, width: 800, height: 800 };
    const results2 = quadTree.queryRange(viewport2);
    expect(results2.map((e) => e.id).sort()).toEqual(['shape-1', 'shape-2']);

    // Far viewport encompassing only shape-3
    const viewport3: BoundingBox = { x: 3000, y: 3000, width: 1000, height: 1000 };
    const results3 = quadTree.queryRange(viewport3);
    expect(results3.map((e) => e.id)).toEqual(['shape-3']);
  });

  it('rejects inserting elements completely outside the QuadTree boundary', () => {
    const outsideElem = createElement('outside', -1000, -1000, 50, 50);
    expect(quadTree.insert(outsideElem)).toBe(false);

    const query = quadTree.queryRange(worldBounds);
    expect(query.length).toBe(0);
  });

  it('subdivides and distributes nodes when maxElements threshold is reached', () => {
    // Insert more than maxElements (4) into the tree
    for (let i = 0; i < 12; i++) {
      const el = createElement(`bulk-${i}`, i * 200, i * 200, 80, 80);
      expect(quadTree.insert(el)).toBe(true);
    }

    // Query small localized window
    const localized = quadTree.queryRange({ x: 0, y: 0, width: 300, height: 300 });
    expect(localized.length).toBeGreaterThanOrEqual(1);
    expect(localized.length).toBeLessThan(12);

    // Query entire world bounds returns all elements
    const full = quadTree.queryRange(worldBounds);
    expect(full.length).toBe(12);
  });

  it('clears all elements and child partitions cleanly', () => {
    quadTree.insert(createElement('1', 50, 50, 20, 20));
    quadTree.insert(createElement('2', 150, 150, 20, 20));

    expect(quadTree.queryRange(worldBounds).length).toBe(2);

    quadTree.clear();
    expect(quadTree.queryRange(worldBounds).length).toBe(0);
  });

  it('handles edge-adjacent and overlapping bounding boxes', () => {
    const el1 = createElement('touch-1', 100, 100, 100, 100);
    const el2 = createElement('touch-2', 200, 100, 100, 100); // Adjacent on x edge

    quadTree.insert(el1);
    quadTree.insert(el2);

    // Query box overlapping the shared edge
    const edgeQuery = quadTree.queryRange({ x: 190, y: 120, width: 20, height: 20 });
    expect(edgeQuery.length).toBe(2);
  });
});
