# 🎨 SyncSpace CRDT

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CRDT](https://img.shields.io/badge/CRDT-Realtime-FF4088.svg)](https://crdt.tech/)


[![CI](https://github.com/txltedxgod/syncspace-crdt/actions/workflows/ci.yml/badge.svg)](https://github.com/txltedxgod/syncspace-crdt/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![WebSockets](https://img.shields.io/badge/WebSockets-Realtime-010101)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**SyncSpace CRDT** is a real-time collaborative infinite canvas and whiteboard platform built with Conflict-Free Replicated Data Types (CRDTs), 2D QuadTree spatial indexing, and WebSocket state synchronization.

---

## 🌟 Features & Mathematics

```
                ┌──────────────────────────────────────────────────┐
                │             WebSocket Sync Server                │
                │        (Broadcasts Delta Operations)             │
                └───────────────▲──────────────────▲───────────────┘
                                │                  │
                        [CRDT Operation]    [CRDT Operation]
                                │                  │
            ┌───────────────────▼──┐            ┌──▼───────────────────┐
            │       Client A       │            │       Client B       │
            │  LWW-Element Set     │            │  LWW-Element Set     │
            │  Lamport Clock (L1)  │            │  Lamport Clock (L2)  │
            │  QuadTree (Viewport) │            │  QuadTree (Viewport) │
            │  60 FPS Canvas       │            │  60 FPS Canvas       │
            └──────────────────────┘            └──────────────────────┘
```

- **Conflict-Free Replicated Data Types (CRDT):** Guarantees strong eventual convergence across all participating clients using Last-Write-Wins (LWW-Element-Set) and Lamport logical clocks without central lock contention.
- **QuadTree 2D Spatial Index:** Accelerates viewport culling and shape selection to guarantee stable 60 FPS performance even with tens of thousands of objects.
- **Real-Time Live Presence:** Multi-user live cursor position broadcasting, presence heartbeats, and color-coded user avatars.
- **Offline-First Resilience:** Seamless local mutations that auto-merge with network deltas when connectivity resumes.
- **Zero-Dependency Web Canvas:** Fast HTML5 Canvas rendering for sticky notes, geometric shapes, text boxes, and connectors.

---

## 🚀 Quick Start

### 1. Run with Docker Compose
```bash
git clone https://github.com/txltedxgod/syncspace-crdt.git
cd syncspace-crdt
docker compose up --build
```
Open multiple tabs at **`http://localhost:3000`** to test simultaneous multi-cursor real-time collaboration.

### 2. Run Locally with Node.js
```bash
npm install
npm run build
npm start
```

---

## 🧪 Testing

```bash
npm test
```

---

## 📄 License
Released under the [MIT License](LICENSE).