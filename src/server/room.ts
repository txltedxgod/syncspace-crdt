import { CRDTEngine } from '../crdt/engine';
import { CRDTOperation, CRDTOperationType, PeerID, UserPresence } from '../crdt/types';

const VALID_OP_TYPES: ReadonlySet<CRDTOperationType> = new Set([
  'CREATE',
  'UPDATE',
  'DELETE',
  'MOVE',
]);

export function validateOperation(raw: unknown): CRDTOperation | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.type !== 'string' ||
    !VALID_OP_TYPES.has(candidate.type as CRDTOperationType)
  ) {
    return null;
  }
  if (typeof candidate.elementId !== 'string' || candidate.elementId.length === 0) {
    return null;
  }
  const clock = candidate.clock as Record<string, unknown> | undefined;
  if (
    !clock ||
    typeof clock !== 'object' ||
    typeof clock.counter !== 'number' ||
    !Number.isFinite(clock.counter) ||
    clock.counter < 0 ||
    typeof clock.peerId !== 'string' ||
    clock.peerId.length === 0
  ) {
    return null;
  }
  const payload =
    candidate.payload && typeof candidate.payload === 'object'
      ? (candidate.payload as CRDTOperation['payload'])
      : undefined;
  return {
    type: candidate.type as CRDTOperationType,
    elementId: candidate.elementId,
    clock: { counter: clock.counter, peerId: clock.peerId },
    payload,
  };
}

export function validatePresence(raw: unknown): UserPresence | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.peerId !== 'string' ||
    candidate.peerId.length === 0 ||
    typeof candidate.username !== 'string' ||
    typeof candidate.color !== 'string' ||
    typeof candidate.cursorX !== 'number' ||
    !Number.isFinite(candidate.cursorX) ||
    typeof candidate.cursorY !== 'number' ||
    !Number.isFinite(candidate.cursorY)
  ) {
    return null;
  }
  return {
    peerId: candidate.peerId,
    username: candidate.username,
    color: candidate.color,
    cursorX: candidate.cursorX,
    cursorY: candidate.cursorY,
    selectedElementId:
      typeof candidate.selectedElementId === 'string'
        ? candidate.selectedElementId
        : undefined,
    lastSeen:
      typeof candidate.lastSeen === 'number' && Number.isFinite(candidate.lastSeen)
        ? candidate.lastSeen
        : Date.now(),
  };
}

/**
 * Coordinates CRDT state synchronization and live peer presence tracking
 * across connected WebSocket clients.
 */
export class SyncSpaceRoom {
  public readonly engine: CRDTEngine;
  private presences: Map<PeerID, UserPresence> = new Map();
  private clientPeers: Map<object, PeerID> = new Map();

  constructor(authorityId: PeerID = 'server-authority') {
    this.engine = new CRDTEngine(authorityId);
  }

  public getSnapshotPayload() {
    return {
      type: 'SNAPSHOT',
      elements: this.engine.exportSnapshot(),
      presences: Array.from(this.presences.values()),
    };
  }

  public getPresences(): UserPresence[] {
    return Array.from(this.presences.values());
  }

  public handleMessage(
    client: object,
    rawMessage: string
  ): { broadcast?: Record<string, unknown>; error?: string } {
    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawMessage);
      if (!parsed || typeof parsed !== 'object') {
        return { error: 'Invalid JSON payload' };
      }
      data = parsed as Record<string, unknown>;
    } catch {
      return { error: 'Malformed JSON' };
    }

    if (data.type === 'OPERATION') {
      const op = validateOperation(data.operation);
      if (!op) {
        return { error: 'Invalid CRDT operation payload' };
      }
      if (this.engine.applyOperation(op)) {
        return { broadcast: { type: 'OPERATION', operation: op } };
      }
      return {};
    }

    if (data.type === 'PRESENCE') {
      const presence = validatePresence(data.presence);
      if (!presence) {
        return { error: 'Invalid user presence payload' };
      }
      this.clientPeers.set(client, presence.peerId);
      this.presences.set(presence.peerId, presence);
      return { broadcast: { type: 'PRESENCE', presence } };
    }

    return { error: 'Unsupported message type' };
  }

  public handleDisconnect(client: object): { type: 'PRESENCE_LEAVE'; peerId: PeerID } | null {
    const peerId = this.clientPeers.get(client);
    if (!peerId) return null;
    this.clientPeers.delete(client);
    this.presences.delete(peerId);
    return { type: 'PRESENCE_LEAVE', peerId };
  }
}
