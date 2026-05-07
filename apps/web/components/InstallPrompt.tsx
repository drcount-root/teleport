"use client";

import { useInstallPrompt } from "../hooks/useInstallPrompt";

export function InstallPrompt() {
  const { canInstall, triggerInstall } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <button
      onClick={triggerInstall}
      className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
      Install app
    </button>
  );
}
