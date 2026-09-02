"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import ConfidenceGauge from "@/components/ui/ConfidenceGauge";
import { fetchDetectionResult } from "@/lib/mock-data";

export default function DetectionResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const incidentId = resolvedParams.id;
  const router = useRouter();

  const { data: detection, isLoading } = useQuery({
    queryKey: ["detection", incidentId],
    queryFn: () => fetchDetectionResult(incidentId),
  });

  return (
    <div className="flex-1 flex flex-col">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[rgba(0,90,156,0.15)] pb-4 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#5A738E] mb-1">
            <span>STEP 3 OF 7 · RADAR MORPHOMETRY</span>
            <span>·</span>
            <span className="text-[#005A9C] font-semibold">{incidentId}</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl tracking-wide text-[#005A9C] uppercase">
            SAR Slick Detection & Morphological Geometry
          </h1>
        </div>

        {/* Primary Next Action */}
        <button
          onClick={() => router.push(`/incident/${incidentId}/drift`)}
          className="px-6 py-3 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs tracking-wider flex items-center gap-2 rounded-full border border-[#005A9C] transition-colors select-none cursor-pointer"
        >
          <span>PROCEED TO DRIFT & ORIGIN</span>
        </button>
      </div>

      {isLoading || !detection ? (
        <div className="flex-1 flex items-center justify-center p-12 text-xs text-[#5A738E] bg-[#FFFFFF] border border-[rgba(0,90,156,0.15)] rounded-[38px]">
          LOADING DETECTION MORPHOMETRY...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
          {/* Main Visual SAR Scene with Polygon Overlay (~65% width) */}
          <div className="lg:col-span-8 flex flex-col bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFD] border-b border-[rgba(0,90,156,0.12)] flex items-center justify-between text-xs">
              <span className="text-[#005A9C] font-semibold">EXTRACTED SLICK BOUNDARY POLYGON</span>
              <span className="text-[11px] text-[#005A9C] bg-[#EDF3FA] border border-[#005A9C]/30 px-3 py-1 rounded-full font-bold">
                GEOJSON POLYGON VERIFIED
              </span>
            </div>

            {/* Tactical High-Res Polygon Viewer */}
            <div className="relative flex-1 min-h-[480px] bg-[#041527] flex items-center justify-center p-6 select-none overflow-hidden">
              <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#005A9C_1px,transparent_1px)] [background-size:20px_20px]" />

              {/* Highly Realistic Synthetic SAR Backscatter Graphic */}
              <div className="relative w-full max-w-xl aspect-4/3 bg-[#1A1D24] border border-[#005A9C]/40 rounded-[32px] flex flex-col justify-between overflow-hidden shadow-2xl group">
                
                {/* 1. Base Sea Surface Backscatter (Salt & Pepper Noise) */}
                <div 
                  className="absolute inset-0 opacity-[0.35] mix-blend-screen pointer-events-none"
                  style={{
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E")',
                    backgroundSize: '150px 150px'
                  }}
                />
                
                {/* 2. Secondary Low-Frequency Swell/Wind Patterns */}
                <div 
                  className="absolute inset-0 opacity-[0.15] mix-blend-overlay pointer-events-none"
                  style={{
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise2%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.05%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise2)%22/%3E%3C/svg%3E")'
                  }}
                />

                {/* 3. Dark Oil Slick Anomaly (Damped Capillary Waves) */}
                <div className="absolute top-[30%] left-[20%] w-[55%] h-[35%] bg-[#050608] transform -rotate-12 rounded-[40%] blur-[6px] mix-blend-multiply opacity-90 transition-transform duration-1000 group-hover:scale-[1.02]" />
                <div className="absolute top-[32%] left-[22%] w-[45%] h-[28%] bg-black transform -rotate-12 rounded-[50%] blur-[3px] opacity-100" />
                <div className="absolute top-[48%] left-[62%] w-[15%] h-[8%] bg-black transform -rotate-[20deg] rounded-[50%] blur-[4px] opacity-80" />

                {/* 4. Sensor Vignette & Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-tr from-[#001122]/60 via-transparent to-[#001122]/60 pointer-events-none" />
                <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] pointer-events-none" />

                {/* 5. Polygon Overlay SVG */}
                <svg className="absolute inset-0 w-full h-full p-8 z-10" viewBox="0 0 500 350">
                  <polygon
                    points="60,50 90,45 110,70 85,85 55,70"
                    fill="none"
                    stroke="#EF3E42"
                    strokeWidth="1.5"
                    strokeDasharray="3,3"
                    opacity="0.6"
                  />
                  <polygon
                    points="380,240 430,230 450,265 400,280"
                    fill="none"
                    stroke="#EF3E42"
                    strokeWidth="1.5"
                    strokeDasharray="3,3"
                    opacity="0.6"
                  />

                  <polygon
                    points="120,180 180,120 320,100 410,140 360,220 220,240 140,210"
                    fill="rgba(0, 176, 116, 0.15)"
                    stroke="#00B074"
                    strokeWidth="2.5"
                    strokeDasharray="5,5"
                  />

                  <line
                    x1="120"
                    y1="180"
                    x2="410"
                    y2="140"
                    stroke="#FFB800"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />

                  <circle cx="265" cy="160" r="5" fill="#FFB800" stroke="#FFFFFF" strokeWidth="1.5" />
                  <text x="275" y="165" fill="#FFB800" fontSize="12" fontWeight="bold" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                    CENTROID (18.912°N, 71.845°E)
                  </text>
                </svg>

                {/* 6. Tactical UI Overlays */}
                <div className="relative z-20 flex flex-col justify-between h-full p-6 pointer-events-none">
                  {/* Top Readout */}
                  <div className="flex items-center justify-between text-[11px] text-[#00B074]">
                    <span className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#00B074]/40 shadow-sm">
                      AREA: {detection.area_km2.toFixed(2)} km²
                    </span>
                    <span className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#FFB800]/40 text-[#FFB800] shadow-sm">
                      ORIENTATION: {detection.orientation_deg}° TRUE
                    </span>
                  </div>

                  {/* Bottom Readout */}
                  <div className="flex items-end justify-between text-[10px] text-white">
                    <div className="bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-sm">
                      <div className="text-[#A3C0DC] mb-0.5">POLYGON VERTICES: <span className="text-white font-bold">6 BOUNDARY NODES</span></div>
                      <div className="text-[#A3C0DC]">ELONGATION RATIO: <span className="text-white font-bold">{detection.elongation_ratio.toFixed(2)}:1 (HEAVY SLICK)</span></div>
                    </div>
                    <div className="bg-[#1f090b]/80 backdrop-blur-md p-3 rounded-xl border border-[#EF3E42]/50 text-[#EF3E42] font-bold shadow-sm">
                      {detection.filtered_lookalikes_count} LOOKALIKES REJECTED
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#F8FAFD] border-t border-[rgba(0,90,156,0.12)] flex items-center justify-between text-xs text-[#5A738E]">
              <span>ALGORITHM: CNN-UNET ++ ADAPTIVE BACKSCATTER THRESHOLDING</span>
              <span>FALSE POSITIVE REJECTION: 99.1%</span>
            </div>
          </div>

          {/* Morphometrics & Parameter Readout Rail (~35% width) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            <div className="bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] p-6 flex flex-col items-center">
              <span className="font-heading text-xl text-[#005A9C] uppercase mb-2 self-start tracking-wide">
                RADAR DETECTION CONFIDENCE
              </span>
              <ConfidenceGauge
                value={detection.detection_confidence}
                size={130}
                label="MINERAL OIL CLASSIFICATION"
                sublabel="CONFIRMED"
              />
            </div>

            <div className="bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] p-6 flex flex-col gap-3.5">
              <span className="font-heading text-xl text-[#005A9C] uppercase border-b border-[rgba(0,90,156,0.1)] pb-2 tracking-wide">
                MORPHOMETRIC ATTRIBUTES
              </span>

              <div className="flex flex-col gap-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#5A738E]">CONTAMINATED SURFACE AREA</span>
                  <strong className="text-[#041527]">{detection.area_km2.toFixed(2)} km²</strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#5A738E]">MAJOR AXIS ORIENTATION</span>
                  <strong className="text-[#005A9C]">{detection.orientation_deg}° True</strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#5A738E]">ELONGATION RATIO</span>
                  <strong className="text-[#041527]">{detection.elongation_ratio.toFixed(2)} : 1</strong>
                </div>

                <div className="flex items-center justify-between border-t border-[rgba(0,90,156,0.08)] pt-2.5">
                  <span className="text-[#5A738E]">ESTIMATED AGE BRACKET</span>
                  <strong className="text-[#005A9C]">{detection.age_bracket}</strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#5A738E]">FILTERED LOOKALIKES</span>
                  <strong className="text-[#00B074]">{detection.filtered_lookalikes_count} (Biogenic / Low Wind)</strong>
                </div>
              </div>
            </div>

            <div className="bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] p-6 flex flex-col gap-3">
              <span className="font-heading text-xl text-[#005A9C] uppercase tracking-wide">HYDRODYNAMIC BACKTRACKING</span>
              <p className="text-[11px] text-[#334E68] leading-relaxed">
                Boundary geometry and age brackets establish initial conditions for Lagrangian reverse drift modeling.
              </p>

              <button
                onClick={() => router.push(`/incident/${incidentId}/drift`)}
                className="w-full mt-1 py-3 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs rounded-full border border-[#005A9C] transition-colors cursor-pointer"
              >
                COMPUTE DRIFT & ORIGIN →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
