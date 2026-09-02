"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import ConfidenceBar from "@/components/ui/ConfidenceBar";
import VesselIcon from "@/components/map/VesselIcon";
import ShapBarChart from "@/components/charts/ShapBarChart";
import MaterialIcon from "@/components/ui/MaterialIcon";
import { fetchVesselDetail } from "@/lib/mock-data";

interface VesselDetailDrawerProps {
  vesselId: string | null;
  onClose: () => void;
}

export default function VesselDetailDrawer({
  vesselId,
  onClose,
}: VesselDetailDrawerProps) {
  const { data: vessel, isLoading } = useQuery({
    queryKey: ["vessel", vesselId],
    queryFn: () => (vesselId ? fetchVesselDetail(vesselId) : null),
    enabled: !!vesselId,
  });

  if (!vesselId) return null;

  const vesselName = vessel?.vessel_info?.name || vessel?.vessel_id || "UNIDENTIFIED RADAR TARGET";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer"
      />

      {/* Slide-over Panel (Curved Left Edge) */}
      <aside className="relative z-10 w-full max-w-xl bg-[#FFFFFF] border-l border-[rgba(0,90,156,0.2)] rounded-l-[38px] flex flex-col h-full overflow-hidden">
        {/* Drawer Header */}
        <div className="p-6 bg-[#F8FAFD] border-b border-[rgba(0,90,156,0.12)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VesselIcon isDark={vessel?.is_dark || false} size="md" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading text-2xl text-[#005A9C] uppercase tracking-wide">
                  {vesselName}
                </span>
                {vessel?.is_dark && (
                  <span className="text-[9px] bg-[#EF3E42] text-white px-2 py-0.5 rounded-full font-bold">
                    DARK TARGET
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[#5A738E]">
                ID: {vessel?.vessel_id} {vessel?.vessel_info?.imo ? `· IMO: ${vessel.vessel_info.imo}` : ""} · FLAG: {vessel?.vessel_info?.flag || "UNKNOWN"}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-[#EDF3FA] text-[#5A738E] hover:text-[#005A9C] rounded-full transition-colors cursor-pointer"
          >
            <MaterialIcon name="close" size={20} />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        {isLoading || !vessel ? (
          <div className="p-12 text-center text-xs text-[#5A738E]">
            LOADING SUSPECT DOSSIER...
          </div>
        ) : (
          <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6 text-xs text-[#334E68]">
            {/* Attribution Culpability Score */}
            <div className="p-5 bg-[#F8FAFD] border border-[rgba(0,90,156,0.15)] rounded-3xl flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#5A738E] uppercase tracking-wider font-semibold">
                  ENSEMBLE CULPABILITY ATTRIBUTION
                </span>
                <span className="font-heading text-2xl text-[#005A9C]">
                  {(vessel.attribution_score * 100).toFixed(1)}%
                </span>
              </div>
              <ConfidenceBar
                value={vessel.attribution_score}
                isDark={vessel.is_dark}
                showScore={false}
              />
            </div>

            {/* AIS Trajectory Gap Callout (for Dark Vessels) */}
            {vessel.is_dark && (
              <div className="p-4 bg-[#FFF5F5] border-l-4 border-[#EF3E42] rounded-2xl flex flex-col gap-1 text-[#EF3E42]">
                <div className="font-bold flex items-center gap-2">
                  <span>UNEXPLAINED AIS TRANSPONDER DEACTIVATION</span>
                </div>
                <p className="text-[11px] text-[#334E68] leading-relaxed">
                  Vessel ceased AIS broadcast while traversing inside the estimated spill backtrack origin envelope. Corroborated with Sentinel-1 SAR dark vessel wake signature.
                </p>
              </div>
            )}

            {/* Vessel Metadata Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#F8FAFD] border border-[rgba(0,90,156,0.1)] rounded-2xl">
                <span className="text-[10px] text-[#627D98] block uppercase">VESSEL TYPE</span>
                <span className="text-[#041527] font-semibold">{vessel.vessel_info?.type || "Crude Oil Tanker (Estimated)"}</span>
              </div>

              <div className="p-3 bg-[#F8FAFD] border border-[rgba(0,90,156,0.1)] rounded-2xl">
                <span className="text-[10px] text-[#627D98] block uppercase">SPEED OVER GROUND</span>
                <span className="text-[#041527] font-semibold">{vessel.behavior_features?.speed || 12.4} knots</span>
              </div>

              <div className="p-3 bg-[#F8FAFD] border border-[rgba(0,90,156,0.1)] rounded-2xl">
                <span className="text-[10px] text-[#627D98] block uppercase">ROUTE DEVIATION</span>
                <span className="text-[#041527] font-semibold">+{((vessel.behavior_features?.route_deviation || 0.35) * 100).toFixed(0)}% course alteration</span>
              </div>

              <div className="p-3 bg-[#F8FAFD] border border-[rgba(0,90,156,0.1)] rounded-2xl">
                <span className="text-[10px] text-[#627D98] block uppercase">VIIRS PASS</span>
                <span className="text-[#005A9C] font-semibold">{vessel.viirs_crosscheck?.matched ? "Thermal Radiance Corroborated" : "No Thermal Anomaly"}</span>
              </div>
            </div>

            {/* SHAP Tree-Explainer Waterfall */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-[rgba(0,90,156,0.1)] pb-2">
                <span className="font-heading text-lg text-[#005A9C] uppercase tracking-wide">
                  SHAP ATTRIBUTION EXPLAINABILITY
                </span>
                <span className="text-[10px] text-[#627D98]">SHAP TreeExplainer</span>
              </div>

              <p className="text-[11px] text-[#5A738E]">
                Feature contribution breakdown explaining the model score for this candidate:
              </p>

              <ShapBarChart data={vessel.shap_breakdown} />
            </div>

            {/* Counterfactual Text */}
            {vessel.counterfactual_text && (
              <div className="p-4 bg-[#EDF3FA] border border-[rgba(0,90,156,0.2)] rounded-3xl flex flex-col gap-2">
                <span className="text-[10px] text-[#005A9C] uppercase tracking-wider font-bold">
                  COUNTERFACTUAL REASONING
                </span>
                <p className="text-[11px] text-[#334E68] leading-relaxed">
                  {vessel.counterfactual_text}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Drawer Footer */}
        <div className="p-4 bg-[#F8FAFD] border-t border-[rgba(0,90,156,0.12)] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#FFFFFF] border border-[rgba(0,90,156,0.25)] text-xs text-[#005A9C] font-semibold rounded-full hover:bg-[#EDF3FA] transition-colors cursor-pointer"
          >
            CLOSE
          </button>

          <button
            onClick={() => {
              alert(`Exported forensic dossier for ${vesselName}`);
            }}
            className="px-5 py-2 bg-[#005A9C] hover:bg-[#00477d] text-white text-xs font-bold rounded-full border border-[#005A9C] transition-colors cursor-pointer"
          >
            EXPORT SUSPECT EVIDENCE
          </button>
        </div>
      </aside>
    </div>
  );
}
