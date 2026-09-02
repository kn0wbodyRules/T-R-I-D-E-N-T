"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useIncident } from "@/components/providers/IncidentContext";
import TopNav from "./TopNav";

export default function TopNavWrapper() {
  const pathname = usePathname();
  const { hasSeenIntro, isIntroReady } = useIncident();

  // On non-root pages (/validation, /alerts, /profile, /incident/...), TopNav is ALWAYS mounted immediately.
  // On root page (/), TopNav is mounted ONLY when hasSeenIntro is true.
  const shouldRender = pathname !== "/" || (isIntroReady && hasSeenIntro);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 w-full">
      <TopNav />
    </div>
  );
}
