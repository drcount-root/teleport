// ─── Signaling (WebSocket between client and server) ────────────────────────

export type SignalMessage =
  | { type: 'create' }
  | { type: 'created'; code: string }
  | { type: 'join'; code: string }
  | { type: 'joined' }
  | { type: 'rejoin'; code: string }
  | { type: 'rejoined' }
  | { type: 'signal'; data: Record<string, unknown> }
  | { type: 'ready' }
  | { type: 'peer-left' }
  | { type: 'error'; reason: string }

// ─── DataChannel control frames (JSON over DataChannel) ─────────────────────

export interface FileMeta {
  type: 'file-meta'
  fileId: string
  name: string
  size: number
  mimeType: string
  totalChunks: number
  chunkSize: number
}

export type DataChannelMessage =
  | FileMeta
  | { type: 'ack'; fileId: string; upToChunk: number }
  | { type: 'file-complete'; fileId: string }

// ─── Transfer UI state ────────────────────────────────────────────────────────

export type TransferStatus = 'queued' | 'transferring' | 'paused' | 'complete' | 'error'

export interface TransferItem {
  fileId: string
  name: string
  size: number
  mimeType: string
  totalChunks: number
  transferredChunks: number
  lastAckedChunk: number
  status: TransferStatus
  direction: 'send' | 'receive'
}

// ─── Worker messages (main thread ↔ transfer-engine.worker.ts) ───────────────

export type WorkerInbound =
  | { type: 'init-offer'; iceServers: unknown[] }
  | { type: 'init-answer'; iceServers: unknown[]; offer: Record<string, unknown> }
  | { type: 'set-remote-desc'; desc: Record<string, unknown> }
  | { type: 'add-ice'; candidate: Record<string, unknown> }
  | { type: 'enqueue-files'; files: File[] }
  | { type: 'pause' }
  | { type: 'resume' }

export type WorkerOutbound =
  | { type: 'offer'; desc: Record<string, unknown> }
  | { type: 'answer'; desc: Record<string, unknown> }
  | { type: 'ice-candidate'; candidate: Record<string, unknown> }
  | { type: 'channel-open' }
  | { type: 'peer-failed' }
  | { type: 'progress'; fileId: string; transferredChunks: number }
  | { type: 'file-complete'; fileId: string }
  | { type: 'file-received'; fileId: string; blob: Blob; name: string; mimeType: string }
