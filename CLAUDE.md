# Teleport — Claude Code Context

P2P file transfer PWA. No auth, no database, no file bytes on server. WebRTC DataChannel only.

---

## Monorepo Layout

```text
apps/web/        @repo/web     Next.js 16 App Router — browser client + PWA
apps/server/     @repo/server  Express + ws — signaling only (no file data)
apps/docs/       unused scaffold — ignore

packages/shared/          @repo/shared          types, constants, binary protocol
packages/ui/              @repo/ui               shared React components
packages/eslint-config/   @repo/eslint-config
packages/typescript-config/  @repo/typescript-config
```

---

## Commands

```bash
pnpm dev            # turbo: starts web (:3000) + server (:3001) in parallel
pnpm build          # turbo: shared → server + web (dep order enforced)
pnpm check-types    # turbo: tsc --noEmit across all packages
pnpm lint           # turbo: eslint across all packages
pnpm format         # prettier --write

# Single package
pnpm --filter @repo/server dev
pnpm --filter @repo/web check-types
```

Turbo task is `check-types` — NOT `typecheck`.

---

## Package Dependency Rules

```text
@repo/web    → @repo/shared, @repo/ui
@repo/server → @repo/shared
@repo/shared → (no workspace deps)
@repo/ui     → (no workspace deps)
```

**Always update `packages/shared/src/types.ts` before touching client or server.**
If a change needs a new message type, define it in shared first.

---

## @repo/shared

Source at `packages/shared/src/`. No build step — exports raw `.ts`.

| File           | Contains                                                                          |
| -------------- | --------------------------------------------------------------------------------- |
| `constants.ts` | CHUNK_SIZE, buffer watermarks, room config, retry config                          |
| `types.ts`     | SignalMessage, FileMeta, DataChannelMessage, TransferItem, WorkerInbound/Outbound |
| `protocol.ts`  | `encodeChunk` / `decodeChunk` (Uint32BE header + ArrayBuffer payload)             |

Key constants:

- `CHUNK_SIZE = 262_144` (256 KB)
- `BUFFER_HIGH_WATERMARK = 4_000_000` — pause DataChannel send above this
- `BUFFER_LOW_WATERMARK = 2_000_000` — resume below this
- `ACK_INTERVAL_CHUNKS = 64` — receiver ACKs every 64 chunks
- `WS_RETRY_MAX_ATTEMPTS = 5`, base 100ms, multiplier 2x
- `ICE_RESTART_MAX = 3`

---

## @repo/server

Source at `apps/server/src/`. Express + `ws` library. **Never handles file bytes.**

```text
index.ts          Express app, WebSocketServer on path /signal, /health, /metrics
room-manager.ts   In-memory Map<code, Room>. create/join/rejoin/getPeer/getCode/sweep
signal-handler.ts Routes WS messages: create→joined, join, rejoin, signal relay, ready, peer-left
code-generator.ts 6-char codes from ROOM_CODE_CHARS (no 0/1/O/I)
```

Room lifecycle: `create` → `join/rejoin` → `signal` exchange → `ready` × 2 → room marked connected → peer-left cleans up.

Dev: `tsx watch src/index.ts`
Prod build: `tsup src/index.ts --format cjs --out-dir dist`
Deploy: Fly.io (`fly.toml` in `apps/server/`)

---

## @repo/web

Source at `apps/web/`. Next.js App Router. `app/` directory at root (no `src/` wrapper).

> Full architecture plan, implementation order, and verification checklist: **[PLANNING.md](./PLANNING.md)**

### Planned structure (not yet built)

```text
app/
  layout.tsx
  page.tsx              main UI — single page, no routing needed
  globals.css
  share-target/page.tsx PWA share_target POST handler

components/             RoomCreator, RoomJoiner, DropZone, TransferQueue,
                        ProgressBar, ConnectionStatus, InstallPrompt

workers/
  transfer-engine.worker.ts   OWNS RTCPeerConnection — most complex file

stores/
  connection.store.ts   Zustand — phase, roomCode, wsRetryCount, iceRestartCount, error
  transfer.store.ts     Zustand — queue: TransferItem[], direction, isPaused

hooks/
  useSignaling.ts       manages SignalingClient lifecycle, routes WS → worker
  useTransferEngine.ts  manages Worker lifecycle, routes postMessage → Zustand stores
  useInstallPrompt.ts   handles beforeinstallprompt

lib/
  signaling-client.ts   WS wrapper with exponential backoff retry
  ice-config.ts         STUN/TURN RTCIceServer config from env vars
```

Connection phase flow: `idle → creating → joining → signaling → connected → reconnecting → error`

### Transfer Engine Worker

`workers/transfer-engine.worker.ts` owns `RTCPeerConnection`. Main thread **never** creates WebRTC objects — only postMessages.

Send flow: FileMeta JSON → ArrayBuffer chunks with 4-byte header → file-complete JSON
Receive flow: parse header → accumulate in Map → ACK every 64 chunks → reassemble → post Blob

Buffer flow control:

```typescript
while (dc.bufferedAmount > BUFFER_HIGH_WATERMARK)
  await waitEvent(dc, "bufferedamountlow");
dc.send(chunk);
```

ICE restart: `pc.onconnectionstatechange` → `'failed'` → `pc.restartIce()` → max `ICE_RESTART_MAX` times.

### Environment Variables

```bash
# apps/web/.env.local
NEXT_PUBLIC_SIGNALING_URL=ws://localhost:3001/signal
NEXT_PUBLIC_TURN_URL=turn:relay.metered.ca:80
NEXT_PUBLIC_TURN_USER=<metered.ca username>
NEXT_PUBLIC_TURN_CRED=<metered.ca credential>
```

### Next.js Config

`output: 'export'` (static export for Cloudflare Pages). No rewrites — WS URL via env var.
PWA: `@ducanh2912/next-pwa` (Workbox).
Web Worker: `config.output.workerChunkLoading = 'import-scripts'` in webpack config.

---

## Retry Strategy (4 Layers)

| Layer | Where                               | Mechanism                                             |
| ----- | ----------------------------------- | ----------------------------------------------------- |
| 1     | `lib/signaling-client.ts`           | WS exponential backoff, auto-rejoin room on reconnect |
| 2     | `workers/transfer-engine.worker.ts` | `pc.restartIce()` on connection `'failed'` (max 3)    |
| 3     | `workers/transfer-engine.worker.ts` | ACK-based chunk resume from `lastAckedChunk + 1`      |
| 4     | `apps/server/src/index.ts`          | Express error handler, WS upgrade only on `/signal`   |

---

## Wire Protocol

```text
DataChannel control (JSON string):
  → file-meta:     { type, fileId, name, size, mimeType, totalChunks, chunkSize }
  ← ack:           { type: 'ack', fileId, upToChunk: N }   every 64 chunks
  → file-complete: { type: 'file-complete', fileId }

DataChannel data (ArrayBuffer):
  [bytes 0-3: Uint32BE chunkIndex][bytes 4+: up to 256 KB]
```

---

## TypeScript Conventions

- Strict mode everywhere. No `any` except Express error handler signatures.
- Package imports use workspace protocol: `"@repo/shared": "workspace:*"`
- `bundler` moduleResolution in shared + server (not NodeNext — avoids extension requirement)
- `nextjs.json` tsconfig for web (Next.js plugin + Bundler resolution)
- No `.js` extension in imports within `apps/web` (Next.js handles it)
- No `.js` extension in `packages/shared` imports (bundler resolution handles it)
- `.js` extension in `apps/server` imports (tsx/tsup handles actual resolution at runtime)

---

## Code Standards

- No comments unless WHY is non-obvious. No JSDoc. No multi-line comment blocks.
- No `console.log` in client code. `console.error` only for caught errors.
- `console.log` in server is fine for startup messages.
- React components: named exports, not default exports (except `page.tsx` — Next.js requires default).
- Zustand stores: define interface, then `create<StoreType>()((set, get) => ...)`.
- No `useEffect` for derived state — compute inline or use Zustand selectors.
- `'use client'` directive required on any component using hooks, stores, or browser APIs.

---

## ESLint

`@repo/eslint-config/next-js` for web, `@repo/eslint-config/base` for server/shared.
All warnings treated as errors (`--max-warnings 0`).
`turbo/no-undeclared-env-vars` — declare all `NEXT_PUBLIC_*` vars in turbo.json `env` field if needed.

---

## Critical Invariants — Never Violate

1. **Server never sees file bytes** — DataChannel is P2P only.
2. **Zero persistence** — server restart destroys all rooms. Intentional.
3. **No auth** — room code (6 chars) is the only shared secret.
4. **Worker owns RTCPeerConnection** — main thread only postMessages + reads store.
5. **Shared types first** — update `packages/shared/src/types.ts` before client or server code.
6. **No rewrites in next.config** — `output: 'export'` is incompatible. Use env vars.
7. **Retry layers are independent** — WS reconnect, ICE restart, chunk resume are separate concerns.

---

## Testing P2P Locally

1. `pnpm dev` — starts web (:3000) and server (:3001)
2. Open **two separate browser windows** (not tabs) at `localhost:3000`
3. Window 1: Create Room → copy 6-char code
4. Window 2: Enter code → Join
5. Both windows console: `DataChannel open`
6. Drag file from Window 1 drop zone → Window 2 auto-downloads

Local connections always use `host` ICE candidates (no STUN needed).
Cross-network testing requires TURN config in `.env.local`.

---

## Deployment

| Service          | What                     | How                                  |
| ---------------- | ------------------------ | ------------------------------------ |
| Cloudflare Pages | `apps/web` static export | `pnpm build`, deploy `apps/web/out/` |
| Fly.io           | `apps/server`            | `fly deploy` from `apps/server/`     |

Server health check: `GET /health` → `{ status: 'ok', rooms: N }`
