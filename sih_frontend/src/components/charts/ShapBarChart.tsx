"use client";

import React from "react";
import clsx from "clsx";

interface ShapItem {
  factor: string;
  contribution: number; // e.g. +0.36 or -0.16
}

interface ShapBarChartProps {
  data?: ShapItem[];
  factors?: ShapItem[];
  className?: string;
  baseScore?: number;
}

export default function ShapBarChart({
  data,
  factors,
  className = "",
  baseScore = 0.5,
}: ShapBarChartProps) {
  const items = data || factors || [];
  // Find max absolute contribution to scale bars
  const maxAbs = Math.max(...items.map((d) => Math.abs(d.contribution)), 0.4);

  return (
    <div className={clsx("w-full flex flex-col gap-2 select-none", className)}>
      <div className="flex items-center justify-between text-[11px] border-b border-[rgba(0,90,156,0.12)] pb-1.5 text-[#5A738E]">
        <span>FEATURE / BEHAVIORAL ATTRIBUTE</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-[#00B074]">
            <span className="w-2 h-2 bg-[#00B074] inline-block" /> Reduces Risk (-)
          </span>
          <span className="flex items-center gap-1 text-[#EF3E42]">
            <span className="w-2 h-2 bg-[#EF3E42] inline-block" /> Increases Attribution (+)
          </span>
        </div>
      </div>

      {/* Feature contribution rows */}
      <div className="flex flex-col gap-2.5 pt-1">
        {items.map((item, idx) => {
          const isPositive = item.contribution >= 0;
          const pct = Math.min(Math.round((Math.abs(item.contribution) / maxAbs) * 100), 100);

          return (
            <div key={idx} className="flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#041527] font-medium">{item.factor}</span>
                <span
                  className={clsx(
                    "font-bold text-[11px]",
                    isPositive ? "text-[#EF3E42]" : "text-[#00B074]"
                  )}
                >
                  {isPositive ? `+${(item.contribution * 100).toFixed(1)}%` : `${(item.contribution * 100).toFixed(1)}%`}
                </span>
              </div>

              {/* Centered zero-axis comparative bar */}
              <div className="relative h-2 bg-[#F8FAFD] border border-[rgba(0,90,156,0.15)] rounded-full overflow-hidden flex">
                <div className="w-1/2 flex justify-end">
                  {!isPositive && (
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-full bg-[#00B074] rounded-l-full transition-all duration-300"
                    />
                  )}
                </div>
                <div className="w-[1px] h-full bg-[rgba(0,90,156,0.3)] z-10" />
                <div className="w-1/2 flex justify-start">
                  {isPositive && (
                    <div
                      style={{ width: `${pct}%` }}
                      className="h-full bg-[#EF3E42] rounded-r-full transition-all duration-300"
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
