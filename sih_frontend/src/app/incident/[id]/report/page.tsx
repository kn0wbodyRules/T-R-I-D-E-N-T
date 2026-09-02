"use client";

import React, { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { fetchReport, updateReportResolution, fetchIncidentById } from "@/lib/mock-data";
import { useIncident } from "@/components/providers/IncidentContext";

export default function InvestigatorReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const incidentId = resolvedParams.id;
  const queryClient = useQueryClient();
  const { aisMode } = useIncident();

  const { data: incident } = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: () => fetchIncidentById(incidentId),
  });

  const { data: report, isLoading } = useQuery({
    queryKey: ["report", incidentId],
    queryFn: () => fetchReport(incidentId),
  });

  const [resolutionStatus, setResolutionStatus] = useState<"unresolved" | "resolved">("unresolved");
  const [reasonCode, setReasonCode] = useState<string>("Referred to Port State Control & Aerial Recon");
  const [investigatorNotes, setInvestigatorNotes] = useState<string>("");
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  React.useEffect(() => {
    if (report?.resolution) {
      setResolutionStatus(report.resolution.status);
      if (report.resolution.reason_code) setReasonCode(report.resolution.reason_code);
      if (report.resolution.notes) setInvestigatorNotes(report.resolution.notes);
    }
  }, [report]);

  const mutation = useMutation({
    mutationFn: (newRes: { status: "unresolved" | "resolved"; reason_code: string; notes: string }) =>
      updateReportResolution(incidentId, newRes),
    onSuccess: (updated) => {
      queryClient.setQueryData(["report", incidentId], updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const handleSaveResolution = () => {
    mutation.mutate({
      status: resolutionStatus,
      reason_code: reasonCode,
      notes: investigatorNotes,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header Bar */}
      <div className="print:hidden flex flex-col md:flex-row md:items-center justify-between border-b border-[rgba(0,90,156,0.15)] pb-4 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#5A738E] mb-1">
            <span>STEP 7 OF 7 · OFFICIAL DOSSIER</span>
            <span>·</span>
            <span className="text-[#005A9C] font-semibold">{incidentId}</span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl tracking-wide text-[#005A9C] uppercase">
            Evidence-Grade Investigator Report
          </h1>
        </div>

        {/* Export & Print Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const element = document.createElement("a");
              const file = new Blob([report?.report_text || ""], { type: "text/markdown" });
              element.href = URL.createObjectURL(file);
              element.download = `TRIDENT-EVIDENCE-${incidentId}.md`;
              document.body.appendChild(element);
              element.click();
              document.body.removeChild(element);
            }}
            className="px-4 py-2.5 bg-[#FFFFFF] border border-[rgba(0,90,156,0.25)] hover:border-[#005A9C] text-xs text-[#005A9C] font-bold rounded-full flex items-center gap-2 transition-colors cursor-pointer"
          >
            <span>EXPORT MARKDOWN</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-6 py-2.5 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs tracking-wider flex items-center gap-2 rounded-full border border-[#005A9C] transition-colors cursor-pointer"
          >
            <span>PRINT / SAVE PDF DOSSIER</span>
          </button>
        </div>
      </div>

      {isLoading || !report ? (
        <div className="flex-1 flex items-center justify-center p-12 text-xs text-[#5A738E] bg-[#FFFFFF] border border-[rgba(0,90,156,0.15)] rounded-[38px]">
          COMPILING EVIDENTIARY DOSSIER...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 print:block">
          {/* Main Legal Document Read View (~68% width) */}
          <div className="lg:col-span-8 flex flex-col print:block bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] p-8 text-xs leading-relaxed space-y-6">
            {/* Document Title Header */}
            <div className="border-b-2 border-[rgba(0,90,156,0.15)] pb-4 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-[#5A738E]">
                <span className="font-bold tracking-widest text-[#005A9C]">
                  NATIONAL TECHNICAL RESEARCH ORGANISATION · MARITIME INTEL
                </span>
                <span>DOSSIER: {incidentId}</span>
              </div>
              <h2 className="font-heading text-lg sm:text-xl text-[#005A9C] uppercase tracking-wide">
                SUSPECT ATTRIBUTION & HYDROCARBON POLLUTION DOSSIER
              </h2>
              <div className="text-[11px] text-[#5A738E]">
                CLASSIFICATION: RESTRICTED // LAW ENFORCEMENT & PORT STATE CONTROL EVIDENCE
              </div>
            </div>

            {/* PERSISTENT REAL / SYNTHETIC AIS BANNER */}
            <div
              className={clsx(
                "p-4 border rounded-2xl flex items-center justify-between",
                aisMode === "real"
                  ? "bg-[#ECFDF5] border-[#00B074] text-[#00B074]"
                  : "bg-[#FFFBEB] border-[#FFB800] text-[#D97706]"
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className={clsx("w-2.5 h-2.5 rounded-full", aisMode === "real" ? "bg-[#00B074]" : "bg-[#FFB800]")} />
                <span className="font-bold uppercase tracking-wider text-xs">
                  {aisMode === "real" ? "DATA SOURCE: CERTIFIED REAL-WORLD AIS FEED" : "DATA SOURCE: BENCHMARK SYNTHETIC SIMULATION"}
                </span>
              </div>
              <span className="text-[10px] opacity-80">
                AUDIT REF: {incidentId}-AIS-CERT
              </span>
            </div>

            {/* MARPOL Annex I Flag Callout */}
            {report.marpol_flag && (
              <div className="p-5 bg-[#FFF5F5] border-l-4 border-[#EF3E42] rounded-2xl text-[#EF3E42] flex items-start gap-3.5">
                <div className="flex-1">
                  <div className="font-heading text-lg tracking-wide uppercase text-[#EF3E42]">
                    STATUTORY VIOLATION FLAG: MARPOL 73/78 ANNEX I (REGULATION 15)
                  </div>
                  <p className="text-[11px] text-[#334E68] mt-1 leading-relaxed">
                    The observed slick volume and geometric persistence exceed permitted operational oily mixture discharge thresholds (&gt;15 ppm). This document constitutes prima facie evidence for Port State Control inspection under MARPOL Article 6.
                  </p>
                </div>
              </div>
            )}

            {/* Report Sections */}
            <div className="space-y-6 text-[#334E68]">
              {report.report_text.split("### ").map((section, idx) => {
                if (!section.trim()) return null;
                const lines = section.split("\n");
                const heading = lines[0];
                const content = lines.slice(1).join("\n");

                return (
                  <div key={idx} className="space-y-2 border-b border-[rgba(0,90,156,0.08)] pb-5 last:border-0">
                    <h3 className="font-heading text-xl text-[#005A9C] uppercase tracking-wide flex items-center gap-2">
                      <span className="text-[#005A9C]">■</span>
                      <span>{heading}</span>
                    </h3>
                    <div className="text-[11px] leading-relaxed whitespace-pre-line text-[#334E68]">
                      {content}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Document Sign-off */}
            <div className="border-t border-[rgba(0,90,156,0.12)] pt-4 print:pb-12 break-inside-avoid flex items-center justify-between text-[11px] text-[#5A738E]">
              <div>
                <div>SIGNATORY: {report.case_officer}</div>
                <div>TIMESTAMP: {report.generated_at_utc}</div>
              </div>
              <div className="text-right">
                <div className="text-[#005A9C] font-bold font-heading text-lg">DIGITALLY SIGNED // TRIDENT PLATFORM</div>
                <div>HASH: 7a91fc82b0e914d...</div>
              </div>
            </div>
          </div>

          {/* Resolution Controls Rail (~32% width) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            <div className="print:hidden bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] p-6 flex flex-col gap-4">
              <div className="border-b border-[rgba(0,90,156,0.1)] pb-3 flex items-center justify-between">
                <span className="font-heading text-xl text-[#005A9C] uppercase tracking-wide">CASE RESOLUTION CONTROLS</span>
                <span
                  className={clsx(
                    "text-[10px] px-3 py-0.5 font-bold uppercase rounded-full",
                    resolutionStatus === "resolved" ? "bg-[#00B074] text-white" : "bg-[#FFB800] text-black"
                  )}
                >
                  {resolutionStatus}
                </span>
              </div>

              {/* Status Toggle */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-[#5A738E] uppercase tracking-wider font-semibold">
                  INVESTIGATION STATUS
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setResolutionStatus("resolved")}
                    className={clsx(
                      "py-2.5 text-xs font-bold transition-all rounded-full border flex items-center justify-center gap-1.5 cursor-pointer",
                      resolutionStatus === "resolved"
                        ? "bg-[#00B074] text-white border-[#00B074]"
                        : "bg-[#F8FAFD] text-[#5A738E] border-[rgba(0,90,156,0.15)] hover:border-[#005A9C]"
                    )}
                  >
                    <span>MARK RESOLVED</span>
                  </button>

                  <button
                    onClick={() => setResolutionStatus("unresolved")}
                    className={clsx(
                      "py-2.5 text-xs font-bold transition-all rounded-full border flex items-center justify-center gap-1.5 cursor-pointer",
                      resolutionStatus === "unresolved"
                        ? "bg-[#FFB800] text-black border-[#FFB800]"
                        : "bg-[#F8FAFD] text-[#5A738E] border-[rgba(0,90,156,0.15)] hover:border-[#005A9C]"
                    )}
                  >
                    <span>UNRESOLVED</span>
                  </button>
                </div>
              </div>

              {/* Statutory Reason-Code Dropdown */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-[#5A738E] uppercase tracking-wider font-semibold">
                  STATUTORY REASON CODE
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="bg-[#F8FAFD] border border-[rgba(0,90,156,0.2)] text-[#041527] text-xs p-3 rounded-2xl focus:border-[#005A9C] outline-none"
                >
                  <option value="Referred to Port State Control & Aerial Recon">
                    Referred to Port State Control & Aerial Recon
                  </option>
                  <option value="Detention Notice Issued to Port State Control">
                    Detention Notice Issued to Port State Control
                  </option>
                  <option value="Aerial Reconnaissance Confirmed Physical Sheen">
                    Aerial Reconnaissance Confirmed Physical Sheen
                  </option>
                  <option value="Inconclusive Evidence / AIS Transmission Spoofed">
                    Inconclusive Evidence / AIS Transmission Spoofed
                  </option>
                  <option value="False Alarm / Natural Biogenic Slick">
                    False Alarm / Natural Biogenic Slick
                  </option>
                </select>
              </div>

              {/* Investigator Notes */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-[#5A738E] uppercase tracking-wider font-semibold">
                  INVESTIGATOR CASE NOTES
                </label>
                <textarea
                  rows={4}
                  value={investigatorNotes}
                  onChange={(e) => setInvestigatorNotes(e.target.value)}
                  placeholder="Enter official case disposition notes, forensic sampling logs, or communications..."
                  className="bg-[#F8FAFD] border border-[rgba(0,90,156,0.2)] text-[#041527] text-xs p-3 rounded-2xl focus:border-[#005A9C] outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Save Resolution Button */}
              <button
                onClick={handleSaveResolution}
                disabled={mutation.isPending}
                className="w-full py-3 bg-[#005A9C] hover:bg-[#00477d] text-white font-bold text-xs rounded-full border border-[#005A9C] transition-colors cursor-pointer"
              >
                <span>{mutation.isPending ? "SAVING DISPOSITION..." : "UPDATE CASE DISPOSITION"}</span>
              </button>

              {saveSuccess && (
                <div className="p-2.5 bg-[#ECFDF5] border border-[#00B074] text-[#00B074] text-[11px] text-center font-bold rounded-xl">
                  ✓ Case resolution state updated successfully.
                </div>
              )}
            </div>

            {/* Back Link */}
            <div className="print:hidden bg-[#FFFFFF] border border-[rgba(0,90,156,0.18)] rounded-[38px] p-5 flex items-center justify-between text-xs">
              <span className="text-[#5A738E]">Need to re-evaluate suspects?</span>
              <button
                onClick={() => window.history.back()}
                className="text-[#005A9C] hover:underline font-bold cursor-pointer"
              >
                BACK TO MATRIX →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
