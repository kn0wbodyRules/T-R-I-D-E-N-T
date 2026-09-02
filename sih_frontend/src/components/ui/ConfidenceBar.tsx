"use client";

import React from "react";
import clsx from "clsx";

interface ConfidenceBarProps {
  value: number; // 0 to 1
  showScore?: boolean;
  className?: string;
  isDark?: boolean;
}

export default function ConfidenceBar({
  value,
  showScore = true,
  className = "",
  isDark = false,
}: ConfidenceBarProps) {
  const normalizedValue = Math.min(Math.max(value, 0), 1);
  const percentage = (normalizedValue * 100).toFixed(1);

  // Color selection
  const getBarColor = (v: number, dark: boolean) => {
    if (dark) return "bg-[#E63946]";
    if (v >= 0.8) return "bg-[#E63946]";
    if (v >= 0.5) return "bg-[#FFB800]";
    return "bg-[#10B981]";
  };

  const getTextColor = (v: number, dark: boolean) => {
    if (dark) return "text-[#E63946]";
    if (v >= 0.8) return "text-[#E63946]";
    if (v >= 0.5) return "text-[#FFB800]";
    return "text-[#10B981]";
  };

  return (
    <div className={clsx("flex items-center gap-3 w-full", className)}>
      <div className="flex-1 h-2 bg-[#08182b] border border-[rgba(233,238,242,0.12)] rounded-full overflow-hidden relative">
        <div
          className={clsx("h-full rounded-full transition-all duration-300", getBarColor(normalizedValue, isDark))}
          style={{ width: `${normalizedValue * 100}%` }}
        />
      </div>

      {showScore && (
        <span
          className={clsx(
            "text-mono-data text-xs font-semibold shrink-0 text-right min-w-[52px]",
            getTextColor(normalizedValue, isDark)
          )}
        >
          {percentage}%
        </span>
      )}
    </div>
  );
}
