"use client";

import { useCallback, useState } from "react";

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function DropZone({ onFiles, disabled = false }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || disabled) return;
      const arr = Array.from(files);
      if (arr.length > 0) onFiles(arr);
    },
    [onFiles, disabled],
  );

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
    e.target.value = "";
  }

  return (
    <label
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors ${
        disabled
          ? "cursor-not-allowed border-zinc-800 opacity-50"
          : isDragging
            ? "border-violet-400 bg-violet-950/30"
            : "border-zinc-700 hover:border-zinc-500"
      }`}
    >
      <input
        type="file"
        multiple
        className="sr-only"
        onChange={handleChange}
        disabled={disabled}
      />
      <svg
        className={`h-8 w-8 ${isDragging ? "text-violet-400" : "text-zinc-500"}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-300">
          Drop files here or click to browse
        </p>
        <p className="mt-1 text-xs text-zinc-500">Any file type, any size</p>
      </div>
    </label>
  );
}
