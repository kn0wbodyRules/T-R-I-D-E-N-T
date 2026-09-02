"use client";

import React, { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

interface StepItem {
  id: number;
  title: string;
  code: string;
  description: string;
  status: "done" | "active" | "pending";
  log: string;
}

export default function PipelineProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const incidentId = resolvedParams.id;
  const router = useRouter();

  const initialSteps: StepItem[] = [
    {
      id: 1,
      title: "Detection & Boundary Extraction",
      code: "STG-01-DET",
      description: "Deep-learning adaptive thresholding over Sentinel-1 C-band SAR backscatter.",
      status: "done",
      log: "[DONE] Extracted closed polygon (14.82 km²). Capillary wave suppression ratio: 0.942.",
    },
    {
      id: 2,
      title: "Weathering & Chemical Age Estimation",
      code: "STG-02-AGE",
      description: "Atmospheric evaporation and emulsification decay modeling using ERA5 wind forcings.",
      status: "done",
      log: "[DONE] Estimated slick age window: 14 to 26 hours. Volume loss parameter: 28.4%.",
    },
    {
      id: 3,
      title: "Hydrodynamic Drift & Origin Backtrack",
      code: "STG-03-DRIFT",
      description: "Lagrangian SPH particle reverse trajectory simulation forced with HYCOM 1/12° currents.",
      status: "active",
      log: "[ACTIVE] Backtracking 10,000 particles... 18.5h reverse corridor convergence at 18.845°N, 71.745°E.",
    },
    {
      id: 4,
      title: "Spatio-Temporal Candidate Search",
      code: "STG-04-AIS",
      description: "Terrestrial + Satellite AIS vessel stream intersection within backtrack origin corridor.",
      status: "pending",
      log: "[PENDING] Ingesting AIS and dark radar target trajectories...",
    },
    {
      id: 5,
      title: "Attribution Scoring & VIIRS Corroboration",
      code: "STG-05-ATTR",
      description: "SHAP feature tree attribution scoring, VIIRS night radiance match, and suspect ranking.",
      status: "pending",
      log: "[PENDING] Awaiting candidate trajectory completion.",
    },
  ];

  const [steps, setSteps] = useState<StepItem[]>(initialSteps);
  const [logs, setLogs] = useState<string[]>([
    "04:22:19 UTC - [INGEST] Sentinel-1C Level-1 GRD SAR pass ingested.",
    "04:22:25 UTC - [STG-01] Boundary extraction complete. Area: 14.82 km².",
    "04:22:31 UTC - [STG-02] Weathering model convergence: Estimated discharge window 14-26 hrs ago.",
    "04:22:38 UTC - [STG-03] HYCOM 1/12° Lagrangian particle backtracking active...",
  ]);

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setSteps((prev) =>
        prev.map((s, idx) => {
          if (idx === 2) return { ...s, status: "done" };
          if (idx === 3) return { ...s, status: "active", log: "[ACTIVE] 5 vessel candidates intercepted in origin box. Flagged 2 AIS gaps." };
          return s;
        })
      );
      setLogs((prev) => [
        ...prev,
        "04:22:45 UTC - [STG-03] Reverse drift kernel locked: 18.845° N, 71.745° E (95% confidence).",
        "04:22:46 UTC - [STG-04] Intercepting AIS traffic: 5 candidates located (2 dark/unmatched).",
      ]);
    }, 2800);

    const timer2 = setTimeout(() => {
      setSteps((prev) =>
        prev.map((s, idx) => {
          if (idx <= 3) return { ...s, status: "done" };
          if (idx === 4) return { ...s, status: "active", log: "[ACTIVE] SHAP TreeExplainer ranking calculated. Top suspect: UNK-DARK-7702 (88.4%)." };
          return s;
        })
      );
      setLogs((prev) => [
        ...prev,
        "04:22:52 UTC - [STG-05] VIIRS Suomi-NPP radiance match: 0.84 nW/cm²·sr confirmed.",
        "04:22:54 UTC - [STG-05] Final suspect attribution generated.",
      ]);
    }, 5500);

    const timer3 = setTimeout(() => {
      setSteps((prev) =>
        prev.map((s) => ({ ...s, status: "done" }))
      );
      setLogs((prev) => [
        ...prev,
        "04:22:58 UTC - [PIPELINE COMPLETE] Attribution results ready for investigator review.",
      ]);
    }, 7800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  const allDone = steps.every((s) => s.status === "done");

  return (
    <div className="flex-1 flex flex-col">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[rgba(0,90,156,0.15)] pb-4 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#5A738E] mb-1">
            <span>STEP 2 OF 7 · AUTOMATED ML PIPELINE</span>
            <span>·</span>
            <span className="text-[#005A9C] font-semibold">{incidentId}</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl tracking-wide text-[#005A9C] uppercase">
            Live Pipeline Execution & Drift Engine
          </h1>
        </div>

        {/* View Results Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/incident/${incidentId}/detection`)}
            className={clsx(
              "px-6 py-3 text-xs font-bold tracking-wider flex items-center gap-2 rounded-full border transition-colors cursor-pointer",
              allDone
                ? "bg-[#00B074] hover:bg-[#008f5d] text-white border-[#00B074]"
                : "bg-[#005A9C] hover:bg-[#00477d] text-white border-[#005A9C]"
            )}
          >
            <span>{allDone ? "VIEW DETECTION RESULTS" : "INSPECT PIPELINE OUTPUT"} →</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Step Tracker Left Column (~60% width) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="text-xs text-[#5A738E] mb-1">
            5-STAGE REVERSE ATTRIBUTION WORKFLOW
          </div>

          <div className="flex flex-col gap-3">
            {steps.map((step) => {
              const isDone = step.status === "done";
              const isActive = step.status === "active";

              return (
                <div
                  key={step.id}
                  className={clsx(
                    "p-5 border transition-colors flex flex-col gap-2 rounded-[32px]",
                    isActive
                      ? "bg-[#EDF3FA] border-[#005A9C]"
                      : isDone
                      ? "bg-[#FFFFFF] border-[rgba(0,90,156,0.16)]"
                      : "bg-[#F8FAFD] border-[rgba(0,90,156,0.08)] opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={clsx(
                          "w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs border shrink-0",
                          isDone
                            ? "bg-[#00B074] border-[#00B074] text-white"
                            : isActive
                            ? "bg-[#005A9C] border-[#005A9C] text-white"
                            : "bg-[#FFFFFF] border-[rgba(0,90,156,0.2)] text-[#5A738E]"
                        )}
                      >
                        {isDone ? "✓" : step.id}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-heading text-lg text-[#005A9C] uppercase tracking-wide">{step.title}</span>
                        <span className="text-[10px] text-[#5A738E]">[{step.code}]</span>
                      </div>
                    </div>

                    <span
                      className={clsx(
                        "text-[10px] px-3 py-0.5 uppercase font-bold rounded-full",
                        isDone
                          ? "bg-[#00B074]/15 text-[#00B074] border border-[#00B074]/30"
                          : isActive
                          ? "bg-[#005A9C] text-white border border-[#005A9C]"
                          : "bg-transparent text-[#5A738E] border border-[rgba(0,90,156,0.15)]"
                      )}
                    >
                      {step.status}
                    </span>
                  </div>

                  <p className="text-xs text-[#334E68] pl-10">
                    {step.description}
                  </p>

                  {(isActive || isDone) && (
                    <div
                      className={clsx(
                        "mt-1 ml-10 p-2.5 text-[11px] border rounded-2xl",
                        isActive
                          ? "bg-[#FFFFFF] border-[#005A9C] text-[#005A9C] flex items-center gap-2 font-medium"
                          : "bg-[#F8FAFD] border-[rgba(0,90,156,0.1)] text-[#334E68]"
                      )}
                    >
                      {isActive && (
                        <span className="w-2 h-2 bg-[#005A9C] rounded-full animate-pulse" />
                      )}
                      <span>{step.log}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Terminal Right Column (~40% width) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] flex flex-col h-full min-h-[440px] overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFD] border-b border-[rgba(0,90,156,0.12)] flex items-center justify-between text-xs">
              <span className="font-heading text-lg text-[#005A9C] tracking-wide">LOG CONSOLE</span>
              <span className="text-[10px] text-[#00B074] font-bold">● LIVE STREAM</span>
            </div>

            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-2 text-xs text-[#334E68] bg-[#F8FAFD]">
              {logs.map((line, i) => (
                <div key={i} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-[#005A9C] font-bold shrink-0">{">"}</span>
                  <span className={clsx(line.includes("DONE") ? "text-[#00B074] font-semibold" : line.includes("ACTIVE") ? "text-[#005A9C] font-semibold" : "text-[#334E68]")}>
                    {line}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-4 bg-[#F8FAFD] border-t border-[rgba(0,90,156,0.12)] flex items-center justify-between">
              <span className="text-[11px] text-[#5A738E]">
                {allDone ? "All 5 stages completed." : "Pipeline in progress..."}
              </span>
              <button
                onClick={() => router.push(`/incident/${incidentId}/detection`)}
                className="px-5 py-2 bg-[#005A9C] hover:bg-[#00477d] text-white text-xs font-bold rounded-full transition-colors cursor-pointer"
              >
                PROCEED TO DETECTION →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
