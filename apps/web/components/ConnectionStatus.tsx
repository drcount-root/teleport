"use client";

import { useConnectionStore } from "../stores/connection.store";
import type { Phase } from "../stores/connection.store";

const PHASE_CONFIG: Record<
  Phase,
  { label: string; color: string; pulse: boolean }
> = {
  idle: { label: "Ready", color: "bg-zinc-500", pulse: false },
  creating: { label: "Creating room…", color: "bg-yellow-400", pulse: true },
  joining: { label: "Joining…", color: "bg-yellow-400", pulse: true },
  signaling: {
    label: "Negotiating…",
    color: "bg-yellow-400",
    pulse: true,
  },
  connected: { label: "Connected", color: "bg-green-400", pulse: false },
  reconnecting: {
    label: "Reconnecting…",
    color: "bg-orange-400",
    pulse: true,
  },
  error: { label: "Disconnected", color: "bg-red-500", pulse: false },
};

export function ConnectionStatus() {
  const { phase, wsRetryCount, error } = useConnectionStore();
  const { label, color, pulse } = PHASE_CONFIG[phase];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${pulse ? "animate-pulse" : ""}`}
        />
        <span className="text-sm font-medium text-zinc-300">
          {phase === "reconnecting" && wsRetryCount > 0
            ? `${label} (${wsRetryCount}/5)`
            : label}
        </span>
      </div>
      {phase === "error" && error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
