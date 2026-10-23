// SyncSpace CRDT - Spatial QuadTree Tests

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersects(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

describe('Spatial QuadTree', () => {
  it('correctly detects overlapping viewport boxes', () => {
    const viewport: BoundingBox = { x: 0, y: 0, width: 1920, height: 1080 };
    const shapeInView: BoundingBox = { x: 100, y: 100, width: 50, height: 50 };
    const shapeOutOfView: BoundingBox = { x: 5000, y: 5000, width: 100, height: 100 };

    expect(intersects(viewport, shapeInView)).toBe(true);
    expect(intersects(viewport, shapeOutOfView)).toBe(false);
  });
});
