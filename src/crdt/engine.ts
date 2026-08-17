import { CanvasElement, CRDTOperation, LamportClock, PeerID } from './types';

/**
 * CRDTEngine implements a Last-Write-Wins Element-Graph (LWW-Element-Set)
 * ensuring eventual consistency without a central locking authority.
 */
export class CRDTEngine {
  private peerId: PeerID;
  private counter: number = 0;
  private elements: Map<string, CanvasElement> = new Map();
  private operationLog: CRDTOperation[] = [];

  constructor(peerId: PeerID) {
    this.peerId = peerId;
  }

  public getPeerId(): PeerID {
    return this.peerId;
  }

  public nextClock(): LamportClock {
    this.counter += 1;
    return {
      counter: this.counter,
      peerId: this.peerId,
    };
  }

  public compareClocks(a: LamportClock, b: LamportClock): number {
    if (a.counter !== b.counter) {
      return a.counter - b.counter;
    }
    return a.peerId.localeCompare(b.peerId);
  }

  /**
   * Applies an incoming operation using LWW (Last-Write-Wins) conflict resolution.
   */
  public applyOperation(op: CRDTOperation): boolean {
    // Advance local clock if necessary
    if (op.clock.counter > this.counter) {
      this.counter = op.clock.counter;
    }

    const existing = this.elements.get(op.elementId);

    if (existing) {
      // Check timestamp precedence
      if (this.compareClocks(op.clock, existing.clock) <= 0) {
        return false; // Stale operation discarded
      }

      if (op.type === 'DELETE') {
        existing.tombstone = true;
        existing.clock = op.clock;
      } else if (op.payload) {
        Object.assign(existing, op.payload);
        existing.clock = op.clock;
      }
    } else {
      // New element insertion
      if (op.type === 'DELETE') {
        // Record tombstone to prevent resurrecting deleted element
        this.elements.set(op.elementId, {
          id: op.elementId,
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          fill: '#000',
          stroke: '#000',
          zIndex: 0,
          tombstone: true,
          clock: op.clock,
        });
      } else if (op.payload) {
        const newElem: CanvasElement = {
          id: op.elementId,
          type: op.payload.type || 'rectangle',
          x: op.payload.x || 0,
          y: op.payload.y || 0,
          width: op.payload.width || 100,
          height: op.payload.height || 100,
          fill: op.payload.fill || '#3b82f6',
          stroke: op.payload.stroke || '#1d4ed8',
          text: op.payload.text || '',
          zIndex: op.payload.zIndex || 0,
          tombstone: false,
          clock: op.clock,
        };
        this.elements.set(op.elementId, newElem);
      }
    }

    this.operationLog.push(op);
    return true;
  }

  public getActiveElements(): CanvasElement[] {
    return Array.from(this.elements.values()).filter((e) => !e.tombstone);
  }

  public getElement(id: string): CanvasElement | undefined {
    const el = this.elements.get(id);
    return el && !el.tombstone ? el : undefined;
  }

  public exportSnapshot(): CanvasElement[] {
    return Array.from(this.elements.values());
  }

  public loadSnapshot(elements: CanvasElement[]) {
    this.elements.clear();
    for (const el of elements) {
      this.elements.set(el.id, { ...el });
      if (el.clock.counter > this.counter) {
        this.counter = el.clock.counter;
      }
    }
  }
}
