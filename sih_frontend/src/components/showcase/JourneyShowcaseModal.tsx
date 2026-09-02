"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import clsx from "clsx";
import { X, ChevronUp, ChevronDown } from "lucide-react";

export interface JourneyStep {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  code: string;
  accentColor: string;
  metrics: { label: string; value: string }[];
  previewGraphic: {
    type: "radar" | "weathering" | "drift" | "candidates" | "shap" | "viirs" | "report";
    title: string;
    subtitle: string;
    badgeText: string;
  };
}

const JOURNEY_STEPS: JourneyStep[] = [
  {
    id: "step-1",
    shortTitle: "1. Radar SAR Ingest",
    title: "Satellite Synthetic Aperture Radar (SAR) Acquisition",
    description:
      "High-resolution C-band SAR backscatter ingestion from Sentinel-1 and RADARSAT. Damped capillary wave suppression isolates hydrocarbon slicks with automated lookalike rejection.",
    code: "STG-01-SAR",
    accentColor: "#005A9C",
    metrics: [
      { label: "Resolution", value: "10m Pixel" },
      { label: "Suppression", value: "-11.4 dB" },
      { label: "Area Extent", value: "14.82 km²" },
    ],
    previewGraphic: {
      type: "radar",
      title: "SAR C-Band Sigma-0 Backscatter",
      subtitle: "VV/VH Co-Polarized Swath Scene Analysis",
      badgeText: "GEOJSON VERIFIED",
    },
  },
  {
    id: "step-2",
    shortTitle: "2. Weathering & Age Model",
    title: "Atmospheric & Chemical Decay Weathering",
    description:
      "Simulates evaporative loss, photo-oxidation, and emulsification forced with ERA5 surface wind vectors to lock the exact discharge age bracket.",
    code: "STG-02-AGE",
    accentColor: "#005A9C",
    metrics: [
      { label: "Age Bracket", value: "14 - 26 hrs" },
      { label: "Volume Loss", value: "28.4%" },
      { label: "Wind Forcing", value: "12.4 kts" },
    ],
    previewGraphic: {
      type: "weathering",
      title: "ADIOS2 Weathering Decay Curve",
      subtitle: "Chemical Evaporation & Emulsification Window",
      badgeText: "ERA5 FORCING SYNCED",
    },
  },
  {
    id: "step-3",
    shortTitle: "3. Lagrangian Drift Backtrack",
    title: "SPH Hydrodynamic Ocean Backtracking",
    description:
      "Reverse particle tracking forced by HYCOM 1/12° oceanic current reanalysis models and ECMWF leeway vectors generates an evidentiary origin kernel.",
    code: "STG-03-DRIFT",
    accentColor: "#005A9C",
    metrics: [
      { label: "Current Drift", value: "1.8 knots" },
      { label: "Convergence", value: "95% CI Kernel" },
      { label: "Backtrack", value: "T - 18.5 hrs" },
    ],
    previewGraphic: {
      type: "drift",
      title: "HYCOM 1/12° Reverse Lagrangian Drift",
      subtitle: "Particle Trajectory Origin Kernel Heatmap",
      badgeText: "SPH SIMULATION LOCKED",
    },
  },
  {
    id: "step-4",
    shortTitle: "4. AIS Corridor Intercept",
    title: "Spatio-Temporal Candidate Intersection",
    description:
      "Filters thousands of satellite AIS and coastal radar tracks to identify all ships navigating through the origin kernel during the release window, flagging dark vessels.",
    code: "STG-04-AIS",
    accentColor: "#EF3E42",
    metrics: [
      { label: "Corridor Ships", value: "5 Vessels" },
      { label: "Dark Targets", value: "2 Silent" },
      { label: "AIS Coverage", value: "99.8%" },
    ],
    previewGraphic: {
      type: "candidates",
      title: "Candidate AIS Stream Intersection",
      subtitle: "AIS Broadcast Gaps & Radar Target Correlation",
      badgeText: "5 TARGETS INTERCEPTED",
    },
  },
  {
    id: "step-5",
    shortTitle: "5. SHAP Tree Attribution",
    title: "Ensemble Attribution & Explainability",
    description:
      "TreeExplainer model attributes culpability based on course deviation, speed anomalies, stop durations, and proximity to origin centroid with signed feature importance.",
    code: "STG-05-SHAP",
    accentColor: "#005A9C",
    metrics: [
      { label: "Top Suspect", value: "UNK-DARK-7702" },
      { label: "Culpability", value: "88.4%" },
      { label: "Top Feature", value: "+36.2% Course Anomaly" },
    ],
    previewGraphic: {
      type: "shap",
      title: "SHAP Feature Contribution Matrix",
      subtitle: "Signed TreeExplainer Impact on Attribution Score",
      badgeText: "CULPRIT IDENTIFIED",
    },
  },
  {
    id: "step-6",
    shortTitle: "6. VIIRS Radiance Cross-Check",
    title: "Suomi-NPP Nighttime Radiance Verification",
    description:
      "Cross-corroborates nighttime combustion and optical radiance from VIIRS Day/Night Band to verify engine loads and bilge heat signatures at the discharge scene.",
    code: "STG-06-VIIRS",
    accentColor: "#D97706",
    metrics: [
      { label: "DNB Radiance", value: "0.84 nW/cm²·sr" },
      { label: "Sensor", value: "NOAA-20 / VIIRS" },
      { label: "Match Status", value: "Confirmed" },
    ],
    previewGraphic: {
      type: "viirs",
      title: "VIIRS Day/Night Band Radiance Pass",
      subtitle: "Nighttime Optical Thermal Anomaly Detection",
      badgeText: "THERMAL CORROBORATED",
    },
  },
  {
    id: "step-7",
    shortTitle: "7. Evidence-Grade Report",
    title: "Statutory MARPOL Investigation Resolution",
    description:
      "Generates an official evidence dossier under MARPOL 73/78 Annex I with cryptographic verification for Port State Control enforcement and ship detention.",
    code: "STG-07-MARPOL",
    accentColor: "#00B074",
    metrics: [
      { label: "Violation", value: "Annex I Reg 15" },
      { label: "Signatory", value: "Cdr. Rajesh V. Nair" },
      { label: "Legal Status", value: "Admissible Evidence" },
    ],
    previewGraphic: {
      type: "report",
      title: "Investigator Dossier Document",
      subtitle: "Cryptographically Signed Forensic Assessment",
      badgeText: "PORT STATE CONTROL READY",
    },
  },
];

interface JourneyShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStepIndex?: number;
}

export default function JourneyShowcaseModal({
  isOpen,
  onClose,
  initialStepIndex = 0,
}: JourneyShowcaseModalProps) {
  const [activeIndex, setActiveIndex] = useState(initialStepIndex);
  const activeStep = JOURNEY_STEPS[activeIndex];

  if (!isOpen) return null;

  const handlePrev = () => {
    if (activeIndex > 0) setActiveIndex(activeIndex - 1);
  };

  const handleNext = () => {
    if (activeIndex < JOURNEY_STEPS.length - 1) setActiveIndex(activeIndex + 1);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 md:p-8">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 cursor-pointer"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="relative w-full max-w-6xl max-h-[92vh] bg-[#FFFFFF] border border-[rgba(0,90,156,0.25)] rounded-[38px] overflow-hidden flex flex-col z-10"
        >
          {/* Modal Header */}
          <div className="px-8 py-5 bg-[#F8FAFD] border-b border-[rgba(0,90,156,0.12)] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#5A738E] mb-0.5">
                <span>INVESTIGATION METHODOLOGY</span>
                <span>·</span>
                <span className="text-[#005A9C] font-semibold">STAGE SHOWCASE</span>
              </div>
              <h2 className="font-heading text-2xl sm:text-3xl text-[#005A9C] uppercase tracking-wide">
                TRIDENT End-to-End Reverse Attribution Journey
              </h2>
            </div>

            {/* Circular Close Button */}
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-[#FFFFFF] hover:bg-[#EDF3FA] border border-[rgba(0,90,156,0.2)] flex items-center justify-center text-[#005A9C] transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Modal Body: Two Column Layout */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
            
            {/* Left Column (~42% width): Morphing Vertical Pills Stack + Stepper Buttons */}
            <div className="lg:col-span-5 p-6 bg-[#F8FAFD] border-r border-[rgba(0,90,156,0.12)] flex gap-4 overflow-y-auto">
              
              {/* Stepper Buttons (Up / Down) */}
              <div className="flex flex-col gap-2 pt-2 shrink-0">
                <button
                  onClick={handlePrev}
                  disabled={activeIndex === 0}
                  className={clsx(
                    "w-9 h-9 rounded-xl border flex items-center justify-center transition-colors",
                    activeIndex === 0
                      ? "bg-[#FFFFFF] border-[rgba(0,90,156,0.1)] text-[#5A738E]/40 cursor-not-allowed"
                      : "bg-[#FFFFFF] hover:bg-[#005A9C] border-[rgba(0,90,156,0.2)] text-[#005A9C] hover:text-white cursor-pointer"
                  )}
                >
                  <ChevronUp size={18} />
                </button>

                <button
                  onClick={handleNext}
                  disabled={activeIndex === JOURNEY_STEPS.length - 1}
                  className={clsx(
                    "w-9 h-9 rounded-xl border flex items-center justify-center transition-colors",
                    activeIndex === JOURNEY_STEPS.length - 1
                      ? "bg-[#FFFFFF] border-[rgba(0,90,156,0.1)] text-[#5A738E]/40 cursor-not-allowed"
                      : "bg-[#FFFFFF] hover:bg-[#005A9C] border-[rgba(0,90,156,0.2)] text-[#005A9C] hover:text-white cursor-pointer"
                  )}
                >
                  <ChevronDown size={18} />
                </button>
              </div>

              {/* Vertical Stack of Morphing Pills */}
              <div className="flex-1 flex flex-col gap-2.5">
                {JOURNEY_STEPS.map((step, idx) => {
                  const isActive = activeIndex === idx;

                  return (
                    <motion.div
                      key={step.id}
                      layout
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      onClick={() => setActiveIndex(idx)}
                      className={clsx(
                        "cursor-pointer transition-colors overflow-hidden",
                        isActive
                          ? "bg-[#EDF3FA] border border-[#005A9C] rounded-2xl p-4 min-h-[185px] flex flex-col justify-between"
                          : "bg-[#FFFFFF] hover:bg-[#EDF3FA] border border-[rgba(0,90,156,0.12)] rounded-full px-4 py-2.5 h-[44px] flex items-center justify-between"
                      )}
                    >
                      {isActive ? (
                        /* Expanded Morphing Card - STG badge removed, uniform fixed layout */
                        <div className="flex flex-col justify-between h-full gap-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-4 h-4 rounded-full border-2 border-[#005A9C] flex items-center justify-center shrink-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#005A9C]" />
                              </div>
                              <span className="font-heading text-base text-[#005A9C] uppercase tracking-wide leading-tight">
                                {step.title}
                              </span>
                            </div>

                            <p className="text-xs text-[#334E68] leading-relaxed line-clamp-2 pl-6">
                              {step.description}
                            </p>
                          </div>

                          {/* Quick Metric Pills */}
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[rgba(0,90,156,0.08)]">
                            {step.metrics.map((m, mIdx) => (
                              <div key={mIdx} className="bg-[#FFFFFF] p-1.5 rounded-xl text-center border border-[rgba(0,90,156,0.1)]">
                                <span className="text-[9px] text-[#627D98] block uppercase truncate">{m.label}</span>
                                <span className="text-xs text-[#041527] font-bold truncate block">{m.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Inactive Compact Capsule Pill */
                        <div className="flex items-center justify-between w-full text-xs">
                          <div className="flex items-center gap-2.5">
                            <div className="w-3.5 h-3.5 rounded-full border border-[rgba(0,90,156,0.3)] flex items-center justify-center shrink-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-[rgba(0,90,156,0.4)]" />
                            </div>
                            <span className="text-[#334E68] font-medium truncate">{step.shortTitle}</span>
                          </div>
                          <span className="text-[10px] text-[#5A738E] font-semibold shrink-0">{step.code}</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Right Column (~58% width): Fluid Synchronized Showcase Viewport */}
            <div className="lg:col-span-7 p-8 bg-[#FFFFFF] flex flex-col justify-between overflow-hidden relative">
              
              {/* Synchronized Media Frame with AnimatePresence */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep.id}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.04 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="w-full flex-1 flex flex-col justify-between"
                >
                  {/* Viewport Top Header */}
                  <div className="flex items-center justify-between border-b border-[rgba(0,90,156,0.12)] pb-4 mb-6">
                    <div>
                      <span className="text-[10px] text-[#005A9C] uppercase tracking-wider block font-bold">
                        STAGE {activeIndex + 1} OF {JOURNEY_STEPS.length}
                      </span>
                      <h3 className="font-heading text-3xl text-[#005A9C] uppercase tracking-wide">
                        {activeStep.previewGraphic.title}
                      </h3>
                      <p className="text-xs text-[#5A738E]">
                        {activeStep.previewGraphic.subtitle}
                      </p>
                    </div>

                    <span className="text-[10px] px-3 py-1 bg-[#EDF3FA] text-[#005A9C] border border-[#005A9C]/30 rounded-full font-bold">
                      {activeStep.previewGraphic.badgeText}
                    </span>
                  </div>

                  {/* High-Impact Visual Graphic Canvas */}
                  <div className="relative flex-1 min-h-[320px] bg-[#041527] rounded-3xl border border-[rgba(0,90,156,0.2)] overflow-hidden flex items-center justify-center p-6">
                    {activeStep.previewGraphic.type === "radar" && (
                      <div className="relative w-full h-full flex flex-col justify-between">
                        <div className="w-48 h-24 bg-black/90 border border-[#4A9BE8] rounded-full mx-auto transform -rotate-6 flex items-center justify-center">
                          <span className="text-[10px] text-[#4A9BE8] font-bold">SLICK POLYGON: 14.82 km²</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-white/75">
                          <span>SENSOR: SENTINEL-1C C-SAR</span>
                          <span>SIGMA-0: -11.4 dB</span>
                        </div>
                      </div>
                    )}

                    {activeStep.previewGraphic.type === "weathering" && (
                      <div className="relative w-full h-full flex flex-col justify-between">
                        <div className="flex-1 flex items-center justify-center">
                          <svg className="w-full h-36" viewBox="0 0 400 120">
                            <path
                              d="M 20 100 Q 120 20, 200 40 T 380 90"
                              fill="none"
                              stroke="#005A9C"
                              strokeWidth="3"
                            />
                          </svg>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-white/75">
                          <span>AGE WINDOW: 14 – 26 HRS</span>
                          <span>VOLUME LOSS: 28.4%</span>
                        </div>
                      </div>
                    )}

                    {activeStep.previewGraphic.type === "drift" && (
                      <div className="relative w-full h-full flex flex-col justify-between">
                        <div className="flex-1 flex items-center justify-center">
                          <div className="w-32 h-32 rounded-full border-2 border-dashed border-[#005A9C] flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-[#EF3E42]/50 flex items-center justify-center text-[9px] text-white font-bold">
                              ORIGIN 95%
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-white/75">
                          <span>HYCOM 1/12° OCEAN CURRENTS</span>
                          <span>BACKTRACK: T - 18.5H</span>
                        </div>
                      </div>
                    )}

                    {activeStep.previewGraphic.type === "candidates" && (
                      <div className="relative w-full h-full flex flex-col justify-between">
                        <div className="flex-1 flex items-center justify-center gap-4">
                          <div className="p-3 bg-[#082347] border border-[#005A9C] rounded-xl text-center">
                            <span className="text-white font-bold text-xs">3 AIS ACTIVE</span>
                          </div>
                          <div className="p-3 bg-[#1f090b] border border-[#EF3E42] rounded-xl text-center">
                            <span className="text-[#EF3E42] font-bold text-xs">2 DARK SHIPS</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-white/75">
                          <span>SPATIO-TEMPORAL SEARCH</span>
                          <span>5 TARGETS INTERCEPTED</span>
                        </div>
                      </div>
                    )}

                    {activeStep.previewGraphic.type === "shap" && (
                      <div className="relative w-full h-full flex flex-col justify-between">
                        <div className="flex-1 flex flex-col justify-center gap-2">
                          <div className="flex items-center justify-between text-[11px] text-white">
                            <span>Course Deviation</span>
                            <span className="text-[#EF3E42] font-bold">+36.2%</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-white">
                            <span>Speed Anomaly</span>
                            <span className="text-[#EF3E42] font-bold">+24.8%</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-white/75">
                          <span>SHAP TREE-EXPLAINER ENSEMBLE</span>
                          <span>TOP CULPABILITY: 88.4%</span>
                        </div>
                      </div>
                    )}

                    {activeStep.previewGraphic.type === "viirs" && (
                      <div className="relative w-full h-full flex flex-col justify-between">
                        <div className="flex-1 flex items-center justify-center">
                          <div className="w-24 h-24 rounded-full bg-[#FFB800]/30 border border-[#FFB800] flex items-center justify-center text-[10px] text-[#FFB800] font-bold">
                            RADIANCE HOTSPOT
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-white/75">
                          <span>VIIRS DAY/NIGHT BAND</span>
                          <span>0.84 nW/cm²·sr</span>
                        </div>
                      </div>
                    )}

                    {activeStep.previewGraphic.type === "report" && (
                      <div className="relative w-full h-full flex flex-col justify-between">
                        <div className="flex-1 flex flex-col justify-center items-center gap-1 text-center">
                          <span className="font-heading text-xl text-white">MARPOL ANNEX I VIOLATION</span>
                          <span className="text-[10px] text-white/70">PRIMA FACIE EVIDENCE FOR PSC DETENTION</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-white/75">
                          <span>SIGNATORY: CDR. RAJESH V. NAIR</span>
                          <span>CRYPTOGRAPHICALLY SEALED</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Viewport Bottom Controls */}
                  <div className="flex items-center justify-between pt-6 border-t border-[rgba(0,90,156,0.12)] mt-6">
                    <button
                      onClick={handlePrev}
                      disabled={activeIndex === 0}
                      className={clsx(
                        "px-5 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer",
                        activeIndex === 0
                          ? "bg-[#F8FAFD] text-[#5A738E]/40 border border-transparent cursor-not-allowed"
                          : "bg-[#FFFFFF] border border-[rgba(0,90,156,0.25)] text-[#005A9C] hover:bg-[#EDF3FA]"
                      )}
                    >
                      ← PREVIOUS STAGE
                    </button>

                    <div className="flex items-center gap-1.5">
                      {JOURNEY_STEPS.map((_, dotIdx) => (
                        <button
                          key={dotIdx}
                          onClick={() => setActiveIndex(dotIdx)}
                          className={clsx(
                            "w-2.5 h-2.5 rounded-full transition-all cursor-pointer",
                            activeIndex === dotIdx
                              ? "bg-[#005A9C] w-6"
                              : "bg-[rgba(0,90,156,0.2)] hover:bg-[rgba(0,90,156,0.4)]"
                          )}
                        />
                      ))}
                    </div>

                    <button
                      onClick={handleNext}
                      disabled={activeIndex === JOURNEY_STEPS.length - 1}
                      className={clsx(
                        "px-5 py-2 rounded-full text-xs font-bold transition-colors cursor-pointer",
                        activeIndex === JOURNEY_STEPS.length - 1
                          ? "bg-[#F8FAFD] text-[#5A738E]/40 border border-transparent cursor-not-allowed"
                          : "bg-[#005A9C] text-white hover:bg-[#00477d]"
                      )}
                    >
                      NEXT STAGE →
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
