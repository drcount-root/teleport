"use client";

import { useTransferStore } from "../stores/transfer.store";
import { ProgressBar } from "./ProgressBar";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  transferring: "Transferring",
  paused: "Paused",
  complete: "Done",
  error: "Error",
};

export function TransferQueue() {
  const queue = useTransferStore((s) => s.queue);

  if (queue.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3">
      {queue.map((item) => {
        const pct =
          item.totalChunks > 0
            ? Math.round((item.transferredChunks / item.totalChunks) * 100)
            : 0;
        return (
          <li
            key={item.fileId}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {item.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {formatBytes(item.size)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`text-xs ${
                    item.direction === "send"
                      ? "text-violet-400"
                      : "text-cyan-400"
                  }`}
                >
                  {item.direction === "send" ? "↑ Send" : "↓ Recv"}
                </span>
                <span
                  className={`text-xs font-medium ${
                    item.status === "complete"
                      ? "text-green-400"
                      : item.status === "error"
                        ? "text-red-400"
                        : "text-zinc-400"
                  }`}
                >
                  {item.status === "transferring"
                    ? `${pct}%`
                    : STATUS_LABEL[item.status]}
                </span>
              </div>
            </div>
            {item.status !== "complete" && item.status !== "error" && (
              <ProgressBar
                value={item.transferredChunks}
                max={item.totalChunks}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
