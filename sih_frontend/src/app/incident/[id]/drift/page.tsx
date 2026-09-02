"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import TridentMap from "@/components/map/TridentMap";
import { fetchDriftOrigin, fetchDetectionResult } from "@/lib/mock-data";

export default function DriftOriginPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const incidentId = resolvedParams.id;
  const router = useRouter();

  const { data: drift, isLoading: isDriftLoading } = useQuery({
    queryKey: ["drift", incidentId],
    queryFn: () => fetchDriftOrigin(incidentId),
  });

  const { data: detection } = useQuery({
    queryKey: ["detection", incidentId],
    queryFn: () => fetchDetectionResult(incidentId),
  });

  const slickCenter: [number, number] = drift
    ? [drift.slick_position.coordinates[1], drift.slick_position.coordinates[0]]
    : [18.912, 71.845];

  const mapCenter: [number, number] = drift?.origin_heatmap?.[0]
    ? [
        (slickCenter[0] + drift.origin_heatmap[0].lat) / 2,
        (slickCenter[1] + drift.origin_heatmap[0].lng) / 2,
      ]
    : slickCenter;

  return (
    <div className="flex-1 flex flex-col">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[rgba(0,90,156,0.15)] pb-4 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#5A738E] mb-1">
            <span>STEP 4 OF 7 · HYDRODYNAMIC DRIFT & BACKTRACKING</span>
            <span>·</span>
            <span className="text-[#005A9C] font-semibold">{incidentId}</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl tracking-wide text-[#005A9C] uppercase">
            Lagrangian Drift Backtracking & Origin Heatmap
          </h1>
        </div>

        {/* Primary Next Action */}
        <button
          onClick={() => router.push(`/incident/${incidentId}/candidates`)}
          className="px-6 py-3 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs tracking-wider flex items-center gap-2 rounded-full border border-[#005A9C] transition-colors select-none cursor-pointer"
        >
          <span>INTERCEPT CANDIDATE VESSELS</span>
        </button>
      </div>

      {isDriftLoading || !drift ? (
        <div className="flex-1 flex items-center justify-center p-12 text-xs text-[#5A738E] bg-[#FFFFFF] border border-[rgba(0,90,156,0.15)] rounded-[38px]">
          COMPUTING LAGRANGIAN SPH REVERSE CORRIDOR...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
          {/* Hero TridentMap Container */}
          <div className="lg:col-span-8 flex flex-col bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFD] border-b border-[rgba(0,90,156,0.12)] flex items-center justify-between text-xs">
              <span className="text-[#005A9C] font-semibold uppercase">ORIGIN PROBABILITY KERNEL (KDE HEATMAP)</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#005A9C] font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#005A9C] rounded-full inline-block" />
                  REVERSE CURRENT DRIFT: {drift.current_speed_kts} kts
                </span>
              </div>
            </div>

            {/* Reusable TridentMap Component */}
            <div className="relative flex-1 min-h-[500px] w-full">
              <TridentMap
                center={mapCenter}
                zoom={11}
                slickCoordinates={detection?.slick_polygon.coordinates[0]}
                slickCenter={slickCenter}
                heatmapPoints={drift.origin_heatmap}
                driftVectors={drift.drift_vectors}
                overlays={{
                  showHeatmap: true,
                  heatmapDimmed: false,
                  showSlickPolygon: true,
                  showVessels: false,
                  showDriftVectors: true,
                }}
              />
            </div>

            {/* Map Legend Strip */}
            <div className="px-6 py-3 bg-[#F8FAFD] border-t border-[rgba(0,90,156,0.12)] flex items-center justify-between text-xs text-[#334E68]">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#EF3E42] rounded-xs inline-block" /> 90%+ Origin Core
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#F97316] rounded-xs inline-block" /> 70% Confidence
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#005A9C] rounded-xs inline-block" /> Current Slick
                </span>
                <span className="flex items-center gap-1.5 text-[#041527] font-semibold">
                  <span className="w-4 h-0.5 border-t border-dashed border-[#005A9C] inline-block" /> Backtrack Line
                </span>
              </div>
              <span>SPH LAGRANGIAN BACKTRACK (T - 18.5 HRS)</span>
            </div>
          </div>

          {/* Temporal & Hydrodynamic Readout Rail (~32% width) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            {/* Estimated Discharge Window Card */}
            <div className="bg-[#FFFFFF] border-2 border-[#005A9C] rounded-[38px] p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-[rgba(0,90,156,0.12)] pb-3">
                <span className="font-heading text-xl text-[#005A9C] uppercase tracking-wide">
                  ESTIMATED DISCHARGE TIME WINDOW
                </span>
                <span className="text-[10px] bg-[#EDF3FA] text-[#005A9C] px-2.5 py-0.5 rounded-full font-bold">
                  LOCKED
                </span>
              </div>

              <div className="flex flex-col gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-[#5A738E] uppercase block tracking-wider">WINDOW START (UTC)</span>
                  <span className="text-[#041527] font-bold text-sm tracking-wide">{drift.estimated_time_window.start}</span>
                </div>

                <div>
                  <span className="text-[10px] text-[#5A738E] uppercase block tracking-wider">WINDOW END (UTC)</span>
                  <span className="text-[#005A9C] font-bold text-sm tracking-wide">{drift.estimated_time_window.end}</span>
                </div>

                <div className="border-t border-[rgba(0,90,156,0.08)] pt-3 text-[11px] text-[#334E68]">
                  Release occurred approximately <strong className="text-[#041527]">16.5 to 22.0 hours</strong> prior to Sentinel-1 SAR pass.
                </div>
              </div>
            </div>

            {/* Hydrodynamic Forcings Card */}
            <div className="bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] p-6 flex flex-col gap-3.5">
              <span className="font-heading text-xl text-[#005A9C] uppercase border-b border-[rgba(0,90,156,0.1)] pb-2 tracking-wide">
                HYDRODYNAMIC FORCINGS
              </span>

              <div className="flex flex-col gap-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#5A738E]">DOMINANT CURRENT VECTOR</span>
                  <strong className="text-[#041527]">{drift.dominant_current_dir}</strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#5A738E]">MEAN CURRENT SPEED</span>
                  <strong className="text-[#041527]">{drift.current_speed_kts} knots</strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#5A738E]">WIND DRIFT FACTOR</span>
                  <strong className="text-[#005A9C]">3.2% Leeway (ERA5)</strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#5A738E]">ORIGIN CENTROID</span>
                  <strong className="text-[#005A9C]">18.845° N, 71.745° E</strong>
                </div>
              </div>
            </div>

            {/* Candidate Search Action Box */}
            <div className="bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] p-6 flex flex-col gap-3">
              <span className="font-heading text-xl text-[#005A9C] uppercase tracking-wide">AIS CORRIDOR SEARCH</span>
              <p className="text-[11px] text-[#334E68] leading-relaxed">
                5 candidate vessels identified traversing the release envelope during the modeled backtrack window.
              </p>

              <button
                onClick={() => router.push(`/incident/${incidentId}/candidates`)}
                className="w-full mt-1 py-3 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs rounded-full border border-[#005A9C] transition-colors cursor-pointer"
              >
                SEARCH CANDIDATE VESSELS →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
