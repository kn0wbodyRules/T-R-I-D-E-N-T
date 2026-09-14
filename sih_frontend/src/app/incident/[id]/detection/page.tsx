"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import ConfidenceGauge from "@/components/ui/ConfidenceGauge";
import { fetchDetectionResult } from "@/lib/mock-data";
import SarSatelliteViewer from "@/components/sar/SarSatelliteViewer";

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
          <div className="lg:col-span-8 flex flex-col">
            <SarSatelliteViewer incidentId={incidentId} detection={detection} mode="detection" />
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
