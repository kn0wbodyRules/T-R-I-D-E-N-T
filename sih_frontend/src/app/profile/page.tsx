"use client";

import React, { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useIncident } from "@/components/providers/IncidentContext";

export default function ProfilePage() {
  const { activeIncidentId, aisMode, toggleAisMode, resetIntro, triggerAlert } = useIncident();
  const router = useRouter();
  const [notificationMute, setNotificationMute] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);

  const handleSaveProfile = () => {
    setSessionSaved(true);
    setTimeout(() => setSessionSaved(false), 3000);
  };

  return (
    <div className="flex-1 flex flex-col p-6 sm:p-8 max-w-[1400px] w-full mx-auto theme-canvas transition-colors duration-250">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b theme-border pb-4 mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs theme-text-subtle mb-1">
            <span>OPERATIONAL SECURITY PROFILE</span>
            <span>·</span>
            <span className="text-[#005A9C] font-semibold">NTRO MARITIME RECON CELL</span>
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl tracking-wide uppercase">
            Investigator Officer Dossier & Security Credentials
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-5 py-2.5 theme-panel border hover:border-[#005A9C] text-xs text-[#005A9C] font-bold rounded-full flex items-center gap-2 transition-colors shadow-xs"
          >
            <span>RETURN TO DASHBOARD</span>
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-8 flex-1 max-w-3xl mx-auto w-full">
        {/* Identity & Security Clearance Card */}
        <div className="theme-panel border rounded-[38px] p-8 flex flex-col items-center text-center relative overflow-hidden shadow-xs">
          {/* Officer Avatar Badge */}
          <div className="w-24 h-24 rounded-full bg-[#EDF3FA] border-2 border-[#005A9C] flex items-center justify-center text-[#005A9C] text-3xl font-heading mb-4">
            RN
          </div>

          <h2 className="font-heading text-3xl uppercase tracking-wide">
            Cdr. Rajesh V. Nair
          </h2>
          <span className="text-xs theme-text-subtle font-semibold mt-0.5">
            Lead Maritime Forensic Analyst · NTRO
          </span>

          {/* Clearance Level Pill */}
          <div className="mt-4 px-4 py-1.5 bg-[#EDF3FA] border border-[#005A9C] text-[#005A9C] text-xs rounded-full font-bold uppercase tracking-wider">
            TOP SECRET // LEVEL-4 SATELLITE ACCESS
          </div>

          {/* Officer Attributes Strip */}
          <div className="w-full mt-6 pt-6 border-t theme-border flex flex-col gap-3 text-xs text-left">
            <div className="flex items-center justify-between">
              <span className="theme-text-subtle uppercase tracking-wider font-semibold">OFFICER PIN</span>
              <span className="theme-text-primary font-bold">NTRO-MAR-89104</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="theme-text-subtle uppercase tracking-wider font-semibold">ASSIGNED SECTOR</span>
              <span className="theme-text-primary">Western EEZ & Arabian Sea</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="theme-text-subtle uppercase tracking-wider font-semibold">STATION</span>
              <span className="theme-text-primary">New Delhi HQ (Terminal 04)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="theme-text-subtle uppercase tracking-wider font-semibold">CERTIFICATE EXPIRY</span>
              <span className="text-[#00B074] font-bold">2027-12-31 (VALID)</span>
            </div>
          </div>
        </div>

        {/* AIS Data Authority Setting */}
        <div className="theme-panel border rounded-[38px] p-8 flex flex-col gap-5 shadow-xs">
          <div className="border-b theme-border pb-4 flex items-center justify-between">
              <div>
                <h3 className="font-heading text-2xl uppercase tracking-wide">
                  AIS DATA FEED AUTHORITY
                </h3>
                <span className="text-xs theme-text-subtle">
                  Select live certified satellite stream or historical simulation benchmark
                </span>
              </div>
              <span
                className={clsx(
                  "text-[10px] px-3 py-1 font-bold uppercase rounded-full border",
                  aisMode === "real"
                    ? "bg-[#ECFDF5] border-[#00B074] text-[#00B074]"
                    : "bg-[#FFFBEB] border-[#FFB800] text-[#D97706]"
                )}
              >
                {aisMode === "real" ? "REAL-TIME AIS" : "SYNTHETIC BENCHMARK"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option 1: Real AIS */}
              <div
                onClick={() => aisMode !== "real" && toggleAisMode()}
                className={clsx(
                  "p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between gap-3",
                  aisMode === "real"
                    ? "bg-[#EDF3FA] border-[#005A9C]"
                    : "theme-panel-subtle hover:border-[#005A9C]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#005A9C] uppercase">DIRECT AIS SATELLITE</span>
                  {aisMode === "real" && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00B074]" />
                  )}
                </div>
                <p className="text-[11px] theme-text-subtle leading-relaxed">
                  Live S-AIS satellite data stream from Coastal Radar Chain & exact AIS vessel positions.
                </p>
                <div className="text-[10px] font-bold text-[#00B074]">STATUS: CONNECTED</div>
              </div>

              {/* Option 2: Synthetic AIS */}
              <div
                onClick={() => aisMode !== "synthetic" && toggleAisMode()}
                className={clsx(
                  "p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between gap-3",
                  aisMode === "synthetic"
                    ? "bg-[#EDF3FA] border-[#005A9C]"
                    : "theme-panel-subtle hover:border-[#005A9C]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#005A9C] uppercase">SYNTHETIC SIMULATION</span>
                  {aisMode === "synthetic" && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FFB800]" />
                  )}
                </div>
                <p className="text-[11px] theme-text-subtle leading-relaxed">
                  Benchmarking stream with synthetic AIS corridor gaps and spoofed telemetry.
                </p>
                <div className="text-[10px] font-bold text-[#D97706]">STATUS: BENCHMARK READY</div>
              </div>
            </div>
          </div>

          {/* User Preferences & Intro Reset */}
          <div className="theme-panel border rounded-[38px] p-8 flex flex-col gap-5 shadow-xs">
            <h3 className="font-heading text-2xl uppercase tracking-wide">
              INVESTIGATION PREFERENCES
            </h3>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between p-4 rounded-2xl theme-panel-subtle border">
                <div>
                  <div className="text-xs font-bold theme-text-primary">CRITICAL INCIDENT AUDIO ALERTS</div>
                  <div className="text-[11px] theme-text-subtle">
                    Audible klaxon tone when high-confidence AIS corridor anomalies are detected.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={!notificationMute}
                  onChange={(e) => setNotificationMute(!e.target.checked)}
                  className="accent-[#005A9C] w-5 h-5 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl theme-panel-subtle border">
                <div>
                  <div className="text-xs font-bold theme-text-primary">TEST NOTIFICATION SYSTEM</div>
                  <div className="text-[11px] theme-text-subtle">
                    Trigger a simulated SAR alert to test Dynamic Island indicators and audio.
                  </div>
                </div>
                <button
                  onClick={triggerAlert}
                  className="px-5 py-2.5 bg-[#EF3E42] hover:bg-[#d43538] text-white text-[10px] font-bold rounded-full uppercase tracking-wider shrink-0 transition-colors cursor-pointer"
                >
                  LAUNCH ALERT
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl theme-panel-subtle border">
                <div>
                  <div className="text-xs font-bold theme-text-primary">REPLAY INTRO SCROLL ANIMATION</div>
                  <div className="text-[11px] theme-text-subtle">
                    Reset the session intro so the 3D container scroll sequence plays on next visit to Dashboard.
                  </div>
                </div>
                <button
                  onClick={() => {
                    resetIntro();
                    router.push('/');
                  }}
                  className="px-4 py-2 bg-[#005A9C] hover:bg-[#00477d] text-white text-xs font-bold rounded-full transition-colors cursor-pointer shrink-0"
                >
                  REPLAY INTRO
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl theme-panel-subtle border">
                <div>
                  <div className="text-xs font-bold theme-text-primary">LOG OUT OFFICER</div>
                  <div className="text-[11px] theme-text-subtle">
                    End current session and return to the Officer Authentication Gateway.
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      sessionStorage.removeItem("trident-officer-authenticated");
                      sessionStorage.removeItem("trident-intro-seen");
                    }
                    resetIntro();
                    // Just force a hard reload or push to / which will check session state
                    window.location.href = '/';
                  }}
                  className="px-4 py-2 bg-[#EF3E42] hover:bg-[#d43538] text-white text-xs font-bold rounded-full transition-colors cursor-pointer shrink-0"
                >
                  LOG OUT
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t theme-border">
              {sessionSaved && (
                <span className="text-xs text-[#00B074] font-bold animate-fade-in">
                  ✓ PREFERENCES SAVED
                </span>
              )}
              <button
                onClick={handleSaveProfile}
                className="px-6 py-2.5 bg-[#005A9C] hover:bg-[#00477d] text-white text-xs font-bold rounded-full transition-colors cursor-pointer"
              >
                SAVE PREFERENCES
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}
