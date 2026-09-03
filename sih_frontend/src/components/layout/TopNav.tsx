"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import clsx from "clsx";
import MaterialIcon from "@/components/ui/MaterialIcon";
import { useIncident } from "@/components/providers/IncidentContext";
import LightbulbThemeToggle from "@/components/ui/LightbulbThemeToggle";

type TabId = "dashboard" | "validation" | "alerts" | "profile";
type NavGroup = "left" | "right";

interface TabDef {
  id: TabId;
  label: string;
  path: string;
  group: NavGroup;
  badge?: number;
}

const TABS: TabDef[] = [
  { id: "dashboard", label: "DASHBOARD", path: "/", group: "left" },
  { id: "validation", label: "VALIDATION", path: "/validation", group: "left" },
  { id: "alerts", label: "ALERTS", path: "/alerts", group: "right" },
  { id: "profile", label: "PROFILE", path: "/profile", group: "right" },
];

export default function TopNav() {
  const pathname = usePathname();
  const {
    activeIncidentId,
    setActiveIncidentId,
    activeIncident,
    allIncidents,
    aisMode,
    toggleAisMode,
    alertsCount,
    islandOverride,
  } = useIncident();

  const [islandExpanded, setIslandExpanded] = useState(false);
  const islandRef = useRef<HTMLDivElement>(null);

  // Derive active tab from pathname
  const activeTabId: TabId = pathname.startsWith("/validation")
    ? "validation"
    : pathname.startsWith("/alerts")
    ? "alerts"
    : pathname.startsWith("/profile")
    ? "profile"
    : "dashboard";

  // Close dynamic island on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (islandRef.current && !islandRef.current.contains(event.target as Node)) {
        setIslandExpanded(false);
      }
    }
    if (islandExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [islandExpanded]);

  const leftTabs = TABS.filter((t) => t.group === "left");
  const rightTabs = TABS.filter((t) => t.group === "right").map((t) =>
    t.id === "alerts" ? { ...t, badge: alertsCount } : t
  );

  return (
    <header className="sticky top-0 z-50 theme-header select-none transition-colors duration-250">
      <div className="max-w-[1720px] mx-auto px-6 sm:px-10 pt-4 pb-2 flex flex-col items-center justify-center relative">
        
        {/* Main Navbar Row: Left Pill Bar | Big Majestic TRIDENT Center | Right Pill Bar + Lightbulb Toggle */}
        <div className="w-full flex items-center justify-between relative">
          
          {/* Left Pill Menu Bar: Dashboard & Validation with Dodger Blue Stroke */}
          <nav className="relative flex items-center gap-1.5 bg-[#FFFFFF] border-2 border-[#005A9C] p-1.5 rounded-full shadow-xs">
            {leftTabs.map((tab) => {
              const isActive = activeTabId === tab.id;

              return (
                <Link
                  key={tab.id}
                  href={tab.path}
                  className={clsx(
                    "relative px-5 py-2 text-xs font-bold tracking-wider rounded-full transition-colors cursor-pointer z-10",
                    isActive ? "text-white" : "text-[#005A9C] hover:bg-[#EDF3FA]"
                  )}
                >
                  {/* Active Pill Highlight */}
                  {isActive && (
                    <div className="absolute inset-0 bg-[#005A9C] rounded-full -z-10 shadow-sm" />
                  )}
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Center: Clean, Majestic Solid TRIDENT Wordmark */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center px-6 pointer-events-none z-10 hidden md:flex">
            <Link
              href="/"
              className="font-trident font-heading text-4xl sm:text-5xl tracking-[0.16em] hover:opacity-90 transition-opacity select-none leading-none inline-block text-center text-[#005A9C] pointer-events-auto"
            >
              TRIDENT
            </Link>
          </div>
          
          {/* Mobile Fallback: TRIDENT Wordmark inline to avoid overlapping if screens are too small */}
          <div className="flex md:hidden items-center justify-center px-2">
            <Link
              href="/"
              className="font-trident font-heading text-3xl tracking-[0.16em] hover:opacity-90 transition-opacity select-none leading-none inline-block text-center text-[#005A9C]"
            >
              TRIDENT
            </Link>
          </div>

          {/* Right Section: ALERTS & PROFILE Tabs with Dodger Blue Stroke + Interactive Lightbulb Theme Toggle */}
          <div className="flex items-center gap-3">
            <nav className="relative flex items-center gap-1.5 bg-[#FFFFFF] border-2 border-[#005A9C] p-1.5 rounded-full shadow-xs">
              {rightTabs.map((tab) => {
                const isActive = activeTabId === tab.id;

                return (
                  <Link
                    key={tab.id}
                    href={tab.path}
                    className={clsx(
                      "relative px-5 py-2 text-xs font-bold tracking-wider rounded-full transition-colors cursor-pointer z-10 flex items-center gap-2",
                      isActive ? "text-white" : "text-[#005A9C] hover:bg-[#EDF3FA]"
                    )}
                  >
                    {/* Active Pill Highlight */}
                    {isActive && (
                      <div className="absolute inset-0 bg-[#005A9C] rounded-full -z-10 shadow-sm" />
                    )}
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span
                        className={clsx(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none transition-colors",
                          isActive ? "bg-white text-[#005A9C]" : "bg-[#EF3E42] text-white"
                        )}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Lightbulb Theme Toggle */}
            <LightbulbThemeToggle />
          </div>
        </div>

        {/* Dynamic Island Capsule */}
        <div ref={islandRef} className="relative z-50 mt-2 flex justify-center">
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            onClick={() => !islandExpanded && setIslandExpanded(true)}
            className={clsx(
              "cursor-pointer transition-colors border theme-island shadow-md",
              islandExpanded
                ? "w-[460px] max-w-[95vw] rounded-[38px] p-6 cursor-default shadow-xl"
                : "rounded-full px-5 py-2 flex items-center gap-3"
            )}
          >
            {!islandExpanded ? (
              /* Compact Dynamic Island Pill */
              <motion.div
                layout="position"
                className="flex items-center gap-3 text-xs"
              >
                {islandOverride ? (
                  <div className="flex items-center justify-center font-bold tracking-widest text-[#EF3E42] animate-pulse py-0.5">
                    {islandOverride}
                  </div>
                ) : (
                  <>
                    {/* 1. Current Case */}
                    <div className="flex items-center gap-1.5 font-bold tracking-wide">
                      <span className="w-2 h-2 rounded-full bg-[#005A9C]" />
                      <span>{activeIncident.incident_id}</span>
                    </div>

                    <span className="opacity-40 text-xs select-none">|</span>

                    {/* 2. Type of AIS */}
                    <div className="flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-wider">
                      <span
                        className={clsx(
                          "w-1.5 h-1.5 rounded-full",
                          aisMode === "real" ? "bg-[#00B074]" : "bg-[#FFB800]"
                        )}
                      />
                      <span>{aisMode === "real" ? "REAL AIS" : "SYNTHETIC AIS"}</span>
                    </div>

                    <span className="opacity-40 text-xs select-none">|</span>

                    {/* 3. Number of alerts */}
                    <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                      <MaterialIcon
                        name={`counter_${Math.min(9, Math.max(0, alertsCount))}`}
                        size={18}
                        className="shrink-0 leading-none"
                      />
                      <span>{alertsCount} Alerts</span>
                    </div>
                  </>
                )}
              </motion.div>
            ) : (
              /* Expanded Dynamic Island Modal State */
              <motion.div
                layout="position"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-5 w-full"
              >
                {/* Dynamic Island Header: WHITE Headings in Light Mode, BLUE in Dark Mode */}
                <div className="flex items-center justify-between border-b border-current/20 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-[#005A9C] shrink-0" />
                    <div>
                      <span className="text-[10px] uppercase tracking-wider block font-semibold theme-island-eyebrow">
                        DYNAMIC ISLAND // OLED HUB
                      </span>
                      <div className="font-heading text-lg tracking-wide uppercase text-white dark:text-[#005A9C]">
                        INCIDENT & AIS CONTROLS
                      </div>
                    </div>
                  </div>

                  {/* Collapse / Close Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIslandExpanded(false);
                    }}
                    className="w-8 h-8 aspect-square rounded-full bg-black/10 hover:bg-[#005A9C] hover:text-white border border-current/20 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <MaterialIcon name="close" size={16} />
                  </button>
                </div>

                {/* AIS Mode Switcher Section */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold theme-island-eyebrow">
                    AIS DATA STREAM MODE
                  </span>
                  <div className="grid grid-cols-2 gap-2 theme-island-panel p-1.5 rounded-2xl border">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (aisMode !== "real") toggleAisMode();
                      }}
                      className={clsx(
                        "py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                        aisMode === "real"
                          ? "bg-[#005A9C] text-white shadow-sm"
                          : "opacity-70 hover:opacity-100 theme-island-row-text"
                      )}
                    >
                      <span className="w-2 h-2 rounded-full bg-[#00B074]" />
                      <span>REAL-TIME AIS</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (aisMode !== "synthetic") toggleAisMode();
                      }}
                      className={clsx(
                        "py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                        aisMode === "synthetic"
                          ? "bg-[#005A9C] text-white shadow-sm"
                          : "opacity-70 hover:opacity-100 theme-island-row-text"
                      )}
                    >
                      <span className="w-2 h-2 rounded-full bg-[#FFB800]" />
                      <span>SYNTHETIC AIS</span>
                    </button>
                  </div>
                </div>

                {/* Quick Incident Switcher */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold theme-island-eyebrow">
                    ACTIVE INCIDENT QUEUE
                  </span>
                  <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                    {allIncidents.map((inc) => {
                      const isCurrent = inc.incident_id === activeIncidentId;

                      return (
                        <div
                          key={inc.incident_id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveIncidentId(inc.incident_id);
                          }}
                          className={clsx(
                            "p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between",
                            isCurrent
                              ? "bg-[#005A9C] border-[#005A9C] text-white"
                              : "theme-island-panel hover:border-[#005A9C]/50"
                          )}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className={clsx("font-bold text-xs", !isCurrent && "theme-island-row-text")}>{inc.incident_id}</span>
                              <span className={clsx("text-[10px] opacity-70", !isCurrent && "theme-island-row-text")}>{inc.region}</span>
                            </div>
                            <span className={clsx("text-[11px] opacity-90", !isCurrent && "theme-island-row-text")}>{inc.name}</span>
                          </div>

                          <span
                            className={clsx(
                              "text-[9px] px-2 py-0.5 rounded-full font-bold uppercase",
                              inc.status === "Needs Review"
                                ? "bg-[#FFB800]/30 text-[#FFB800] border border-[#FFB800]/50"
                                : inc.status === "Complete"
                                ? "bg-[#00B074]/30 text-[#00B074] border border-[#00B074]/50"
                                : "bg-white/20 text-white"
                            )}
                          >
                            {inc.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Footer Action */}
                <div className="pt-2 border-t border-current/15 flex items-center justify-between text-xs theme-island-row-text">
                  <span>Area: <strong>{activeIncident.area_km2.toFixed(1)} km²</strong></span>
                  <Link
                    href={`/incident/${activeIncidentId}/intake`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIslandExpanded(false);
                    }}
                    className="hover:underline font-bold transition-colors flex items-center gap-1"
                  >
                    <span>OPEN ACTIVE WORKFLOW</span>
                    <MaterialIcon name="arrow_forward" size={14} />
                  </Link>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>

      </div>
    </header>
  );
}
