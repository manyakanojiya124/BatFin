import { useId, type CSSProperties } from "react";

interface BatteryRingProps {
  level: number;
  label?: string;
  size?: "medium" | "large";
}

export function BatteryRing({
  label = "Current charge",
  level,
  size = "medium",
}: BatteryRingProps) {
  const clampedLevel = Math.max(0, Math.min(100, Math.round(level)));
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (clampedLevel / 100) * circumference;
  const gradientId = `battery-gradient-${useId().replace(/:/g, "")}`;

  return (
    <div className={`relative ${size === "large" ? "size-52 sm:size-60" : "size-44"}`}>
      <svg
        aria-label={`${clampedLevel}% ${label.toLowerCase()}`}
        className="size-full -rotate-90"
        role="img"
        viewBox="0 0 100 100"
      >
        <circle
          className="text-surface-container-highest"
          cx="50"
          cy="50"
          fill="none"
          r="45"
          stroke="currentColor"
          strokeWidth="8"
        />
        <circle
          className="battery-ring-progress"
          cx="50"
          cy="50"
          fill="none"
          key={clampedLevel}
          r="45"
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="8"
          style={
            {
              "--battery-ring-offset": offset,
            } as CSSProperties
          }
        />
        <defs>
          <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#bef264" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <span
            className={`font-heading font-semibold tabular-nums text-text-primary ${
              size === "large" ? "text-5xl" : "text-4xl"
            }`}
          >
            {clampedLevel}
            <span className="text-xl text-text-secondary">%</span>
          </span>
          <p className="mt-1 text-xs font-medium text-text-secondary">{label}</p>
        </div>
      </div>
    </div>
  );
}
