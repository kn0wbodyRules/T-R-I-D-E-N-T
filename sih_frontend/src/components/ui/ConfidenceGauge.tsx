"use client";

import React from "react";
import clsx from "clsx";

interface ConfidenceGaugeProps {
  value: number; // 0 to 1
  size?: number;
  label?: string;
  sublabel?: string;
  showTicks?: boolean;
  className?: string;
}

export default function ConfidenceGauge({
  value,
  size = 120,
  label,
  sublabel,
  showTicks = true,
  className = "",
}: ConfidenceGaugeProps) {
  const normalizedValue = Math.min(Math.max(value, 0), 1);
  const percentage = Math.round(normalizedValue * 100);

  // SVG parameters
  const strokeWidth = 8;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  // Use a 240 degree gauge arc
  const arcLength = circumference * (240 / 360);
  const strokeDashoffset = arcLength * (1 - normalizedValue);

  // Color grading
  const getColor = (v: number) => {
    if (v >= 0.8) return "#005A9C"; // high attribution
    if (v >= 0.5) return "#D97706"; // moderate / review
    return "#00B074"; // baseline
  };

  const activeColor = getColor(normalizedValue);

  return (
    <div className={clsx("flex flex-col items-center justify-center select-none", className)}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-210"
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(0, 90, 156, 0.15)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />

          {/* Gauge fill */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={activeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className="font-bold tracking-tight text-[#041527] leading-none"
            style={{ fontSize: size * 0.22 }}
          >
            {percentage}
            <span className="text-xs text-[#5A738E] font-normal">%</span>
          </span>
          {sublabel && (
            <span className="text-[10px] text-[#5A738E] uppercase tracking-wider mt-1 font-semibold">
              {sublabel}
            </span>
          )}
        </div>
      </div>

      {label && (
        <span className="text-xs text-[#334E68] tracking-wide mt-1.5 text-center font-medium">
          {label}
        </span>
      )}
    </div>
  );
}
