import { CanvasElement, CRDTOperation, LamportClock, PeerID } from './types';

function cloneElement(el: CanvasElement): CanvasElement {
  return {
    ...el,
    clock: { ...el.clock },
  };
}

function isValidClock(clock: LamportClock | undefined): clock is LamportClock {
  if (!clock || typeof clock !== 'object') {
    return false;
  }
  return (
    typeof clock.counter === 'number' &&
    Number.isFinite(clock.counter) &&
    clock.counter >= 0 &&
    typeof clock.peerId === 'string' &&
    clock.peerId.length > 0
  );
}

/**
 * Copy only whitelisted visual/geometric attributes from an untrusted payload,
 * preventing callers from mutating `id`, `clock`, `tombstone`, or prototypes.
 */
function applySanitizedPayload(
  target: CanvasElement,
  payload: Partial<CanvasElement>
): void {
  if (payload.type !== undefined) target.type = payload.type;
  if (payload.x !== undefined && Number.isFinite(payload.x)) target.x = payload.x;
  if (payload.y !== undefined && Number.isFinite(payload.y)) target.y = payload.y;
  if (payload.width !== undefined && Number.isFinite(payload.width)) {
    target.width = payload.width;
  }
  if (payload.height !== undefined && Number.isFinite(payload.height)) {
    target.height = payload.height;
  }
  if (payload.fill !== undefined) target.fill = payload.fill;
  if (payload.stroke !== undefined) target.stroke = payload.stroke;
  if (payload.text !== undefined) target.text = payload.text;
  if (payload.rotation !== undefined && Number.isFinite(payload.rotation)) {
    target.rotation = payload.rotation;
  }
  if (payload.zIndex !== undefined && Number.isFinite(payload.zIndex)) {
    target.zIndex = payload.zIndex;
  }
}

/**
 * CRDTEngine implements a Last-Write-Wins Element-Set (LWW-Element-Set)
 * ensuring strong eventual consistency without a central locking authority.
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

  public getCounter(): number {
    return this.counter;
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
    if (!op || !op.elementId || !isValidClock(op.clock)) {
      return false;
    }

    // Advance local Lamport clock to preserve causal ordering
    if (op.clock.counter > this.counter) {
      this.counter = op.clock.counter;
    }

    const existing = this.elements.get(op.elementId);

    if (existing) {
      if (this.compareClocks(op.clock, existing.clock) <= 0) {
        return false; // Stale operation discarded
      }

      if (op.type === 'DELETE') {
        existing.tombstone = true;
        existing.clock = { ...op.clock };
      } else if (op.payload) {
        // Total-order LWW: strictly newer non-delete op converges regardless of arrival order
        existing.tombstone = false;
        applySanitizedPayload(existing, op.payload);
        existing.clock = { ...op.clock };
      } else {
        return false;
      }
    } else if (op.type === 'DELETE') {
      // Record tombstone so out-of-order stale creates cannot resurrect deleted elements
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
        clock: { ...op.clock },
      });
    } else if (op.payload) {
      const newElem: CanvasElement = {
        id: op.elementId,
        type: op.payload.type ?? 'rectangle',
        x: op.payload.x ?? 0,
        y: op.payload.y ?? 0,
        width: op.payload.width ?? 100,
        height: op.payload.height ?? 100,
        fill: op.payload.fill ?? '#3b82f6',
        stroke: op.payload.stroke ?? '#1d4ed8',
        text: op.payload.text ?? '',
        rotation: op.payload.rotation,
        zIndex: op.payload.zIndex ?? 0,
        tombstone: false,
        clock: { ...op.clock },
      };
      this.elements.set(op.elementId, newElem);
    } else {
      return false;
    }

    this.operationLog.push({
      type: op.type,
      elementId: op.elementId,
      clock: { ...op.clock },
      payload: op.payload ? { ...op.payload } : undefined,
    });
    return true;
  }

  /**
   * Idempotently merges a full or partial remote snapshot using per-element LWW semantics.
   * Returns the number of elements inserted or updated locally.
   */
  public mergeSnapshot(elements: CanvasElement[]): number {
    let applied = 0;
    for (const remote of elements) {
      if (!remote || !remote.id || !isValidClock(remote.clock)) {
        continue;
      }
      if (remote.clock.counter > this.counter) {
        this.counter = remote.clock.counter;
      }
      const local = this.elements.get(remote.id);
      if (!local || this.compareClocks(remote.clock, local.clock) > 0) {
        this.elements.set(remote.id, cloneElement(remote));
        applied += 1;
      }
    }
    return applied;
  }

  /**
   * Returns operations recorded strictly after `sinceCounter` for delta synchronization.
   */
  public getOperationsSince(sinceCounter: number): CRDTOperation[] {
    return this.operationLog
      .filter((op) => op.clock.counter > sinceCounter)
      .map((op) => ({
        ...op,
        clock: { ...op.clock },
        payload: op.payload ? { ...op.payload } : undefined,
      }));
  }

  /**
   * Garbage-collects tombstone entries strictly older than `beforeCounter`.
   */
  public compactTombstones(beforeCounter: number): number {
    let removed = 0;
    for (const [id, el] of this.elements.entries()) {
      if (el.tombstone && el.clock.counter < beforeCounter) {
        this.elements.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  public getActiveElements(): CanvasElement[] {
    return Array.from(this.elements.values())
      .filter((e) => !e.tombstone)
      .map(cloneElement);
  }

  public getElement(id: string): CanvasElement | undefined {
    const el = this.elements.get(id);
    return el && !el.tombstone ? cloneElement(el) : undefined;
  }

  public exportSnapshot(): CanvasElement[] {
    return Array.from(this.elements.values()).map(cloneElement);
  }

  public loadSnapshot(elements: CanvasElement[]): void {
    this.elements.clear();
    this.operationLog = [];
    this.mergeSnapshot(elements);
  }
}
