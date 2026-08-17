import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { CRDTEngine } from '../crdt/engine';
import { CRDTOperation, UserPresence } from '../crdt/types';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const crdtEngine = new CRDTEngine('server-authority');
const presences = new Map<string, UserPresence>();

// Seed initial canvas with demo items
crdtEngine.applyOperation({
  type: 'CREATE',
  elementId: 'elem-welcome-1',
  clock: crdtEngine.nextClock(),
  payload: {
    type: 'sticky',
    x: 100,
    y: 120,
    width: 180,
    height: 140,
    fill: '#fef08a',
    stroke: '#eab308',
    text: '🚀 Welcome to SyncSpace!\nReal-time CRDT Canvas',
    zIndex: 1,
  },
});

crdtEngine.applyOperation({
  type: 'CREATE',
  elementId: 'elem-box-2',
  clock: crdtEngine.nextClock(),
  payload: {
    type: 'rectangle',
    x: 340,
    y: 120,
    width: 220,
    height: 140,
    fill: '#3b82f6',
    stroke: '#1d4ed8',
    text: '⚡ Conflict-Free Replicated Data Types',
    zIndex: 2,
  },
});

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const filePath = path.join(__dirname, '../../src/client/index.html');
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading dashboard');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'syncspace-crdt' }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  // 1. Send full initial snapshot
  const initialPayload = {
    type: 'SNAPSHOT',
    elements: crdtEngine.exportSnapshot(),
    presences: Array.from(presences.values()),
  };
  ws.send(JSON.stringify(initialPayload));

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'OPERATION') {
        const op: CRDTOperation = data.operation;
        const accepted = crdtEngine.applyOperation(op);
        if (accepted) {
          // Broadcast to all other peers
          broadcastExcept(ws, {
            type: 'OPERATION',
            operation: op,
          });
        }
      } else if (data.type === 'PRESENCE') {
        const presence: UserPresence = data.presence;
        presences.set(presence.peerId, presence);
        broadcastExcept(ws, {
          type: 'PRESENCE',
          presence,
        });
      }
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
  });

  ws.on('close', () => {
    // Clean up
  });
});

function broadcastExcept(sender: WebSocket, data: any) {
  const jsonStr = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(jsonStr);
    }
  });
}

server.listen(PORT, () => {
  console.log(`[SyncSpace] Collaborative CRDT server running on http://localhost:${PORT}`);
});
