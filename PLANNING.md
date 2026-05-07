# Teleport — P2P File Transfer PWA

## Context

Zero-auth, zero-database real-time P2P file transfer app. File bytes go peer-to-peer via WebRTC DataChannel — server never sees them. Signaling server is intentionally minimal. Will become a PWA. Connected to `drcount-root/teleport` on GitHub.

---

## Architecture Decisions

| Concern    | Choice                                        | Reason                                                                       |
| ---------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| Transfer   | WebRTC DataChannel                            | Direct P2P, server never sees file bytes, wire-speed on LAN                  |
| Chunk size | 256 KB                                        | Optimal JS overhead vs. progress granularity                                 |
| Signaling  | Node.js + Express + `ws`                      | Express for HTTP routes (health, future endpoints), ws for WebSocket upgrade |
| Frontend   | Next.js 16 (App Router) + TypeScript          | Static export for PWA deployment, React 19                                   |
| State      | Zustand                                       | 1 KB, no boilerplate, perfect for async transfer state machines              |
| Styling    | Tailwind CSS + Radix UI                       | No runtime CSS, accessible primitives                                        |
| Monorepo   | pnpm workspaces + Turborepo                   | Task orchestration, build caching, parallel dev                              |
| STUN       | Google public servers                         | Free, reliable, zero ops                                                     |
| TURN (MVP) | metered.ca free tier                          | 500 GB/month free, swap to Coturn later                                      |
| PWA        | `@ducanh2912/next-pwa` (Workbox)              | Best PWA support for Next.js                                                 |
| Worker     | RTCPeerConnection in Web Worker               | Main thread never blocks during transfer                                     |
| Deployment | Fly.io (signaling), Cloudflare Pages (client) | Free tier, global edge, WebSocket support                                    |
| Retry      | Multi-layer retry strategy                    | See Retry Mechanisms section                                                 |

---

## Monorepo Structure

Turborepo scaffold — `apps/` for runnable apps, `packages/` for shared libs.
Package prefix: `@repo/*`. Next.js 16.2.0 + React 19.

```text
teleport/
├── PLANNING.md
├── CLAUDE.md                         # to be created
├── package.json                      # workspace root (turbo, prettier, typescript)
├── pnpm-workspace.yaml               # apps/* + packages/*
├── turbo.json                        # build/dev/lint/check-types pipeline
├── .gitignore
│
├── .claude/
│   └── commands/
│       ├── start-dev.md
│       ├── test-transfer.md
│       ├── check-webrtc.md
│       ├── build-prod.md
│       └── deploy.md
│
├── apps/
│   ├── web/                          # @repo/web — Next.js 16 App Router PWA
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── public/
│   │   │   ├── manifest.json         # PWA manifest + share_target
│   │   │   ├── icon-192.png
│   │   │   └── icon-512.png
│   │   ├── app/                      # Next.js App Router (at root, no src/ wrapper)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── globals.css
│   │   │   └── share-target/
│   │   │       └── page.tsx          # PWA share_target POST handler
│   │   ├── components/
│   │   │   ├── RoomCreator.tsx
│   │   │   ├── RoomJoiner.tsx
│   │   │   ├── DropZone.tsx
│   │   │   ├── TransferQueue.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── ConnectionStatus.tsx
│   │   │   └── InstallPrompt.tsx
│   │   ├── workers/
│   │   │   └── transfer-engine.worker.ts   # owns RTCPeerConnection
│   │   ├── stores/
│   │   │   ├── connection.store.ts
│   │   │   └── transfer.store.ts
│   │   ├── hooks/
│   │   │   ├── useSignaling.ts
│   │   │   ├── useTransferEngine.ts
│   │   │   └── useInstallPrompt.ts
│   │   └── lib/
│   │       ├── signaling-client.ts         # WS with exponential backoff
│   │       └── ice-config.ts
│   │
│   ├── server/                       # @repo/server — Express + ws signaling
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   ├── fly.toml
│   │   └── src/
│   │       ├── index.ts              # Express app + ws upgrade on /signal
│   │       ├── room-manager.ts       # in-memory Map<code, Room>
│   │       ├── signal-handler.ts     # routes all WS messages
│   │       └── code-generator.ts     # 6-char room codes
│   │
│
└── packages/
    ├── shared/                       # @repo/shared — types, constants, protocol
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── types.ts              # TransferItem, SignalMessage, FileMeta, WorkerInbound/Outbound
    │       ├── protocol.ts           # chunk header encode/decode (Uint32BE prefix)
    │       └── constants.ts          # all magic numbers + retry config
    │
    ├── ui/                           # @repo/ui — existing scaffold
    ├── eslint-config/                # @repo/eslint-config — existing
    └── typescript-config/            # @repo/typescript-config — existing
```

---

## Key Config Files

### `turbo.json` (actual — already in repo)

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "lint": { "dependsOn": ["^lint"] },
    "check-types": { "dependsOn": ["^check-types"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

Note: task is `check-types` not `typecheck`. Add `dist/**` to `outputs` when `@repo/shared` is added.

### `pnpm-workspace.yaml` (actual — already in repo)

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### `apps/web/next.config.ts`

```typescript
import withPWA from "@ducanh2912/next-pwa";

const nextConfig = withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
})({
  output: "export",
  webpack(config) {
    config.output.workerChunkLoading = "import-scripts";
    return config;
  },
  // No rewrites — static export doesn't support them at build time.
  // WS URL is configured via NEXT_PUBLIC_SIGNALING_URL env var in all envs.
});

export default nextConfig;
```

---

## Shared Constants (`packages/shared/src/constants.ts`)

```typescript
export const CHUNK_SIZE = 262_144; // 256 KB per chunk
export const BUFFER_HIGH_WATERMARK = 4_000_000; // pause sending above this
export const BUFFER_LOW_WATERMARK = 2_000_000; // resume sending below this
export const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const ROOM_TTL_MS = 300_000; // 5 min safety sweep

// Retry
export const WS_RETRY_BASE_MS = 100;
export const WS_RETRY_MAX_ATTEMPTS = 5;
export const WS_RETRY_MULTIPLIER = 2;
export const ICE_RESTART_MAX = 3;
export const ACK_INTERVAL_CHUNKS = 64; // ACK every 64 chunks = every 16 MB
```

---

## Wire Protocol

```text
Control frame (JSON UTF-8 string):
  file-meta     { type, fileId, name, size, mimeType, totalChunks, chunkSize }
  ack           { type: 'ack', fileId, upToChunk: N }   receiver→sender every 64 chunks
  file-complete { type: 'file-complete', fileId }

Data frame (ArrayBuffer):
  [bytes 0-3: Uint32BE chunkIndex][bytes 4+: up to 256 KB payload]
```

---

## Retry Mechanisms (4 Layers)

### Layer 1 — WebSocket Signaling Reconnect

- On `close`/`error`: exponential backoff — 100ms → 200ms → 400ms → 800ms → 1600ms (max 5 attempts)
- On reconnect with active room: auto re-send `{ type: 'rejoin', code }`
- Server `rejoin` handler re-attaches WS to existing room if still alive
- After 5 failures: emit `connection-failed` → UI shows error

### Layer 2 — ICE Connection Failure + Restart

- `pc.onconnectionstatechange` → if `'failed'`: call `pc.restartIce()` (max `ICE_RESTART_MAX = 3`)
- ICE restart triggers `onnegotiationneeded` → new offer → re-signaling via WS
- After 3 ICE restarts fail: post `{ type: 'peer-failed' }` to main thread → UI prompts re-share

### Layer 3 — File Transfer Chunk Resume

- Receiver sends `ack` every `ACK_INTERVAL_CHUNKS` chunks with `upToChunk` index
- Sender tracks `lastAckedChunk` per file
- On DataChannel reopen (after ICE restart): sender resumes from `lastAckedChunk + 1`
- Receiver keeps received chunks in `Map<chunkIndex, ArrayBuffer>` — no re-download

### Layer 4 — Server Stability (Express)

- `GET /health` → `{ status: 'ok', rooms: N }` (Fly.io health check)
- `GET /metrics` → room count + active connection stats
- Global Express error handler
- `ws` upgrade only on `/signal` path

---

## Signaling Server (`apps/server/src/index.ts`)

```typescript
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { roomManager } from "./room-manager";
import { signalHandler } from "./signal-handler";

const app = express();
app.get("/health", (_, res) =>
  res.json({ status: "ok", rooms: roomManager.count() }),
);
app.use((err: Error, _req: any, res: any, _next: any) =>
  res.status(500).json({ error: err.message }),
);

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/signal" });
wss.on("connection", (ws) => signalHandler(ws, roomManager));
server.listen(process.env.PORT ?? 3001);
```

Room lifecycle:

- `create` → generate code, store `{ host: ws, guest: null, createdAt, connected: false }`
- `join` → attach guest, notify host
- `rejoin` → re-attach ws to existing room (retry support)
- `signal` → relay SDP offer/answer and ICE candidates between peers
- `ready` (both peers) → mark connected, delete room entry
- `ws.close` → delete room, notify peer
- 60s sweep → delete rooms older than `ROOM_TTL_MS` that aren't connected

---

## Transfer Engine (`apps/web/workers/transfer-engine.worker.ts`)

Owns `RTCPeerConnection`. Main thread never touches WebRTC — only postMessages.

**Send loop:**

```typescript
for (const file of queue) {
  dc.send(JSON.stringify(fileMeta));
  const buf = await file.arrayBuffer();
  for (let i = resumeFrom; i < totalChunks; i++) {
    while (dc.bufferedAmount > BUFFER_HIGH_WATERMARK)
      await waitEvent(dc, "bufferedamountlow");
    dc.send(encodeChunk(i, buf.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)));
    if (i % ACK_INTERVAL_CHUNKS === 0) postProgress(fileId, i);
  }
  dc.send(JSON.stringify({ type: "file-complete", fileId }));
}
```

**Receive loop:**

```typescript
dc.onmessage = ({ data }) => {
  if (data instanceof ArrayBuffer) {
    const idx = decodeChunkHeader(data);
    chunks.set(idx, data);
    receivedCount++;
    if (receivedCount % ACK_INTERVAL_CHUNKS === 0)
      dc.send(JSON.stringify({ type: "ack", fileId, upToChunk: idx }));
    if (receivedCount === totalChunks) reassembleAndPost();
  } else {
    handleControl(JSON.parse(data as string));
  }
};
```

---

## Zustand Stores

```typescript
// connection.store.ts
type Phase =
  | "idle"
  | "creating"
  | "joining"
  | "signaling"
  | "connected"
  | "reconnecting"
  | "error";
interface ConnectionStore {
  phase: Phase;
  roomCode: string | null;
  wsRetryCount: number;
  iceRestartCount: number;
  error: string | null;
}

// transfer.store.ts
interface TransferStore {
  queue: TransferItem[];
  direction: "send" | "receive" | null;
  isPaused: boolean;
}
// TransferItem.lastAckedChunk enables resume after reconnect
```

---

## Environment Variables

```bash
# apps/web/.env.local
NEXT_PUBLIC_SIGNALING_URL=ws://localhost:3001/signal
NEXT_PUBLIC_TURN_URL=turn:relay.metered.ca:80
NEXT_PUBLIC_TURN_USER=<metered.ca username>
NEXT_PUBLIC_TURN_CRED=<metered.ca credential>

# apps/web/.env.production
NEXT_PUBLIC_SIGNALING_URL=wss://teleport-signal.fly.dev/signal
NEXT_PUBLIC_TURN_URL=turn:relay.metered.ca:80
NEXT_PUBLIC_TURN_USER=<metered.ca username>
NEXT_PUBLIC_TURN_CRED=<metered.ca credential>
```

---

## Implementation Order

1. **Phase 0** — CLAUDE.md + `.claude/commands/` ✅
2. **Phase 1** — `packages/shared` (`@repo/shared`): constants → types → protocol ✅
3. **Phase 2** — `apps/server` (`@repo/server`): code-generator → room-manager → signal-handler → index → Dockerfile + fly.toml ✅
4. **Phase 3** — Transfer engine Web Worker in `apps/web/workers/` ✅
5. **Phase 4** — Signaling client + WS retry + hooks in `apps/web/` ✅
6. **Phase 5** — Zustand stores in `apps/web/stores/` ✅
7. **Phase 6** — `apps/web/next.config.ts` (PWA plugin, worker webpack) ✅
8. **Phase 7** — React UI components in `apps/web/components/` ✅
9. **Phase 8** — PWA manifest + share_target route ✅

---

## Verification Checklist

- [ ] `turbo run dev` starts web (:3000) + server (:3001) in parallel
- [ ] Two browser windows: create room → join → `DataChannel open` in console
- [ ] Drag 10 MB file → other window auto-downloads, name + size match
- [ ] Kill server mid-transfer → WS retry kicks in → reconnects → transfer resumes
- [ ] `pnpm check-types` zero errors
- [ ] `pnpm build` produces `apps/web/out/` with `sw.js`

---

## Critical Invariants

- Server **never** sees file bytes — DataChannel only
- Zero persistence — server restart destroys all rooms (intentional)
- No auth — room code is the only shared secret
- Web Worker owns `RTCPeerConnection` — main thread only postMessages
- Always update `packages/shared/src/types.ts` before touching client or server
- Retry layers are independent: WS reconnect → ICE restart → chunk resume
