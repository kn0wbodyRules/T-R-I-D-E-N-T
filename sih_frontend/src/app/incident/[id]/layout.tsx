"use client";

import React, { use, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import clsx from "clsx";
import { ChevronUp, ChevronDown } from "lucide-react";
import MaterialIcon from "@/components/ui/MaterialIcon";
import { useIncident } from "@/components/providers/IncidentContext";
import JourneyShowcaseModal from "@/components/showcase/JourneyShowcaseModal";

const INVESTIGATION_STEPS = [
  {
    path: "intake",
    shortTitle: "1. Intake & SAR",
    title: "1. SAR Ingestion",
    code: "STG-01",
    description: "Sentinel-1 radar backscatter scene ingestion & slick boundary extraction.",
  },
  {
    path: "pipeline",
    shortTitle: "2. Pipeline Tracker",
    title: "2. Pipeline Execution",
    code: "STG-02",
    description: "Automated 5-stage ML workflow, weathering, and drift engine progress.",
  },
  {
    path: "detection",
    shortTitle: "3. Slick Detection",
    title: "3. Slick Detection",
    code: "STG-03",
    description: "Closed boundary polygon, area extent, and lookalike rejection.",
  },
  {
    path: "drift",
    shortTitle: "4. Drift & Origin",
    title: "4. Drift & Origin",
    code: "STG-04",
    description: "HYCOM 1/12° ocean currents reverse backtrack & origin KDE heatmap.",
  },
  {
    path: "candidates",
    shortTitle: "5. Candidate Map",
    title: "5. Candidate Map",
    code: "STG-05",
    description: "Spatio-temporal origin intersection & silent dark radar tracking.",
  },
  {
    path: "ranking",
    shortTitle: "6. Suspect Ranking",
    title: "6. Suspect Ranking",
    code: "STG-06",
    description: "Ranked culpability table, margin callout & SHAP tree explainability.",
  },
  {
    path: "report",
    shortTitle: "7. Evidentiary Report",
    title: "7. Evidentiary Report",
    code: "STG-07",
    description: "Evidence-grade MARPOL Annex I violation report & PSC resolution.",
  },
];

export default function IncidentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const incidentId = resolvedParams.id;
  const pathname = usePathname();
  const router = useRouter();
  const { activeIncident } = useIncident();

  const [showcaseOpen, setShowcaseOpen] = useState(false);

  // Find current step index
  const currentStepSlug = pathname.split("/")[3] || "intake";
  const currentStepIdx = INVESTIGATION_STEPS.findIndex((s) => s.path === currentStepSlug);
  const activeIdx = currentStepIdx === -1 ? 0 : currentStepIdx;

  const handleStepClick = (path: string) => {
    router.push(`/incident/${incidentId}/${path}`);
  };

  const handlePrev = () => {
    if (activeIdx > 0) {
      router.push(`/incident/${incidentId}/${INVESTIGATION_STEPS[activeIdx - 1].path}`);
    }
  };

  const handleNext = () => {
    if (activeIdx < INVESTIGATION_STEPS.length - 1) {
      router.push(`/incident/${incidentId}/${INVESTIGATION_STEPS[activeIdx + 1].path}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col print:block print:min-h-0">
      {/* Print-only Global TRIDENT Header (Above everything) */}
      <div className="hidden print:block w-full text-center py-6 border-b border-[rgba(0,90,156,0.15)] bg-white">
        <span className="font-trident font-heading text-6xl text-[#005A9C] tracking-widest uppercase">TRIDENT</span>
      </div>
      
      <div className="flex-1 flex flex-col lg:flex-row print:block w-full max-w-[1720px] mx-auto p-4 sm:p-6 lg:p-8 gap-6 bg-[#F4F7FB]">
        {/* Investigation Journey Sidebar with Apple-Style Morphing Pills Stack */}
      <aside className="w-full lg:w-[380px] shrink-0 bg-[#FFFFFF] border border-[rgba(0,90,156,0.2)] rounded-[38px] p-6 flex flex-col justify-between overflow-hidden self-start">
        
        <div className="flex flex-col gap-4">
          {/* Top: Header & Incident Meta */}
          <div className="border-b border-[rgba(0,90,156,0.12)] pb-4">
            <div className="flex items-center justify-between text-[10px] text-[#5A738E] uppercase tracking-wider mb-1">
              <span>INVESTIGATION JOURNEY</span>
              <button
                onClick={() => setShowcaseOpen(true)}
                className="text-[#005A9C] hover:underline font-bold transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>SHOWCASE</span>
                <MaterialIcon name="open_in_new" size={12} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg sm:text-[19px] text-[#005A9C] tracking-wide whitespace-nowrap">
                {incidentId}
              </h2>
              <span className="text-[10px] px-2.5 py-0.5 bg-[#005A9C] text-white rounded-full font-bold uppercase shrink-0">
                {activeIncident.status}
              </span>
            </div>

            <div className="text-xs text-[#334E68] mt-1">
              Slick Extent: <strong className="text-[#041527]">{activeIncident.area_km2.toFixed(1)} km²</strong>
            </div>
          </div>

          {/* Stepper Navigation: Morphing Pills Stack with Vertical Up/Down Controls */}
          <div className="flex gap-2.5">
            {/* Vertical Up/Down Stepper Controls */}
            <div className="flex flex-col gap-2 pt-1 shrink-0">
              <button
                onClick={handlePrev}
                disabled={activeIdx === 0}
                title="Previous step"
                className={clsx(
                  "w-8 h-8 rounded-lg border flex items-center justify-center transition-colors",
                  activeIdx === 0
                    ? "bg-[#F8FAFD] border-[rgba(0,90,156,0.1)] text-[#5A738E]/40 cursor-not-allowed"
                    : "bg-[#EDF3FA] hover:bg-[#005A9C] border-[rgba(0,90,156,0.2)] text-[#005A9C] hover:text-white cursor-pointer"
                )}
              >
                <ChevronUp size={16} />
              </button>

              <button
                onClick={handleNext}
                disabled={activeIdx === INVESTIGATION_STEPS.length - 1}
                title="Next step"
                className={clsx(
                  "w-8 h-8 rounded-lg border flex items-center justify-center transition-colors",
                  activeIdx === INVESTIGATION_STEPS.length - 1
                    ? "bg-[#F8FAFD] border-[rgba(0,90,156,0.1)] text-[#5A738E]/40 cursor-not-allowed"
                    : "bg-[#EDF3FA] hover:bg-[#005A9C] border-[rgba(0,90,156,0.2)] text-[#005A9C] hover:text-white cursor-pointer"
                )}
              >
                <ChevronDown size={16} />
              </button>
            </div>

            {/* Morphing Pills Column */}
            <div className="flex-1 flex flex-col gap-2">
              {INVESTIGATION_STEPS.map((step, idx) => {
                const isReportStage = currentStepSlug === "report";
                const isActive = !isReportStage && activeIdx === idx;
                const isPast = isReportStage || idx < activeIdx;

                return (
                  <motion.div
                    key={step.path}
                    layout
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    onClick={() => handleStepClick(step.path)}
                    className={clsx(
                      "cursor-pointer transition-colors overflow-hidden",
                      isActive
                        ? "bg-[#EDF3FA] border border-[#005A9C] rounded-2xl p-3.5"
                        : isPast
                        ? "bg-[#F8FAFD] hover:bg-[#EDF3FA] border border-[rgba(0,90,156,0.15)] rounded-full px-3.5 py-2 flex items-center justify-between"
                        : "bg-[#FFFFFF] hover:bg-[#F8FAFD] border border-[rgba(0,90,156,0.1)] rounded-full px-3.5 py-2 flex items-center justify-between"
                    )}
                  >
                    {isActive ? (
                      /* Active Morphing Card State: STG badge is REMOVED */
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-[#005A9C] flex items-center justify-center shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#005A9C]" />
                          </div>
                          <span className="font-heading text-sm sm:text-base text-[#005A9C] uppercase tracking-wide leading-tight">
                            {step.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#334E68] pl-5 leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    ) : (
                      /* Inactive Compact Pill State: STG badge is PRESENT */
                      <div className="flex items-center justify-between w-full text-xs">
                        <div className="flex items-center gap-2">
                          <div
                            className={clsx(
                              "w-4 h-4 rounded-full flex items-center justify-center shrink-0",
                              isPast
                                ? "text-[#00B074]"
                                : "border border-[rgba(0,90,156,0.3)]"
                            )}
                          >
                            {isPast ? (
                              <MaterialIcon name="check_circle" size={16} />
                            ) : (
                              <div className="w-1 h-1 rounded-full bg-[rgba(0,90,156,0.4)]" />
                            )}
                          </div>
                          <span
                            className={clsx(
                              "font-medium",
                              isPast ? "text-[#041527]" : "text-[#5A738E]"
                            )}
                          >
                            {step.shortTitle}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#5A738E] font-semibold">{step.code}</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Actions: Step Indicator & Showcase Trigger */}
        <div className="pt-4 mt-4 border-t border-[rgba(0,90,156,0.12)] flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-[#5A738E]">
            <span>STEP {activeIdx + 1} OF {INVESTIGATION_STEPS.length}</span>
            <button
              onClick={() => setShowcaseOpen(true)}
              className="text-[#005A9C] hover:underline font-bold transition-colors cursor-pointer"
            >
              EXPAND SHOWCASE →
            </button>
          </div>
        </div>
      </aside>

      {/* Main Investigation Content View */}
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>

      {/* Apple-Style Interactive Showcase Modal */}
      <JourneyShowcaseModal
        isOpen={showcaseOpen}
        onClose={() => setShowcaseOpen(false)}
        initialStepIndex={activeIdx}
      />
      </div>
    </div>
  );
}
