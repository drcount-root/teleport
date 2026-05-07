"use client";

import { useState } from "react";
import { useConnectionStore } from "../stores/connection.store";

interface RoomCreatorProps {
  onCreateRoom: () => void;
}

export function RoomCreator({ onCreateRoom }: RoomCreatorProps) {
  const { phase, roomCode } = useConnectionStore();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!roomCode) return;
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isWaiting =
    phase === "creating" || phase === "signaling" || phase === "joining";

  if (roomCode && (phase === "signaling" || phase === "joining")) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
        <p className="text-sm text-zinc-400">Share this code</p>
        <div className="font-mono text-4xl font-bold tracking-[0.25em] text-violet-400">
          {roomCode}
        </div>
        <button
          onClick={handleCopy}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-700"
        >
          {copied ? "Copied!" : "Copy code"}
        </button>
        <p className="text-xs text-zinc-500">Waiting for peer to join…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
      <h2 className="text-lg font-semibold text-white">Create a room</h2>
      <p className="text-center text-sm text-zinc-400">
        Get a code to share with your peer
      </p>
      <button
        onClick={onCreateRoom}
        disabled={isWaiting || phase === "connected"}
        className="w-full rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isWaiting ? "Creating…" : "Generate code"}
      </button>
    </div>
  );
}
