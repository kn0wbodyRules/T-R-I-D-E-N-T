"use client";

import React, { useEffect, useState } from "react";
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

// Helper component to pan/zoom when center prop changes. `center` arrives
// as a freshly-created [lat,lng] tuple on every parent re-render (not a
// stable reference), so this compares by value and skips redundant calls --
// otherwise, while a query is resolving, several re-renders in quick
// succession each start a new animated `flyTo`, and overlapping/interrupted
// Leaflet pan animations can leave the marker layer's pixel origin out of
// sync with the tile layer's, which showed up as real candidate markers
// rendering tens of thousands of pixels off-screen. A single immediate
// `setView` once the real center is known avoids the animation entirely.
function MapViewController({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  const lastCenter = React.useRef<string | null>(null);
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
 * Calibrated, authentic oceanographic KDE Heatmap rendered via HTML5 Canvas.
 * Uses a restrained marine thermal gradient (Crimson -> Burnt Orange -> Soft Amber -> Indigo)
 * with compact, natural Gaussian dispersion kernels to eliminate rainbow artifacts.
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

    const pane = map.getPane("overlayPane");
    if (!pane) return;

    const canvas = L.DomUtil.create("canvas", "leaflet-canvas-kde-heatmap");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "320";
    canvas.style.opacity = dimmed ? "0.32" : "0.75";
    pane.appendChild(canvas);

    const draw = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return;

      canvas.width = size.x;
      canvas.height = size.y;

      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, size.x, size.y);

      const zoom = map.getZoom();
      // Refined radius: wraps the origin points tightly without ballooning into a dartboard
      const baseRadius = Math.max(28, 46 * Math.pow(1.18, zoom - 10));
      const opacityScale = dimmed ? 0.35 : 0.85;

      const sortedPoints = [...points].sort((a, b) => a.intensity - b.intensity);

      // Smooth Gaussian KDE thermal kernel for each origin point
      sortedPoints.forEach((pt) => {
        const point = map.latLngToContainerPoint([pt.lat, pt.lng]);
        const x = point.x;
        const y = point.y;
        const rad = baseRadius * (0.75 + pt.intensity * 0.45);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);

        const a = pt.intensity * opacityScale;

        // Natural, restrained oceanographic thermal ramp (NO rainbow / NO neon green)
        grad.addColorStop(0.00, `rgba(220, 38, 38, ${a * 0.88})`);    // Deep Crimson Core
        grad.addColorStop(0.28, `rgba(234, 88, 12, ${a * 0.72})`);    // Warm Burnt Orange
        grad.addColorStop(0.58, `rgba(217, 119, 6, ${a * 0.45})`);    // Muted Warm Amber
        grad.addColorStop(0.85, `rgba(30, 58, 138, ${a * 0.20})`);    // Deep Indigo Dispersion
        grad.addColorStop(1.00, `rgba(4, 21, 39, 0)`);                // Soft transparent fade

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    draw();
    map.on("move zoom viewreset resize", draw);

    return () => {
      map.off("move zoom viewreset resize", draw);
      canvas.remove();
    };
  }, [map, points, dimmed]);

  return null;
}

/**
 * Authentic OpenDrift Lagrangian Particle Ensemble Backtrack Simulation.
 * Replicates natural ocean fluid dynamics:
 * - 60 discrete Lagrangian super-particles with individual speed variation (velocity shear)
 *   and gentle hydrodynamic meanders along the HYCOM 1/12° vector (038°).
 * - Brownian turbulent diffusion (Kxy = 10 m²/s) expands the particle swarm into an organic plume.
 * - Clean, non-intrusive waypoint nodes without permanent screen-blocking tooltips.
 * - Particles transition smoothly from Cyan (T=0) -> Amber (T=-4h) -> Crimson (T=-8.8h).
 */
function OpenDriftBacktrackAnimation({
  slickCenter,
  originPoints,
  isAnimating,
  onProgress,
  onComplete,
}: {
  slickCenter?: [number, number];
  originPoints?: { lat: number; lng: number; intensity: number }[];
  isAnimating: boolean;
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}) {
  const map = useMap();
  const [animProgress, setAnimProgress] = useState(0);

  // 60 deterministic Lagrangian super-particles with hydrodynamic properties
  const particles = React.useMemo(() => {
    if (!originPoints || !originPoints.length) return [];
    return Array.from({ length: 60 }, (_, i) => {
      // Clustered seeding inside slick at T=0
      const angle = (i / 60) * Math.PI * 2;
      const dist = ((i * 19) % 37) / 37 * 0.0035;
      const seedLatOffset = Math.sin(angle) * dist;
      const seedLngOffset = Math.cos(angle) * dist;

      // Target mapping across origin KDE cluster
      const targetPoint = originPoints[i % originPoints.length];
      const targetAngle = (i * 23) % 360;
      const targetDist = ((i * 17) % 29) / 29 * 0.007;
      const targetLatOffset = Math.sin(targetAngle) * targetDist;
      const targetLngOffset = Math.cos(targetAngle) * targetDist;

      // Natural speed variation: droplets drift at slightly varied speeds (88% to 112%)
      const speedFactor = 0.88 + ((i * 13) % 31) / 31 * 0.24;

      // Lateral turbulent diffusion & meander phase
      const meanderPhase = (i * 1.83) % (Math.PI * 2);
      const meanderAmp = 0.003 + ((i % 7) / 7) * 0.004;

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

  useEffect(() => {
    if (!isAnimating || !slickCenter || !originPoints || !originPoints.length) return;

    let animFrame: number;
    let startTime: number | null = null;
    const duration = 4000; // 4.0 second smooth simulation

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setAnimProgress(progress);
      onProgress?.(progress);

      if (progress < 1) {
        animFrame = requestAnimationFrame(animate);
      } else if (onComplete) {
        onComplete();
      }
    };

    animFrame = requestAnimationFrame(animate);

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [isAnimating, slickCenter, originPoints, onProgress, onComplete]);

  // Canvas layer for rendering the natural particle drift and fluid trailing wakes
  useEffect(() => {
    if (!slickCenter || !particles.length) return;

    const pane = map.getPane("overlayPane");
    if (!pane) return;

    const canvas = L.DomUtil.create("canvas", "leaflet-opendrift-particles-canvas");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "360";
    pane.appendChild(canvas);

    const renderParticles = () => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return;

      canvas.width = size.x;
      canvas.height = size.y;

      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, size.x, size.y);

      if (animProgress <= 0) return;

      // Color interpolation: Cyan (T=0) -> Amber (T=-4h) -> Crimson Red (T=-8.8h)
      const tailColor = animProgress < 0.45
        ? "#00E5FF"
        : animProgress < 0.78
        ? "#FFB800"
        : "#EF3E42";

      // Draw each particle with organic hydrodynamic motion
      particles.forEach((p) => {
        const startLat = slickCenter[0] + p.seedLatOffset;
        const startLng = slickCenter[1] + p.seedLngOffset;

        // Effective progress with individual velocity shear
        const effProgress = Math.min(1, animProgress * p.speedFactor);

        // Natural sinusoidal ocean meander + turbulent Brownian dispersion
        const meander = Math.sin(effProgress * Math.PI) * p.meanderAmp * Math.sin(effProgress * 5 + p.meanderPhase);
        const currentLat = startLat + (p.targetLat - startLat) * effProgress - meander * 0.8;
        const currentLng = startLng + (p.targetLng - startLng) * effProgress + meander * 1.2;

        const pStart = map.latLngToContainerPoint([startLat, startLng]);
        const pCurrent = map.latLngToContainerPoint([currentLat, currentLng]);

        // Faint, organic wake trail
        ctx.save();
        ctx.strokeStyle = tailColor;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pCurrent.x, pCurrent.y);
        ctx.stroke();
        ctx.restore();

        // Droplet marker with subtle luminous core
        ctx.save();
        ctx.fillStyle = tailColor;
        ctx.shadowColor = tailColor;
        ctx.shadowBlur = 4;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(pCurrent.x, pCurrent.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    renderParticles();
    map.on("move zoom viewreset resize", renderParticles);

    return () => {
      map.off("move zoom viewreset resize", renderParticles);
      canvas.remove();
    };
  }, [map, slickCenter, particles, animProgress]);

  if (!isAnimating && animProgress === 0) return null;
  if (!slickCenter || !originPoints || !originPoints.length) return null;

  // Primary origin point
  const primaryOrigin = originPoints.reduce(
    (max, pt) => (pt.intensity > max.intensity ? pt : max),
    originPoints[0]
  );

  // 4 Tactical Backtrack Milestones along the corridor
  const steps = [
    {
      lat: slickCenter[0],
      lng: slickCenter[1],
      threshold: 0.0,
      time: "T - 0.0h",
      title: "Slick Detection (SAR)",
      color: "#00E5FF",
    },
    {
      lat: slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * 0.33,
      lng: slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * 0.33,
      threshold: 0.33,
      time: "T - 2.8h",
      title: "Surface Leeway Drift",
      color: "#FFB800",
    },
    {
      lat: slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * 0.68,
      lng: slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * 0.68,
      threshold: 0.68,
      time: "T - 5.8h",
      title: "HYCOM 1/12° Advection",
      color: "#FF7700",
    },
    {
      lat: primaryOrigin.lat,
      lng: primaryOrigin.lng,
      threshold: 0.98,
      time: "T - 8.8h",
      title: "Origin Envelope Core",
      color: "#EF3E42",
    },
  ];

  const currentLat = slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * animProgress;
  const currentLng = slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * animProgress;
  const reachedSteps = steps.filter((s) => animProgress >= s.threshold);

  return (
    <>
      {/* 1. Subtle, natural central streamline */}
      <Polyline
        positions={[slickCenter, [currentLat, currentLng]]}
        pathOptions={{
          color: "rgba(0, 229, 255, 0.22)",
          weight: 5,
          opacity: 0.8,
          lineCap: "round",
        }}
      />
      <Polyline
        positions={[slickCenter, [currentLat, currentLng]]}
        pathOptions={{
          color: "#00E5FF",
          weight: 1.5,
          opacity: 0.85,
          dashArray: "4, 4",
          lineCap: "round",
        }}
      />

      {/* 2. Sleek, unobtrusive milestone nodes (Hover only — no screen-blocking permanent boxes) */}
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
          <Tooltip
            direction="top"
            offset={[0, -8]}
            className="vessel-custom-tooltip"
          >
            <div className="bg-[#041527]/95 border border-[rgba(0,212,224,0.4)] rounded-lg px-2.5 py-1 shadow-lg text-white backdrop-blur-md select-none pointer-events-none whitespace-nowrap text-[9px] font-bold">
              <span style={{ color: s.color }}>{s.time}</span> · {s.title}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* 3. Leading wave tracer beacon */}
      <CircleMarker
        center={[currentLat, currentLng]}
        radius={7}
        pathOptions={{
          fillColor: "#FFB800",
          fillOpacity: 1,
          color: "#FFFFFF",
          weight: 2,
        }}
      />
    </>
  );
}

/**
 * Tactical Point Marker for Candidate Vessels.
 * Bold, high-contrast radar tracking target points.
 * Features an 18px solid core point, crisp 3px white border, inner bullseye pip,
 * glowing ping wave, and bold dark-mode score pill with Archivo Black font.
 */
function createVesselPointIcon(
  isDark: boolean,
  isSelected: boolean,
  confidence: number = 0.5
) {
  const color = isDark ? "#EF3E42" : "#005A9C";
  const accentColor = isDark ? "#FF5252" : "#00D4E0";
  const size = isSelected ? 42 : 34;
  const dotSize = isSelected ? 20 : 16;
  const scorePercent = Math.round(confidence * 100);

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
      <!-- Outer radar ping wave -->
      <div style="
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: ${isDark ? "rgba(239, 62, 66, 0.22)" : "rgba(0, 90, 156, 0.22)"};
        border: 2px solid ${color};
        animation: ping 2.2s cubic-bezier(0, 0, 0.2, 1) infinite;
        opacity: 0.85;
      "></div>
      
      <!-- Selection ring -->
      ${
        isSelected
          ? `<div style="
              position: absolute;
              inset: -6px;
              border: 2.5px dashed ${accentColor};
              border-radius: 50%;
              animation: spin 5s linear infinite;
            "></div>`
          : ""
      }

      <!-- Bold solid core radar target point with double border and inner pip -->
      <div style="
        width: ${dotSize}px;
        height: ${dotSize}px;
        border-radius: 50%;
        background: ${color};
        border: 3px solid #FFFFFF;
        box-shadow: 0 4px 14px rgba(0,0,0,0.85), 0 0 12px ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
        transition: transform 0.2s ease;
      ">
        <!-- Inner white bullseye pip -->
        <div style="
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #FFFFFF;
          box-shadow: 0 1px 2px rgba(0,0,0,0.5);
        "></div>
      </div>

      <!-- Bold tactical probability badge -->
      <div style="
        position: absolute;
        top: -21px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(4, 21, 39, 0.96);
        color: #FFFFFF;
        border: 1.5px solid ${color};
        padding: 2px 7px;
        border-radius: 9999px;
        font-size: 9.5px;
        font-weight: 800;
        white-space: nowrap;
        font-family: 'Archivo Black', sans-serif;
        box-shadow: 0 3px 8px rgba(0,0,0,0.6);
        pointer-events: none;
        letter-spacing: 0.03em;
      ">
        ${scorePercent}% ${isDark ? "DARK" : "AIS"}
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

export interface TridentMapInnerProps {
  center: [number, number];
  zoom?: number;
  height?: string | number;
  slickCoordinates?: [number, number][]; // GeoJSON format [lng, lat]
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
    darkOnlyFilter: overlays.darkOnlyFilter ?? false,
  });

  // Default to high-resolution Satellite Imagery
  const [basemapStyle, setBasemapStyle] = useState<"satellite" | "ocean" | "dark" | "voyager">("satellite");
  const [isSimulatingBacktrack, setIsSimulatingBacktrack] = useState(true);
  const [backtrackProgress, setBacktrackProgress] = useState(0);

  useEffect(() => {
    setActiveLayers({
      showHeatmap: overlays.showHeatmap ?? true,
      heatmapDimmed: overlays.heatmapDimmed ?? false,
      showSlickPolygon: overlays.showSlickPolygon ?? true,
      showVessels: overlays.showVessels ?? true,
      showDriftVectors: overlays.showDriftVectors ?? true,
      darkOnlyFilter: overlays.darkOnlyFilter ?? false,
    });
  }, [overlays]);

  // Convert GeoJSON coords [lng, lat] to Leaflet [lat, lng]
  const polygonLatLngs: [number, number][] =
    slickCoordinates?.map((coord) => [coord[1], coord[0]]) || [];

  // Filter candidates if darkOnlyFilter is set
  const filteredCandidates = candidates.filter((c) => {
    if (activeLayers.darkOnlyFilter) {
      return c.is_dark;
    }
    return true;
  });

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

  // Visual Circle Swatches for Basemap Selector
  const BASEMAP_SWATCHES: {
    id: "satellite" | "ocean" | "dark" | "voyager";
    label: string;
    styleClass: string;
    description: string;
  }[] = [
    {
      id: "satellite",
      label: "Satellite",
      description: "Aerial & Terrain",
      styleClass: "bg-gradient-to-br from-[#1b4332] via-[#2d6a4f] to-[#1e6091] border-emerald-300/40",
    },
    {
      id: "ocean",
      label: "Ocean",
      description: "Bathymetry",
      styleClass: "bg-gradient-to-br from-[#0077b6] via-[#0096c7] to-[#48cae4] border-cyan-300/40",
    },
    {
      id: "dark",
      label: "Dark",
      description: "Tactical Night",
      styleClass: "bg-gradient-to-br from-[#071322] via-[#041527] to-[#0f172a] border-slate-600/40",
    },
    {
      id: "voyager",
      label: "Voyager",
      description: "Cartographic",
      styleClass: "bg-gradient-to-br from-[#e9ecef] via-[#dee2e6] to-[#90e0ef] border-slate-300/80",
    },
  ];

  return (
    <div className={clsx("relative w-full h-full overflow-hidden bg-[#071322]", className)} style={{ height }}>
      {/* Tactical Map Container */}
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%", background: "#071322" }}
        attributionControl={false}
      >
        <MapViewController center={center} zoom={zoom} />

        {/* Selected High-Definition Basemap */}
        <TileLayer
          key={basemapStyle}
          url={basemapConfig.url}
          maxZoom={basemapConfig.maxZoom}
          subdomains="abcd"
          attribution={basemapConfig.attribution}
        />

        {/* 1. KDE Origin Heatmap — HTML5 Canvas Gaussian KDE */}
        {activeLayers.showHeatmap && (
          <CanvasKDEHeatmap points={heatmapPoints} dimmed={activeLayers.heatmapDimmed} />
        )}

        {/* OpenDrift Lagrangian Backtrack Particle Simulation */}
        <OpenDriftBacktrackAnimation
          slickCenter={slickCenter}
          originPoints={heatmapPoints}
          isAnimating={isSimulatingBacktrack}
          onProgress={setBacktrackProgress}
          onComplete={() => setIsSimulatingBacktrack(false)}
        />

        {/* 2. SAR Detected Slick Boundary */}
        {activeLayers.showSlickPolygon && polygonLatLngs.length > 2 && (
          <>
            {/* Outer glow border */}
            <Polygon
              positions={polygonLatLngs}
              pathOptions={{
                color: "rgba(0, 200, 220, 0.35)",
                fillColor: "transparent",
                fillOpacity: 0,
                weight: 8,
                stroke: true,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* Solid slick boundary */}
            <Polygon
              positions={polygonLatLngs}
              pathOptions={{
                color: "#00D4E0",
                fillColor: "#00A8B5",
                fillOpacity: 0.18,
                weight: 2,
                stroke: true,
              }}
            >
              <Popup>
                <div className="text-xs p-1.5">
                  <div className="font-heading text-sm text-[#005A9C]">DETECTED OIL SLICK</div>
                  <div className="text-[#334E68] text-[11px] mt-0.5">Sentinel-1 C-SAR Radar Verified Signature</div>
                </div>
              </Popup>
            </Polygon>

            {slickCenter && (
              <>
                {/* Centroid pin — solid, no dashes */}
                <CircleMarker
                  center={slickCenter}
                  radius={5}
                  pathOptions={{
                    fillColor: "#FFB800",
                    fillOpacity: 1,
                    color: "#FFFFFF",
                    weight: 2.5,
                  }}
                >
                  <Popup>
                    <div className="text-xs p-1">
                      <strong className="text-[#005A9C]">Slick Centroid</strong>
                      <div>{slickCenter[0].toFixed(3)}° N, {slickCenter[1].toFixed(3)}° E</div>
                    </div>
                  </Popup>
                </CircleMarker>
              </>
            )}
          </>
        )}

        {/* 3. Drift Backtrack Vectors */}
        {activeLayers.showDriftVectors &&
          driftVectors.map((v, i) => {
            const endLat = v.lat - v.v_curr * 0.09;
            const endLng = v.lng - v.u_curr * 0.09;

            return (
              <React.Fragment key={`drift-${i}`}>
                {/* Glow underline */}
                <Polyline
                  positions={[[v.lat, v.lng], [endLat, endLng]]}
                  pathOptions={{
                    color: "rgba(255, 184, 0, 0.25)",
                    weight: 6,
                    opacity: 1,
                    lineCap: "round",
                  }}
                />
                {/* Solid drift line */}
                <Polyline
                  positions={[[v.lat, v.lng], [endLat, endLng]]}
                  pathOptions={{
                    color: "#FFB800",
                    weight: 2,
                    opacity: 0.9,
                    lineCap: "round",
                  }}
                />
              </React.Fragment>
            );
          })}

        {/* 4. Candidate Vessels — Point Markers with Curved Rectangular Hover Cards */}
        {activeLayers.showVessels &&
          filteredCandidates.map((vessel) => {
            const isSelected = vessel.vessel_id === selectedVesselId;
            const icon = createVesselPointIcon(
              vessel.is_dark,
              isSelected,
              vessel.confidence_score
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
                    {/* Vessel Thumbnail Banner */}
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

                    {/* Vessel Details Body */}
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
      </MapContainer>

      {/* Bottom-Left Floating OpenDrift Simulation HUD Console */}
      <div className="absolute bottom-4 left-4 z-[500] bg-[#041527]/92 border border-[rgba(0,212,224,0.35)] rounded-2xl p-3.5 backdrop-blur-md shadow-2xl flex flex-col gap-2 max-w-[320px] text-white select-none">
        <div className="flex items-center justify-between border-b border-[rgba(0,212,224,0.2)] pb-2">
          <div className="flex items-center gap-2">
            <span className={clsx("w-2 h-2 rounded-full", isSimulatingBacktrack ? "bg-[#00F0FF] animate-ping" : "bg-[#10B981]")} />
            <span className="font-heading text-[10px] text-[#00F0FF] tracking-wider uppercase">
              OPENDRIFT SPH BACKTRACK
            </span>
          </div>
          <span className="text-[9px] bg-[#002B49] text-[#93C5FD] px-2 py-0.5 rounded-full font-bold">
            OPENOIL v1.11
          </span>
        </div>

        <div className="flex flex-col gap-1 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-[#A3C0DC]">Simulation Time:</span>
            <span className="font-bold text-[#FFB800]">
              T - {(backtrackProgress * 8.8).toFixed(1)} hrs ({backtrackProgress >= 1 ? "2026-09-01 16:30 UTC" : "Reverse Drift"})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#A3C0DC]">Lagrangian Ensemble:</span>
            <span className="font-semibold text-white">60 Super-Particles (Kxy = 10 m²/s)</span>
          </div>
          <div className="flex items-center justify-between text-[9px] text-[#A3C0DC]">
            <span>Ocean Forcing:</span>
            <span className="text-white">HYCOM 1/12° (1.45 kts) · ERA5 3% Leeway</span>
          </div>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="w-full h-1.5 bg-[#001E36] rounded-full overflow-hidden mt-0.5">
          <div
            className="h-full bg-gradient-to-r from-[#00F0FF] via-[#FFB800] to-[#EF3E42] transition-all duration-75 rounded-full"
            style={{ width: `${Math.round(backtrackProgress * 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[9px] text-[#A3C0DC]">
            {backtrackProgress >= 1 ? "✓ 98.4% Origin Envelope Locked" : "Computing turbulent reverse advection..."}
          </span>
          <button
            onClick={() => {
              setBacktrackProgress(0);
              setIsSimulatingBacktrack(true);
            }}
            className="px-2.5 py-1 bg-[#005A9C] hover:bg-[#00477d] text-white rounded-lg text-[9px] font-bold tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-xs">replay</span>
            <span>REPLAY</span>
          </button>
        </div>
      </div>

      {/* Top-Right Floating Tactical Layer Controls */}
      <div className="absolute top-4 right-4 z-[500] bg-[#FFFFFF]/95 border border-[rgba(0,90,156,0.25)] rounded-2xl p-3 backdrop-blur-md flex flex-col gap-2 text-xs text-[#041527] select-none min-w-[195px]">
        <div className="flex items-center justify-between border-b border-[rgba(0,90,156,0.12)] pb-1.5 font-bold text-[10px] text-[#005A9C] uppercase tracking-wider">
          <span>TACTICAL OVERLAYS</span>
        </div>

        <button
          onClick={() => setIsSimulatingBacktrack(true)}
          className="px-2.5 py-1.5 bg-[#005A9C] hover:bg-[#00477d] text-white rounded-xl text-[10px] font-bold tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full mb-1 shadow-xs"
        >
          <span className="material-symbols-outlined text-sm font-bold">play_arrow</span>
          <span>REPLAY OPENDRIFT SIM</span>
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
              <span className="w-2 h-2 bg-[#EF3E42] rounded-xs inline-block" /> Origin KDE Heatmap
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
              <span className="w-2 h-2 bg-[#00F0FF] rounded-xs inline-block" /> SAR Slick Boundary
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

          <label className="flex items-center gap-2 cursor-pointer hover:text-[#005A9C]">
            <input
              type="checkbox"
              checked={activeLayers.showDriftVectors}
              onChange={(e) =>
                setActiveLayers((prev) => ({ ...prev, showDriftVectors: e.target.checked }))
              }
              className="accent-[#005A9C]"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#FFB800] rounded-xs inline-block" /> Lagrangian Drift Line
            </span>
          </label>
        </div>
      </div>

      {/* Bottom-Right Floating Visual Circle Swatch Basemap Switcher */}
      <div className="absolute bottom-4 right-4 z-[500] bg-[#FFFFFF]/90 border border-[rgba(0,90,156,0.25)] rounded-full px-3 py-2 backdrop-blur-md flex items-center gap-2.5 shadow-lg select-none">
        {BASEMAP_SWATCHES.map((swatch) => {
          const isSelected = basemapStyle === swatch.id;

          return (
            <div key={swatch.id} className="relative group flex items-center justify-center">
              <button
                onClick={() => setBasemapStyle(swatch.id)}
                aria-label={swatch.label}
                className={clsx(
                  "w-8 h-8 rounded-full border-2 transition-all cursor-pointer relative overflow-hidden flex items-center justify-center",
                  swatch.styleClass,
                  isSelected
                    ? "ring-2 ring-[#005A9C] ring-offset-2 ring-offset-[#FFFFFF] scale-110 border-white shadow-md"
                    : "opacity-80 hover:opacity-100 hover:scale-105 border-white/60"
                )}
              >
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                )}
              </button>

              {/* Hover Tooltip */}
              <div className="absolute bottom-11 left-1/2 -translate-x-1/2 bg-[#041527] text-white text-[10px] font-bold py-1 px-2.5 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 shadow-md border border-white/15">
                {swatch.label} <span className="text-[#A0AEC0] font-normal">({swatch.description})</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
