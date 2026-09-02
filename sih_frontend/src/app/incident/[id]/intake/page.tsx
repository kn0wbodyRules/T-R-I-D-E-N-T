"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchDetectionResult, fetchIncidentById } from "@/lib/mock-data";

export default function IncidentIntakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const incidentId = resolvedParams.id;
  const router = useRouter();

  const { data: incident } = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: () => fetchIncidentById(incidentId),
  });

  const { data: detection, isLoading } = useQuery({
    queryKey: ["detection", incidentId],
    queryFn: () => fetchDetectionResult(incidentId),
  });

  return (
    <div className="flex-1 flex flex-col">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[rgba(0,90,156,0.15)] pb-4 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#5A738E] mb-1">
            <span>STEP 1 OF 7 · SATELLITE RADAR INGEST</span>
            <span>·</span>
            <span className="text-[#005A9C] font-semibold">{incidentId}</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl tracking-wide text-[#005A9C] uppercase">
            Incident Intake & SAR Raw Telemetry
          </h1>
        </div>

        {/* Primary Analyze Action */}
        <button
          onClick={() => router.push(`/incident/${incidentId}/pipeline`)}
          className="px-6 py-3 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 rounded-full border border-[#005A9C] transition-colors select-none cursor-pointer"
        >
          <span>RUN ATTRIBUTION PIPELINE</span>
        </button>
      </div>

      {isLoading || !detection ? (
        <div className="flex-1 flex items-center justify-center p-12 text-xs text-[#5A738E] bg-[#FFFFFF] border border-[rgba(0,90,156,0.15)] rounded-[38px]">
          LOADING SATELLITE PASS SCENE...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
          {/* Main SAR Scene Display Viewport (~65% width) */}
          <div className="lg:col-span-8 flex flex-col bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFD] border-b border-[rgba(0,90,156,0.12)] flex items-center justify-between text-xs">
              <span className="text-[#005A9C] font-semibold">SYNTHETIC APERTURE RADAR (SAR) SCENE</span>
              <span className="text-[11px] text-[#5A738E]">MODE: CO-POLARIZED VV/VH</span>
            </div>

            {/* Tactical SAR Scene Viewport */}
            <div className="relative flex-1 min-h-[460px] bg-[#041527] flex items-center justify-center overflow-hidden p-6 select-none">
              <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#005A9C_1px,transparent_1px)] [background-size:24px_24px]" />
              <div className="absolute inset-x-0 top-1/2 h-[1px] bg-[rgba(255,255,255,0.1)] pointer-events-none" />
              <div className="absolute inset-y-0 left-1/2 w-[1px] bg-[rgba(255,255,255,0.1)] pointer-events-none" />

              {/* Highly Realistic Synthetic SAR Backscatter Graphic */}
              <div className="relative w-full max-w-lg aspect-4/3 bg-[#1A1D24] border border-[#005A9C]/40 rounded-[32px] flex flex-col justify-between overflow-hidden shadow-2xl group">
                
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

                {/* 5. Tactical UI Overlays */}
                <div className="relative z-10 flex flex-col justify-between h-full p-6">
                  {/* Top Header */}
                  <div className="flex items-center justify-between text-[10px] text-[#00B074]">
                    <span className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#00B074]/40 flex items-center gap-1.5 shadow-sm">
                      <span className="w-1.5 h-1.5 bg-[#00B074] rounded-full animate-pulse" />
                      SWATH: 250 KM
                    </span>
                    <span className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#00B074]/40 text-[#00B074] shadow-sm">
                      INCIDENCE: 34.8°
                    </span>
                  </div>

                  {/* Targeted Crosshair around Slick */}
                  <div className="absolute top-[25%] left-[15%] w-[65%] h-[45%] border border-[#00B074]/30 bg-[#00B074]/5 pointer-events-none">
                    <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-[#00B074]" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-[#00B074]" />
                    <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-[#00B074]" />
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-[#00B074]" />
                  </div>

                  {/* Bottom Readout */}
                  <div className="flex items-end justify-between text-[10px] text-white">
                    <div className="bg-black/60 backdrop-blur-md p-3 rounded-xl border border-white/10 shadow-sm">
                      <div className="text-[#A3C0DC] mb-0.5">BACKSCATTER SUPPRESSION: <span className="text-white font-bold">-11.4 dB</span></div>
                      <div className="text-[#A3C0DC]">SURFACE ROUGHNESS: <span className="text-white font-bold">DAMPED WAVES</span></div>
                    </div>
                    <div className="px-3 py-1.5 bg-[#00B074]/10 border border-[#00B074]/60 text-[#00B074] rounded-full font-bold shadow-sm backdrop-blur-md">
                      HYDROCARBON ANOMALY CONFIRMED
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-[#F8FAFD] border-t border-[rgba(0,90,156,0.12)] flex items-center justify-between text-xs">
              <span className="text-[11px] text-[#5A738E]">
                PIXEL SPACING: 10.0m × 10.0m · CALIBRATION: SIGMA-0 (dB)
              </span>
              <button
                onClick={() => alert("Zooming full-resolution 10m GeoTIFF")}
                className="px-3 py-1.5 bg-[#FFFFFF] border border-[rgba(0,90,156,0.25)] text-[11px] rounded-full hover:border-[#005A9C] text-[#005A9C] font-semibold transition-colors cursor-pointer"
              >
                EXPAND RASTER
              </button>
            </div>
          </div>

          {/* Sensor & Metadata Rail (~35% width) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            <div className="bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] p-6 flex flex-col gap-4">
              <div className="border-b border-[rgba(0,90,156,0.1)] pb-3 flex items-center justify-between">
                <span className="font-heading text-xl text-[#005A9C] uppercase tracking-wide">INGEST METADATA</span>
                <span className="text-[10px] text-[#005A9C] bg-[#EDF3FA] px-3 py-1 rounded-full font-bold">
                  LEVEL-1 GRD
                </span>
              </div>

              <div className="flex flex-col gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-[#5A738E] block uppercase tracking-wider">SPACECRAFT / SENSOR</span>
                  <span className="text-[#041527] font-semibold">{detection.sensor_source}</span>
                </div>

                <div>
                  <span className="text-[10px] text-[#5A738E] block uppercase tracking-wider">ACQUISITION TIMESTAMP</span>
                  <span className="text-[#005A9C] font-bold">{detection.satellite_pass_utc}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] text-[#5A738E] block uppercase tracking-wider">WIND SPEED AT PASS</span>
                    <span className="text-[#041527] font-semibold">{detection.wind_speed_kts} knots</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#5A738E] block uppercase tracking-wider">DOUGLAS SEA STATE</span>
                    <span className="text-[#041527] font-semibold">State {detection.sea_state} (Smooth)</span>
                  </div>
                </div>

                <div className="border-t border-[rgba(0,90,156,0.08)] pt-3">
                  <span className="text-[10px] text-[#5A738E] block uppercase tracking-wider">RADAR INCIDENT COORDINATES</span>
                  <span className="text-[11px] text-[#334E68]">
                    18.912° N, 71.845° E (EEZ Corridor)
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] p-6 flex flex-col gap-3">
              <span className="font-heading text-xl text-[#005A9C] uppercase tracking-wide">ATTRIBUTION READINESS</span>
              <p className="text-[11px] text-[#334E68] leading-relaxed">
                Raw radar backscatter has passed initial quality threshold checks. Capillary damping confirms mineral oil discharge signature. Ready to execute hydrodynamic backtracking.
              </p>

              <button
                onClick={() => router.push(`/incident/${incidentId}/pipeline`)}
                className="w-full mt-2 py-3 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs rounded-full border border-[#005A9C] transition-colors cursor-pointer"
              >
                PROCEED TO PIPELINE →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
