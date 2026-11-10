import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { SyncSpaceRoom } from './room';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const room = new SyncSpaceRoom('server-authority');

// Seed initial canvas with demo items
room.engine.applyOperation({
  type: 'CREATE',
  elementId: 'elem-welcome-1',
  clock: room.engine.nextClock(),
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

room.engine.applyOperation({
  type: 'CREATE',
  elementId: 'elem-box-2',
  clock: room.engine.nextClock(),
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
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'syncspace-crdt',
        activePeers: room.getPresences().length,
      })
    );
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  ws.send(JSON.stringify(room.getSnapshotPayload()));

  ws.on('message', (message: string) => {
    const result = room.handleMessage(ws, message.toString());
    if (result.broadcast) {
      broadcastExcept(ws, result.broadcast);
    } else if (result.error) {
      ws.send(JSON.stringify({ type: 'ERROR', message: result.error }));
    }
  });

  ws.on('close', () => {
    const leaveEvent = room.handleDisconnect(ws);
    if (leaveEvent) {
      broadcastExcept(ws, leaveEvent);
    }
  });
});

function broadcastExcept(sender: WebSocket, data: Record<string, unknown>) {
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
