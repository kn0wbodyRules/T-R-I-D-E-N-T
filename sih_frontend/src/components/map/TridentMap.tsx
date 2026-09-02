"use client";

import React from "react";
import dynamic from "next/dynamic";
import { TridentMapInnerProps } from "./TridentMapInner";

// Dynamic import of Leaflet map to avoid SSR 'window is not defined' crashes
const TridentMapDynamic = dynamic(() => import("./TridentMapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[400px] bg-[#0C2340] border border-[rgba(233,238,242,0.12)] flex flex-col items-center justify-center text-mono-data text-xs text-[#E9EEF2]/60 gap-3">
      <div className="w-6 h-6 border-2 border-[#2F65B9] border-t-transparent animate-spin rounded-full" />
      <span>INITIALIZING TACTICAL RADAR CANVAS...</span>
    </div>
  ),
});

export default function TridentMap(props: TridentMapInnerProps) {
  return <TridentMapDynamic {...props} />;
}
