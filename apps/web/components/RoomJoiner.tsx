"use client";

import { useState } from "react";
import { useConnectionStore } from "../stores/connection.store";
import { ROOM_CODE_LENGTH } from "@repo/shared";

interface RoomJoinerProps {
  onJoinRoom: (code: string) => void;
}

export function RoomJoiner({ onJoinRoom }: RoomJoinerProps) {
  const { phase } = useConnectionStore();
  const [code, setCode] = useState("");

  const isDisabled =
    phase !== "idle" && phase !== "error";
  const canSubmit =
    code.trim().length === ROOM_CODE_LENGTH && !isDisabled;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) onJoinRoom(code.trim().toUpperCase());
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
      <h2 className="text-lg font-semibold text-white">Join a room</h2>
      <p className="text-center text-sm text-zinc-400">
        Enter the 6-character code
      </p>
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.toUpperCase().slice(0, ROOM_CODE_LENGTH))
          }
          placeholder="ABC123"
          disabled={isDisabled}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-center font-mono text-xl tracking-widest text-white placeholder-zinc-600 outline-none transition focus:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-6 py-3 font-semibold text-zinc-200 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "joining" ? "Joining…" : "Join"}
        </button>
      </form>
    </div>
  );
}
