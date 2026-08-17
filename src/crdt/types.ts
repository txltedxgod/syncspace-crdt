export type PeerID = string;

export interface LamportClock {
  counter: number;
  peerId: PeerID;
}

export type ShapeType = 'rectangle' | 'circle' | 'diamond' | 'sticky' | 'text' | 'arrow';

export interface CanvasElement {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  text?: string;
  rotation?: number;
  zIndex: number;
  tombstone: boolean;
  clock: LamportClock;
}

export type CRDTOperationType = 'CREATE' | 'UPDATE' | 'DELETE' | 'MOVE';

export interface CRDTOperation {
  type: CRDTOperationType;
  elementId: string;
  clock: LamportClock;
  payload?: Partial<CanvasElement>;
}

export interface UserPresence {
  peerId: PeerID;
  username: string;
  color: string;
  cursorX: number;
  cursorY: number;
  selectedElementId?: string;
  lastSeen: number;
}
