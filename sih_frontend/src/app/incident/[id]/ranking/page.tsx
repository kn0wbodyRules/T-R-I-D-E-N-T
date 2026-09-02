"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import ConfidenceBar from "@/components/ui/ConfidenceBar";
import VesselIcon from "@/components/map/VesselIcon";
import VesselDetailDrawer from "@/components/vessel/VesselDetailDrawer";
import { fetchRanking } from "@/lib/mock-data";
import { useIncident } from "@/components/providers/IncidentContext";

const RadarShipIcon = ({ fill, className }: { fill: string; className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill={fill} className={className}>
    <path d="m120-420 320-460v460H120Zm153-80h87v-125l-87 125Zm227 80q12-28 26-98t14-142q0-72-13.5-148T500-920q61 18 121.5 67t109 117q48.5 68 79 149.5T840-420H500Zm104-80h148q-17-77-55.5-141T615-750q2 21 3.5 43.5T620-660q0 47-4.5 87T604-500ZM360-200q-36 0-67-17t-53-43q-14 15-30.5 28T173-211q-35-26-59.5-64.5T80-360h800q-9 46-33.5 84.5T787-211q-20-8-36.5-21T720-260q-23 26-53.5 43T600-200q-36 0-67-17t-53-43q-22 26-53 43t-67 17ZM80-40v-80h40q32 0 62.5-10t57.5-30q27 20 57.5 29.5T360-121q32 0 62-9.5t58-29.5q27 20 57.5 29.5T600-121q32 0 62-9.5t58-29.5q28 20 58 30t62 10h40v80h-40q-31 0-61-7.5T720-70q-29 15-59 22.5T600-40q-31 0-61-7.5T480-70q-29 15-59 22.5T360-40q-31 0-61-7.5T240-70q-29 15-59 22.5T120-40H80Zm280-460Zm244 0Z"/>
  </svg>
);

export default function AttributionRankingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const incidentId = resolvedParams.id;
  const router = useRouter();

  const { selectedVesselId, setSelectedVesselId } = useIncident();

  const { data: ranking, isLoading } = useQuery({
    queryKey: ["ranking", incidentId],
    queryFn: () => fetchRanking(incidentId),
  });

  return (
    <div className="flex-1 flex flex-col">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[rgba(0,90,156,0.15)] pb-4 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#5A738E] mb-1">
            <span>STEP 6 OF 7 · ATTRIBUTION MATRIX</span>
            <span>·</span>
            <span className="text-[#005A9C] font-semibold">{incidentId}</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl tracking-wide text-[#005A9C] uppercase">
            Ranked Suspect Attribution Matrix
          </h1>
        </div>

        {/* Primary Action to Generate Report */}
        <button
          onClick={() => router.push(`/incident/${incidentId}/report`)}
          className="px-6 py-3 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs tracking-wider flex items-center gap-2 rounded-full border border-[#005A9C] transition-colors select-none cursor-pointer"
        >
          <span>GENERATE INVESTIGATOR REPORT →</span>
        </button>
      </div>

      {isLoading || !ranking ? (
        <div className="flex-1 flex items-center justify-center p-12 text-xs text-[#5A738E] bg-[#FFFFFF] border border-[rgba(0,90,156,0.15)] rounded-[38px]">
          COMPUTING ENSEMBLE ATTRIBUTION SCORES...
        </div>
      ) : (
        <div className="flex flex-col gap-6 flex-1">
          {/* Margin Analysis Banner */}
          <div
            className={clsx(
              "p-6 border rounded-[38px] flex items-start gap-4",
              ranking.is_close_margin
                ? "bg-[#FFFBEB] border-[#FFB800] text-[#D97706]"
                : "bg-[#ECFDF5] border-[#00B074] text-[#00B074]"
            )}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
                <span className="font-heading text-lg tracking-wide text-[#041527]">
                  {ranking.is_close_margin
                    ? "ATTRIBUTION MARGIN ANALYSIS: CLOSE CALL / SECONDARY REVIEW REQUIRED"
                    : "ATTRIBUTION MARGIN ANALYSIS: DECISIVE SINGLE SUSPECT LEAD"}
                </span>
                <span
                  className={clsx(
                    "text-[10px] px-2.5 py-0.5 rounded-full font-bold",
                    ranking.is_close_margin ? "bg-[#FFB800] text-black" : "bg-[#00B074] text-white"
                  )}
                >
                  {ranking.is_close_margin ? "CLOSE MARGIN" : "CLEAR LEAD"}
                </span>
              </div>
              <p className="text-xs text-[#334E68] mt-1.5 leading-relaxed">
                {ranking.margin_note}
              </p>
            </div>
          </div>

          {/* Suspect Ranking Table */}
          <div className="bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] flex flex-col overflow-hidden">
            <div className="px-8 py-5 bg-[#F8FAFD] border-b border-[rgba(0,90,156,0.12)] flex items-center justify-between">
              <span className="font-heading text-xl text-[#005A9C] uppercase tracking-wide">
                RANKED SUSPECT CANDIDATES ({ranking.rows.length})
              </span>
              <span className="text-[11px] text-[#627D98]">
                CLICK ANY ROW TO OPEN SHAP EXPLAINABILITY BREAKDOWN
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFD] border-b border-[rgba(0,90,156,0.12)] text-[11px] text-[#5A738E] uppercase tracking-wider">
                    <th className="py-4 px-6 w-20 text-center">RANK</th>
                    <th className="py-4 px-6">VESSEL IDENTIFIER</th>
                    <th className="py-4 px-6 w-32 text-center">AIS STATUS</th>
                    <th className="py-4 px-6 w-36">FLAG / REGISTRY</th>
                    <th className="py-4 px-6 w-48">VESSEL TYPE</th>
                    <th className="py-4 px-6 w-28 text-right">SPEED</th>
                    <th className="py-4 px-8 w-64 text-right">ATTRIBUTION SCORE</th>
                    <th className="py-4 px-6 w-28 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(0,90,156,0.08)]">
                  {ranking.rows.map((row) => {
                    const isSelected = row.vessel_id === selectedVesselId;

                    return (
                      <tr
                        key={row.vessel_id}
                        onClick={() => setSelectedVesselId(row.vessel_id)}
                        className={clsx(
                          "cursor-pointer transition-colors group",
                          isSelected
                            ? "bg-[#EDF3FA]"
                            : row.is_dark
                            ? "bg-[#FFF5F5] hover:bg-[#FFEBEB]"
                            : "hover:bg-[#F8FAFD]"
                        )}
                      >
                        <td className="py-4 px-6 text-center">
                          <span
                            className={clsx(
                              "w-7 h-7 rounded-full inline-flex items-center justify-center font-bold text-xs border",
                              row.rank === 1
                                ? "bg-[#005A9C] text-white border-[#005A9C]"
                                : "bg-[#F8FAFD] text-[#5A738E] border-[rgba(0,90,156,0.2)]"
                            )}
                          >
                            #{row.rank}
                          </span>
                        </td>

                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <VesselIcon isDark={row.is_dark} size="sm" />
                            <div>
                              <div className={clsx("font-bold uppercase tracking-wide", row.is_dark ? "text-[#EF3E42]" : "text-[#041527]")}>
                                {row.name_or_unidentified}
                              </div>
                              <div className="text-[10px] text-[#627D98]">
                                {row.imo && row.imo !== "UNKNOWN" ? `IMO ${row.imo}` : "UNMATCHED SAR TARGET"}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-6 flex justify-center">
                          {row.is_dark ? (
                            <div title="DARK TARGET (AIS OFF)" className="flex items-center justify-center">
                              <RadarShipIcon fill="#EF3E42" className="w-8 h-8 drop-shadow-sm stroke-current stroke-[20px] text-[#EF3E42]" />
                            </div>
                          ) : (
                            <div title="AIS ACTIVE" className="flex items-center justify-center">
                              <RadarShipIcon fill="#005A9C" className="w-8 h-8 drop-shadow-sm stroke-current stroke-[20px] text-[#005A9C]" />
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-6 text-[#334E68]">
                          {row.flag || "Unflagged"}
                        </td>

                        <td className="py-4 px-6 text-[#5A738E] text-[11px] truncate max-w-[180px]">
                          {row.type || "Tanker (Estimated)"}
                        </td>

                        <td className="py-4 px-6 text-right font-semibold text-[#041527]">
                          {row.speed_knots !== undefined ? `${row.speed_knots.toFixed(1)} kts` : "—"}
                        </td>

                        <td className="py-4 px-8">
                          <ConfidenceBar
                            value={row.confidence_score}
                            isDark={row.is_dark}
                            showScore={true}
                          />
                        </td>

                        <td className="py-4 px-6 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVesselId(row.vessel_id);
                            }}
                            className="px-3.5 py-1.5 bg-[#005A9C] hover:bg-[#00477d] text-[11px] font-bold rounded-full border border-[#005A9C] text-white transition-colors cursor-pointer"
                          >
                            DOSSIER
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-[#F8FAFD] border-t border-[rgba(0,90,156,0.12)] flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
              <div className="flex flex-col gap-2 text-[#627D98]">
                <span>
                  MODEL: Hydrodynamic SPH + TreeExplainer Ensemble (Calibrated against CleanSeaNet benchmark)
                </span>
                <div className="flex items-center gap-4 mt-1">
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                    <RadarShipIcon fill="#EF3E42" className="w-5 h-5 drop-shadow-sm stroke-current stroke-[20px] text-[#EF3E42]" />
                    <span className="text-[#EF3E42]">RED = DARK TARGET (AIS OFF)</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                    <RadarShipIcon fill="#005A9C" className="w-5 h-5 drop-shadow-sm stroke-current stroke-[20px] text-[#005A9C]" />
                    <span className="text-[#005A9C]">BLUE = AIS ACTIVE</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => router.push(`/incident/${incidentId}/report`)}
                className="px-6 py-2.5 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs tracking-wider flex items-center gap-2 rounded-full border border-[#005A9C] transition-colors cursor-pointer shrink-0"
              >
                <span>COMPOSE EVIDENTIARY REPORT →</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Overlay for Vessel Detail */}
      <VesselDetailDrawer
        vesselId={selectedVesselId}
        onClose={() => setSelectedVesselId(null)}
      />
    </div>
  );
}
