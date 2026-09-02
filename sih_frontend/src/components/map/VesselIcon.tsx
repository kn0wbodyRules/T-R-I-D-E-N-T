"use client";

import React from "react";
import clsx from "clsx";
import MaterialIcon from "@/components/ui/MaterialIcon";

interface VesselIconProps {
  isDark: boolean;
  name?: string;
  score?: number;
  isSelected?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  className?: string;
}

export default function VesselIcon({
  isDark,
  name,
  score,
  isSelected = false,
  size = "md",
  onClick,
  className = "",
}: VesselIconProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };

  const iconSizes = {
    sm: 24,
    md: 32,
    lg: 40,
  };

  if (isDark) {
    // UNIDENTIFIED / DARK VESSEL STATE
    return (
      <div
        onClick={onClick}
        className={clsx(
          "relative flex items-center justify-center cursor-pointer transition-colors group",
          isSelected ? "scale-110 z-30" : "z-20",
          className
        )}
      >
        <div
          className={clsx(
            "flex items-center justify-center text-[#E63946]",
            isSelected && "drop-shadow-lg",
            sizeClasses[size]
          )}
        >
          <MaterialIcon name="warning" size={iconSizes[size]} fill className="text-[#E63946] drop-shadow-md [font-variation-settings:'wght'_700]" />
        </div>

        {/* Hover / selected tactical label */}
        {name && (
          <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap z-40 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-[#1f090b] border border-[#E63946] rounded-lg px-2 py-1 flex items-center gap-1.5 shadow-xl">
              <span className="w-1.5 h-1.5 bg-[#E63946] rounded-full" />
              <span className="text-[11px] font-semibold text-[#E63946] uppercase tracking-wider">
                {name}
              </span>
              {score !== undefined && (
                <span className="text-[10px] bg-[#E63946] text-white px-1 font-bold rounded-sm">
                  {(score * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // IDENTIFIED AIS VESSEL STATE
  return (
    <div
      onClick={onClick}
      className={clsx(
        "relative flex items-center justify-center cursor-pointer transition-colors group",
        isSelected ? "scale-110 z-30" : "z-10",
        className
      )}
    >
      <div
        className={clsx(
          "flex items-center justify-center text-[#005A9C]",
          "hover:text-[#00477d] transition-colors",
          isSelected && "text-[#00477d] drop-shadow-lg",
          sizeClasses[size]
        )}
      >
        <MaterialIcon name="directions_boat" size={iconSizes[size]} className="text-current drop-shadow-md [font-variation-settings:'wght'_700]" />
      </div>

      {/* Hover / selected tactical label */}
      {name && (
        <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap z-40 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-[#132448] border border-[#2F65B9] rounded-lg px-2 py-1 flex items-center gap-1.5 shadow-xl">
            <span className="w-1.5 h-1.5 bg-[#2F65B9] rounded-full" />
            <span className="text-[11px] text-white uppercase tracking-wider">
              {name}
            </span>
            {score !== undefined && (
              <span className="text-[10px] text-[#70A3F3] px-1 font-bold">
                {(score * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
