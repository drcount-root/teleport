"use client";

import { useCallback, useEffect, useRef } from "react";
import type { WorkerInbound, WorkerOutbound } from "@repo/shared";
import { useConnectionStore } from "../stores/connection.store";
import { useTransferStore } from "../stores/transfer.store";

export function useTransferEngine() {
  const workerRef = useRef<Worker | null>(null);
  // Set by the component to relay WebRTC signals via the signaling client
  const sendSignalRef = useRef<
    ((data: Record<string, unknown>) => void) | null
  >(null);
  // Set by the component to notify signaling client that channel is open
  const onChannelOpenRef = useRef<(() => void) | null>(null);

  const { setPhase, setError } = useConnectionStore();
  const { addItem, updateItem } = useTransferStore();

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/transfer-engine.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = ({ data }: MessageEvent<WorkerOutbound>) => {
      switch (data.type) {
        case "offer":
          sendSignalRef.current?.(data.desc);
          break;
        case "answer":
          sendSignalRef.current?.(data.desc);
          break;
        case "ice-candidate":
          sendSignalRef.current?.(data.candidate);
          break;
        case "channel-open":
          setPhase("connected");
          onChannelOpenRef.current?.();
          break;
        case "peer-failed":
          setPhase("error");
          setError("WebRTC connection failed after max ICE restarts");
          break;
        case "file-started":
          addItem({
            fileId: data.fileId,
            name: data.name,
            size: data.size,
            mimeType: data.mimeType,
            totalChunks: data.totalChunks,
            transferredChunks: 0,
            lastAckedChunk: -1,
            status: "transferring",
            direction: data.direction,
          });
          break;
        case "progress":
          updateItem(data.fileId, {
            transferredChunks: data.transferredChunks,
            status: "transferring",
          });
          break;
        case "file-complete":
          updateItem(data.fileId, { status: "complete" });
          break;
        case "file-received": {
          const url = URL.createObjectURL(data.blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.name;
          a.click();
          URL.revokeObjectURL(url);
          updateItem(data.fileId, { status: "complete" });
          break;
        }
      }
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [setPhase, setError, addItem, updateItem]);

  const postToWorker = useCallback((msg: WorkerInbound): void => {
    workerRef.current?.postMessage(msg);
  }, []);

  return { postToWorker, sendSignalRef, onChannelOpenRef };
}
