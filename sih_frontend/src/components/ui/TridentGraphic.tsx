"use client";

import React from "react";
import clsx from "clsx";

interface TridentGraphicProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  direction?: "left-to-right" | "right-to-left";
}

/**
 * Ultra-Vivid Radiant Gold Trident Graphic:
 * - Native horizontal orientation (viewBox: 520x200)
 * - Long visible golden shaft
 * - Full 3-pronged head with taller center tine and curved outer tines with sharp barbs
 * - Saturated 24K Gold gradients (#FFFDF0 -> #FFE066 -> #FFD700 -> #F59E0B) with NO brown/olive tones
 * - Heavy 5px solid black outline for maximum contrast against navy text
 */
export default function TridentGraphic({
  className,
  width = 260,
  height = 88,
  direction = "left-to-right",
}: TridentGraphicProps) {
  const isReverse = direction === "right-to-left";

  return (
    <svg
      viewBox="0 0 520 200"
      width={width}
      height={height}
      style={{
        transform: isReverse ? "scaleX(-1)" : "none",
        transformOrigin: "center center",
      }}
      className={clsx(
        "overflow-visible select-none pointer-events-none filter drop-shadow-[0_6px_16px_rgba(0,0,0,0.65)]",
        className
      )}
    >
      <defs>
        {/* Radiant 24K Gold Cylindrical Gradient (Vibrant Yellow-Gold, Zero Olive/Brown) */}
        <linearGradient id="radiantGoldV3" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#D97706" />
          <stop offset="18%" stopColor="#F59E0B" />
          <stop offset="38%" stopColor="#FFD700" />
          <stop offset="50%" stopColor="#FFFDF0" />
          <stop offset="62%" stopColor="#FFD700" />
          <stop offset="82%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        {/* Head Gradient with Specular Gold Core */}
        <linearGradient id="headGoldV3" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="30%" stopColor="#FFD700" />
          <stop offset="60%" stopColor="#FFFDF0" />
          <stop offset="80%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>

        {/* Specular White-Gold Center Spine */}
        <linearGradient id="spineHighlightV3" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#FFE066" stopOpacity="0.7" />
          <stop offset="40%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Heavy 5px Solid Black Outline & Radiant Gold Body */}
      <g stroke="#000000" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        {/* Full Trident Profile: Long Shaft + Base Collar + 3 Barbed Tines */}
        <path
          d="
            M 12 91
            L 220 91
            C 242 91, 268 83, 290 80
            C 306 60, 352 44, 410 43
            L 416 50
            L 476 40
            L 456 56
            L 384 54
            C 330 58, 324 80, 342 89
            L 448 90
            L 456 82
            L 516 100
            L 456 118
            L 448 110
            L 342 111
            C 324 120, 330 142, 384 146
            L 456 144
            L 476 160
            L 416 150
            L 410 157
            C 352 156, 306 140, 290 120
            C 268 117, 242 109, 220 109
            L 12 109
            C 5 109, 5 91, 12 91
            Z
          "
          fill="url(#radiantGoldV3)"
        />
      </g>

      {/* Internal Head Specular Overlay */}
      <path
        d="
          M 292 82
          C 308 62, 354 46, 410 45
          L 416 52
          L 474 42
          L 454 58
          L 384 56
          C 332 60, 326 82, 344 91
          L 448 92
          L 454 84
          L 512 100
          L 454 116
          L 448 108
          L 344 109
          C 326 118, 332 140, 384 144
          L 454 142
          L 474 158
          L 416 148
          L 410 155
          C 354 154, 308 138, 292 118
          Z
        "
        fill="url(#headGoldV3)"
        opacity="0.85"
      />

      {/* Specular Centerline Highlight Spines */}
      <g stroke="url(#spineHighlightV3)" strokeLinecap="round" opacity="0.95">
        {/* Long Shaft Spine */}
        <line x1="18" y1="100" x2="285" y2="100" strokeWidth="3" />
        {/* Center Tine Spine */}
        <line x1="335" y1="100" x2="505" y2="100" strokeWidth="3.5" />
        {/* Upper Outer Tine Spine */}
        <path d="M 320 72 C 348 54, 400 46, 458 48" fill="none" strokeWidth="2.5" />
        {/* Lower Outer Tine Spine */}
        <path d="M 320 128 C 348 146, 400 154, 458 152" fill="none" strokeWidth="2.5" />
      </g>
    </svg>
  );
}
