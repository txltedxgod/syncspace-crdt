import { CanvasElement } from '../crdt/types';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * QuadTree spatial index for fast 60fps viewport boundary culling
 * and interactive shape picking.
 */
export class QuadTree {
  private bounds: BoundingBox;
  private maxElements: number;
  private maxDepth: number;
  private depth: number;
  private elements: CanvasElement[] = [];
  private nodes: QuadTree[] = [];

  constructor(bounds: BoundingBox, maxElements = 8, maxDepth = 6, depth = 0) {
    this.bounds = bounds;
    this.maxElements = maxElements;
    this.maxDepth = maxDepth;
    this.depth = depth;
  }

  public clear() {
    this.elements = [];
    for (const node of this.nodes) {
      node.clear();
    }
    this.nodes = [];
  }

  private split() {
    const subW = this.bounds.width / 2;
    const subH = this.bounds.height / 2;
    const x = this.bounds.x;
    const y = this.bounds.y;

    this.nodes[0] = new QuadTree({ x: x + subW, y: y, width: subW, height: subH }, this.maxElements, this.maxDepth, this.depth + 1);
    this.nodes[1] = new QuadTree({ x: x, y: y, width: subW, height: subH }, this.maxElements, this.maxDepth, this.depth + 1);
    this.nodes[2] = new QuadTree({ x: x, y: y + subH, width: subW, height: subH }, this.maxElements, this.maxDepth, this.depth + 1);
    this.nodes[3] = new QuadTree({ x: x + subW, y: y + subH, width: subW, height: subH }, this.maxElements, this.maxDepth, this.depth + 1);
  }

  public insert(element: CanvasElement): boolean {
    if (!this.intersects(this.bounds, element)) {
      return false;
    }

    if (this.nodes.length > 0) {
      for (const node of this.nodes) {
        if (node.insert(element)) return true;
      }
    }

    this.elements.push(element);

    if (this.elements.length > this.maxElements && this.depth < this.maxDepth && this.nodes.length === 0) {
      this.split();
      let i = 0;
      while (i < this.elements.length) {
        let moved = false;
        for (const node of this.nodes) {
          if (node.insert(this.elements[i])) {
            this.elements.splice(i, 1);
            moved = true;
            break;
          }
        }
        if (!moved) i++;
      }
    }

    return true;
  }

  public queryRange(viewport: BoundingBox): CanvasElement[] {
    const found: CanvasElement[] = [];
    this.queryInternal(viewport, found);
    return found;
  }

  private queryInternal(range: BoundingBox, results: CanvasElement[]) {
    if (!this.intersects(this.bounds, range)) {
      return;
    }

    for (const el of this.elements) {
      if (this.intersects(range, el)) {
        results.push(el);
      }
    }

    for (const node of this.nodes) {
      node.queryInternal(range, results);
    }
  }

  private intersects(a: BoundingBox, b: BoundingBox): boolean {
    return !(
      b.x > a.x + a.width ||
      b.x + b.width < a.x ||
      b.y > a.y + a.height ||
      b.y + b.height < a.y
    );
  }
}
