"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { MOCK_INCIDENTS, IncidentCard } from "@/lib/mock-data";

interface IncidentContextType {
  activeIncidentId: string;
  setActiveIncidentId: (id: string) => void;
  activeIncident: IncidentCard;
  allIncidents: IncidentCard[];
  aisMode: "real" | "synthetic";
  setAisMode: (mode: "real" | "synthetic") => void;
  toggleAisMode: () => void;
  selectedVesselId: string | null;
  setSelectedVesselId: (id: string | null) => void;
  alertsCount: number;
  setAlertsCount: React.Dispatch<React.SetStateAction<number>>;
  hasSeenIntro: boolean;
  isIntroReady: boolean;
  completeIntro: () => void;
  resetIntro: () => void;
  casesViewMode: "expanded" | "list";
  setCasesViewMode: (mode: "expanded" | "list") => void;
  islandOverride: string | null;
  triggerAlert: () => void;
}

const IncidentContext = createContext<IncidentContextType | undefined>(undefined);

export function IncidentProvider({ children }: { children: React.ReactNode }) {
  const [activeIncidentId, setActiveIncidentId] = useState<string>("INC-2026-0892");
  const [aisMode, setAisMode] = useState<"real" | "synthetic">("real");
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [alertsCount, setAlertsCount] = useState<number>(2);
  const [casesViewMode, setCasesViewMode] = useState<"expanded" | "list">("list");

  // Intro session state
  const [hasSeenIntro, setHasSeenIntro] = useState<boolean>(true); // default true for SSR
  const [isIntroReady, setIsIntroReady] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("trident-intro-seen");
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (stored === "true" || prefersReducedMotion) {
        setHasSeenIntro(true);
      } else {
        setHasSeenIntro(false);
      }
      setIsIntroReady(true);
    }
  }, []);

  const completeIntro = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("trident-intro-seen", "true");
    }
    setHasSeenIntro(true);
  };

  const resetIntro = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("trident-intro-seen");
    }
    setHasSeenIntro(false);
  };

  const activeIncident =
    MOCK_INCIDENTS.find((i) => i.incident_id === activeIncidentId) || MOCK_INCIDENTS[0];

  const toggleAisMode = () => {
    setAisMode((prev) => (prev === "real" ? "synthetic" : "real"));
  };

  const [islandOverride, setIslandOverride] = useState<string | null>(null);

  const triggerAlert = () => {
    // Play beep sound using AudioContext 5 times, once per second
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const audioCtx = new AudioContext();
        
        for (let i = 0; i < 5; i++) {
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + i);
          
          // Smooth envelope to prevent audio clicking
          gainNode.gain.setValueAtTime(0, audioCtx.currentTime + i);
          gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + i + 0.05);
          gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime + i + 0.15);
          gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + i + 0.2);
          
          oscillator.start(audioCtx.currentTime + i);
          oscillator.stop(audioCtx.currentTime + i + 0.2);
        }
      }
    } catch (e) {
      console.error("Audio playback failed", e);
    }

    setAlertsCount((prev) => prev + 1);
    setIslandOverride("1 NEW ALERT");
    setTimeout(() => {
      setIslandOverride(null);
    }, 5000);
  };

  return (
    <IncidentContext.Provider
      value={{
        activeIncidentId,
        setActiveIncidentId,
        activeIncident,
        allIncidents: MOCK_INCIDENTS,
        aisMode,
        setAisMode,
        toggleAisMode,
        selectedVesselId,
        setSelectedVesselId,
        alertsCount,
        setAlertsCount,
        hasSeenIntro,
        isIntroReady,
        completeIntro,
        resetIntro,
        casesViewMode,
        setCasesViewMode,
        islandOverride,
        triggerAlert,
      }}
    >
      {children}
    </IncidentContext.Provider>
  );
}

export function useIncident() {
  const context = useContext(IncidentContext);
  if (!context) {
    throw new Error("useIncident must be used within an IncidentProvider");
  }
  return context;
}
