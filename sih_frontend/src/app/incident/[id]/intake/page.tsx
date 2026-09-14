"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchDetectionResult, fetchIncidentById } from "@/lib/mock-data";
import SarSatelliteViewer from "@/components/sar/SarSatelliteViewer";

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
          <div className="lg:col-span-8 flex flex-col">
            <SarSatelliteViewer incidentId={incidentId} detection={detection} mode="intake" />
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
                    {(() => {
                      const ring = detection.slick_polygon.coordinates[0];
                      if (!ring?.length) return "Coordinates unavailable";
                      const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
                      const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
                      return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? "E" : "W"} (${incident?.region || "EEZ Corridor"})`;
                    })()}
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
