"use client";

import React from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { motion, AnimatePresence } from "motion/react";
import { fetchValidationCases } from "@/lib/mock-data";

export default function ValidationBenchmarkPage() {
  const { data: cases = [], isLoading } = useQuery({
    queryKey: ["validationCases"],
    queryFn: fetchValidationCases,
  });

  const [hoveredCard, setHoveredCard] = React.useState<number | null>(null);
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

  // Map benchmark cases to their actual satellite comparison imagery
  const getCaseImages = (incidentName: string) => {
    if (incidentName.toLowerCase().includes("corsica")) {
      return {
        groundTruth: "/images/validation/corsica-ground-truth.jpg",
        prediction: "/images/validation/corsica-prediction.jpg",
      };
    }
    return {
      groundTruth: "/images/validation/singapore-ground-truth.jpg",
      prediction: "/images/validation/singapore-prediction.jpg",
    };
  };

  return (
    <div className="flex-1 flex flex-col p-6 sm:p-8 max-w-[1600px] w-full mx-auto theme-canvas transition-colors duration-250">
      {/* Header */}
      <div className="border-b theme-border pb-4 mb-8">
        <div className="flex items-center gap-2 text-xs theme-text-subtle mb-1">
          <span>ALGORITHM EVALUATION BENCHMARK</span>
          <span>·</span>
          <span className="text-[#005A9C] font-semibold">HISTORICAL GROUND TRUTH VALIDATION</span>
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl tracking-wide uppercase">
          Empirical Validation & Benchmark Cases
        </h1>
      </div>

      {/* Aggregate Benchmark Summary Metrics */}
      <div className="flex flex-col lg:flex-row gap-4 mb-8 min-h-[130px]">
        {/* Card 1: IOU */}
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
            <span className="text-[10px] theme-text-subtle uppercase tracking-wider font-semibold truncate">MEAN IOU SCORE</span>
            <span className="font-heading text-3xl sm:text-4xl mt-1 shrink-0">0.878</span>
            <span className="text-[10px] theme-text-subtle mt-0.5 truncate">Slick Segmentation</span>
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
                <span className="text-[10px] uppercase font-bold theme-text-subtle mb-1.5">Intersection Over Union</span>
                <span className="text-xs font-semibold theme-text-primary">Threshold Target: &gt; 0.75</span>
                <span className="text-[10px] theme-text-muted mt-1.5">Industry standard alignment metric.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Card 2: DICE */}
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
            <span className="text-[10px] theme-text-subtle uppercase tracking-wider font-semibold truncate">MEAN DICE COEFFICIENT</span>
            <span className="font-heading text-3xl sm:text-4xl mt-1 shrink-0">0.935</span>
            <span className="text-[10px] theme-text-subtle mt-0.5 truncate">Morphological Overlap</span>
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
                <span className="text-[10px] uppercase font-bold theme-text-subtle mb-1.5">F1 Score Equivalent</span>
                <span className="text-xs font-semibold theme-text-primary">Performance: Excellent</span>
                <span className="text-[10px] theme-text-muted mt-1.5">Strong morphological similarity.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Card 3: ORIGIN ERROR */}
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
            <span className="text-[10px] theme-text-subtle uppercase tracking-wider font-semibold truncate">MEAN ORIGIN ERROR</span>
            <span className="font-heading text-3xl sm:text-4xl text-[#00B074] mt-1 shrink-0">1.05 <span className="text-xs font-normal theme-text-subtle">km</span></span>
            <span className="text-[10px] text-[#00B074] font-semibold mt-0.5 truncate">SPH Lagrangian Backtrack</span>
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
                <span className="text-[10px] uppercase font-bold theme-text-subtle mb-1.5">Spatial Accuracy</span>
                <span className="text-xs font-semibold text-[#00B074]">&lt; 1.5km Margin of Error</span>
                <span className="text-[10px] theme-text-muted mt-1.5">Verified vs AIS track logs.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Card 4: TOP-1 ACCURACY */}
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
            <span className="text-[10px] theme-text-subtle uppercase tracking-wider font-semibold truncate">TOP-1 ACCURACY</span>
            <span className="font-heading text-3xl sm:text-4xl text-[#00B074] mt-1 shrink-0">100.0%</span>
            <span className="text-[10px] text-[#00B074] font-semibold mt-0.5 truncate">True Culprit at Rank #1</span>
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
                <span className="text-[10px] uppercase font-bold theme-text-subtle mb-1.5">Ground Truth Hit Rate</span>
                <span className="text-xs font-semibold text-[#00B074]">2/2 Benchmark Cases</span>
                <span className="text-[10px] theme-text-muted mt-1.5">100% first-rank identification.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Card 5: PRECISION@K */}
        <motion.div
          layout
          onMouseEnter={() => handleMouseEnter(5)}
          onMouseLeave={handleMouseLeave}
          style={{ flex: hoveredCard === 5 ? 2.5 : hoveredCard !== null ? 1 : 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className={clsx(
            "theme-panel border rounded-[38px] p-5 lg:p-6 flex overflow-hidden shadow-xs relative transition-colors group",
            hoveredCard === 5 ? "cursor-default" : "cursor-pointer"
          )}
        >
          <motion.div layout="position" className="flex flex-col justify-between shrink-0 min-w-0">
            <span className="text-[10px] theme-text-subtle uppercase tracking-wider font-semibold truncate">PRECISION@K (K=3)</span>
            <span className="font-heading text-3xl sm:text-4xl mt-1 shrink-0">0.970</span>
            <span className="text-[10px] theme-text-subtle mt-0.5 truncate">Corridor Suspect Pool</span>
          </motion.div>

          <AnimatePresence>
            {hoveredCard === 5 && (
              <motion.div
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.1 } }}
                transition={{ delay: 0.15, duration: 0.2 }}
                className="hidden lg:flex flex-col justify-center ml-6 pl-6 border-l theme-border whitespace-nowrap overflow-hidden"
              >
                <span className="text-[10px] uppercase font-bold theme-text-subtle mb-1.5">Top-3 Ranking Reliability</span>
                <span className="text-xs font-semibold theme-text-primary">0.970 Confidence</span>
                <span className="text-[10px] theme-text-muted mt-1.5">Consistent top suspect isolation.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs theme-text-subtle border theme-border theme-panel rounded-[38px]">
          LOADING BENCHMARK METRIC CORPUS...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          {cases.map((benchmarkCase) => {
            const caseImages = getCaseImages(benchmarkCase.incident_name);

            return (
              <div
                key={benchmarkCase.incident_name}
                className="theme-panel border rounded-[38px] flex flex-col overflow-hidden shadow-xs"
              >
                {/* Benchmark Case Header with Single Circular Green Checkmark */}
                <div className="p-6 theme-panel-subtle border-b flex items-center justify-between">
                  <div>
                    <div className="text-[10px] theme-text-subtle uppercase tracking-wider">
                      BENCHMARK CASE · {benchmarkCase.date}
                    </div>
                    <h3 className="font-heading text-2xl uppercase mt-0.5 tracking-wide">
                      {benchmarkCase.incident_name} Incident
                    </h3>
                  </div>

                  {/* Circular Green Checkmark Badge without text */}
                  <div
                    className="w-8 h-8 rounded-full bg-[#ECFDF5] border border-[#00B074]/50 flex items-center justify-center shadow-xs"
                    title="Verified Ground Truth"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="18px"
                      viewBox="0 -960 960 960"
                      width="18px"
                      fill="#00B074"
                      className="shrink-0"
                    >
                      <path d="m424-296 282-282-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" />
                    </svg>
                  </div>
                </div>

                {/* Location & Overview */}
                <div className="p-6 border-b theme-border theme-panel-subtle text-xs theme-text-muted leading-relaxed">
                  <div className="text-[10px] theme-text-subtle uppercase tracking-wider mb-1 font-semibold">
                    LOCATION & EVENT OVERVIEW
                  </div>
                  <div className="theme-text-primary font-semibold">{benchmarkCase.location}</div>
                  <div className="mt-1.5 theme-text-subtle text-[11px]">{benchmarkCase.summary}</div>
                </div>

                {/* Side-by-Side Comparison with Real Generated Satellite Imagery */}
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 theme-canvas">
                  
                  {/* Panel 1: Official Ground Truth */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] theme-text-subtle uppercase tracking-wider font-semibold">
                      OFFICIAL GROUND TRUTH (EMSA / MPA)
                    </span>
                    <div className="h-56 bg-[#041527] border theme-border rounded-2xl relative overflow-hidden flex flex-col justify-between p-4 shadow-sm group">
                      {/* Background Satellite Image */}
                      <Image
                        src={caseImages.groundTruth}
                        alt={`${benchmarkCase.incident_name} Official Ground Truth`}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />

                      {/* Top & Bottom Contrast Gradient Scrim */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/60 pointer-events-none" />

                      {/* Top Overlay Badge */}
                      <div className="relative z-10">
                        <span className="text-[9px] font-bold bg-[#00B074]/80 text-white px-2.5 py-1 rounded-full backdrop-blur-xs border border-[#00B074] uppercase tracking-wider">
                          ACTUAL DISCHARGE
                        </span>
                      </div>

                      {/* Bottom Target Caption */}
                      <div className="relative z-10 text-[11px] text-white font-medium">
                        <div className="bg-black/60 backdrop-blur-xs px-2.5 py-1.5 rounded-lg border border-white/15 inline-block">
                          TARGET: <strong className="text-white font-bold">{benchmarkCase.ground_truth_vessel}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Panel 2: TRIDENT Prediction & Drift */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-[#005A9C] uppercase font-bold tracking-wider">
                      TRIDENT PREDICTION & DRIFT
                    </span>
                    <div className="h-56 bg-[#041527] border border-[#005A9C]/50 rounded-2xl relative overflow-hidden flex flex-col justify-between p-4 shadow-sm group">
                      {/* Background Satellite Image */}
                      <Image
                        src={caseImages.prediction}
                        alt={`${benchmarkCase.incident_name} TRIDENT Prediction & Drift`}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />

                      {/* Top & Bottom Contrast Gradient Scrim */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/60 pointer-events-none" />

                      {/* Top Overlay Badge */}
                      <div className="relative z-10">
                        <span className="text-[9px] font-bold bg-[#005A9C]/80 text-white px-2.5 py-1 rounded-full backdrop-blur-xs border border-[#0090FF] uppercase tracking-wider">
                          PREDICTED SLICK
                        </span>
                      </div>

                      {/* Bottom Prediction Caption */}
                      <div className="relative z-10 text-[11px] text-white font-medium">
                        <div className="bg-black/60 backdrop-blur-xs px-2.5 py-1.5 rounded-lg border border-white/15 inline-block">
                          <span className="text-[#60A5FA] font-bold">PREDICTED: </span>
                          <strong className="text-white font-bold">{benchmarkCase.predicted_vessel}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Empirical Metrics Readout */}
                <div className="p-6 theme-panel-subtle border-t">
                  <div className="text-[10px] theme-text-subtle uppercase tracking-wider mb-3 font-semibold">
                    EMPIRICAL METRICS READOUT
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="theme-panel p-3.5 border rounded-2xl">
                      <span className="text-[10px] theme-text-subtle block uppercase tracking-wider">IOU METRIC</span>
                      <span className="theme-text-primary font-bold text-lg">
                        {benchmarkCase.metrics.iou?.toFixed(3)}
                      </span>
                    </div>

                    <div className="theme-panel p-3.5 border rounded-2xl">
                      <span className="text-[10px] theme-text-subtle block uppercase tracking-wider">DICE COEFF</span>
                      <span className="theme-text-primary font-bold text-lg">
                        {benchmarkCase.metrics.dice?.toFixed(3)}
                      </span>
                    </div>

                    <div className="theme-panel p-3.5 border rounded-2xl">
                      <span className="text-[10px] theme-text-subtle block uppercase tracking-wider">ORIGIN ERROR</span>
                      <span className="text-[#00B074] font-bold text-lg">
                        {benchmarkCase.metrics.origin_error_km?.toFixed(2)} km
                      </span>
                    </div>

                    <div className="theme-panel p-3.5 border rounded-2xl">
                      <span className="text-[10px] theme-text-subtle block uppercase tracking-wider">TOP-1 HIT</span>
                      <span className="text-[#00B074] font-bold text-lg">
                        {benchmarkCase.metrics.top1_correct ? "CORRECT" : "MISSED"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
