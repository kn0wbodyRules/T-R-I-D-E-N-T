"use client";

import * as React from "react";
import Image from "next/image";
import { cva, type VariantProps } from "class-variance-authority";
import clsx from "clsx";
import MaterialIcon from "@/components/ui/MaterialIcon";
import { getVesselImage } from "@/lib/vessel-images";

export function cn(...inputs: (string | undefined | null | false)[]) {
  return clsx(inputs);
}

// Types
export interface LeaderboardRanking {
  userId: string;
  userName: string | null;
  rank: number;
  value: number; // confidence score (0 to 1)
  avatarUrl?: string | null;
  isDark?: boolean;
}

// Variants
export const podiumVariants = cva("flex items-end justify-center gap-4 sm:gap-6", {
  variants: {
    size: {
      sm: "gap-3",
      default: "gap-4 sm:gap-6",
      lg: "gap-6 sm:gap-8",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

// Podium styles for each position (Criminal ranking)
const PODIUM_CONFIG = {
  1: {
    icon: "warning",
    label: "PRIME CRIMINAL SUSPECT",
    color: "text-white",
    bg: "bg-[#EF3E42]", // Alert Crimson
    borderColor: "#EF3E42",
    ringColor: "ring-[#EF3E42]/50",
    height: "h-40",
    heightSm: "h-28",
    heightLg: "h-48",
  },
  2: {
    icon: "gavel",
    label: "SECONDARY SUSPECT",
    color: "text-white",
    bg: "bg-[#FFB800]", // Amber
    borderColor: "#FFB800",
    ringColor: "ring-[#FFB800]/50",
    height: "h-28",
    heightSm: "h-20",
    heightLg: "h-36",
  },
  3: {
    icon: "policy",
    label: "TERTIARY LEAD",
    color: "text-white",
    bg: "bg-[#005A9C]", // Dodger Blue
    borderColor: "#005A9C",
    ringColor: "ring-[#005A9C]/50",
    height: "h-20",
    heightSm: "h-16",
    heightLg: "h-28",
  },
} as const;

export interface LeaderboardPodiumProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect">,
    VariantProps<typeof podiumVariants> {
  rankings: LeaderboardRanking[];
  showValue?: boolean;
  showAvatar?: boolean;
  onSelect?: (userId: string) => void;
}

const LeaderboardPodium = React.forwardRef<HTMLDivElement, LeaderboardPodiumProps>(
  (
    {
      className,
      size,
      rankings,
      showValue = true,
      showAvatar = true,
      onSelect,
      ...props
    },
    ref
  ) => {
    // Get top 3, reorder for podium display: 2nd, 1st, 3rd
    const top3 = rankings.slice(0, 3);
    const podiumOrder = [
      top3.find((r) => r.rank === 2),
      top3.find((r) => r.rank === 1),
      top3.find((r) => r.rank === 3),
    ].filter(Boolean) as LeaderboardRanking[];

    if (podiumOrder.length === 0) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(podiumVariants({ size }), "w-full select-none", className)}
        role="list"
        aria-label="Criminal Suspect Attribution Podium"
        {...props}
      >
        {podiumOrder.map((ranking) => {
          const config = PODIUM_CONFIG[ranking.rank as 1 | 2 | 3];
          if (!config) return null;

          const isPrime = ranking.rank === 1;
          const displayName = ranking.userName || `Vessel ${ranking.userId.slice(0, 6)}`;
          const avatarSrc =
            ranking.avatarUrl || getVesselImage(ranking.userId, ranking.userName);

          const podiumHeight = {
            sm: config.heightSm,
            default: config.height,
            lg: config.heightLg,
          }[size ?? "default"];

          return (
            <div
              key={ranking.userId}
              role="listitem"
              onClick={() => onSelect?.(ranking.userId)}
              className={cn(
                "flex flex-col items-center transition-transform duration-200 group cursor-pointer",
                isPrime ? "scale-105 z-10" : "hover:-translate-y-1"
              )}
              title={`Click to view SHAP dossier for ${displayName}`}
            >
              {/* Category Badge Above Avatar */}
              {isPrime ? (
                <div className="mb-2.5 px-3 py-1 bg-[#EF3E42] text-white text-[10px] font-heading font-black uppercase tracking-wider rounded-full shadow-lg border border-[#EF3E42]/80 flex items-center gap-1.5 animate-pulse">
                  <MaterialIcon name="warning" size={13} fill className="text-white" />
                  <span>PRIMARY CULPRIT</span>
                </div>
              ) : ranking.rank === 2 ? (
                <div className="mb-2 px-2.5 py-0.5 bg-[#FFFBEB] border border-[#FFB800]/60 text-[#D97706] text-[9px] font-bold uppercase tracking-wider rounded-full shadow-xs">
                  SECONDARY SUSPECT
                </div>
              ) : (
                <div className="mb-2 px-2.5 py-0.5 bg-[#EDF3FA] border border-[#005A9C]/40 text-[#005A9C] text-[9px] font-bold uppercase tracking-wider rounded-full shadow-xs">
                  TERTIARY CONTACT
                </div>
              )}

              {/* Avatar with status icon & tactical target ring */}
              <div className="relative mb-2.5">
                {showAvatar ? (
                  <div
                    className={cn(
                      "relative rounded-full overflow-hidden shadow-lg transition-transform group-hover:scale-105",
                      isPrime
                        ? "w-24 h-24 sm:w-28 sm:h-28 ring-4 ring-[#EF3E42] shadow-[#EF3E42]/30"
                        : ranking.rank === 2
                        ? "w-18 h-18 sm:w-22 sm:h-22 ring-3 ring-[#FFB800]"
                        : "w-16 h-16 sm:w-20 sm:h-20 ring-3 ring-[#005A9C]"
                    )}
                  >
                    <Image
                      src={avatarSrc}
                      alt={displayName}
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 100px, 120px"
                      className="object-cover object-center"
                    />
                    {/* Dark Target Scrim / Crosshair effect */}
                    {ranking.isDark && (
                      <div className="absolute inset-0 bg-[#EF3E42]/15 mix-blend-multiply" />
                    )}
                  </div>
                ) : (
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full shadow-md",
                      isPrime ? "w-24 h-24" : "w-18 h-18",
                      config.bg
                    )}
                  >
                    <MaterialIcon
                      name={config.icon}
                      size={isPrime ? 32 : 24}
                      className={config.color}
                      fill
                    />
                  </div>
                )}

                {/* Tactical Rank Badge */}
                <div
                  className={cn(
                    "absolute -right-1 -bottom-1 flex items-center justify-center rounded-full shadow-md text-white border-2 border-white font-bold",
                    config.bg,
                    isPrime ? "h-8 w-8 text-xs" : "h-6 w-6 text-[10px]"
                  )}
                >
                  #{ranking.rank}
                </div>
              </div>

              {/* Name */}
              <span
                className={cn(
                  "max-w-32 sm:max-w-36 truncate text-center font-bold tracking-tight mt-1 group-hover:underline",
                  isPrime ? "text-sm sm:text-base text-[#EF3E42]" : "text-xs sm:text-sm text-[#041527]"
                )}
                title={displayName}
              >
                {displayName}
              </span>

              {/* Value (Confidence Score) */}
              {showValue && (
                <div
                  className={cn(
                    "font-bold tabular-nums mt-0.5 flex items-center gap-1",
                    isPrime ? "text-xs text-[#EF3E42]" : "text-[11px] text-[#5A738E]"
                  )}
                >
                  <span className="font-heading text-sm">
                    {(ranking.value * 100).toFixed(1)}%
                  </span>
                  <span className="text-[10px] uppercase font-normal text-[#5A738E]">
                    {isPrime ? "Confidence" : "Match"}
                  </span>
                </div>
              )}

              {/* Tactical Podium Block */}
              <div
                aria-hidden="true"
                className={cn(
                  "mt-3 shadow-inner relative overflow-hidden flex flex-col justify-between transition-all",
                  isPrime ? "w-28 sm:w-36" : "w-22 sm:w-28",
                  podiumHeight,
                  config.bg,
                  "rounded-t-2xl shadow-md border-t-2 border-x-2 border-white/20"
                )}
              >
                {/* Diagonal stripes overlay for criminal/police hazard aesthetic */}
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 20px)",
                  }}
                />

                {/* Position Rank Number */}
                <div
                  className={cn(
                    "flex items-center justify-center font-heading text-3xl sm:text-4xl font-black pt-3 opacity-95 relative z-10",
                    config.color
                  )}
                >
                  {ranking.rank}
                </div>

                {/* Subtitle label inside block */}
                <div className="pb-2 text-center text-[9px] font-mono font-bold tracking-wider text-white/90 relative z-10 uppercase">
                  {isPrime ? "PRIMARY CULPRIT" : ranking.rank === 2 ? "RANK #2" : "RANK #3"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

LeaderboardPodium.displayName = "LeaderboardPodium";

export { LeaderboardPodium };
