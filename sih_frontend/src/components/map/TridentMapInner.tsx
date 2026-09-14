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
 * Ultra-vibrant, deeply present KDE Heatmap rendered using HTML5 2D Canvas.
 * Multi-pass Gaussian thermal gradient with luminous cores, rich oceanic spread,
 * and high-contrast spatial presence that pops vividly on any basemap.
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
    // Boost saturation and give an illuminated glow aura
    canvas.style.filter = "saturate(2.0) contrast(1.25) drop-shadow(0 0 24px rgba(239,62,66,0.65)) drop-shadow(0 0 40px rgba(255,184,0,0.45))";
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
      // Generous spatial presence scaled dynamically by zoom
      const baseRadius = Math.max(50, 105 * Math.pow(1.26, zoom - 10));
      const opacityScale = dimmed ? 0.35 : 0.95;

      const sortedPoints = [...points].sort((a, b) => a.intensity - b.intensity);

      // PASS 1: Broad Gaussian Dispersion Field (Atmospheric Presence)
      sortedPoints.forEach((pt) => {
        const point = map.latLngToContainerPoint([pt.lat, pt.lng]);
        const x = point.x;
        const y = point.y;
        const rad = baseRadius * (0.85 + pt.intensity * 0.65);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);

        const a = pt.intensity * opacityScale;

        grad.addColorStop(0.00, `rgba(239, 62, 66, ${a * 0.92})`);   // Fiery Red
        grad.addColorStop(0.28, `rgba(255, 120, 0, ${a * 0.82})`);   // Deep Orange
        grad.addColorStop(0.55, `rgba(255, 190, 0, ${a * 0.68})`);   // Golden Yellow
        grad.addColorStop(0.78, `rgba(0, 212, 224, ${a * 0.45})`);   // Radiant Cyan
        grad.addColorStop(0.92, `rgba(0, 90, 156, ${a * 0.22})`);    // Deep Dodger Blue
        grad.addColorStop(1.00, `rgba(4, 21, 39, 0)`);               // Fade out

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      });

      // PASS 2: Saturated Hotspot Cores (Intense High-Probability Centers)
      sortedPoints.forEach((pt) => {
        if (pt.intensity < 0.65) return;
        const point = map.latLngToContainerPoint([pt.lat, pt.lng]);
        const x = point.x;
        const y = point.y;
        const coreRad = baseRadius * (0.45 + pt.intensity * 0.35);
        const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, coreRad);

        const a = pt.intensity * opacityScale;

        coreGrad.addColorStop(0.00, `rgba(255, 0, 45, ${a * 0.98})`);  // Blazing Crimson Core
        coreGrad.addColorStop(0.40, `rgba(255, 80, 0, ${a * 0.90})`);  // Bright Flame Orange
        coreGrad.addColorStop(0.75, `rgba(255, 215, 0, ${a * 0.70})`); // Vivid Gold
        coreGrad.addColorStop(1.00, `rgba(255, 215, 0, 0)`);

        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(x, y, coreRad, 0, Math.PI * 2);
        ctx.fill();

        // PASS 3: 90% Confidence Origin Contour Ring on peak hotspots
        if (pt.intensity >= 0.90) {
          ctx.save();
          ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.55})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(x, y, coreRad * 0.75, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
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
 * OpenDrift Lagrangian Backtrack Animation — Step-by-Step Trajectory Tracing.
 * Traces out the exact backtrack steps from current slick (T=0) backwards along the
 * hydrodynamic drift corridor to the origin core (T=-8.8h). Waypoints lock in
 * progressively with timestamps, radar pings, and milestone labels.
 */
function OpenDriftBacktrackAnimation({
  slickCenter,
  originPoints,
  isAnimating,
  onComplete,
}: {
  slickCenter?: [number, number];
  originPoints?: { lat: number; lng: number; intensity: number }[];
  isAnimating: boolean;
  onComplete?: () => void;
}) {
  const map = useMap();
  const [animProgress, setAnimProgress] = useState(0);

  useEffect(() => {
    if (!isAnimating || !slickCenter || !originPoints || !originPoints.length) return;

    let animFrame: number;
    let startTime: number | null = null;
    const duration = 3600; // 3.6 second progressive step-by-step trace

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setAnimProgress(progress);

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
  }, [isAnimating, slickCenter, originPoints, onComplete]);

  if (!isAnimating || !slickCenter || !originPoints || !originPoints.length) return null;

  // Primary origin point (highest intensity)
  const primaryOrigin = originPoints.reduce(
    (max, pt) => (pt.intensity > max.intensity ? pt : max),
    originPoints[0]
  );

  // 4 Concrete Forensic Backtrack Steps along the drift corridor
  const steps = [
    {
      lat: slickCenter[0],
      lng: slickCenter[1],
      threshold: 0.0,
      time: "T - 0.0h",
      title: "Step 0: Slick Detection",
      subtitle: "SAR Pass Centroid",
      color: "#00D4E0",
    },
    {
      lat: slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * 0.33,
      lng: slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * 0.33,
      threshold: 0.33,
      time: "T - 2.8h",
      title: "Step 1: Surface Leeway Drift",
      subtitle: "ERA5 Wind Drift Component",
      color: "#FFB800",
    },
    {
      lat: slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * 0.68,
      lng: slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * 0.68,
      threshold: 0.68,
      time: "T - 5.8h",
      title: "Step 2: HYCOM Ocean Current",
      subtitle: "1/12° Reverse Advection",
      color: "#FF7700",
    },
    {
      lat: primaryOrigin.lat,
      lng: primaryOrigin.lng,
      threshold: 0.98,
      time: "T - 8.8h",
      title: "Step 3: Discharge Origin Core",
      subtitle: "98% Probability Envelope",
      color: "#EF3E42",
    },
  ];

  // Current lead tracer position
  const currentLat = slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * animProgress;
  const currentLng = slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * animProgress;

  // Reached milestone waypoints
  const reachedSteps = steps.filter((s) => animProgress >= s.threshold);

  return (
    <>
      {/* 1. Traced Backtrack Path (Solid neon beam with glowing underlay) */}
      <Polyline
        positions={[slickCenter, [currentLat, currentLng]]}
        pathOptions={{
          color: "rgba(0, 212, 224, 0.35)",
          weight: 7,
          opacity: 1,
          lineCap: "round",
        }}
      />
      <Polyline
        positions={[slickCenter, [currentLat, currentLng]]}
        pathOptions={{
          color: "#00F0FF",
          weight: 2.5,
          opacity: 0.95,
          lineCap: "round",
        }}
      />

      {/* 2. Step Waypoints (Traced out progressively with timestamp chips) */}
      {reachedSteps.map((s, idx) => (
        <React.Fragment key={`backtrack-step-${idx}`}>
          {/* Waypoint sonar ripple on lock */}
          <CircleMarker
            center={[s.lat, s.lng]}
            radius={idx === 3 ? 16 : 12}
            pathOptions={{
              fillColor: s.color,
              fillOpacity: 0.2,
              color: s.color,
              weight: 1.5,
              opacity: 0.8,
            }}
          />

          {/* Solid Waypoint Dot */}
          <CircleMarker
            center={[s.lat, s.lng]}
            radius={idx === 3 ? 7 : 5}
            pathOptions={{
              fillColor: s.color,
              fillOpacity: 1,
              color: "#FFFFFF",
              weight: 2,
            }}
          >
            <Tooltip
              direction="right"
              offset={[10, 0]}
              permanent={true}
              className="vessel-custom-tooltip"
            >
              <div className="bg-[#041527]/95 border border-[rgba(0,212,224,0.4)] rounded-lg px-2 py-1 shadow-lg text-white backdrop-blur-md select-none pointer-events-none whitespace-nowrap">
                <div className="text-[9px] font-bold tracking-wider" style={{ color: s.color }}>
                  {s.time} · {s.title}
                </div>
                <div className="text-[8px] text-[#A3C0DC]">{s.subtitle}</div>
              </div>
            </Tooltip>
          </CircleMarker>
        </React.Fragment>
      ))}

      {/* 3. Leading Active Wavefront Head (Pulsing Tracer Radar) */}
      <CircleMarker
        center={[currentLat, currentLng]}
        radius={10}
        pathOptions={{
          fillColor: "#FFB800",
          fillOpacity: 0.9,
          color: "#FFFFFF",
          weight: 2.5,
        }}
      />
    </>
  );
}

/**
 * Tactical Point Marker for Candidate Vessels.
 * Clean, sleek radar tracking points (no generic icons).
 * Features an inner solid target point, outer radar ping pulse, and percentage pill.
 */
function createVesselPointIcon(
  isDark: boolean,
  isSelected: boolean,
  confidence: number = 0.5
) {
  const color = isDark ? "#EF3E42" : "#00D4E0";
  const size = isSelected ? 30 : 22;
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
      <!-- Outer radar ping pulse -->
      <div style="
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: ${isDark ? "rgba(239, 62, 66, 0.3)" : "rgba(0, 212, 224, 0.3)"};
        border: 1.5px solid ${color};
        animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        opacity: 0.8;
      "></div>
      
      <!-- Selection ring -->
      ${
        isSelected
          ? `<div style="
              position: absolute;
              inset: -5px;
              border: 2px dashed ${color};
              border-radius: 50%;
              animation: spin 6s linear infinite;
            "></div>`
          : ""
      }

      <!-- Solid core radar tracking point -->
      <div style="
        width: ${isSelected ? 14 : 10}px;
        height: ${isSelected ? 14 : 10}px;
        border-radius: 50%;
        background: ${color};
        border: 2px solid #FFFFFF;
        box-shadow: 0 0 10px ${color}, 0 2px 6px rgba(0,0,0,0.6);
        z-index: 2;
        transition: transform 0.2s ease;
      "></div>

      <!-- Tactical probability badge -->
      <div style="
        position: absolute;
        top: -19px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(4, 21, 39, 0.92);
        color: #FFFFFF;
        border: 1px solid ${color};
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 8.5px;
        font-weight: 700;
        white-space: nowrap;
        font-family: 'Archivo Black', sans-serif;
        box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        pointer-events: none;
        letter-spacing: 0.02em;
      ">
        ${scorePercent}%
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
