"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { motion, AnimatePresence } from "motion/react";
import TridentMap from "@/components/map/TridentMap";
import { fetchIncidents, fetchDetectionResult, fetchDriftOrigin, fetchCandidates } from "@/lib/mock-data";
import { useIncident } from "@/components/providers/IncidentContext";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import TopNav from "@/components/layout/TopNav";
import MaterialIcon from "@/components/ui/MaterialIcon";
import OfficerLoginPage from "@/components/auth/OfficerLoginPage";
import WordsPreloader from "@/components/ui/WordsPreloader";

export default function DashboardPage() {
  const {
    activeIncidentId,
    setActiveIncidentId,
    hasSeenIntro,
    isIntroReady,
    completeIntro,
    resetIntro,
    casesViewMode,
    setCasesViewMode,
  } = useIncident();

  // Authentication & Preloader sequence states
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isPlayingPreloader, setIsPlayingPreloader] = useState<boolean>(false);
  const [isAuthChecked, setIsAuthChecked] = useState<boolean>(false);

  // Check stored auth session on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedAuth = sessionStorage.getItem("trident-officer-authenticated");
      if (storedAuth === "true") {
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
      setIsAuthChecked(true);
    }
  }, []);

  const handleLoginSuccess = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("trident-officer-authenticated", "true");
    }
    setIsLoggedIn(true);
    setIsPlayingPreloader(true);
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("trident-officer-authenticated");
      sessionStorage.removeItem("trident-intro-seen");
    }
    setIsLoggedIn(false);
    setIsPlayingPreloader(false);
    resetIntro();
  };

  // Accordion hover state for the 4 stat cards
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (id: number) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredCard(id);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCard(null);
    }, 150);
  };

  const handleCompleteIntro = () => {
    completeIntro();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  };

  useEffect(() => {
    if (isLoggedIn && !hasSeenIntro && isIntroReady && !isPlayingPreloader) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" || e.key === "Enter") {
          handleCompleteIntro();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isLoggedIn, hasSeenIntro, isIntroReady, isPlayingPreloader]);

  const { data: incidents = [], isLoading: isIncidentsLoading } = useQuery({
    queryKey: ["incidents"],
    queryFn: fetchIncidents,
  });

  const { data: detection } = useQuery({
    queryKey: ["detection", activeIncidentId],
    queryFn: () => fetchDetectionResult(activeIncidentId),
  });

  const { data: drift } = useQuery({
    queryKey: ["drift", activeIncidentId],
    queryFn: () => fetchDriftOrigin(activeIncidentId),
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates", activeIncidentId],
    queryFn: () => fetchCandidates(activeIncidentId),
  });

  const activeInc = incidents.find((i) => i.incident_id === activeIncidentId) || incidents[0];

  // Derive coordinates safely from drift or incident mapping
  const mapCenter: [number, number] = drift?.slick_position?.coordinates
    ? [drift.slick_position.coordinates[1], drift.slick_position.coordinates[0]]
    : activeIncidentId === "INC-2026-0885"
    ? [9.120, 79.450]
    : activeIncidentId === "INC-2026-0871"
    ? [5.890, 80.520]
    : [18.912, 71.845];

  // Render loading state while checking session
  if (!isAuthChecked) {
    return (
      <div className="min-h-screen w-full bg-[#041527] flex items-center justify-center text-white">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-xs tracking-widest text-blue-200 uppercase">INITIALIZING TRIDENT GATEWAY...</span>
        </div>
      </div>
    );
  }

  // 1. OFFICER LOGIN SCREEN (If not logged in)
  if (!isLoggedIn) {
    return <OfficerLoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // DASHBOARD CONTENT COMPONENT
  const renderDashboardContent = () => (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1720px] w-full mx-auto flex flex-col gap-6 theme-canvas transition-colors duration-250">
      {/* 1. Full-Width 4-Stat Cards Row (Accordion) */}
      <div className="flex flex-col lg:flex-row gap-4 min-h-[140px]">
        {/* Stat 1: Active Incidents */}
        <motion.div
          layout
          onMouseEnter={() => handleMouseEnter(1)}
          onMouseLeave={handleMouseLeave}
          style={{ flex: hoveredCard === 1 ? 2.5 : hoveredCard !== null ? 1 : 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className={clsx(
            "theme-panel border rounded-[38px] p-5 lg:p-6 flex overflow-hidden shadow-xs relative transition-colors group",
            hoveredCard === 1 ? "cursor-default" : "cursor-pointer"
          )}
        >
          <motion.div layout="position" className="flex flex-col justify-between shrink-0 min-w-0">
            <span className="text-[11px] theme-text-subtle uppercase tracking-wider font-semibold truncate">
              ACTIVE INCIDENTS IN EEZ
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-heading text-3xl sm:text-4xl shrink-0">03</span>
              <span className="text-[10px] text-[#00B074] font-bold truncate">● 1 CRITICAL</span>
            </div>
            <span className="text-[10px] theme-text-subtle mt-1 truncate">SATELLITE SAR SURVEILLANCE</span>
          </motion.div>

          <AnimatePresence>
            {hoveredCard === 1 && (
              <motion.div
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.1 } }}
                transition={{ delay: 0.15, duration: 0.2 }}
                className="hidden lg:flex flex-col justify-center ml-6 pl-6 border-l theme-border whitespace-nowrap overflow-hidden"
              >
                <span className="text-[10px] uppercase font-bold theme-text-subtle mb-1.5">Status Breakdown</span>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="text-[#EF3E42]">1 Critical</span>
                  <span className="opacity-40">·</span>
                  <span className="text-[#FFB800]">1 Needs Review</span>
                  <span className="opacity-40">·</span>
                  <span className="text-[#005A9C]">1 Processing</span>
                </div>
                <span className="text-[10px] theme-text-muted mt-1.5">Updated on last Sentinel-1 pass.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Stat 2: Contaminated Area Extent */}
        <motion.div
          layout
          onMouseEnter={() => handleMouseEnter(2)}
          onMouseLeave={handleMouseLeave}
          style={{ flex: hoveredCard === 2 ? 2.5 : hoveredCard !== null ? 1 : 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className={clsx(
            "theme-panel border rounded-[38px] p-5 lg:p-6 flex overflow-hidden shadow-xs relative transition-colors group",
            hoveredCard === 2 ? "cursor-default" : "cursor-pointer"
          )}
        >
          <motion.div layout="position" className="flex flex-col justify-between shrink-0 min-w-0">
            <span className="text-[11px] theme-text-subtle uppercase tracking-wider font-semibold truncate">
              CONTAMINATED AREA EXTENT
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-heading text-3xl sm:text-4xl shrink-0">
                {activeInc ? activeInc.area_km2.toFixed(1) : "14.8"}
              </span>
              <span className="text-xs theme-text-subtle shrink-0">km²</span>
            </div>
            <span className="text-[10px] theme-text-subtle mt-1 truncate">C-BAND SAR RADAR VERIFIED</span>
          </motion.div>

          <AnimatePresence>
            {hoveredCard === 2 && (
              <motion.div
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.1 } }}
                transition={{ delay: 0.15, duration: 0.2 }}
                className="hidden lg:flex flex-col justify-center ml-6 pl-6 border-l theme-border whitespace-nowrap overflow-hidden"
              >
                <span className="text-[10px] uppercase font-bold theme-text-subtle mb-1.5">Affected Regions</span>
                <div className="flex flex-col gap-1 text-xs font-semibold">
                  <span>Mumbai Offshore — <span className="text-[#EF3E42]">14.8 km²</span></span>
                  <span>Gulf of Mannar — <span className="text-[#FFB800]">32.4 km²</span></span>
                  <span>Strait of Malacca — <span className="text-[#005A9C]">8.2 km²</span></span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Stat 3: Suspect Contacts */}
        <motion.div
          layout
          onMouseEnter={() => handleMouseEnter(3)}
          onMouseLeave={handleMouseLeave}
          style={{ flex: hoveredCard === 3 ? 2.5 : hoveredCard !== null ? 1 : 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className={clsx(
            "theme-panel border rounded-[38px] p-5 lg:p-6 flex overflow-hidden shadow-xs relative transition-colors group",
            hoveredCard === 3 ? "cursor-default" : "cursor-pointer"
          )}
        >
          <motion.div layout="position" className="flex flex-col justify-between shrink-0 min-w-0">
            <span className="text-[11px] theme-text-subtle uppercase tracking-wider font-semibold truncate">
              CORRIDOR SUSPECT CONTACTS
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-heading text-3xl sm:text-4xl shrink-0">
                {candidates.length || 5}
              </span>
              <span className="text-[10px] text-[#EF3E42] font-bold truncate">
                ({candidates.filter((c) => c.is_dark).length || 2} SILENT)
              </span>
            </div>
            <span className="text-[10px] theme-text-subtle mt-1 truncate">AIS & SPH DRIFT BACKTRACK</span>
          </motion.div>

          <AnimatePresence>
            {hoveredCard === 3 && (
              <motion.div
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.1 } }}
                transition={{ delay: 0.15, duration: 0.2 }}
                className="hidden lg:flex flex-col justify-center ml-6 pl-6 border-l theme-border whitespace-nowrap overflow-hidden"
              >
                <span className="text-[10px] uppercase font-bold theme-text-subtle mb-1.5">Vessel Dispositions</span>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="text-[#005A9C]">3 Identified</span>
                  <span className="opacity-40">·</span>
                  <span className="text-[#EF3E42]">2 Dark/Silent</span>
                </div>
                <span className="text-[10px] theme-text-muted mt-1.5">Data: AIS & SPH Drift Backtrack</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Stat 4: Top Suspect Attribution */}
        <motion.div
          layout
          onMouseEnter={() => handleMouseEnter(4)}
          onMouseLeave={handleMouseLeave}
          style={{ flex: hoveredCard === 4 ? 2.5 : hoveredCard !== null ? 1 : 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className={clsx(
            "theme-panel border rounded-[38px] p-5 lg:p-6 flex overflow-hidden shadow-xs relative transition-colors group",
            hoveredCard === 4 ? "cursor-default" : "cursor-pointer"
          )}
        >
          <motion.div layout="position" className="flex flex-col justify-between shrink-0 min-w-0">
            <span className="text-[11px] theme-text-subtle uppercase tracking-wider font-semibold truncate">
              TOP SUSPECT ATTRIBUTION
            </span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-heading text-3xl sm:text-4xl shrink-0">88.4%</span>
              <span className="text-[10px] text-[#005A9C] bg-[#EDF3FA] px-2.5 py-0.5 rounded-full font-bold truncate">
                CLEAR LEAD
              </span>
            </div>
            <span className="text-[10px] theme-text-subtle mt-1 truncate">TREE-EXPLAINER ENSEMBLE</span>
          </motion.div>

          <AnimatePresence>
            {hoveredCard === 4 && (
              <motion.div
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.1 } }}
                transition={{ delay: 0.15, duration: 0.2 }}
                className="hidden lg:flex flex-col justify-center ml-6 pl-6 border-l theme-border whitespace-nowrap overflow-hidden"
              >
                <span className="text-[10px] uppercase font-bold theme-text-subtle mb-1.5">Confidence Margin</span>
                <div className="flex flex-col gap-1 text-xs font-semibold">
                  <span className="text-[#005A9C]">88.4% — MT Nordic Voyager</span>
                  <span className="theme-text-muted">2nd place: 11.2%</span>
                </div>
                <span className="text-[10px] theme-text-muted mt-1.5">Model: Tree-Explainer Ensemble</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* 2. Main Content Area: Map (~65% width) + Active Spill Cases Queue (~35% width) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Tactical Map Container */}
        <div className="lg:col-span-8 flex flex-col theme-panel border rounded-[38px] overflow-hidden shadow-xs">
          <div className="px-6 py-4 theme-panel-subtle border-b flex items-center justify-between text-xs">
            <span className="text-[#005A9C] font-semibold uppercase tracking-wider">
              MARITIME RECONNAISSANCE THEATRE · {activeInc?.region || "INDIAN EEZ"}
            </span>
            <div className="flex items-center gap-3 text-[11px] theme-text-muted">
              <span className="flex items-center gap-1.5 font-bold">
                <span className="w-2 h-2 rounded-full bg-[#005A9C]" /> {activeInc?.incident_id}
              </span>
            </div>
          </div>

          <div className="relative flex-1 min-h-[480px] w-full">
            <TridentMap
              center={mapCenter}
              zoom={10}
              slickCoordinates={detection?.slick_polygon.coordinates[0]}
              slickCenter={mapCenter}
              heatmapPoints={drift?.origin_heatmap || []}
              candidates={candidates}
              driftVectors={drift?.drift_vectors || []}
              overlays={{
                showHeatmap: true,
                heatmapDimmed: false,
                showSlickPolygon: true,
                showVessels: true,
                showDriftVectors: true,
              }}
            />
          </div>

          <div className="px-6 py-3.5 theme-panel-subtle border-t flex items-center justify-between text-xs theme-text-muted">
            <span>RADAR: Sentinel-1 C-SAR · HYDRODYNAMICS: HYCOM 1/12° SPH</span>
            <Link
              href={`/incident/${activeIncidentId}/intake`}
              className="text-[#005A9C] hover:underline font-bold transition-colors"
            >
              LAUNCH FULL INVESTIGATION →
            </Link>
          </div>
        </div>

        {/* Incident Queue Rail */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="theme-panel border rounded-[38px] flex flex-col h-full overflow-hidden justify-between shadow-xs">
            <div>
              <div className="px-6 py-4 theme-panel-subtle border-b flex items-center justify-between">
                <span className="font-heading text-2xl uppercase tracking-wide">
                  ACTIVE SPILL CASES
                </span>
                <div className="flex items-center" title={`${incidents.length} active cases remaining`}>
                  <MaterialIcon
                    name={`counter_${Math.min(9, Math.max(0, incidents.length))}`}
                    size={26}
                    className="text-[#005A9C]"
                  />
                </div>
              </div>

              <div className="p-4 flex flex-col gap-3 overflow-y-auto">
                {isIncidentsLoading ? (
                  <div className="p-8 text-center text-xs theme-text-subtle">
                    LOADING MARITIME DOSSIERS...
                  </div>
                ) : (
                  incidents.map((inc) => {
                    const isSelected = inc.incident_id === activeIncidentId;
                    const isCompact = casesViewMode === "list" && !isSelected;

                    if (isCompact) {
                      return (
                        <div
                          key={inc.incident_id}
                          onClick={() => setActiveIncidentId(inc.incident_id)}
                          className="px-4 py-3 rounded-2xl theme-panel border hover:border-[#005A9C] transition-all cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 truncate mr-2">
                            <span className="w-2 h-2 rounded-full bg-[#005A9C]/40 shrink-0" />
                            <span className="font-bold text-[#005A9C] shrink-0">{inc.incident_id}</span>
                            <span className="theme-text-primary truncate font-medium">{inc.name}</span>
                          </div>
                          <span
                            className={clsx(
                              "text-[9px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0",
                              inc.status === "Needs Review"
                                ? "bg-[#FFB800]/20 text-[#D97706] border border-[#FFB800]/40"
                                : inc.status === "Complete"
                                ? "bg-[#00B074]/20 text-[#00B074] border border-[#00B074]/40"
                                : "bg-[#005A9C]/15 text-[#005A9C] border border-[#005A9C]/30"
                            )}
                          >
                            {inc.status}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={inc.incident_id}
                        onClick={() => setActiveIncidentId(inc.incident_id)}
                        className={clsx(
                          "p-5 rounded-3xl border transition-all cursor-pointer flex flex-col gap-2.5",
                          isSelected
                            ? "bg-[#EDF3FA] border-[#005A9C]"
                            : "theme-panel hover:border-[#005A9C]"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-[#005A9C] uppercase tracking-wider">
                            {inc.incident_id}
                          </span>
                          <span
                            className={clsx(
                              "text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase",
                              inc.status === "Needs Review"
                                ? "bg-[#FFB800]/20 text-[#D97706] border border-[#FFB800]/40"
                                : inc.status === "Complete"
                                ? "bg-[#00B074]/20 text-[#00B074] border border-[#00B074]/40"
                                : "bg-[#005A9C]/15 text-[#005A9C] border border-[#005A9C]/30"
                            )}
                          >
                            {inc.status}
                          </span>
                        </div>

                        <div
                          className="text-sm font-semibold leading-tight"
                          style={{
                            fontFamily: 'Alata, sans-serif',
                            color: isSelected ? '#005A9C' : 'var(--subheading-color)'
                          }}
                        >
                          {inc.name}
                        </div>

                        <div
                          className={clsx(
                            "flex items-center justify-between text-[11px] pt-1 border-t",
                            isSelected ? "text-[#005A9C] border-[#005A9C]/20" : "theme-text-subtle theme-border"
                          )}
                        >
                          <span>Extent: <strong className={isSelected ? "text-[#005A9C]" : "theme-text-primary"}>{inc.area_km2.toFixed(1)} km²</strong></span>
                          <span>Pass: <strong className="text-[#005A9C]">{inc.timestamp?.split(" ")[1] || "04:22 UTC"}</strong></span>
                        </div>

                        <Link
                          href={`/incident/${inc.incident_id}/intake`}
                          className="mt-1 w-full py-2 bg-[#005A9C] hover:bg-[#00477d] text-white text-xs font-bold text-center rounded-full transition-colors"
                        >
                          OPEN INVESTIGATION
                        </Link>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bottom Status Info Strip with List / Expanded Mode Switcher */}
            <div className="px-6 py-3 theme-panel-subtle border-t flex items-center justify-between text-xs theme-text-subtle">
              <span className="text-[10px] bg-[#005A9C] text-white px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                EEZ ACTIVE
              </span>

              <div className="flex items-center gap-1 theme-panel p-0.5 rounded-xl border">
                <button
                  onClick={() => setCasesViewMode("list")}
                  className={clsx(
                    "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1",
                    casesViewMode === "list"
                      ? "bg-[#005A9C] text-white shadow-xs"
                      : "theme-text-subtle hover:text-[#005A9C]"
                  )}
                  title="List Mode (Expand selected case only)"
                >
                  <MaterialIcon name="format_list_bulleted" size={13} />
                  <span>LIST</span>
                </button>

                <button
                  onClick={() => setCasesViewMode("expanded")}
                  className={clsx(
                    "px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1",
                    casesViewMode === "expanded"
                      ? "bg-[#005A9C] text-white shadow-xs"
                      : "theme-text-subtle hover:text-[#005A9C]"
                  )}
                  title="Expanded Mode (Show all cards in full)"
                >
                  <MaterialIcon name="view_agenda" size={13} />
                  <span>EXPANDED</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* 2. WORDS PRELOADER SEQUENCE (Triggers after login) */}
      {isPlayingPreloader && (
        <WordsPreloader
          collegeName="TRIDENT PORTAL"
          onComplete={() => setIsPlayingPreloader(false)}
        />
      )}

      {/* 3. MAIN LANDING PAGE SEQUENCE (CONTAINER SCROLL "OIL DOES NOT BELONG ON SEA" -> DASHBOARD) */}
      {!isPlayingPreloader && (
        <>
          {hasSeenIntro || !isIntroReady ? (
            <div className="flex-1 flex flex-col w-full relative theme-canvas">

              {renderDashboardContent()}
            </div>
          ) : (
            <motion.div 
              initial={{ y: "100vh" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
              className="relative w-full bg-[#27187E] min-h-screen"
            >
              <ContainerScroll
                onComplete={handleCompleteIntro}
                titleComponent={
                  <div className="flex flex-col items-center justify-center text-center select-none">
                    {/* Exactly 2 lines: Eyebrow + Bold Headline */}
                    <span
                      className="text-lg sm:text-2xl uppercase tracking-widest block mb-2"
                      style={{ fontFamily: 'Alata, sans-serif', color: 'rgba(247, 247, 255, 0.8)' }}
                    >
                      MARITIME SAR INTELLIGENCE
                    </span>
                    <h1
                      className="font-heading text-5xl sm:text-7xl lg:text-8xl tracking-wide uppercase leading-none"
                      style={{ color: "#F7F7FF" }}
                    >
                      OIL DOES NOT BELONG ON SEA
                    </h1>
                  </div>
                }
              >
                {/* Live Dashboard with TopNav rendered inside the tilted 3D Card */}
                <div className="w-full flex flex-col min-h-full">
                  <TopNav />
                  {renderDashboardContent()}
                </div>
              </ContainerScroll>

              {/* Sleek Minimal Floating Controls */}
              <div className="fixed bottom-6 right-8 z-50 flex items-center gap-3">
                <button
                  onClick={handleCompleteIntro}
                  className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md text-[#F7F7FF] border border-white/20 flex items-center justify-center transition-all cursor-pointer shadow-lg"
                  title="Skip Intro"
                >
                  <MaterialIcon name="close" size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </>
      )}
    </>
  );
}
