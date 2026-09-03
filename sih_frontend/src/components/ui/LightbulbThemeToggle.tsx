"use client";

import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import clsx from "clsx";

interface LightbulbThemeToggleProps {
  className?: string;
  isDark?: boolean;
  onToggle?: (isDark: boolean) => void;
}

/**
 * Animated Interactive Lightbulb Theme Toggle Component
 * - "On" State (Light Mode / isDark=false): Glowing golden lightbulb, page is White & Dodger Blue
 * - "Off" State (Dark Mode / isDark=true): Hollow outline lightbulb, page is Deep Oceanic Blue & White
 * - Spring physics: stiffness: 400, damping: 25, tap scale 0.85
 */
export default function LightbulbThemeToggle({
  className,
  isDark: externalIsDark,
  onToggle,
}: LightbulbThemeToggleProps) {
  const [internalIsDark, setInternalIsDark] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("trident-theme");
      const isDarkActive = stored === "dark";
      setInternalIsDark(isDarkActive);
      if (isDarkActive) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    }
  }, []);

  const isDark = externalIsDark !== undefined ? externalIsDark : internalIsDark;

  const handleToggle = () => {
    const nextState = !isDark;
    if (externalIsDark === undefined) {
      setInternalIsDark(nextState);
      if (typeof window !== "undefined") {
        if (nextState) {
          document.documentElement.setAttribute("data-theme", "dark");
          localStorage.setItem("trident-theme", "dark");
        } else {
          document.documentElement.removeAttribute("data-theme");
          localStorage.setItem("trident-theme", "light");
        }
      }
    }
    onToggle?.(nextState);
  };

  // Spring transition physics
  const springTransition = {
    type: "spring" as const,
    stiffness: 400,
    damping: 25,
  };

  // Lightbulb interior fill variants
  const bulbFillVariants = {
    on: {
      fill: "#FFD700",
      stroke: "#D97706",
      strokeWidth: 1.5,
      filter: "drop-shadow(0px 0px 8px rgba(255, 215, 0, 0.85))",
    },
    off: {
      fill: "rgba(255, 215, 0, 0)",
      stroke: "#FFFFFF",
      strokeWidth: 2,
      filter: "drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))",
    },
  };

  // Radiating rays variants (Active in Light "On" Mode)
  const raysVariants = {
    on: {
      opacity: 1,
      scale: 1,
      stroke: "#FFD700",
    },
    off: {
      opacity: 0,
      scale: 0.5,
      stroke: "#FFFFFF",
    },
  };

  // Filament variants
  const filamentVariants = {
    on: {
      stroke: "#9A6B00",
      opacity: 0.9,
    },
    off: {
      stroke: "#FFFFFF",
      opacity: 0.6,
    },
  };

  return (
    <motion.button
      type="button"
      onClick={handleToggle}
      whileTap={{ scale: 0.85 }}
      whileHover={{ scale: 1.05 }}
      aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className={clsx(
        "w-12 h-12 rounded-full flex items-center justify-center cursor-pointer select-none transition-colors",
        "bg-transparent hover:bg-black/5",
        className
      )}
    >
      <motion.svg
        viewBox="0 0 24 24"
        width="26"
        height="26"
        className="overflow-visible"
        animate={isDark ? "off" : "on"}
        transition={springTransition}
      >
        {/* Radiating Light Rays (Active in Light "On" Mode) */}
        <motion.g
          variants={raysVariants}
          transition={springTransition}
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="19.78" y1="4.22" x2="18.36" y2="5.64" />
          <line x1="23" y1="12" x2="21" y2="12" />
          <line x1="19.78" y1="19.78" x2="18.36" y2="18.36" />
        </motion.g>

        {/* Morphing Lightbulb Body Path */}
        <motion.path
          d="M9 18h6v1.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19.5V18zm-1-3.5c-.7-1-1-2.2-1-3.5a5 5 0 1 1 10 0c0 1.3-.3 2.5-1 3.5H8z"
          variants={bulbFillVariants}
          transition={springTransition}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Base Screw Threads */}
        <motion.line
          x1="10"
          y1="22"
          x2="14"
          y2="22"
          stroke={isDark ? "#FFFFFF" : "currentColor"}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity={isDark ? 0.9 : 0.6}
        />

        {/* Internal Filament */}
        <motion.path
          d="M10 11.5l1.5-2 1 2 1.5-2"
          fill="none"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          variants={filamentVariants}
          transition={springTransition}
        />
      </motion.svg>
    </motion.button>
  );
}
