"use client";

import React, { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import TridentMap from "@/components/map/TridentMap";
import VesselIcon from "@/components/map/VesselIcon";
import ConfidenceBar from "@/components/ui/ConfidenceBar";
import VesselDetailDrawer from "@/components/vessel/VesselDetailDrawer";
import {
  fetchCandidates,
  fetchDriftOrigin,
  fetchDetectionResult,
} from "@/lib/mock-data";
import { useIncident } from "@/components/providers/IncidentContext";

export default function CandidateVesselsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const incidentId = resolvedParams.id;
  const router = useRouter();

  const { selectedVesselId, setSelectedVesselId } = useIncident();
  const [filterMode, setFilterMode] = useState<"all" | "dark_only" | "high_risk">("all");

  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates", incidentId],
    queryFn: () => fetchCandidates(incidentId),
  });

  const { data: drift } = useQuery({
    queryKey: ["drift", incidentId],
    queryFn: () => fetchDriftOrigin(incidentId),
  });

  const { data: detection } = useQuery({
    queryKey: ["detection", incidentId],
    queryFn: () => fetchDetectionResult(incidentId),
  });

  const filteredCandidates = candidates.filter((c) => {
    if (filterMode === "dark_only") return c.is_dark;
    if (filterMode === "high_risk") return c.confidence_score >= 0.7;
    return true;
  });

  const slickCenter: [number, number] = drift
    ? [drift.slick_position.coordinates[1], drift.slick_position.coordinates[0]]
    : [18.912, 71.845];

  const mapCenter: [number, number] = drift?.origin_heatmap?.[0]
    ? [drift.origin_heatmap[0].lat, drift.origin_heatmap[0].lng]
    : slickCenter;

  return (
    <div className="flex-1 flex flex-col">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[rgba(0,90,156,0.15)] pb-4 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#5A738E] mb-1">
            <span>STEP 5 OF 7 · AIS & RADAR SPATIO-TEMPORAL SEARCH</span>
            <span>·</span>
            <span className="text-[#005A9C] font-semibold">{incidentId}</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl tracking-wide text-[#005A9C] uppercase">
            Candidate Vessels in Origin Corridor
          </h1>
        </div>

        {/* Action: View Full Ranking */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/incident/${incidentId}/ranking`)}
            className="px-6 py-3 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs tracking-wider flex items-center gap-2 rounded-full border border-[#005A9C] transition-colors select-none cursor-pointer"
          >
            <span>VIEW ATTRIBUTION RANKING →</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Main Map View (~68% width) */}
        <div className="lg:col-span-8 flex flex-col bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] overflow-hidden">
          <div className="px-6 py-4 bg-[#F8FAFD] border-b border-[rgba(0,90,156,0.12)] flex items-center justify-between text-xs">
            <span className="text-[#005A9C] font-semibold uppercase">CANDIDATE VESSEL POSITIONING OVER KDE ORIGIN</span>

            {/* Filter Toggle Control */}
            <div className="flex items-center gap-1 bg-[#FFFFFF] border border-[rgba(0,90,156,0.2)] p-1 rounded-full">
              <button
                onClick={() => setFilterMode("all")}
                className={clsx(
                  "px-3 py-1 text-[10px] rounded-full transition-colors cursor-pointer font-bold",
                  filterMode === "all" ? "bg-[#005A9C] text-white" : "text-[#005A9C] hover:bg-[#EDF3FA]"
                )}
              >
                ALL ({candidates.length})
              </button>
              <button
                onClick={() => setFilterMode("dark_only")}
                className={clsx(
                  "px-3 py-1 text-[10px] rounded-full flex items-center gap-1 transition-colors cursor-pointer font-bold",
                  filterMode === "dark_only" ? "bg-[#EF3E42] text-white" : "text-[#EF3E42] hover:bg-[#EF3E42]/10"
                )}
              >
                <span className="w-1.5 h-1.5 bg-[#EF3E42] rounded-full inline-block" />
                DARK ONLY ({candidates.filter((c) => c.is_dark).length})
              </button>
              <button
                onClick={() => setFilterMode("high_risk")}
                className={clsx(
                  "px-3 py-1 text-[10px] rounded-full transition-colors cursor-pointer font-bold",
                  filterMode === "high_risk" ? "bg-[#FFB800] text-black" : "text-[#D97706] hover:bg-[#FFB800]/10"
                )}
              >
                RISK {">"} 70%
              </button>
            </div>
          </div>

          <div className="relative flex-1 min-h-[500px] w-full">
            <TridentMap
              center={mapCenter}
              zoom={11}
              slickCoordinates={detection?.slick_polygon.coordinates[0]}
              slickCenter={slickCenter}
              heatmapPoints={drift?.origin_heatmap || []}
              candidates={filteredCandidates}
              selectedVesselId={selectedVesselId}
              onSelectVessel={(id: string) => setSelectedVesselId(id)}
              driftVectors={drift?.drift_vectors || []}
              overlays={{
                showHeatmap: true,
                heatmapDimmed: true,
                showSlickPolygon: true,
                showVessels: true,
                showDriftVectors: true,
                darkOnlyFilter: filterMode === "dark_only",
              }}
            />
          </div>

          <div className="px-6 py-3.5 bg-[#F8FAFD] border-t border-[rgba(0,90,156,0.12)] flex items-center justify-between text-xs text-[#334E68]">
            <span>CLICK ANY VESSEL MARKER OR ROW TO OPEN SHAP DOSSIER</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[#005A9C] font-semibold">
                <span className="w-2.5 h-2.5 bg-[#005A9C] text-white rounded-xs inline-flex items-center justify-center text-[8px]">▲</span> Identified AIS
              </span>
              <span className="flex items-center gap-1.5 text-[#EF3E42] font-semibold">
                <span className="w-2.5 h-2.5 bg-[#EF3E42] text-white rounded-xs inline-flex items-center justify-center text-[8px]">!</span> Dark Target
              </span>
            </div>
          </div>
        </div>

        {/* Candidate List Rail (~32% width) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] flex flex-col h-full overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFD] border-b border-[rgba(0,90,156,0.12)] flex items-center justify-between">
              <div>
                <span className="font-heading text-xl text-[#005A9C] uppercase tracking-wide">CORRIDOR CONTACTS</span>
                <span className="text-[10px] text-[#627D98] block">
                  SHOWING {filteredCandidates.length} OF {candidates.length} VESSELS
                </span>
              </div>
              <span className="text-[10px] bg-[#005A9C] text-white px-3 py-1 rounded-full font-bold">
                BY CULPABILITY
              </span>
            </div>

            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-3">
              {filteredCandidates.map((vessel) => {
                const isSelected = vessel.vessel_id === selectedVesselId;

                return (
                  <div
                    key={vessel.vessel_id}
                    onClick={() => setSelectedVesselId(vessel.vessel_id)}
                    className={clsx(
                      "p-4 border transition-colors cursor-pointer flex flex-col gap-2 rounded-2xl group",
                      isSelected
                        ? "bg-[#EDF3FA] border-[#005A9C]"
                        : vessel.is_dark
                        ? "bg-[#FFF5F5] border-[#EF3E42]/40 hover:border-[#EF3E42]"
                        : "bg-[#FFFFFF] border-[rgba(0,90,156,0.12)] hover:border-[#005A9C]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <VesselIcon isDark={vessel.is_dark} size="sm" />
                        <div>
                          <h4 className="text-xs font-bold text-[#041527] uppercase leading-tight">
                            {vessel.name_or_unidentified}
                          </h4>
                          <span className="text-[10px] text-[#627D98]">
                            {vessel.is_dark ? "AIS SILENT / RADAR TRACK" : `IMO: ${vessel.imo || "N/A"} · ${vessel.flag || "Flag Unknown"}`}
                          </span>
                        </div>
                      </div>

                      <span
                        className={clsx(
                          "text-[9px] px-2 py-0.5 font-bold uppercase shrink-0 rounded-full",
                          vessel.is_dark
                            ? "bg-[#EF3E42] text-white"
                            : "bg-[#005A9C] text-white"
                        )}
                      >
                        {vessel.is_dark ? "DARK" : "AIS"}
                      </span>
                    </div>

                    <div className="pt-1">
                      <div className="flex items-center justify-between text-[10px] text-[#5A738E] mb-1">
                        <span>ATTRIBUTION CULPABILITY</span>
                        <span className="text-[#041527] font-bold">
                          {(vessel.confidence_score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <ConfidenceBar
                        value={vessel.confidence_score}
                        isDark={vessel.is_dark}
                        showScore={false}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[#5A738E] pt-1 border-t border-[rgba(0,90,156,0.08)]">
                      <span>SPEED: <strong className="text-[#041527]">{vessel.speed_knots} kts</strong></span>
                      <span>LAST SEEN: <strong className="text-[#005A9C]">{vessel.last_seen_utc?.split(" ")[1]}</strong></span>
                      <span className="text-[#005A9C] group-hover:underline font-bold">
                        DOSSIER →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-[#F8FAFD] border-t border-[rgba(0,90,156,0.12)]">
              <button
                onClick={() => router.push(`/incident/${incidentId}/ranking`)}
                className="w-full py-3 bg-[#005A9C] hover:bg-[#00477d] text-white text-xs font-bold rounded-full border border-[#005A9C] transition-colors cursor-pointer"
              >
                OPEN SUSPECT RANKING TABLE →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over Overlay for Vessel Detail */}
      <VesselDetailDrawer
        vesselId={selectedVesselId}
        onClose={() => setSelectedVesselId(null)}
      />
    </div>
  );
}
