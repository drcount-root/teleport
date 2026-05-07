interface ProgressBarProps {
  value: number;
  max: number;
  className?: string;
}

export function ProgressBar({ value, max, className = "" }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-700 ${className}`}
    >
      <div
        className="h-full rounded-full bg-violet-500 transition-all duration-150"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
