"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Polyline,
  Marker,
  Popup,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import clsx from "clsx";
import { Candidate } from "@/lib/mock-data";

// Pan/zoom synchronization helper without redundant interrupted animations
function MapViewController({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  const lastCenter = useRef<string | null>(null);
  useEffect(() => {
    const key = `${center[0].toFixed(5)},${center[1].toFixed(5)},${zoom}`;
    if (lastCenter.current === key) return;
    lastCenter.current = key;
    map.setView(center, zoom, { animate: false });
  }, [center, zoom, map]);
  return null;
}

/**
 * Verified context-accurate vessel thumbnail provider (heavy maritime cargo / tankers)
 */
const getVesselImage = (id: string) => {
  const images = [
    "https://images.unsplash.com/photo-1518527989017-5baca7a58d3c?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1585713181935-d5f622cc2415?w=800&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1606185540834-d6e7483ee1a4?w=800&auto=format&fit=crop&q=80",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
  return images[hash % images.length];
};

/**
 * Authentic Maritime Coordinate Graticule (Parallels & Meridians).
 * Directly attached to map container to prevent pane transform drift.
 */
function NauticalGraticule({ show }: { show: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!show) return;

    const container = map.getContainer();
    if (!container) return;

    const canvas = document.createElement("canvas");
    canvas.className = "leaflet-nautical-graticule-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "405";
    container.appendChild(canvas);

    const draw = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return;

      if (canvas.width !== size.x || canvas.height !== size.y) {
        canvas.width = size.x;
        canvas.height = size.y;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, size.x, size.y);

      const bounds = map.getBounds();
      const zoom = map.getZoom();

      // Dynamic step size matching nautical navigation chart standards
      let step = 0.05; // ~3 NM
      if (zoom >= 13) step = 0.01; // ~0.6 NM
      else if (zoom === 12) step = 0.02; // ~1.2 NM
      else if (zoom >= 10) step = 0.05; // ~3.0 NM
      else if (zoom >= 8) step = 0.1; // ~6.0 NM
      else step = 0.25;

      const south = bounds.getSouth();
      const north = bounds.getNorth();
      const west = bounds.getWest();
      const east = bounds.getEast();

      const minLat = Math.floor(south / step) * step;
      const maxLat = Math.ceil(north / step) * step;
      const minLng = Math.floor(west / step) * step;
      const maxLng = Math.ceil(east / step) * step;

      ctx.save();
      ctx.strokeStyle = "rgba(147, 197, 253, 0.16)";
      ctx.fillStyle = "rgba(147, 197, 253, 0.70)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

      // Draw latitude parallels
      for (let lat = minLat; lat <= maxLat; lat += step) {
        if (lat < south || lat > north) continue;
        const pt = map.latLngToContainerPoint([lat, west]);

        ctx.beginPath();
        ctx.moveTo(0, pt.y);
        ctx.lineTo(size.x, pt.y);
        ctx.stroke();

        const deg = Math.floor(lat);
        const min = Math.round((lat - deg) * 60);
        const label = `${deg}°${min.toString().padStart(2, "0")}'N`;
        ctx.fillText(label, 12, pt.y - 3);
      }

      // Draw longitude meridians
      for (let lng = minLng; lng <= maxLng; lng += step) {
        if (lng < west || lng > east) continue;
        const pt = map.latLngToContainerPoint([north, lng]);

        ctx.beginPath();
        ctx.moveTo(pt.x, 0);
        ctx.lineTo(pt.x, size.y);
        ctx.stroke();

        const deg = Math.floor(lng);
        const min = Math.round((lng - deg) * 60);
        const label = `${deg}°${min.toString().padStart(2, "0")}'E`;
        ctx.fillText(label, pt.x + 4, size.y - 12);
      }

      ctx.restore();
    };

    draw();
    const rafId = requestAnimationFrame(draw);
    const timer1 = setTimeout(draw, 60);
    const timer2 = setTimeout(draw, 250);

    map.on("move zoom viewreset resize layeradd", draw);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      map.off("move zoom viewreset resize layeradd", draw);
      canvas.remove();
    };
  }, [map, show]);

  return null;
}

/**
 * Prominent, Highly-Visible Oceanographic KDE Probability Heatmap.
 * Renders a rich, multi-pass thermal dispersion plume
 * (Ruby Red Core -> Coral Flame -> Radiant Amber -> Golden Halo)
 * Attached directly to map container for 100% reliable rendering without transform drift.
 */
function CanvasKDEHeatmap({
  points,
  dimmed,
}: {
  points: { lat: number; lng: number; intensity: number }[];
  dimmed: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!points || !points.length) return;

    const container = map.getContainer();
    if (!container) return;

    const canvas = document.createElement("canvas");
    canvas.className = "leaflet-canvas-kde-heatmap";
    canvas.style.position = "absolute";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "410";
    canvas.style.opacity = dimmed ? "0.45" : "0.96";
    container.appendChild(canvas);

    const draw = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return;

      if (canvas.width !== size.x || canvas.height !== size.y) {
        canvas.width = size.x;
        canvas.height = size.y;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, size.x, size.y);

      const zoom = map.getZoom();
      // Prominent, generous radius merging points into a rich, continuous corridor
      const baseRadius = Math.max(75, 135 * Math.pow(1.22, zoom - 10));
      const opacityScale = dimmed ? 0.45 : 1.0;

      const sortedPoints = [...points].sort((a, b) => a.intensity - b.intensity);

      // PASS 1: Broad, luminous thermal dispersion field
      sortedPoints.forEach((pt) => {
        const point = map.latLngToContainerPoint([pt.lat, pt.lng]);
        const x = point.x;
        const y = point.y;
        const rad = baseRadius * (0.85 + pt.intensity * 0.55);

        const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
        const a = pt.intensity * opacityScale;

        // Radiant thermal spectrum (No blue/cyan, pure thermal)
        grad.addColorStop(0.00, `rgba(239, 68, 68, ${a * 0.98})`);   // Deep Ruby Red
        grad.addColorStop(0.22, `rgba(255, 87, 34, ${a * 0.90})`);   // Vivid Coral
        grad.addColorStop(0.48, `rgba(255, 184, 0, ${a * 0.78})`);   // Radiant Warm Amber
        grad.addColorStop(0.72, `rgba(251, 191, 36, ${a * 0.42})`);  // Golden Halo
        grad.addColorStop(1.00, `rgba(251, 191, 36, 0)`);            // Transparent fade

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      });

      // PASS 2: Saturated high-probability discharge core for focal centers
      sortedPoints.forEach((pt) => {
        if (pt.intensity < 0.65) return;
        const point = map.latLngToContainerPoint([pt.lat, pt.lng]);
        const x = point.x;
        const y = point.y;
        const coreRad = baseRadius * (0.44 + pt.intensity * 0.32);

        const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, coreRad);
        const a = pt.intensity * opacityScale;

        coreGrad.addColorStop(0.00, `rgba(255, 20, 60, ${a * 0.98})`);  // Deep Intense Ruby
        coreGrad.addColorStop(0.40, `rgba(255, 90, 20, ${a * 0.88})`);  // Flame Orange
        coreGrad.addColorStop(0.75, `rgba(255, 190, 0, ${a * 0.50})`);  // Vivid Gold
        coreGrad.addColorStop(1.00, `rgba(255, 190, 0, 0)`);

        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(x, y, coreRad, 0, Math.PI * 2);
        ctx.fill();
      });

      // PASS 3: Scientific Probability Isobar Contours
      if (sortedPoints.length > 0) {
        const hottest = sortedPoints[sortedPoints.length - 1];
        const hPoint = map.latLngToContainerPoint([hottest.lat, hottest.lng]);

        // 90% Probability Core Isobar (White dashed circle)
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.90)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(hPoint.x, hPoint.y, baseRadius * 0.46, 0, Math.PI * 2);
        ctx.stroke();

        // 75% Probability Corridor Isobar (Amber dashed circle)
        ctx.strokeStyle = "rgba(255, 184, 0, 0.75)";
        ctx.lineWidth = 1.1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(hPoint.x, hPoint.y, baseRadius * 0.86, 0, Math.PI * 2);
        ctx.stroke();

        // Tactical Target Pip at centroid
        ctx.setLineDash([]);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.fillStyle = "#EF4444";
        ctx.beginPath();
        ctx.arc(hPoint.x, hPoint.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }
    };

    draw();
    const rafId = requestAnimationFrame(draw);
    const timer1 = setTimeout(draw, 50);
    const timer2 = setTimeout(draw, 250);

    map.on("move zoom viewreset resize layeradd", draw);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer1);
      clearTimeout(timer2);
      map.off("move zoom viewreset resize layeradd", draw);
      canvas.remove();
    };
  }, [map, points, dimmed]);

  return null;
}

/**
 * Authentic OpenDrift Lagrangian Particle Ensemble Backtrack Simulation Engine.
 * 150 discrete fluid droplets drifting backwards with trailing wakes (comet tails),
 * velocity shear, Brownian lateral dispersion, and sequential milestone lighting.
 */
function OpenDriftBacktrackAnimation({
  slickCenter,
  originPoints,
  isAnimating,
  replayTrigger,
  onComplete,
}: {
  slickCenter?: [number, number];
  originPoints?: { lat: number; lng: number; intensity: number }[];
  isAnimating: boolean;
  replayTrigger: number;
  onComplete?: () => void;
}) {
  const map = useMap();
  const [displayedProgress, setDisplayedProgress] = useState(0);

  const animProgressRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 150 deterministic Lagrangian super-particles with realistic ocean fluid dynamics
  const particles = useMemo(() => {
    if (!originPoints || !originPoints.length) return [];
    return Array.from({ length: 150 }, (_, i) => {
      // Clustered seeding inside the SAR slick at T=0
      const angle = (i / 150) * Math.PI * 2;
      const dist = ((i * 29) % 53) / 53 * 0.0035;
      const seedLatOffset = Math.sin(angle) * dist;
      const seedLngOffset = Math.cos(angle) * dist;

      // Target mapping distributed across origin KDE cluster
      const targetPoint = originPoints[i % originPoints.length];
      const targetAngle = (i * 37) % 360;
      const targetDist = ((i * 23) % 43) / 43 * 0.0075;
      const targetLatOffset = Math.sin(targetAngle) * targetDist;
      const targetLngOffset = Math.cos(targetAngle) * targetDist;

      // Hydrodynamic velocity shear: droplet transport speeds range from 82% to 118%
      const speedFactor = 0.82 + ((i * 19) % 37) / 37 * 0.36;

      // Turbulent Brownian lateral eddy diffusion (Kxy = 10 m²/s)
      const meanderPhase = (i * 2.31) % (Math.PI * 2);
      const meanderAmp = 0.003 + ((i % 11) / 11) * 0.0045;

      return {
        seedLatOffset,
        seedLngOffset,
        targetLat: targetPoint.lat + targetLatOffset,
        targetLng: targetPoint.lng + targetLngOffset,
        speedFactor,
        meanderPhase,
        meanderAmp,
      };
    });
  }, [originPoints]);

  // Primary origin point
  const primaryOrigin = useMemo(() => {
    if (!originPoints || !originPoints.length) return null;
    return originPoints.reduce(
      (max, pt) => (pt.intensity > max.intensity ? pt : max),
      originPoints[0]
    );
  }, [originPoints]);

  // High-performance canvas particle renderer directly on map container
  useEffect(() => {
    if (!slickCenter || !particles.length) return;

    const container = map.getContainer();
    if (!container) return;

    const canvas = document.createElement("canvas");
    canvas.className = "leaflet-opendrift-particles-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "420";
    container.appendChild(canvas);

    const DURATION = 4600; // 4.6s smooth hydrodynamic advection sequence

    const render = (now: number) => {
      if (!startTimeRef.current) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / DURATION, 1);
      animProgressRef.current = progress;

      setDisplayedProgress((prev) => {
        if (Math.abs(prev - progress) > 0.015 || progress === 1) return progress;
        return prev;
      });

      const size = map.getSize();
      if (size.x > 0 && size.y > 0) {
        if (canvas.width !== size.x || canvas.height !== size.y) {
          canvas.width = size.x;
          canvas.height = size.y;
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, size.x, size.y);

          // Authentic oceanographic time ramp: Cerulean (T=0) -> Amber (T=-4h) -> Crimson (T=-8.8h)
          const tailColor =
            progress < 0.38
              ? "#38BDF8"
              : progress < 0.72
              ? "#F59E0B"
              : "#EF4444";

          particles.forEach((p) => {
            const startLat = slickCenter[0] + p.seedLatOffset;
            const startLng = slickCenter[1] + p.seedLngOffset;

            const effProgress = Math.min(1, progress * p.speedFactor);

            // Sinusoidal ocean meander + turbulent Brownian lateral dispersion
            const meander =
              Math.sin(effProgress * Math.PI) *
              p.meanderAmp *
              Math.sin(effProgress * 7 + p.meanderPhase);

            const currentLat =
              startLat + (p.targetLat - startLat) * effProgress - meander * 0.85;
            const currentLng =
              startLng + (p.targetLng - startLng) * effProgress + meander * 1.15;

            // Trailing wake (comet tail) extending behind the droplet
            const tailProgress = Math.max(0, effProgress - 0.18);
            const tailMeander =
              Math.sin(tailProgress * Math.PI) *
              p.meanderAmp *
              Math.sin(tailProgress * 7 + p.meanderPhase);
            const tailLat =
              startLat + (p.targetLat - startLat) * tailProgress - tailMeander * 0.85;
            const tailLng =
              startLng + (p.targetLng - startLng) * tailProgress + tailMeander * 1.15;

            const pTail = map.latLngToContainerPoint([tailLat, tailLng]);
            const pCurrent = map.latLngToContainerPoint([currentLat, currentLng]);

            // Fluid trailing wake segment
            ctx.save();
            ctx.strokeStyle = tailColor;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(pTail.x, pTail.y);
            ctx.lineTo(pCurrent.x, pCurrent.y);
            ctx.stroke();
            ctx.restore();

            // Droplet head with subtle luminous glow
            ctx.save();
            ctx.fillStyle = tailColor;
            ctx.shadowColor = tailColor;
            ctx.shadowBlur = 4;
            ctx.globalAlpha = 0.92;
            ctx.beginPath();
            ctx.arc(pCurrent.x, pCurrent.y, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });
        }
      }

      if (progress < 1) {
        rafIdRef.current = requestAnimationFrame(render);
      } else {
        onCompleteRef.current?.();
      }
    };

    // Redraw static snapshot on pan/zoom once settled
    const redrawCurrent = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return;
      if (canvas.width !== size.x || canvas.height !== size.y) {
        canvas.width = size.x;
        canvas.height = size.y;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, size.x, size.y);

      const progress = animProgressRef.current;
      const tailColor =
        progress < 0.38 ? "#38BDF8" : progress < 0.72 ? "#F59E0B" : "#EF4444";

      particles.forEach((p) => {
        const startLat = slickCenter[0] + p.seedLatOffset;
        const startLng = slickCenter[1] + p.seedLngOffset;
        const effProgress = Math.min(1, progress * p.speedFactor);
        const meander =
          Math.sin(effProgress * Math.PI) *
          p.meanderAmp *
          Math.sin(effProgress * 7 + p.meanderPhase);
        const currentLat =
          startLat + (p.targetLat - startLat) * effProgress - meander * 0.85;
        const currentLng =
          startLng + (p.targetLng - startLng) * effProgress + meander * 1.15;

        const tailProgress = Math.max(0, effProgress - 0.18);
        const tailMeander =
          Math.sin(tailProgress * Math.PI) *
          p.meanderAmp *
          Math.sin(tailProgress * 7 + p.meanderPhase);
        const tailLat =
          startLat + (p.targetLat - startLat) * tailProgress - tailMeander * 0.85;
        const tailLng =
          startLng + (p.targetLng - startLng) * tailProgress + tailMeander * 1.15;

        const pTail = map.latLngToContainerPoint([tailLat, tailLng]);
        const pCurrent = map.latLngToContainerPoint([currentLat, currentLng]);

        ctx.save();
        ctx.strokeStyle = tailColor;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(pTail.x, pTail.y);
        ctx.lineTo(pCurrent.x, pCurrent.y);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = tailColor;
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.arc(pCurrent.x, pCurrent.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    startTimeRef.current = performance.now();
    animProgressRef.current = 0;
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(render);

    map.on("move zoom viewreset resize", redrawCurrent);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      map.off("move zoom viewreset resize", redrawCurrent);
      canvas.remove();
    };
  }, [map, slickCenter, particles, replayTrigger]);

  if (!slickCenter || !primaryOrigin) return null;

  // 4 Tactical Backtrack Milestones along the corridor
  const steps = [
    {
      lat: slickCenter[0],
      lng: slickCenter[1],
      threshold: 0.0,
      time: "T - 0.0h",
      title: "SAR Slick Detection",
      color: "#38BDF8",
    },
    {
      lat: slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * 0.33,
      lng: slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * 0.33,
      threshold: 0.33,
      time: "T - 2.8h",
      title: "Surface Leeway Drift",
      color: "#F59E0B",
    },
    {
      lat: slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * 0.68,
      lng: slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * 0.68,
      threshold: 0.68,
      time: "T - 5.8h",
      title: "HYCOM 1/12° Advection",
      color: "#F97316",
    },
    {
      lat: primaryOrigin.lat,
      lng: primaryOrigin.lng,
      threshold: 0.98,
      time: "T - 8.8h",
      title: "Origin Envelope Core",
      color: "#EF4444",
    },
  ];

  const currentLat = slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * displayedProgress;
  const currentLng = slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * displayedProgress;
  const reachedSteps = steps.filter((s) => displayedProgress >= s.threshold);

  return (
    <>
      {/* Central trajectory streamline */}
      <Polyline
        positions={[slickCenter, [currentLat, currentLng]]}
        pathOptions={{
          color: "rgba(56, 189, 248, 0.45)",
          weight: 2.5,
          opacity: 0.85,
          dashArray: "4, 5",
          lineCap: "round",
        }}
      />

      {/* Discrete Isochrone Milestones */}
      {reachedSteps.map((s, idx) => (
        <CircleMarker
          key={`backtrack-step-${idx}`}
          center={[s.lat, s.lng]}
          radius={idx === 3 ? 6 : 4.5}
          pathOptions={{
            fillColor: s.color,
            fillOpacity: 1,
            color: "#FFFFFF",
            weight: 2,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]} className="vessel-custom-tooltip">
            <div className="bg-[#041527]/95 border border-[rgba(0,90,156,0.3)] rounded-lg px-2.5 py-1 shadow-lg text-white backdrop-blur-md select-none pointer-events-none whitespace-nowrap text-[9px] font-mono">
              <span style={{ color: s.color }} className="font-bold">{s.time}</span> · {s.title}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Leading tracer pip */}
      <CircleMarker
        center={[currentLat, currentLng]}
        radius={5}
        pathOptions={{
          fillColor: "#FFFFFF",
          fillOpacity: 1,
          color: "#38BDF8",
          weight: 2,
        }}
      />
    </>
  );
}

/**
 * Tactical Point Marker for Candidate Vessels.
 * Clean, bold radar tracking disc with NO permanent text pills.
 * All forensic details appear inside the curved rectangular card on hover.
 */
function createVesselPointIcon(
  isDark: boolean,
  isSelected: boolean
) {
  const color = isDark ? "#EF3E42" : "#005A9C";
  const accentColor = isDark ? "#FF5252" : "#00D4E0";
  const size = isSelected ? 38 : 30;
  const dotSize = isSelected ? 18 : 15;

  const html = `
    <div style="
      position: relative;
      width: ${size}px;
      height: ${size}px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    ">
      <!-- Radar Ping Wave -->
      <div style="
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: ${isDark ? "rgba(239, 62, 66, 0.2)" : "rgba(0, 90, 156, 0.2)"};
        border: 1.5px solid ${color};
        animation: ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        opacity: 0.8;
      "></div>
      
      <!-- Target selection ring -->
      ${
        isSelected
          ? `<div style="
              position: absolute;
              inset: -5px;
              border: 2px dashed ${accentColor};
              border-radius: 50%;
              animation: spin 6s linear infinite;
            "></div>`
          : ""
      }

      <!-- Solid core radar target point with high-contrast white border -->
      <div style="
        width: ${dotSize}px;
        height: ${dotSize}px;
        border-radius: 50%;
        background: ${color};
        border: 2.5px solid #FFFFFF;
        box-shadow: 0 2px 8px rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
      ">
        <div style="
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #FFFFFF;
        "></div>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "custom-vessel-point-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Authentic Hydrographic Status Strip & Live Cursor Coordinate Tracker.
 */
function NauticalInformationStrip({ center }: { center: [number, number] }) {
  const map = useMap();
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: center[0],
    lng: center[1],
  });

  useEffect(() => {
    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.on("mousemove", handleMouseMove);
    return () => {
      map.off("mousemove", handleMouseMove);
    };
  }, [map]);

  const formatCoord = (val: number, isLat: boolean) => {
    const dir = isLat ? (val >= 0 ? "N" : "S") : val >= 0 ? "E" : "W";
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const min = ((abs - deg) * 60).toFixed(2);
    return `${deg}°${min}'${dir}`;
  };

  return (
    <div className="absolute bottom-3 left-4 z-[500] pointer-events-none select-none flex flex-col gap-1 text-white">
      <div className="bg-[#041527]/92 border border-[rgba(0,90,156,0.3)] rounded-xl px-3 py-1.5 backdrop-blur-md flex items-center gap-3.5 text-[10px] font-mono shadow-xl">
        <div className="flex items-center gap-2 pr-3 border-r border-white/15">
          <div className="flex flex-col items-center">
            <div className="w-14 h-1 border-b border-l border-r border-white/80" />
            <span className="text-[9px] text-[#93C5FD] font-semibold mt-0.5">2 NM · 3.7 KM</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pr-3 border-r border-white/15">
          <span className="text-[#38BDF8]">POS:</span>
          <span className="text-white font-bold tracking-wider">
            ${formatCoord(coords.lat, true)} ${formatCoord(coords.lng, false)}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-3 text-[9px] text-[#A3C0DC]">
          <span>DEPTH: ~72m (ARABIAN SHELF)</span>
          <span className="text-white/20">|</span>
          <span>← 48.2 NM TO MUMBAI (JNPT)</span>
        </div>
      </div>
    </div>
  );
}

export interface TridentMapInnerProps {
  center: [number, number];
  zoom?: number;
  height?: string | number;
  slickCoordinates?: [number, number][];
  slickCenter?: [number, number];
  heatmapPoints?: { lat: number; lng: number; intensity: number }[];
  candidates?: Candidate[];
  selectedVesselId?: string | null;
  onSelectVessel?: (vesselId: string) => void;
  driftVectors?: { lat: number; lng: number; u_curr: number; v_curr: number; time_hrs: number }[];
  overlays?: {
    showHeatmap?: boolean;
    heatmapDimmed?: boolean;
    showSlickPolygon?: boolean;
    showVessels?: boolean;
    showDriftVectors?: boolean;
    darkOnlyFilter?: boolean;
  };
  className?: string;
}

export default function TridentMapInner({
  center,
  zoom = 10,
  height = "100%",
  slickCoordinates,
  slickCenter,
  heatmapPoints = [],
  candidates = [],
  selectedVesselId,
  onSelectVessel,
  driftVectors = [],
  overlays = {
    showHeatmap: true,
    heatmapDimmed: false,
    showSlickPolygon: true,
    showVessels: true,
    showDriftVectors: true,
    darkOnlyFilter: false,
  },
  className,
}: TridentMapInnerProps) {
  const [activeLayers, setActiveLayers] = useState({
    showHeatmap: overlays.showHeatmap ?? true,
    heatmapDimmed: overlays.heatmapDimmed ?? false,
    showSlickPolygon: overlays.showSlickPolygon ?? true,
    showVessels: overlays.showVessels ?? true,
    showDriftVectors: overlays.showDriftVectors ?? true,
    showGraticule: true,
    darkOnlyFilter: overlays.darkOnlyFilter ?? false,
  });

  const [basemapStyle, setBasemapStyle] = useState<"satellite" | "ocean" | "dark" | "voyager">("satellite");
  const [isSimulatingBacktrack, setIsSimulatingBacktrack] = useState(true);
  const [replayTrigger, setReplayTrigger] = useState(0);

  useEffect(() => {
    setActiveLayers((prev) => ({
      ...prev,
      showHeatmap: overlays.showHeatmap ?? true,
      heatmapDimmed: overlays.heatmapDimmed ?? false,
      showSlickPolygon: overlays.showSlickPolygon ?? true,
      showVessels: overlays.showVessels ?? true,
      showDriftVectors: overlays.showDriftVectors ?? true,
      darkOnlyFilter: overlays.darkOnlyFilter ?? false,
    }));
  }, [overlays]);

  const polygonLatLngs: [number, number][] = useMemo(() => {
    return slickCoordinates?.map((coord) => [coord[1], coord[0]]) || [];
  }, [slickCoordinates]);

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (activeLayers.darkOnlyFilter) {
        return c.is_dark;
      }
      return true;
    });
  }, [candidates, activeLayers.darkOnlyFilter]);

  const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY || "cb1_2t44_1_e6a513ca214da31c552345b1";

  const getBasemapConfig = () => {
    switch (basemapStyle) {
      case "satellite":
        return {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
          maxZoom: 18,
        };
      case "ocean":
        return {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
          attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, GEBCO, NOAA, National Geographic',
          maxZoom: 16,
        };
      case "voyager":
        return {
          url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${cartoKey}`,
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          maxZoom: 19,
        };
      case "dark":
      default:
        return {
          url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${cartoKey}`,
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          maxZoom: 19,
        };
    }
  };

  const basemapConfig = getBasemapConfig();

  const handleReplaySimulation = () => {
    setIsSimulatingBacktrack(true);
    setReplayTrigger((prev) => prev + 1);
  };

  return (
    <div className={clsx("relative w-full h-full overflow-hidden bg-[#071322]", className)} style={{ height }}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%", background: "#071322" }}
        attributionControl={false}
      >
        <MapViewController center={center} zoom={zoom} />

        <TileLayer
          key={basemapStyle}
          url={basemapConfig.url}
          maxZoom={basemapConfig.maxZoom}
          subdomains="abcd"
          attribution={basemapConfig.attribution}
        />

        {/* 1. Nautical Graticule Grid */}
        <NauticalGraticule show={activeLayers.showGraticule} />

        {/* 2. Structured KDE Origin Probability Heatmap */}
        {activeLayers.showHeatmap && (
          <CanvasKDEHeatmap points={heatmapPoints} dimmed={activeLayers.heatmapDimmed} />
        )}

        {/* 3. OpenDrift Lagrangian Backtrack Particle Simulation */}
        <OpenDriftBacktrackAnimation
          slickCenter={slickCenter}
          originPoints={heatmapPoints}
          isAnimating={isSimulatingBacktrack}
          replayTrigger={replayTrigger}
          onComplete={() => setIsSimulatingBacktrack(false)}
        />

        {/* 4. SAR Detected Slick Boundary */}
        {activeLayers.showSlickPolygon && polygonLatLngs.length > 2 && (
          <>
            <Polygon
              positions={polygonLatLngs}
              pathOptions={{
                color: "#0284C7",
                fillColor: "#081626",
                fillOpacity: 0.65,
                weight: 1.5,
                stroke: true,
                lineCap: "round",
                lineJoin: "round",
              }}
            >
              <Popup>
                <div className="text-xs p-1.5">
                  <div className="font-heading text-sm text-[#005A9C]">SAR DETECTED OIL SLICK</div>
                  <div className="text-[#334E68] text-[11px] mt-0.5">
                    Sentinel-1 C-SAR Radar Backscatter Damping Anomaly
                  </div>
                  <div className="text-[10px] text-[#5A738E] mt-1 font-mono">
                    Area: 14.8 km² · VV Polarization
                  </div>
                </div>
              </Popup>
            </Polygon>

            <Polygon
              positions={polygonLatLngs}
              pathOptions={{
                color: "#38BDF8",
                fillColor: "transparent",
                fillOpacity: 0,
                weight: 1,
                dashArray: "3, 3",
                opacity: 0.6,
              }}
            />

            {slickCenter && (
              <CircleMarker
                center={slickCenter}
                radius={4}
                pathOptions={{
                  fillColor: "#38BDF8",
                  fillOpacity: 1,
                  color: "#FFFFFF",
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-xs p-1">
                    <strong className="text-[#005A9C]">SAR Slick Centroid</strong>
                    <div className="font-mono text-[10px]">
                      {slickCenter[0].toFixed(3)}° N, {slickCenter[1].toFixed(3)}° E
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )}
          </>
        )}

        {/* 5. Candidate Vessels — Point Markers with Curved Rectangular Hover Cards (NO permanent text pills) */}
        {activeLayers.showVessels &&
          filteredCandidates.map((vessel) => {
            const isSelected = vessel.vessel_id === selectedVesselId;
            const icon = createVesselPointIcon(
              vessel.is_dark,
              isSelected
            );

            return (
              <Marker
                key={vessel.vessel_id}
                position={[vessel.position.lat, vessel.position.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => onSelectVessel?.(vessel.vessel_id),
                }}
              >
                <Tooltip
                  direction="top"
                  offset={[0, -14]}
                  opacity={1}
                  className="vessel-custom-tooltip"
                >
                  <div className="w-[230px] bg-[#FFFFFF] border border-[rgba(0,90,156,0.25)] rounded-2xl overflow-hidden shadow-2xl text-left pointer-events-auto select-none p-0">
                    <div className="relative w-full h-24 bg-[#041527] overflow-hidden rounded-t-2xl">
                      <img
                        src={getVesselImage(vessel.vessel_id)}
                        alt={vessel.name_or_unidentified}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#041527]/85 via-transparent to-transparent" />
                      <div className="absolute top-2 right-2">
                        {vessel.is_dark ? (
                          <span className="text-[9px] bg-[#EF3E42] text-white px-2 py-0.5 rounded-full font-bold shadow-xs">
                            DARK TARGET
                          </span>
                        ) : (
                          <span className="text-[9px] bg-[#005A9C] text-white px-2 py-0.5 rounded-full font-bold shadow-xs">
                            AIS VERIFIED
                          </span>
                        )}
                      </div>
                      <div className="absolute bottom-1.5 left-2.5 right-2.5">
                        <div className="font-heading text-xs text-white uppercase tracking-wide truncate drop-shadow-md">
                          {vessel.name_or_unidentified}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 flex flex-col gap-1.5 bg-[#FFFFFF]">
                      <div className="flex items-center justify-between text-[10px] text-[#5A738E]">
                        <span>ID: <strong className="text-[#041527]">{vessel.vessel_id}</strong></span>
                        <span>{vessel.speed_knots || 12} kts · {vessel.course_deg || 0}°</span>
                      </div>
                      <div className="pt-2 border-t border-[rgba(0,90,156,0.12)] flex items-center justify-between">
                        <span className="text-[10px] text-[#5A738E] font-medium">Attribution Lead:</span>
                        <span className={clsx("font-heading text-sm", vessel.is_dark ? "text-[#EF3E42]" : "text-[#005A9C]")}>
                          {(vessel.confidence_score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[9px] text-[#005A9C] font-semibold text-center bg-[#EDF3FA] py-1 px-2 rounded-lg mt-0.5">
                        Click point to open full dossier →
                      </div>
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}

        <NauticalInformationStrip center={center} />
      </MapContainer>

      {/* Top-Left Nautical Compass & Hydrodynamic Vector Indicator */}
      <div className="absolute top-4 left-14 z-[500] pointer-events-none select-none flex items-center gap-2">
        <div className="bg-[#041527]/92 border border-[rgba(0,90,156,0.3)] rounded-xl px-2.5 py-1.5 backdrop-blur-md shadow-xl flex items-center gap-2">
          <div className="w-5 h-5 relative flex items-center justify-center">
            <div className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-b-[8px] border-b-[#EF4444] absolute top-0.5" />
            <div className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-t-[8px] border-t-[#64748B] absolute bottom-0.5" />
            <span className="text-[6.5px] font-bold text-[#EF4444] absolute -top-1 font-mono">N</span>
          </div>
          <div className="flex flex-col text-[8.5px] leading-tight">
            <span className="font-bold text-white tracking-wider">TRUE NORTH</span>
            <span className="text-[#93C5FD] font-mono text-[7.5px]">0.8°W VAR</span>
          </div>
        </div>

        <div className="hidden sm:flex bg-[#041527]/92 border border-[rgba(0,90,156,0.3)] rounded-xl px-2.5 py-1.5 backdrop-blur-md shadow-xl items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          <div className="flex flex-col text-[8.5px] leading-tight">
            <span className="text-[#93C5FD] font-bold uppercase tracking-wider">HYCOM 1/12° FORCING</span>
            <span className="text-white font-mono font-bold text-[9px]">038° @ 1.45 kts · 3% LEEWAY</span>
          </div>
        </div>
      </div>

      {/* Top-Right Floating Tactical Layer Controls */}
      <div className="absolute top-4 right-4 z-[500] bg-[#FFFFFF]/96 border border-[rgba(0,90,156,0.25)] rounded-2xl p-3 backdrop-blur-md flex flex-col gap-2 text-xs text-[#041527] select-none min-w-[205px] shadow-xl">
        <div className="flex items-center justify-between border-b border-[rgba(0,90,156,0.12)] pb-1.5 font-bold text-[10px] text-[#005A9C] uppercase tracking-wider">
          <span>TACTICAL OVERLAYS</span>
        </div>

        <button
          onClick={handleReplaySimulation}
          className="px-2.5 py-1.5 bg-[#005A9C] hover:bg-[#00477d] text-white rounded-xl text-[10px] font-bold tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full mb-1 shadow-xs"
        >
          <span className="material-symbols-outlined text-sm font-bold">
            {isSimulatingBacktrack ? "sync" : "replay"}
          </span>
          <span>{isSimulatingBacktrack ? "SIMULATION PLAYING..." : "REPLAY OPENDRIFT SIM"}</span>
        </button>

        <div className="flex flex-col gap-1.5 text-[11px]">
          <label className="flex items-center gap-2 cursor-pointer hover:text-[#005A9C]">
            <input
              type="checkbox"
              checked={activeLayers.showHeatmap}
              onChange={(e) =>
                setActiveLayers((prev) => ({ ...prev, showHeatmap: e.target.checked }))
              }
              className="accent-[#005A9C]"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#EF3E42] rounded-xs inline-block" /> Origin KDE Envelope
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:text-[#005A9C]">
            <input
              type="checkbox"
              checked={activeLayers.showSlickPolygon}
              onChange={(e) =>
                setActiveLayers((prev) => ({ ...prev, showSlickPolygon: e.target.checked }))
              }
              className="accent-[#005A9C]"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#0284C7] rounded-xs inline-block" /> SAR Slick Radar Damping
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:text-[#005A9C]">
            <input
              type="checkbox"
              checked={activeLayers.showGraticule}
              onChange={(e) =>
                setActiveLayers((prev) => ({ ...prev, showGraticule: e.target.checked }))
              }
              className="accent-[#005A9C]"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#93C5FD] rounded-xs inline-block" /> Nautical Graticule Grid
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:text-[#005A9C]">
            <input
              type="checkbox"
              checked={activeLayers.showVessels}
              onChange={(e) =>
                setActiveLayers((prev) => ({ ...prev, showVessels: e.target.checked }))
              }
              className="accent-[#005A9C]"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#005A9C] rounded-xs inline-block" /> AIS / Dark Vessels
            </span>
          </label>
        </div>
      </div>

      {/* Bottom-Right Professional GIS Basemap Switcher */}
      <div className="absolute bottom-3 right-4 z-[500] bg-[#041527]/92 border border-[rgba(0,90,156,0.3)] rounded-xl p-1 backdrop-blur-md flex items-center gap-1 shadow-xl select-none">
        {(["satellite", "ocean", "dark", "voyager"] as const).map((id) => {
          const isSelected = basemapStyle === id;
          const labels = {
            satellite: "SATELLITE",
            ocean: "BATHYMETRY",
            dark: "TACTICAL",
            voyager: "CHART",
          };

          return (
            <button
              key={id}
              onClick={() => setBasemapStyle(id)}
              className={clsx(
                "px-2 py-1 rounded-lg text-[9.5px] font-mono font-bold tracking-wider transition-all cursor-pointer",
                isSelected
                  ? "bg-[#005A9C] text-white shadow-xs"
                  : "text-[#A3C0DC] hover:text-white hover:bg-white/10"
              )}
            >
              {labels[id]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
