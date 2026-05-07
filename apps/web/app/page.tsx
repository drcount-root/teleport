"use client";

import { useTransferEngine } from "../hooks/useTransferEngine";
import { useSignaling } from "../hooks/useSignaling";
import { useConnectionStore } from "../stores/connection.store";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { RoomCreator } from "../components/RoomCreator";
import { RoomJoiner } from "../components/RoomJoiner";
import { DropZone } from "../components/DropZone";
import { TransferQueue } from "../components/TransferQueue";
import { InstallPrompt } from "../components/InstallPrompt";

export default function Home() {
  const { postToWorker, sendSignalRef, onChannelOpenRef } = useTransferEngine();
  const { createRoom, joinRoom, sendSignal, sendReady } =
    useSignaling(postToWorker);

  // Wire worker ↔ signaling
  sendSignalRef.current = sendSignal;
  onChannelOpenRef.current = sendReady;

  const { phase, error, reset } = useConnectionStore();

  function handleFiles(files: File[]) {
    postToWorker({ type: "enqueue-files", files });
  }

  const isIdle = phase === "idle" || phase === "error";
  const isConnected = phase === "connected";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Teleport
        </h1>
        <p className="text-sm text-zinc-400">
          P2P file transfer — no server, no limits
        </p>
      </div>

      <ConnectionStatus />

      <div className="w-full">
        {isIdle && (
          <div className="flex flex-col gap-4">
            {phase === "error" && error && (
              <div className="flex items-center justify-between rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={reset}
                  className="ml-4 shrink-0 text-xs text-zinc-400 underline hover:text-white"
                >
                  Reset
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <RoomCreator onCreateRoom={createRoom} />
              <RoomJoiner onJoinRoom={joinRoom} />
            </div>
          </div>
        )}

        {(phase === "creating" || phase === "signaling") && (
          <RoomCreator onCreateRoom={createRoom} />
        )}

        {phase === "joining" && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-violet-400" />
            <p className="text-sm text-zinc-400">Connecting to room…</p>
          </div>
        )}

        {phase === "reconnecting" && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-orange-400" />
            <p className="text-sm text-zinc-400">Reconnecting…</p>
          </div>
        )}

        {isConnected && (
          <div className="flex flex-col gap-4">
            <DropZone onFiles={handleFiles} />
            <TransferQueue />
          </div>
        )}
      </div>

      <InstallPrompt />
    </main>
  );
}
