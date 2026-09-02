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
import clsx from "clsx";
import { Candidate } from "@/lib/mock-data";

// Helper component to pan/zoom when center prop changes
function MapViewController({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center, zoom, map]);
  return null;
}

// Leaflet custom vessel marker icon generators
function createVesselLeafletIcon(
  isDark: boolean,
  isSelected: boolean,
  heading: number = 0,
  confidence: number = 0.5,
  name: string = "VESSEL"
) {
  const color = isDark ? "#EF3E42" : "#005A9C";
  const size = isSelected ? 36 : 28;
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
      ${
        isSelected
          ? `<div style="
              position: absolute;
              inset: -8px;
              border: 2px solid ${color};
              border-radius: 50%;
              animation: pulse 1.5s infinite;
              opacity: 0.9;
            "></div>`
          : ""
      }
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${isDark ? "#EF3E42" : "#005A9C"};
        color: #FFFFFF;
        border: 2px solid #FFFFFF;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Alata', sans-serif;
        font-weight: bold;
        font-size: ${size > 30 ? "12px" : "10px"};
        transform: rotate(${heading}deg);
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      ">
        ▲
      </div>
      <div style="
        position: absolute;
        top: -18px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(4, 21, 39, 0.92);
        color: #FFFFFF;
        border: 1px solid ${color};
        padding: 1px 6px;
        border-radius: 6px;
        font-size: 9px;
        font-weight: 700;
        white-space: nowrap;
        font-family: 'Valley Sans', sans-serif;
        backdrop-filter: blur(4px);
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

        {/* 1. KDE Origin Heatmap Overlay with Luminous Dispersion Gradient */}
        {activeLayers.showHeatmap &&
          heatmapPoints.map((pt, idx) => {
            const isDimmed = activeLayers.heatmapDimmed;
            const opacity = isDimmed ? pt.intensity * 0.35 : pt.intensity * 0.8;
            const radius = 950 + (1 - pt.intensity) * 1100;

            const fillColor =
              pt.intensity > 0.85
                ? "#EF3E42"
                : pt.intensity > 0.65
                ? "#F97316"
                : pt.intensity > 0.45
                ? "#FFB800"
                : "#00D2FF";

            return (
              <CircleMarker
                key={`heat-${idx}`}
                center={[pt.lat, pt.lng]}
                radius={radius / 40}
                pathOptions={{
                  fillColor,
                  fillOpacity: opacity,
                  stroke: true,
                  color: fillColor,
                  weight: pt.intensity > 0.85 ? 2 : 0.8,
                  opacity: opacity * 0.9,
                }}
              />
            );
          })}

        {/* 2. Detected Slick Polygon Overlay (Vibrant Cyan Radar Boundary) */}
        {activeLayers.showSlickPolygon && polygonLatLngs.length > 2 && (
          <>
            <Polygon
              positions={polygonLatLngs}
              pathOptions={{
                color: "#00F0FF",
                fillColor: "#005A9C",
                fillOpacity: 0.5,
                weight: 3,
                dashArray: "6, 6",
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
                <CircleMarker
                  center={slickCenter}
                  radius={12}
                  pathOptions={{
                    fillColor: "#00F0FF",
                    fillOpacity: 0.25,
                    color: "#00F0FF",
                    weight: 1.5,
                    dashArray: "3, 3",
                  }}
                />
                <CircleMarker
                  center={slickCenter}
                  radius={6}
                  pathOptions={{
                    fillColor: "#FFB800",
                    fillOpacity: 1,
                    color: "#FFFFFF",
                    weight: 2,
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
              <Polyline
                key={`drift-${i}`}
                positions={[[v.lat, v.lng], [endLat, endLng]]}
                pathOptions={{
                  color: "#FFB800",
                  weight: 2.5,
                  dashArray: "4, 6",
                  opacity: 0.9,
                }}
              />
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
      <div className="absolute top-4 right-4 z-[500] bg-[#FFFFFF]/95 border border-[rgba(0,90,156,0.25)] rounded-2xl p-3 backdrop-blur-md flex flex-col gap-2 text-xs text-[#041527] select-none min-w-[185px]">
        <div className="flex items-center justify-between border-b border-[rgba(0,90,156,0.12)] pb-1.5 font-bold text-[10px] text-[#005A9C] uppercase tracking-wider">
          <span>TACTICAL OVERLAYS</span>
        </div>

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
