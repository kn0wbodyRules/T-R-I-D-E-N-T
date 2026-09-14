"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import clsx from "clsx"
import MaterialIcon from "@/components/ui/MaterialIcon"

export function cn(...inputs: (string | undefined | null | false)[]) {
  return clsx(inputs)
}

// Types
export interface LeaderboardRanking {
  userId: string
  userName: string | null
  rank: number
  value: number // confidence score (0 to 1)
  avatarUrl?: string | null
  isDark?: boolean // Add tactical context
}

// Variants
export const podiumVariants = cva("flex items-end justify-center gap-4", {
  variants: {
    size: {
      sm: "gap-2",
      default: "gap-4",
      lg: "gap-6",
    },
  },
  defaultVariants: {
    size: "default",
  },
})

// Podium styles for each position (Criminal ranking)
const PODIUM_CONFIG = {
  1: {
    icon: "warning", // Material Icon for Prime Suspect
    color: "text-white",
    bg: "bg-[#EF3E42]", // Dodger Red
    ringColor: "ring-[#EF3E42]/50",
    height: "h-36",
    heightSm: "h-24",
    heightLg: "h-40",
  },
  2: {
    icon: "gavel", // Material Icon for Secondary Suspect
    color: "text-white",
    bg: "bg-[#FFB800]", // Amber
    ringColor: "ring-[#FFB800]/50",
    height: "h-28",
    heightSm: "h-20",
    heightLg: "h-32",
  },
  3: {
    icon: "policy", // Material Icon for Tertiary Suspect
    color: "text-white",
    bg: "bg-[#005A9C]", // Dodger Blue
    ringColor: "ring-[#005A9C]/50",
    height: "h-20",
    heightSm: "h-16",
    heightLg: "h-28",
  },
} as const

export interface LeaderboardPodiumProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof podiumVariants> {
  rankings: LeaderboardRanking[]
  showValue?: boolean
  showAvatar?: boolean
}

const LeaderboardPodium = React.forwardRef<
  HTMLDivElement,
  LeaderboardPodiumProps
>(
  (
    {
      className,
      size,
      rankings,
      showValue = true,
      showAvatar = true,
      ...props
    },
    ref
  ) => {
    // Get top 3, reorder for podium display: 2nd, 1st, 3rd
    const top3 = rankings.slice(0, 3)
    const podiumOrder = [
      top3.find((r) => r.rank === 2),
      top3.find((r) => r.rank === 1),
      top3.find((r) => r.rank === 3),
    ].filter(Boolean) as LeaderboardRanking[]

    if (podiumOrder.length === 0) {
      return null
    }

    const avatarSize = {
      sm: "h-10 w-10 text-sm",
      default: "h-14 w-14 text-lg",
      lg: "h-20 w-20 text-2xl",
    }[size ?? "default"]

    const iconSize = {
      sm: 16,
      default: 20,
      lg: 24,
    }[size ?? "default"]

    const textSize = {
      sm: "text-xs",
      default: "text-sm",
      lg: "text-base",
    }[size ?? "default"]

    return (
      <div
        ref={ref}
        className={cn(podiumVariants({ size }), className)}
        role="list"
        aria-label="Top Suspects Podium"
        {...props}
      >
        {podiumOrder.map((ranking) => {
          const config = PODIUM_CONFIG[ranking.rank as 1 | 2 | 3]
          if (!config) return null

          const displayName =
            ranking.userName || `Vessel ${ranking.userId.slice(0, 6)}`
          
          // Use default suspect avatar if none provided (stock cargo ships)
          const fallbackAvatars = {
            1: "https://images.unsplash.com/photo-1518527989017-5baca7a58d3c?w=150&auto=format&fit=crop&q=80",
            2: "https://images.unsplash.com/photo-1585713181935-d5f622cc2415?w=150&auto=format&fit=crop&q=80",
            3: "https://images.unsplash.com/photo-1606185540834-d6e7483ee1a4?w=150&auto=format&fit=crop&q=80"
          };
          const avatarSrc = ranking.avatarUrl ?? fallbackAvatars[ranking.rank as 1|2|3];

          const podiumHeight = {
            sm: config.heightSm,
            default: config.height,
            lg: config.heightLg,
          }[size ?? "default"]

          return (
            <div
              key={ranking.userId}
              role="listitem"
              className="flex flex-col items-center"
            >
              {/* Avatar with status icon */}
              <div className="relative mb-2" aria-hidden="true">
                {showAvatar ? (
                  <img
                    src={avatarSrc}
                    alt={`${displayName}`}
                    className={cn("rounded-full object-cover border-[3px] shadow-sm", avatarSize)}
                    style={{ borderColor: ranking.rank === 1 ? "#EF3E42" : ranking.rank === 2 ? "#FFB800" : "#005A9C" }}
                  />
                ) : (
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full shadow-sm",
                      avatarSize,
                      config.bg
                    )}
                  >
                    <MaterialIcon name={config.icon} size={iconSize} className={config.color} fill />
                  </div>
                )}

                {/* Rank badge */}
                <div
                  className={cn(
                    "absolute -right-1 -bottom-1 flex items-center justify-center rounded-full shadow-md text-white border-2 border-white",
                    config.bg,
                    size === "sm"
                      ? "h-5 w-5"
                      : size === "lg"
                        ? "h-8 w-8"
                        : "h-6 w-6"
                  )}
                >
                  <MaterialIcon
                    name={config.icon}
                    size={size === "sm" ? 12 : size === "lg" ? 18 : 14}
                    fill
                    className="text-white"
                  />
                </div>
              </div>

              {/* Name */}
              <span
                className={cn(
                  "max-w-28 truncate text-center font-bold tracking-tight mt-1",
                  textSize,
                  ranking.rank === 1 ? "text-[#EF3E42]" : "text-[#041527]"
                )}
                title={displayName}
              >
                {displayName}
              </span>

              {/* Value (Confidence Score) */}
              {showValue && (
                <span
                  className={cn(
                    "text-[#5A738E] font-semibold tabular-nums mt-0.5",
                    size === "sm" ? "text-[10px]" : "text-xs"
                  )}
                >
                  {(ranking.value * 100).toFixed(1)}% Match
                </span>
              )}

              {/* Podium block */}
              <div
                aria-hidden="true"
                className={cn(
                  "mt-3 w-24 shadow-inner relative overflow-hidden",
                  size === "sm" && "w-20",
                  size === "lg" && "w-32",
                  podiumHeight,
                  config.bg,
                  "rounded-t-xl"
                )}
              >
                {/* Diagonal stripes overlay for criminal/police aesthetic */}
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #000 10px, #000 20px)" }}></div>
                <div
                  className={cn(
                    "flex h-10 items-center justify-center font-heading text-2xl opacity-90 relative z-10",
                    config.color
                  )}
                >
                  {ranking.rank}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
)
LeaderboardPodium.displayName = "LeaderboardPodium"

export { LeaderboardPodium }
