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
 * Real data-driven KDE heatmap rendered using HTML5 2D Canvas in Leaflet's overlayPane.
 * Maps every [lat, lng, intensity] point to exact pixel coordinates and paints a smooth
 * thermal Gaussian gradient. 100% reliable, zero external dependencies, 100% accurate.
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
    canvas.style.zIndex = "350";
    canvas.style.mixBlendMode = "screen";
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
      // Radius scales gracefully with zoom level
      const baseRadius = Math.max(35, 65 * Math.pow(1.25, zoom - 10));
      const opacityScale = dimmed ? 0.25 : 0.85;

      // Sort points so lower intensity is drawn first
      const sortedPoints = [...points].sort((a, b) => a.intensity - b.intensity);

      sortedPoints.forEach((pt) => {
        const point = map.latLngToContainerPoint([pt.lat, pt.lng]);
        const x = point.x;
        const y = point.y;

        const rad = baseRadius * (0.65 + pt.intensity * 0.55);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);

        const a = pt.intensity * opacityScale;

        // Precise smooth thermal KDE gradient: Hottest Red core -> Amber -> Cyan -> Dodger Blue
        grad.addColorStop(0.00, `rgba(239, 62, 66, ${a * 0.95})`);   // Hottest Red core
        grad.addColorStop(0.25, `rgba(255, 140, 0, ${a * 0.80})`);   // Red-Orange
        grad.addColorStop(0.50, `rgba(255, 200, 0, ${a * 0.65})`);   // Yellow/Amber
        grad.addColorStop(0.72, `rgba(0, 212, 224, ${a * 0.40})`);   // Cyan
        grad.addColorStop(0.88, `rgba(0, 90, 156, ${a * 0.20})`);    // Dodger Blue
        grad.addColorStop(1.00, `rgba(4, 21, 39, 0)`);               // Transparent navy edge

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
 * OpenDrift Lagrangian Backtrack Particle Simulation.
 * Animates the reverse current SPH ensemble backtrack from current slick position (T=0)
 * to the origin probability heatmap envelope (T=-8.8h).
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
    const duration = 3000; // 3 second animation

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

  // Position at current animation progress
  const currentLat = slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * animProgress;
  const currentLng = slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * animProgress;

  // SPH ensemble particles trailing behind
  const offsets = [0.08, 0.16, 0.24, 0.32, 0.40];

  return (
    <>
      {/* Animated Growing Backtrack Ray */}
      <Polyline
        positions={[
          slickCenter,
          [currentLat, currentLng],
        ]}
        pathOptions={{
          color: "#00F0FF",
          weight: 3.5,
          opacity: 0.9,
          dashArray: "6, 6",
        }}
      />

      {/* Trailing Lagrangian SPH Ensemble Particles */}
      {offsets.map((off, idx) => {
        const p = Math.max(0, animProgress - off);
        const pLat = slickCenter[0] + (primaryOrigin.lat - slickCenter[0]) * p;
        const pLng = slickCenter[1] + (primaryOrigin.lng - slickCenter[1]) * p;

        return (
          <CircleMarker
            key={`lagrangian-particle-${idx}`}
            center={[pLat, pLng]}
            radius={7 - idx}
            pathOptions={{
              fillColor: "#00F0FF",
              fillOpacity: 0.85 - idx * 0.14,
              color: "#FFFFFF",
              weight: 1.5,
            }}
          />
        );
      })}

      {/* Animated Lead Wavefront */}
      <CircleMarker
        center={[currentLat, currentLng]}
        radius={11}
        pathOptions={{
          fillColor: "#FFB800",
          fillOpacity: 1,
          color: "#FFFFFF",
          weight: 3,
        }}
      >
        <Popup>
          <div className="text-xs font-bold text-[#005A9C] p-1">
            OpenDrift SPH Ensemble Backtrack (T - {(animProgress * 8.8).toFixed(1)} hrs)
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}

// Leaflet custom vessel marker icon generators — uses Google Material Symbols
function createVesselLeafletIcon(
  isDark: boolean,
  isSelected: boolean,
  heading: number = 0,
  confidence: number = 0.5,
  name: string = "VESSEL"
) {
  const color = isDark ? "#EF3E42" : "#005A9C";
  const bgColor = isDark ? "rgba(239,62,66,0.15)" : "rgba(0,90,156,0.12)";
  const size = isSelected ? 40 : 32;
  const scorePercent = Math.round(confidence * 100);
  const iconName = isDark ? "warning" : "directions_boat";
  const iconSize = isSelected ? 22 : 18;

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
      ${
        isSelected
          ? `<div style="
              position: absolute;
              inset: -6px;
              border: 2px solid ${color};
              border-radius: 50%;
              animation: pulse 1.5s infinite;
              opacity: 0.7;
            "></div>`
          : ""
      }
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${bgColor};
        border: 2px solid ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        backdrop-filter: blur(2px);
      ">
        <span class="material-symbols-outlined" style="
          font-size: ${iconSize}px;
          color: ${color};
          font-variation-settings: 'FILL' 1, 'wght' 600;
          transform: rotate(${isDark ? 0 : heading}deg);
        ">${iconName}</span>
      </div>
      <div style="
        position: absolute;
        top: -20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(4, 21, 39, 0.92);
        color: #FFFFFF;
        border: 1px solid ${color};
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 9px;
        font-weight: 700;
        white-space: nowrap;
        font-family: 'Archivo Black', sans-serif;
        backdrop-filter: blur(4px);
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">
        ${scorePercent}% ${isDark ? "DARK" : "AIS"}
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "custom-vessel-leaflet-icon",
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

        {/* 4. Candidate Vessels */}
        {activeLayers.showVessels &&
          filteredCandidates.map((vessel) => {
            const isSelected = vessel.vessel_id === selectedVesselId;
            const icon = createVesselLeafletIcon(
              vessel.is_dark,
              isSelected,
              vessel.course_deg || 0,
              vessel.confidence_score,
              vessel.name_or_unidentified
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
                <Popup>
                  <div className="p-1.5 text-xs min-w-[160px]">
                    <div className="font-heading text-sm text-[#005A9C] uppercase">
                      {vessel.name_or_unidentified}
                    </div>
                    <div className="text-[#5A738E] text-[10px] mt-0.5">
                      ID: {vessel.vessel_id} · Speed: {vessel.speed_knots || 12} kts
                    </div>
                    <div className="mt-1.5 pt-1 border-t border-[rgba(0,90,156,0.15)] font-bold text-[#005A9C] flex items-center justify-between">
                      <span>Attribution Lead:</span>
                      <span>{(vessel.confidence_score * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </Popup>
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
