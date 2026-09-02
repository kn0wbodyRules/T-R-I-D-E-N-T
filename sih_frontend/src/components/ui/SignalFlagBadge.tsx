import React from "react";

export type Severity = "critical" | "pending" | "info" | "warning";

interface Props {
  severity: Severity;
  className?: string;
}

export default function SignalFlagBadge({ severity, className = "" }: Props) {
  const normalized = severity === "warning" ? "pending" : severity;
  
  let bgColor = "#005A9C"; // info
  let letter = "I";
  let label = "Information";
  let textColor = "#FFFFFF";

  if (normalized === "critical") {
    bgColor = "#EF3E42";
    letter = "C";
    label = "Critical";
    textColor = "#FFFFFF";
  } else if (normalized === "pending") {
    bgColor = "#FFB800";
    letter = "P";
    label = "Pending";
    textColor = "#041527"; // Dark navy for contrast on amber
  }

  return (
    <div 
      className={`inline-flex items-center justify-center shrink-0 ${className}`} 
      title={label}
      role="img"
      aria-label={label}
    >
      <svg width="38" height="28" viewBox="0 0 38 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line 
          x1="2" 
          y1="14" 
          x2="10" 
          y2="14" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          className="opacity-40" 
        />
        
        <path 
          d="M 10 3 Q 10 1 12 2 L 35 12.5 Q 37 14 35 15.5 L 12 26 Q 10 27 10 25 Z" 
          fill={bgColor} 
        />
        
        <text 
          x="18" 
          y="18.5" 
          fill={textColor} 
          fontSize="13" 
          fontFamily="system-ui, sans-serif" 
          fontWeight="900" 
          textAnchor="middle"
        >
          {letter}
        </text>
      </svg>
    </div>
  );
}
