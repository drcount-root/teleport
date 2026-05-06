import {
  CHUNK_SIZE,
  BUFFER_HIGH_WATERMARK,
  BUFFER_LOW_WATERMARK,
  ICE_RESTART_MAX,
  ACK_INTERVAL_CHUNKS,
  encodeChunk,
  decodeChunk,
} from "@repo/shared";
import type {
  WorkerInbound,
  WorkerOutbound,
  FileMeta,
  DataChannelMessage,
} from "@repo/shared";

// ─── Connection state ─────────────────────────────────────────────────────────

let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;
let iceRestartCount = 0;

// ─── Send state ───────────────────────────────────────────────────────────────

const sendQueue: File[] = [];
let isSending = false;
let isPaused = false;
let resumeResolve: (() => void) | null = null;
// fileId → index of last chunk ACKed by receiver (-1 = none)
const lastAckedChunk = new Map<string, number>();

// ─── Receive state ────────────────────────────────────────────────────────────

interface ReceiveState {
  meta: FileMeta;
  chunks: Map<number, ArrayBuffer>;
  received: number;
}
const receiving = new Map<string, ReceiveState>();
let currentReceivingFileId: string | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function post(msg: WorkerOutbound): void {
  self.postMessage(msg);
}

async function waitForDrain(): Promise<void> {
  if (!dc || dc.bufferedAmount <= BUFFER_HIGH_WATERMARK) return;
  await new Promise<void>((resolve) => {
    dc!.addEventListener("bufferedamountlow", () => resolve(), { once: true });
    // Re-check synchronously — avoids race where amount dropped before listener attached
    if (dc!.bufferedAmount <= BUFFER_HIGH_WATERMARK) resolve();
  });
}

async function waitForChannelOpen(): Promise<void> {
  if (dc?.readyState === "open") return;
  await new Promise<void>((resolve) => {
    const poll = setInterval(() => {
      if (dc?.readyState === "open") {
        clearInterval(poll);
        resolve();
      }
    }, 200);
  });
}

// ─── DataChannel setup ────────────────────────────────────────────────────────

function setupDataChannel(channel: RTCDataChannel): void {
  dc = channel;
  dc.binaryType = "arraybuffer";
  dc.bufferedAmountLowThreshold = BUFFER_LOW_WATERMARK;

  dc.onopen = () => post({ type: "channel-open" });

  dc.onmessage = ({ data }: MessageEvent<ArrayBuffer | string>) => {
    if (data instanceof ArrayBuffer) {
      handleChunk(data);
    } else {
      handleControl(JSON.parse(data) as DataChannelMessage);
    }
  };
}

// ─── Receive handlers ─────────────────────────────────────────────────────────

function handleControl(msg: DataChannelMessage): void {
  switch (msg.type) {
    case "file-meta": {
      currentReceivingFileId = msg.fileId;
      receiving.set(msg.fileId, { meta: msg, chunks: new Map(), received: 0 });
      post({
        type: "file-started",
        fileId: msg.fileId,
        name: msg.name,
        size: msg.size,
        mimeType: msg.mimeType,
        totalChunks: msg.totalChunks,
        direction: "receive",
      });
      break;
    }
    case "ack": {
      // Receiver's ACK arrives at sender
      lastAckedChunk.set(msg.fileId, msg.upToChunk);
      break;
    }
    case "file-complete": {
      // Sender signals done — reassemble if not already done via chunk count
      const fileId = msg.fileId;
      const state = receiving.get(fileId);
      if (state && state.received < state.meta.totalChunks) {
        // Missed some chunks — reassemble with what we have (best effort)
        reassembleAndPost(fileId, state);
        receiving.delete(fileId);
      }
      lastAckedChunk.delete(fileId);
      break;
    }
  }
}

function handleChunk(frame: ArrayBuffer): void {
  if (!currentReceivingFileId) return;

  const state = receiving.get(currentReceivingFileId);
  if (!state) return;

  const { chunkIndex, payload } = decodeChunk(frame);

  // Deduplication — chunk may arrive again after sender resumes from lastAckedChunk
  if (!state.chunks.has(chunkIndex)) {
    state.chunks.set(chunkIndex, payload);
    state.received++;
  }

  // ACK every ACK_INTERVAL_CHUNKS unique chunks received
  if (state.received % ACK_INTERVAL_CHUNKS === 0) {
    dc!.send(
      JSON.stringify({
        type: "ack",
        fileId: currentReceivingFileId,
        upToChunk: chunkIndex,
      }),
    );
  }

  post({
    type: "progress",
    fileId: currentReceivingFileId,
    transferredChunks: state.received,
  });

  if (state.received === state.meta.totalChunks) {
    reassembleAndPost(currentReceivingFileId, state);
    receiving.delete(currentReceivingFileId);
    currentReceivingFileId = null;
  }
}

function reassembleAndPost(fileId: string, state: ReceiveState): void {
  const { meta, chunks } = state;
  const total = new Uint8Array(meta.size);
  let offset = 0;
  for (let i = 0; i < meta.totalChunks; i++) {
    const chunk = chunks.get(i);
    if (!chunk) continue; // gap — best effort
    total.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  const blob = new Blob([total], { type: meta.mimeType });
  post({
    type: "file-received",
    fileId,
    blob,
    name: meta.name,
    mimeType: meta.mimeType,
  });
}

// ─── Send flow ────────────────────────────────────────────────────────────────

async function sendFile(file: File): Promise<void> {
  const fileId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  const meta: FileMeta = {
    type: "file-meta",
    fileId,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    totalChunks,
    chunkSize: CHUNK_SIZE,
  };

  lastAckedChunk.set(fileId, -1);
  dc!.send(JSON.stringify(meta));
  post({
    type: "file-started",
    fileId,
    name: file.name,
    size: file.size,
    mimeType: meta.mimeType,
    totalChunks,
    direction: "send",
  });

  const buf = await file.arrayBuffer();
  const startChunk = (lastAckedChunk.get(fileId) ?? -1) + 1;

  for (let i = startChunk; i < totalChunks; i++) {
    // Pause support
    if (isPaused) {
      await new Promise<void>((resolve) => {
        resumeResolve = resolve;
      });
    }

    // Wait for DataChannel to reopen if ICE restarted mid-transfer
    await waitForChannelOpen();

    // Flow control
    await waitForDrain();

    const start = i * CHUNK_SIZE;
    dc!.send(encodeChunk(i, buf.slice(start, start + CHUNK_SIZE)));

    if ((i + 1) % ACK_INTERVAL_CHUNKS === 0) {
      post({ type: "progress", fileId, transferredChunks: i + 1 });
    }
  }

  dc!.send(JSON.stringify({ type: "file-complete", fileId }));
  post({ type: "file-complete", fileId });
  lastAckedChunk.delete(fileId);
}

async function processSendQueue(): Promise<void> {
  if (isSending) return;
  isSending = true;
  while (sendQueue.length > 0) {
    const file = sendQueue.shift()!;
    await sendFile(file);
  }
  isSending = false;
}

// ─── RTCPeerConnection setup ──────────────────────────────────────────────────

function initPeerConnection(iceServers: unknown[]): RTCPeerConnection {
  if (pc) {
    pc.close();
    iceRestartCount = 0;
  }

  pc = new RTCPeerConnection({
    iceServers: iceServers as RTCIceServer[],
  });

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      post({
        type: "ice-candidate",
        candidate: candidate.toJSON() as Record<string, unknown>,
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (!pc) return;
    if (pc.connectionState === "failed") {
      if (iceRestartCount < ICE_RESTART_MAX) {
        iceRestartCount++;
        pc.restartIce();
      } else {
        post({ type: "peer-failed" });
      }
    }
    if (pc.connectionState === "connected") {
      iceRestartCount = 0;
    }
  };

  // Fires when restartIce() triggers renegotiation
  pc.onnegotiationneeded = async () => {
    if (!pc) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      post({
        type: "offer",
        desc: pc.localDescription!.toJSON() as unknown as Record<string, unknown>,
      });
    } catch {
      // Ignore — can fire during teardown
    }
  };

  // Answerer receives DataChannel from offerer
  pc.ondatachannel = ({ channel }) => setupDataChannel(channel);

  return pc;
}

// ─── Main message handler ─────────────────────────────────────────────────────

self.onmessage = async ({ data }: MessageEvent<WorkerInbound>) => {
  const msg = data;

  switch (msg.type) {
    case "init-offer": {
      const conn = initPeerConnection(msg.iceServers);
      // Offerer creates the DataChannel — triggers onnegotiationneeded → offer posted
      const channel = conn.createDataChannel("transfer", { ordered: true });
      setupDataChannel(channel);
      break;
    }

    case "init-answer": {
      const conn = initPeerConnection(msg.iceServers);
      await conn.setRemoteDescription(
        new RTCSessionDescription(
          msg.offer as unknown as RTCSessionDescriptionInit,
        ),
      );
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      post({
        type: "answer",
        desc: conn.localDescription!.toJSON() as unknown as Record<string, unknown>,
      });
      break;
    }

    case "set-remote-desc": {
      if (!pc) return;
      await pc.setRemoteDescription(
        new RTCSessionDescription(msg.desc as unknown as RTCSessionDescriptionInit),
      );
      break;
    }

    case "add-ice": {
      if (!pc) return;
      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(msg.candidate as RTCIceCandidateInit),
        );
      } catch {
        // Stale candidate — safe to ignore
      }
      break;
    }

    case "enqueue-files": {
      sendQueue.push(...msg.files);
      void processSendQueue();
      break;
    }

    case "pause": {
      isPaused = true;
      break;
    }

    case "resume": {
      isPaused = false;
      resumeResolve?.();
      resumeResolve = null;
      break;
    }
  }
};
