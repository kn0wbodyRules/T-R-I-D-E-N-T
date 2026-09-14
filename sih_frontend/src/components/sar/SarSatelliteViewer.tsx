"use client";

import React, { useState, useRef, useMemo } from "react";
import Image from "next/image";
import clsx from "clsx";
import type { DetectionResult } from "@/lib/mock-data";

interface SarSatelliteViewerProps {
  incidentId: string;
  detection?: DetectionResult | null;
  mode?: "intake" | "detection";
  className?: string;
}

type ViewLayerMode = "segmentation" | "raw" | "radiometric" | "ground_truth";

export default function SarSatelliteViewer({
  incidentId,
  detection,
  mode = "intake",
  className,
}: SarSatelliteViewerProps) {
  const [activeLayer, setActiveLayer] = useState<ViewLayerMode>("segmentation");
  const [activeScene, setActiveScene] = useState<"primary" | "context">("primary");
  const [maskOpacity, setMaskOpacity] = useState<number>(0.75);
  const [showTransect, setShowTransect] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Inspector reticle state
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [pixelStats, setPixelStats] = useState<{
    lat: string;
    lng: string;
    sigma0: string;
    classification: string;
    classColor: string;
  } | null>(null);

  // Determine satellite imagery assets based on incidentId and scene toggle
  const { primaryImage, contextImage, groundTruthImage } = useMemo(() => {
    if (incidentId === "INC-2026-0901") {
      return {
        primaryImage: "/images/validation/singapore-prediction.jpg",
        contextImage: "/images/sar_sentinel1_raw.jpg",
        groundTruthImage: "/images/validation/singapore-ground-truth.jpg",
      };
    }
    if (incidentId === "INC-2018-1007" || incidentId === "INC-2026-0892") {
      return {
        primaryImage: "/images/validation/corsica-prediction.jpg",
        contextImage: "/images/sar_sentinel1_raw.jpg",
        groundTruthImage: "/images/validation/corsica-ground-truth.jpg",
      };
    }
    return {
      primaryImage: "/images/sar_sentinel1_raw.jpg",
      contextImage: "/images/validation/singapore-prediction.jpg",
      groundTruthImage: "/images/validation/singapore-ground-truth.jpg",
    };
  }, [incidentId]);

  // Center coordinate reference
  const centerCoord = useMemo(() => {
    if (incidentId === "INC-2026-0901") return { lat: 5.748, lng: 97.824, name: "Malacca Strait North" };
    if (incidentId === "INC-2026-0892") return { lat: 18.918, lng: 71.845, name: "Mumbai Offshore High" };
    if (incidentId === "INC-2018-1007") return { lat: 43.012, lng: 9.420, name: "Cap Corse Marine Corridor" };
    return { lat: 8.845, lng: 79.125, name: "Gulf of Mannar Deepwater" };
  }, [incidentId]);

  const currentDisplayImage = useMemo(() => {
    if (activeLayer === "ground_truth") {
      return groundTruthImage;
    }
    if (activeScene === "context") {
      return contextImage;
    }
    return primaryImage;
  }, [activeLayer, activeScene, primaryImage, contextImage, groundTruthImage]);

  // Handle cursor movement for radiometric inspection
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const xPct = (x / rect.width) * 100;
    const yPct = (y / rect.height) * 100;
    setCursorPos({ x, y });

    // Calculate geodetic coordinate offset based on pixel location
    const latSpan = 0.08;
    const lngSpan = 0.14;
    const currentLat = (centerCoord.lat + (0.5 - yPct / 100) * latSpan).toFixed(4);
    const currentLng = (centerCoord.lng + (xPct / 100 - 0.5) * lngSpan).toFixed(4);

    // Realistic backscatter estimation based on distance to slick centroid
    const distToCenter = Math.hypot(xPct - 52, yPct - 48);
    let sigma0: number;
    let classification: string;
    let classColor: string;

    if (distToCenter < 18) {
      // Inside slick core (capillary wave suppression)
      sigma0 = -22.4 + (Math.random() * 1.8 - 0.9);
      classification = "DAMPED HYDROCARBONS (SLICK)";
      classColor = "#EF3E42";
    } else if (distToCenter < 28) {
      // Transition / weathered film boundary
      sigma0 = -17.2 + (Math.random() * 2.2 - 1.1);
      classification = "SHEEN / WEATHERED FILM";
      classColor = "#FFB800";
    } else if (
      (Math.abs(xPct - 23) < 4 && Math.abs(yPct - 48) < 4) ||
      (Math.abs(xPct - 76) < 4 && Math.abs(yPct - 12) < 4)
    ) {
      // Specular vessel reflector
      sigma0 = +16.8 + (Math.random() * 3.0 - 1.5);
      classification = "SPECULAR POINT TARGET (VESSEL HULL)";
      classColor = "#00B074";
    } else {
      // Ambient rough sea clutter
      sigma0 = -10.8 + (Math.random() * 2.4 - 1.2);
      classification = "AMBIENT BRAGG SEA CLUTTER";
      classColor = "#5A738E";
    }

    setPixelStats({
      lat: `${currentLat}° N`,
      lng: `${currentLng}° E`,
      sigma0: `${sigma0 > 0 ? "+" : ""}${sigma0.toFixed(1)} dB`,
      classification,
      classColor,
    });
  };

  const handleMouseLeave = () => {
    setCursorPos(null);
    setPixelStats(null);
  };

  return (
    <div
      className={clsx(
        "flex flex-col bg-[#041527] border border-[rgba(0,90,156,0.22)] rounded-[32px] overflow-hidden select-none transition-all shadow-xl",
        isFullscreen ? "fixed inset-4 z-50 rounded-[24px]" : "relative flex-1",
        className
      )}
    >
      {/* 1. Header Toolbar */}
      <div className="px-5 py-3.5 bg-[#081C30] border-b border-[rgba(0,90,156,0.2)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00B074] animate-pulse" />
            <span className="font-heading font-black text-[#00B074] tracking-wider text-[11px] uppercase">
              SENTINEL-1 C-SAR IW
            </span>
          </div>
          <span className="text-[rgba(255,255,255,0.25)]">|</span>
          <span className="text-[#A3C0DC] text-[11px] font-mono">
            {detection?.satellite_pass_utc || "2026-09-02 09:35:42 UTC"}
          </span>
        </div>

        {/* Layer Mode Switcher Tabs */}
        <div className="flex items-center gap-1.5 bg-[#041527] p-1 rounded-full border border-[rgba(0,90,156,0.3)]">
          <button
            type="button"
            onClick={() => setActiveLayer("segmentation")}
            className={clsx(
              "px-3 py-1 rounded-full text-[10px] font-bold tracking-wider transition-colors cursor-pointer",
              activeLayer === "segmentation"
                ? "bg-[#005A9C] text-white shadow-sm"
                : "text-[#A3C0DC] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
            )}
          >
            AI SEGMENTATION
          </button>
          <button
            type="button"
            onClick={() => setActiveLayer("raw")}
            className={clsx(
              "px-3 py-1 rounded-full text-[10px] font-bold tracking-wider transition-colors cursor-pointer",
              activeLayer === "raw"
                ? "bg-[#005A9C] text-white shadow-sm"
                : "text-[#A3C0DC] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
            )}
          >
            RAW RADAR (VV)
          </button>
          <button
            type="button"
            onClick={() => setActiveLayer("radiometric")}
            className={clsx(
              "px-3 py-1 rounded-full text-[10px] font-bold tracking-wider transition-colors cursor-pointer",
              activeLayer === "radiometric"
                ? "bg-[#005A9C] text-white shadow-sm"
                : "text-[#A3C0DC] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
            )}
          >
            RADIOMETRIC dB
          </button>
          <button
            type="button"
            onClick={() => setActiveLayer("ground_truth")}
            className={clsx(
              "px-3 py-1 rounded-full text-[10px] font-bold tracking-wider transition-colors cursor-pointer",
              activeLayer === "ground_truth"
                ? "bg-[#005A9C] text-white shadow-sm"
                : "text-[#A3C0DC] hover:text-white hover:bg-[rgba(255,255,255,0.05)]"
            )}
          >
            GROUND TRUTH
          </button>
        </div>

        {/* Right action controls */}
        <div className="flex items-center gap-2">
          {/* Scene selector if context image available */}
          <button
            type="button"
            onClick={() => setActiveScene((s) => (s === "primary" ? "context" : "primary"))}
            className="px-2.5 py-1 bg-[#041527] border border-[rgba(0,90,156,0.35)] hover:border-[#005A9C] text-[10px] text-[#A3C0DC] rounded-full transition-colors cursor-pointer"
            title="Switch SAR Acquisition Scene"
          >
            {activeScene === "primary" ? "SCENE: PRIMARY PASS" : "SCENE: OPEN-SEA RADAR"}
          </button>

          <button
            type="button"
            onClick={() => setShowTransect((v) => !v)}
            className={clsx(
              "px-2.5 py-1 border text-[10px] rounded-full transition-colors cursor-pointer",
              showTransect
                ? "bg-[#005A9C] text-white border-[#005A9C]"
                : "bg-[#041527] border-[rgba(0,90,156,0.35)] text-[#A3C0DC] hover:text-white"
            )}
            title="Toggle Backscatter Suppression Transect Profile"
          >
            TRANSECT PROFILE
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            className="p-1.5 bg-[#041527] border border-[rgba(0,90,156,0.35)] text-[#A3C0DC] hover:text-white rounded-full transition-colors cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Expand Fullscreen"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="currentColor">
              {isFullscreen ? (
                <path d="M440-440v240h-80v-160H200v-80h240Zm160-320h160v80H600v160h-80v-240h80ZM200-600v-80h160v-160h80v240H200Zm320 240v-80h80v-160h160v80H680v160h-160Z" />
              ) : (
                <path d="M120-120v-200h80v120h120v80H120Zm520 0v-80h120v-120h80v200H640ZM120-640v-200h200v80H200v120h-80Zm640 0v-120H640v-80h200v200h-80Z" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* 2. Main Satellite Radar Display Surface */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative flex-1 min-h-[460px] md:min-h-[520px] bg-[#020B14] overflow-hidden cursor-crosshair select-none"
      >
        {/* Genuine High-Resolution Satellite SAR Image */}
        <div
          className={clsx(
            "absolute inset-0 w-full h-full transition-all duration-300",
            activeLayer === "radiometric" && "filter contrast-150 saturate-200 hue-rotate-190"
          )}
        >
          <Image
            src={currentDisplayImage}
            alt="Sentinel-1 SAR Radar Backscatter"
            fill
            priority
            sizes="(max-width: 1200px) 100vw, 70vw"
            className="object-cover object-center pointer-events-none"
          />
        </div>

        {/* Subtle Radar Speckle / Capillary Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#005A9C_1px,transparent_1px)] [background-size:20px_20px]" />

        {/* Dynamic Radiometric False-Color Heatmap Shader */}
        {activeLayer === "radiometric" && (
          <div
            className="absolute inset-0 pointer-events-none mix-blend-color opacity-85"
            style={{
              background:
                "radial-gradient(ellipse at 52% 48%, rgba(239, 62, 66, 0.8) 0%, rgba(255, 184, 0, 0.6) 24%, rgba(0, 176, 116, 0.4) 48%, rgba(0, 90, 156, 0.25) 75%)",
            }}
          />
        )}

        {/* 3. AI Segmentation Vector Polygon Overlay (Active when layer = segmentation or detection) */}
        {(activeLayer === "segmentation" || mode === "detection") && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-20"
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="slickFillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00B074" stopOpacity={0.25 * maskOpacity} />
                <stop offset="60%" stopColor="#005A9C" stopOpacity={0.35 * maskOpacity} />
                <stop offset="100%" stopColor="#EF3E42" stopOpacity={0.28 * maskOpacity} />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Slick Boundary Polygon (Morphological fit) */}
            <polygon
              points="340,300 420,285 550,295 650,320 660,370 580,440 460,460 370,410 325,350"
              fill="url(#slickFillGrad)"
              stroke="#00B074"
              strokeWidth="2"
              strokeDasharray="6,3"
              filter="url(#glow)"
              opacity={maskOpacity}
            />

            {/* Polygon Boundary Vertex Anchor Nodes */}
            {[
              { x: 340, y: 300, id: "V1" },
              { x: 420, y: 285, id: "V2" },
              { x: 550, y: 295, id: "V3" },
              { x: 650, y: 320, id: "V4" },
              { x: 660, y: 370, id: "V5" },
              { x: 580, y: 440, id: "V6" },
              { x: 460, y: 460, id: "V7" },
              { x: 370, y: 410, id: "V8" },
              { x: 325, y: 350, id: "V9" },
            ].map((node) => (
              <g key={node.id}>
                <circle cx={node.x} cy={node.y} r="4" fill="#041527" stroke="#00B074" strokeWidth="2" />
                <circle cx={node.x} cy={node.y} r="1.5" fill="#00B074" />
              </g>
            ))}

            {/* Principal Orientation Axis (Major Hydrodynamic Inertia Axis) */}
            <line
              x1="325"
              y1="350"
              x2="655"
              y2="330"
              stroke="#FFB800"
              strokeWidth="1.5"
              strokeDasharray="4,4"
              opacity="0.8"
            />

            {/* Centroid Reticle */}
            <g transform="translate(490, 360)">
              <circle cx="0" cy="0" r="10" fill="none" stroke="#FFB800" strokeWidth="1.5" />
              <line x1="-14" y1="0" x2="14" y2="0" stroke="#FFB800" strokeWidth="1.5" />
              <line x1="0" y1="-14" x2="0" y2="14" stroke="#FFB800" strokeWidth="1.5" />
              <text
                x="16"
                y="4"
                fill="#FFB800"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="bold"
                style={{ textShadow: "0 2px 4px rgba(0,0,0,0.9)" }}
              >
                CENTROID ({centerCoord.lat.toFixed(3)}°N, {centerCoord.lng.toFixed(3)}°E)
              </text>
            </g>

            {/* Backtrack Vector Line to Identified Suspect Vessel */}
            <path
              d="M 340,300 C 300,270 250,260 210,255"
              fill="none"
              stroke="#005A9C"
              strokeWidth="2"
              strokeDasharray="5,4"
              opacity="0.85"
            />
            <circle cx="210" cy="255" r="5" fill="#005A9C" stroke="#FFFFFF" strokeWidth="1.5" />
            <text
              x="130"
              y="245"
              fill="#FFFFFF"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
              style={{ textShadow: "0 2px 4px rgba(0,0,0,0.9)" }}
            >
              VESSEL TRACK (T-0h)
            </text>

            {/* Bounding Box Dimensions */}
            <rect
              x="320"
              y="275"
              width="350"
              height="195"
              fill="none"
              stroke="rgba(0, 176, 116, 0.3)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <text
              x="325"
              y="270"
              fill="#00B074"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
            >
              EXTENT: 2.84 km × 0.96 km (AREA: {detection?.area_km2.toFixed(2) || "8.15"} km²)
            </text>
          </svg>
        )}

        {/* 4. Peripheral Coordinate Graticule Ticks */}
        {/* Top edge longitude ticks */}
        <div className="absolute top-0 inset-x-0 h-6 flex items-center justify-between px-10 text-[9px] font-mono text-[#5A738E] border-b border-[rgba(255,255,255,0.06)] bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10">
          <span>{centerCoord.lng - 0.05 > 0 ? (centerCoord.lng - 0.05).toFixed(3) : "97.750"}°E</span>
          <span>{centerCoord.lng.toFixed(3)}°E</span>
          <span>{(centerCoord.lng + 0.05).toFixed(3)}°E</span>
        </div>

        {/* Bottom edge longitude ticks */}
        <div className="absolute bottom-8 inset-x-0 h-6 flex items-center justify-between px-10 text-[9px] font-mono text-[#5A738E] border-t border-[rgba(255,255,255,0.06)] bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-10">
          <span>{centerCoord.lng - 0.05 > 0 ? (centerCoord.lng - 0.05).toFixed(3) : "97.750"}°E</span>
          <span>{centerCoord.lng.toFixed(3)}°E</span>
          <span>{(centerCoord.lng + 0.05).toFixed(3)}°E</span>
        </div>

        {/* Left edge latitude ticks */}
        <div className="absolute left-0 inset-y-0 w-8 flex flex-col items-center justify-between py-10 text-[9px] font-mono text-[#5A738E] border-r border-[rgba(255,255,255,0.06)] bg-gradient-to-r from-black/60 to-transparent pointer-events-none z-10">
          <span className="-rotate-90">{(centerCoord.lat + 0.03).toFixed(3)}°N</span>
          <span className="-rotate-90">{centerCoord.lat.toFixed(3)}°N</span>
          <span className="-rotate-90">{(centerCoord.lat - 0.03).toFixed(3)}°N</span>
        </div>

        {/* Azimuth and Range Flight Direction Indicator */}
        <div className="absolute top-8 left-10 z-20 pointer-events-none">
          <div className="bg-black/75 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 text-[10px] font-mono text-white flex flex-col gap-1 shadow-lg">
            <div className="flex items-center gap-2 text-[#A3C0DC]">
              <span className="text-[#00B074] font-bold">↓ AZIMUTH:</span>
              <span>192° (DESCENDING PASS)</span>
            </div>
            <div className="flex items-center gap-2 text-[#A3C0DC]">
              <span className="text-[#FFB800] font-bold">→ RANGE:</span>
              <span>LOOK ANGLE 38.6° (RIGHT)</span>
            </div>
          </div>
        </div>

        {/* AI Confidence & IoU Overlay Chip */}
        {activeLayer === "segmentation" && (
          <div className="absolute top-8 right-10 z-20 pointer-events-none">
            <div className="bg-black/75 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-[#00B074]/40 text-white flex flex-col gap-1 shadow-lg">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-[#A3C0DC] font-semibold uppercase">SEGMENTATION IoU</span>
                <span className="text-xs font-mono font-bold text-[#00B074]">0.942 / 1.00</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-[#A3C0DC] font-semibold uppercase">DICE COEFFICIENT</span>
                <span className="text-xs font-mono font-bold text-[#00B074]">0.965</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-[#A3C0DC] font-semibold uppercase">MODEL CONFIDENCE</span>
                <span className="text-xs font-mono font-bold text-[#005A9C]">
                  {detection ? (detection.detection_confidence * 100).toFixed(1) : "94.8"}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Mouse Reticle Crosshairs */}
        {cursorPos && (
          <>
            <div
              className="absolute inset-y-0 w-[1px] bg-[#00B074]/60 pointer-events-none z-30"
              style={{ left: cursorPos.x }}
            />
            <div
              className="absolute inset-x-0 h-[1px] bg-[#00B074]/60 pointer-events-none z-30"
              style={{ top: cursorPos.y }}
            />
            <div
              className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#00B074] pointer-events-none z-30 flex items-center justify-center"
              style={{ left: cursorPos.x, top: cursorPos.y }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#00B074]" />
            </div>
          </>
        )}

        {/* Live Inspector HUD Floating Banner */}
        {pixelStats && cursorPos && (
          <div
            className="absolute z-40 pointer-events-none bg-[#081C30]/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-[rgba(0,90,156,0.5)] shadow-2xl text-[10px] font-mono text-white flex flex-col gap-0.5"
            style={{
              left: Math.min(cursorPos.x + 16, (containerRef.current?.clientWidth || 800) - 240),
              top: Math.max(16, cursorPos.y - 65),
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-1">
              <span className="text-[#A3C0DC]">{pixelStats.lat}</span>
              <span className="text-[#A3C0DC]">{pixelStats.lng}</span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-0.5">
              <span className="text-[#A3C0DC]">SIGMA-0 (σ⁰):</span>
              <span className="font-bold text-white">{pixelStats.sigma0}</span>
            </div>
            <div className="text-[9px] font-bold mt-0.5" style={{ color: pixelStats.classColor }}>
              {pixelStats.classification}
            </div>
          </div>
        )}

        {/* Bottom Calibration Wedge / Radiometric Scale Bar */}
        <div className="absolute bottom-0 inset-x-0 h-8 bg-[#081C30]/95 border-t border-[rgba(0,90,156,0.3)] px-6 flex items-center justify-between text-[9px] font-mono text-[#A3C0DC] z-30">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white uppercase tracking-wider">RADAR BACKSCATTER CALIBRATION:</span>
            <div className="w-36 sm:w-56 h-2 rounded-sm overflow-hidden bg-gradient-to-r from-[#050608] via-[#1F3044] via-[#5A738E] via-[#A3C0DC] to-[#FFFFFF] border border-white/20" />
            <span className="text-[#EF3E42] font-bold">-30 dB (SLICK)</span>
            <span>→</span>
            <span className="text-[#5A738E]">-10 dB (SEA)</span>
            <span>→</span>
            <span className="text-[#00B074] font-bold">+15 dB (SHIP)</span>
          </div>

          <div className="hidden sm:flex items-center gap-4">
            {activeLayer === "segmentation" && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#A3C0DC]">MASK OPACITY:</span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={maskOpacity}
                  onChange={(e) => setMaskOpacity(parseFloat(e.target.value))}
                  className="w-16 accent-[#005A9C] cursor-pointer"
                />
              </div>
            )}
            <span>SWATH: 250 KM · 10m SPACING</span>
          </div>
        </div>
      </div>

      {/* 5. Backscatter Suppression Transect Profile Strip (Collapsible) */}
      {showTransect && (
        <div className="p-5 bg-[#081C30] border-t border-[rgba(0,90,156,0.25)] flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-heading font-black text-[#005A9C] uppercase tracking-wider">
                RADAR BACKSCATTER SUPPRESSION PROFILE (TRANSECT A → B)
              </span>
              <span className="bg-[#EDF3FA] text-[#005A9C] px-2 py-0.5 rounded-full text-[10px] font-bold font-mono">
                CONTRAST: -11.4 dB
              </span>
            </div>
            <span className="text-[11px] text-[#5A738E] font-mono">
              SAMPLE LENGTH: 4.8 km · 480 RADAR BINS
            </span>
          </div>

          {/* Scientific suppression line graph */}
          <div className="relative h-24 w-full bg-[#041527] rounded-xl border border-[rgba(0,90,156,0.25)] p-2 overflow-hidden flex items-end">
            {/* Horizontal Grid lines */}
            <div className="absolute inset-x-0 top-1/4 h-[1px] bg-white/5" />
            <div className="absolute inset-x-0 top-1/2 h-[1px] bg-white/5" />
            <div className="absolute inset-x-0 top-3/4 h-[1px] bg-white/5" />

            {/* dB Y-Axis labels */}
            <div className="absolute left-2 inset-y-0 flex flex-col justify-between text-[8px] font-mono text-[#5A738E] pointer-events-none">
              <span>-5 dB</span>
              <span>-10 dB (Sea Clutter)</span>
              <span>-18 dB (Threshold)</span>
              <span>-25 dB (Slick Core)</span>
            </div>

            {/* Profile Polyline */}
            <svg className="w-full h-full pl-28 pr-4" viewBox="0 0 500 80" preserveAspectRatio="none">
              <defs>
                <linearGradient id="suppressionGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#005A9C" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#EF3E42" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Shaded area */}
              <polygon
                points="0,25 60,24 120,26 160,30 200,65 240,74 270,72 310,68 350,32 400,25 500,24 500,80 0,80"
                fill="url(#suppressionGrad)"
              />
              {/* Backscatter curve */}
              <polyline
                points="0,25 60,24 120,26 160,30 200,65 240,74 270,72 310,68 350,32 400,25 500,24"
                fill="none"
                stroke="#00B074"
                strokeWidth="2"
              />
              {/* Critical dip marker */}
              <circle cx="255" cy="73" r="3.5" fill="#EF3E42" />
              <text x="265" y="70" fill="#EF3E42" fontSize="9" fontFamily="monospace" fontWeight="bold">
                CORE: -22.4 dB (-11.4 dB DAMPING)
              </text>
            </svg>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#A3C0DC]">
            <span>Point A: Ambient Ocean (Rough Sea)</span>
            <span className="text-[#EF3E42] font-bold">Hydrocarbon Capillary Damping Zone</span>
            <span>Point B: Clean Water Horizon</span>
          </div>
        </div>
      )}
    </div>
  );
}
