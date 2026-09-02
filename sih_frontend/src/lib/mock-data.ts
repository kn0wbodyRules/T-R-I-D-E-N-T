// GeoJSON Types
export type GeoPoint = {
  type: "Point";
  coordinates: [number, number]; // [lng, lat]
};

export type GeoPolygon = {
  type: "Polygon";
  coordinates: [number, number][][]; // [[[lng, lat], ...]]
};

// Data Contracts
export type IncidentCard = {
  incident_id: string;
  name: string;
  thumbnail_url: string;
  detection_confidence: number; // 0-1
  top_candidate: { name: string; score: number; is_dark: boolean } | null;
  status: "Processing" | "Complete" | "Needs Review";
  severity_rank: number;
  region: string;
  timestamp: string;
  area_km2: number;
};

export type DetectionResult = {
  incident_id: string;
  scene_image_url: string;
  slick_polygon: GeoPolygon;
  detection_confidence: number;
  area_km2: number;
  orientation_deg: number;
  elongation_ratio: number;
  age_bracket: string; // e.g. "12-36 hrs"
  filtered_lookalikes_count: number;
  sensor_source: string;
  satellite_pass_utc: string;
  wind_speed_kts: number;
  sea_state: number;
};

export type DriftOrigin = {
  incident_id: string;
  slick_position: GeoPoint;
  origin_heatmap: { lat: number; lng: number; intensity: number }[];
  estimated_time_window: { start: string; end: string };
  drift_vectors: { lat: number; lng: number; u_curr: number; v_curr: number; time_hrs: number }[];
  current_speed_kts: number;
  dominant_current_dir: string;
};

export type Candidate = {
  vessel_id: string;
  name_or_unidentified: string;
  position: { lat: number; lng: number };
  is_dark: boolean;
  confidence_score: number;
  ais_matched: boolean;
  imo?: string;
  mmsi?: string;
  flag?: string;
  type?: string;
  speed_knots?: number;
  course_deg?: number;
  last_seen_utc?: string;
};

export type VesselDetail = {
  vessel_id: string;
  vessel_info: { name: string; imo: string; flag: string; type: string; callsign?: string; length_m?: number } | null;
  is_dark: boolean;
  viirs_crosscheck: { applicable: boolean; matched: boolean; notes?: string } | null;
  behavior_features: { speed: number; route_deviation: number; stop_duration_min: number };
  anomaly_score: number;
  attribution_score: number;
  shap_breakdown: { factor: string; contribution: number }[]; // signed
  counterfactual_text: string;
};

export type RankingRow = Candidate & { rank: number };

export type RankingResponse = {
  incident_id: string;
  rows: RankingRow[];
  margin_note: string;
  is_close_margin: boolean;
};

export type Report = {
  incident_id: string;
  report_text: string; // markdown
  data_source_mode: "real" | "synthetic";
  marpol_flag: boolean;
  resolution: { status: "unresolved" | "resolved"; reason_code?: string; notes?: string } | null;
  generated_at_utc: string;
  case_officer: string;
};

export type ValidationCase = {
  incident_name: "2018 Corsica" | "2024 Singapore";
  date: string;
  location: string;
  summary: string;
  metrics: { iou?: number; dice?: number; origin_error_km?: number; top1_correct?: boolean; precision_at_k?: number };
  comparison_images: string[];
  ground_truth_vessel: string;
  predicted_vessel: string;
};

export type Alert = {
  id: string;
  timestamp: string;
  message: string;
  incident_id: string;
  severity: "critical" | "pending" | "info";
  unread: boolean;
};

// Pipeline Step Type
export type PipelineStep = {
  id: number;
  title: string;
  status: "done" | "active" | "pending";
  description: string;
  duration_ms: number;
  details: string;
};

// ==========================================
// MOCK DATA STORES
// ==========================================

export const MOCK_INCIDENTS: IncidentCard[] = [
  {
    incident_id: "INC-2026-0892",
    name: "Mumbai Offshore Sector 4",
    thumbnail_url: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80",
    detection_confidence: 0.884,
    top_candidate: { name: "UNK-DARK-7702 (Dark Vessel)", score: 0.884, is_dark: true },
    status: "Needs Review",
    severity_rank: 1,
    region: "Arabian Sea / Mumbai High",
    timestamp: "2026-09-02 04:30 UTC",
    area_km2: 14.82,
  },
  {
    incident_id: "INC-2026-0887",
    name: "Gulf of Mannar Deepwater",
    thumbnail_url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=80",
    detection_confidence: 0.962,
    top_candidate: { name: "MT NORDIC VOYAGER", score: 0.962, is_dark: false },
    status: "Complete",
    severity_rank: 2,
    region: "Indian Ocean / Gulf of Mannar",
    timestamp: "2026-09-01 18:15 UTC",
    area_km2: 32.40,
  },
  {
    incident_id: "INC-2026-0901",
    name: "Strait of Malacca North Approach",
    thumbnail_url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80",
    detection_confidence: 0.791,
    top_candidate: { name: "PACIFIC EMERALD", score: 0.791, is_dark: false },
    status: "Processing",
    severity_rank: 3,
    region: "Andaman Sea / Malacca Entry",
    timestamp: "2026-09-02 09:40 UTC",
    area_km2: 8.15,
  },
];

export const MOCK_DETECTIONS: Record<string, DetectionResult> = {
  "INC-2026-0892": {
    incident_id: "INC-2026-0892",
    scene_image_url: "/sar_mumbai_sector4.jpg",
    slick_polygon: {
      type: "Polygon",
      coordinates: [
        [
          [71.821, 18.905],
          [71.838, 18.918],
          [71.862, 18.932],
          [71.879, 18.924],
          [71.854, 18.901],
          [71.821, 18.905],
        ],
      ],
    },
    detection_confidence: 0.884,
    area_km2: 14.82,
    orientation_deg: 42.6,
    elongation_ratio: 4.38,
    age_bracket: "14–26 hrs",
    filtered_lookalikes_count: 7,
    sensor_source: "Sentinel-1C C-SAR (Interferometric Wide, VV+VH)",
    satellite_pass_utc: "2026-09-02 04:22:18 UTC",
    wind_speed_kts: 5.4,
    sea_state: 2,
  },
  "INC-2026-0887": {
    incident_id: "INC-2026-0887",
    scene_image_url: "/sar_mannar.jpg",
    slick_polygon: {
      type: "Polygon",
      coordinates: [
        [
          [79.080, 8.820],
          [79.120, 8.855],
          [79.165, 8.880],
          [79.145, 8.840],
          [79.095, 8.810],
          [79.080, 8.820],
        ],
      ],
    },
    detection_confidence: 0.962,
    area_km2: 32.40,
    orientation_deg: 68.2,
    elongation_ratio: 5.12,
    age_bracket: "24–36 hrs",
    filtered_lookalikes_count: 12,
    sensor_source: "RADARSAT Constellation Mission (RCM-2, Medium Res)",
    satellite_pass_utc: "2026-09-01 18:10:04 UTC",
    wind_speed_kts: 7.1,
    sea_state: 3,
  },
  "INC-2026-0901": {
    incident_id: "INC-2026-0901",
    scene_image_url: "/sar_malacca.jpg",
    slick_polygon: {
      type: "Polygon",
      coordinates: [
        [
          [97.800, 5.740],
          [97.830, 5.760],
          [97.850, 5.750],
          [97.820, 5.730],
          [97.800, 5.740],
        ],
      ],
    },
    detection_confidence: 0.791,
    area_km2: 8.15,
    orientation_deg: 115.0,
    elongation_ratio: 3.20,
    age_bracket: "6–12 hrs",
    filtered_lookalikes_count: 4,
    sensor_source: "Sentinel-1A SAR (StripMap Mode)",
    satellite_pass_utc: "2026-09-02 09:35:42 UTC",
    wind_speed_kts: 4.2,
    sea_state: 1,
  },
};

export const MOCK_DRIFT_ORIGINS: Record<string, DriftOrigin> = {
  "INC-2026-0892": {
    incident_id: "INC-2026-0892",
    slick_position: {
      type: "Point",
      coordinates: [71.845, 18.912],
    },
    origin_heatmap: [
      { lat: 18.845, lng: 71.745, intensity: 0.98 },
      { lat: 18.852, lng: 71.758, intensity: 0.92 },
      { lat: 18.838, lng: 71.732, intensity: 0.86 },
      { lat: 18.860, lng: 71.770, intensity: 0.78 },
      { lat: 18.830, lng: 71.720, intensity: 0.65 },
      { lat: 18.875, lng: 71.795, intensity: 0.52 },
      { lat: 18.890, lng: 71.815, intensity: 0.40 },
    ],
    estimated_time_window: {
      start: "2026-09-01 16:30 UTC",
      end: "2026-09-02 01:15 UTC",
    },
    drift_vectors: [
      { lat: 18.845, lng: 71.745, u_curr: 0.42, v_curr: 0.68, time_hrs: 18 },
      { lat: 18.870, lng: 71.780, u_curr: 0.38, v_curr: 0.61, time_hrs: 12 },
      { lat: 18.895, lng: 71.815, u_curr: 0.35, v_curr: 0.54, time_hrs: 6 },
    ],
    current_speed_kts: 1.45,
    dominant_current_dir: "038° NNE (HYCOM 1/12° Analysis)",
  },
  "INC-2026-0887": {
    incident_id: "INC-2026-0887",
    slick_position: {
      type: "Point",
      coordinates: [79.112, 8.840],
    },
    origin_heatmap: [
      { lat: 8.760, lng: 79.010, intensity: 0.99 },
      { lat: 8.775, lng: 80.025, intensity: 0.88 },
      { lat: 8.750, lng: 78.995, intensity: 0.81 },
      { lat: 8.790, lng: 79.040, intensity: 0.62 },
    ],
    estimated_time_window: {
      start: "2026-08-31 22:00 UTC",
      end: "2026-09-01 06:30 UTC",
    },
    drift_vectors: [
      { lat: 8.760, lng: 79.010, u_curr: 0.55, v_curr: 0.48, time_hrs: 24 },
      { lat: 8.800, lng: 79.060, u_curr: 0.51, v_curr: 0.44, time_hrs: 12 },
    ],
    current_speed_kts: 1.82,
    dominant_current_dir: "052° NE",
  },
  "INC-2026-0901": {
    incident_id: "INC-2026-0901",
    slick_position: {
      type: "Point",
      coordinates: [97.820, 5.750],
    },
    origin_heatmap: [
      { lat: 5.710, lng: 97.750, intensity: 0.94 },
      { lat: 5.720, lng: 97.770, intensity: 0.85 },
    ],
    estimated_time_window: {
      start: "2026-09-02 02:00 UTC",
      end: "2026-09-02 06:00 UTC",
    },
    drift_vectors: [
      { lat: 5.710, lng: 97.750, u_curr: 0.32, v_curr: 0.28, time_hrs: 8 },
    ],
    current_speed_kts: 1.10,
    dominant_current_dir: "045° NE",
  },
};

export const MOCK_CANDIDATES: Record<string, Candidate[]> = {
  "INC-2026-0892": [
    {
      vessel_id: "v-dark-7702",
      name_or_unidentified: "Unidentified — Dark Vessel #7702",
      position: { lat: 18.847, lng: 71.748 },
      is_dark: true,
      confidence_score: 0.884,
      ais_matched: false,
      imo: "UNKNOWN",
      mmsi: "N/A (AIS SILENT)",
      flag: "Unflagged / Spoofed",
      type: "Crude Oil Tanker (Estimated from SAR RCS)",
      speed_knots: 8.2,
      course_deg: 215,
      last_seen_utc: "2026-09-01 23:45 UTC",
    },
    {
      vessel_id: "v-9438201",
      name_or_unidentified: "MT OCEAN PRIDE",
      position: { lat: 18.855, lng: 71.762 },
      is_dark: false,
      confidence_score: 0.841,
      ais_matched: true,
      imo: "9438201",
      mmsi: "419001234",
      flag: "Liberia",
      type: "Chemical/Oil Products Tanker",
      speed_knots: 12.8,
      course_deg: 218,
      last_seen_utc: "2026-09-02 00:10 UTC",
    },
    {
      vessel_id: "v-9311024",
      name_or_unidentified: "MV SINDHU RATNA",
      position: { lat: 18.882, lng: 71.790 },
      is_dark: false,
      confidence_score: 0.412,
      ais_matched: true,
      imo: "9311024",
      mmsi: "419000889",
      flag: "India",
      type: "Bulk Carrier",
      speed_knots: 11.4,
      course_deg: 35,
      last_seen_utc: "2026-09-02 01:05 UTC",
    },
    {
      vessel_id: "v-dark-9014",
      name_or_unidentified: "Unidentified — Dark Track #9014",
      position: { lat: 18.815, lng: 71.710 },
      is_dark: true,
      confidence_score: 0.285,
      ais_matched: false,
      imo: "UNKNOWN",
      mmsi: "N/A",
      flag: "Unknown",
      type: "Small Craft / Offshore Supply",
      speed_knots: 6.0,
      course_deg: 180,
      last_seen_utc: "2026-09-01 21:30 UTC",
    },
    {
      vessel_id: "v-9671182",
      name_or_unidentified: "CMA CGM MONSOON",
      position: { lat: 18.930, lng: 71.860 },
      is_dark: false,
      confidence_score: 0.128,
      ais_matched: true,
      imo: "9671182",
      mmsi: "228394000",
      flag: "France",
      type: "Container Ship",
      speed_knots: 19.5,
      course_deg: 40,
      last_seen_utc: "2026-09-02 03:15 UTC",
    },
  ],
  "INC-2026-0887": [
    {
      vessel_id: "v-9284710",
      name_or_unidentified: "MT NORDIC VOYAGER",
      position: { lat: 8.762, lng: 79.012 },
      is_dark: false,
      confidence_score: 0.962,
      ais_matched: true,
      imo: "9284710",
      mmsi: "538008122",
      flag: "Marshall Islands",
      type: "VLCC Crude Oil Tanker",
      speed_knots: 7.4,
      course_deg: 55,
      last_seen_utc: "2026-09-01 02:40 UTC",
    },
    {
      vessel_id: "v-9128843",
      name_or_unidentified: "WAN HAI 502",
      position: { lat: 8.790, lng: 79.050 },
      is_dark: false,
      confidence_score: 0.580,
      ais_matched: true,
      imo: "9128843",
      mmsi: "563024000",
      flag: "Singapore",
      type: "Container Ship",
      speed_knots: 16.2,
      course_deg: 60,
      last_seen_utc: "2026-09-01 04:10 UTC",
    },
    {
      vessel_id: "v-dark-3310",
      name_or_unidentified: "Unidentified — Dark Track #3310",
      position: { lat: 8.740, lng: 78.980 },
      is_dark: true,
      confidence_score: 0.210,
      ais_matched: false,
      imo: "UNKNOWN",
      mmsi: "N/A",
      flag: "Unknown",
      type: "Trawler",
      speed_knots: 4.8,
      course_deg: 120,
      last_seen_utc: "2026-09-01 01:15 UTC",
    },
  ],
  "INC-2026-0901": [
    {
      vessel_id: "v-9552109",
      name_or_unidentified: "PACIFIC EMERALD",
      position: { lat: 5.712, lng: 97.752 },
      is_dark: false,
      confidence_score: 0.791,
      ais_matched: true,
      imo: "9552109",
      mmsi: "352001923",
      flag: "Panama",
      type: "Product Tanker",
      speed_knots: 10.1,
      course_deg: 130,
      last_seen_utc: "2026-09-02 04:15 UTC",
    },
  ],
};

export const MOCK_VESSEL_DETAILS: Record<string, VesselDetail> = {
  "v-dark-7702": {
    vessel_id: "v-dark-7702",
    vessel_info: null,
    is_dark: true,
    viirs_crosscheck: {
      applicable: true,
      matched: true,
      notes: "VIIRS Nighttime Radiance Anomaly matched at 0.84 nW/cm²·sr (Suomi-NPP Overpass 2026-09-01 21:18 UTC) — consistent with gas flare / deck illumination on uncooperative tanker.",
    },
    behavior_features: {
      speed: 8.2,
      route_deviation: 3.42, // km off standard TSS lane
      stop_duration_min: 78,
    },
    anomaly_score: 0.924,
    attribution_score: 0.884,
    shap_breakdown: [
      { factor: "Origin Heatmap Peak Intersection", contribution: 0.36 },
      { factor: "AIS Transmission Gap (6.4 hrs)", contribution: 0.29 },
      { factor: "Speed Reduction to <9 kts in Origin Box", contribution: 0.22 },
      { factor: "VIIRS Radiance Cross-Match", contribution: 0.15 },
      { factor: "SAR Estimated RCS Dimension (>220m)", contribution: 0.08 },
      { factor: "TSS Outbound Corridor Deviation", contribution: -0.06 },
      { factor: "Historical Flag State Risk Index", contribution: -0.16 },
    ],
    counterfactual_text:
      "What would change this attribution? If AIS transmission had remained continuous during the 20:00–02:00 UTC window and vessel maintained constant speed >13.5 kts, the attribution confidence would decrease by 46.2% (falling below threshold to 0.422).",
  },
  "v-9438201": {
    vessel_id: "v-9438201",
    vessel_info: {
      name: "MT OCEAN PRIDE",
      imo: "9438201",
      flag: "Liberia",
      type: "Chemical/Oil Products Tanker",
      callsign: "A8ZT4",
      length_m: 183,
    },
    is_dark: false,
    viirs_crosscheck: {
      applicable: true,
      matched: false,
      notes: "VIIRS DNB Nighttime cross-check completed: No localized shortwave radiance anomaly detected along trackline.",
    },
    behavior_features: {
      speed: 12.8,
      route_deviation: 0.85,
      stop_duration_min: 0,
    },
    anomaly_score: 0.682,
    attribution_score: 0.841,
    shap_breakdown: [
      { factor: "Trajectory Alignment with Drift Path", contribution: 0.41 },
      { factor: "Cargo Tank Cleaning Cycle History", contribution: 0.26 },
      { factor: "Speed Jitter during Origin Pass", contribution: 0.18 },
      { factor: "Continuous AIS Broadcast", contribution: -0.18 },
      { factor: "No VIIRS Nighttime Thermal Signature", contribution: -0.12 },
    ],
    counterfactual_text:
      "What would change this attribution? If MT OCEAN PRIDE logged verified port de-ballasting records with Port State Control or sea-valve telemetry confirming closed bilge overboard valves, attribution score drops to 0.240.",
  },
  "v-9284710": {
    vessel_id: "v-9284710",
    vessel_info: {
      name: "MT NORDIC VOYAGER",
      imo: "9284710",
      flag: "Marshall Islands",
      type: "VLCC Crude Oil Tanker",
      callsign: "V7QZ8",
      length_m: 333,
    },
    is_dark: false,
    viirs_crosscheck: {
      applicable: true,
      matched: true,
      notes: "High-radiance thermal match detected at 0.95 nW/cm²·sr during midnight overpass coinciding with 4-knot engine throttle down.",
    },
    behavior_features: {
      speed: 7.4,
      route_deviation: 4.80,
      stop_duration_min: 145,
    },
    anomaly_score: 0.965,
    attribution_score: 0.962,
    shap_breakdown: [
      { factor: "Direct Trajectory Over Origin Core", contribution: 0.48 },
      { factor: "Deep Throttle Reduction (15.2 -> 7.4 kts)", contribution: 0.32 },
      { factor: "VIIRS Radiance Overpass Match", contribution: 0.21 },
      { factor: "Hydrodynamic SPH Particle Collocation", contribution: 0.18 },
      { factor: "Tanker Class Capacity (>300,000 DWT)", contribution: 0.09 },
      { factor: "AIS Transponder Uninterrupted", contribution: -0.08 },
    ],
    counterfactual_text:
      "What would change this attribution? Decisive attribution (+38.2% margin over nearest candidate). Only evidence of simultaneous external mechanical collision or subsea pipeline rupture could overturn this attribution.",
  },
  "v-9552109": {
    vessel_id: "v-9552109",
    vessel_info: {
      name: "PACIFIC EMERALD",
      imo: "9552109",
      flag: "Panama",
      type: "Product Tanker",
      callsign: "3FFA9",
      length_m: 179,
    },
    is_dark: false,
    viirs_crosscheck: {
      applicable: false,
      matched: false,
      notes: "VIIRS Crosscheck: NOT APPLICABLE — Daytime satellite acquisition window with overcast convective cloud cover.",
    },
    behavior_features: {
      speed: 10.1,
      route_deviation: 1.20,
      stop_duration_min: 15,
    },
    anomaly_score: 0.740,
    attribution_score: 0.791,
    shap_breakdown: [
      { factor: "Passage through Origin Corridor", contribution: 0.39 },
      { factor: "Minor Speed Fluctuation", contribution: 0.22 },
      { factor: "Recent Bunker Loading History", contribution: 0.18 },
    ],
    counterfactual_text:
      "What would change this attribution? Complete analysis pending SAR Sentinel-1B second pass to verify slick dissipation rate.",
  },
};

export const MOCK_RANKINGS: Record<string, RankingResponse> = {
  "INC-2026-0892": {
    incident_id: "INC-2026-0892",
    rows: [
      {
        rank: 1,
        vessel_id: "v-dark-7702",
        name_or_unidentified: "Unidentified — Dark Vessel #7702",
        position: { lat: 18.847, lng: 71.748 },
        is_dark: true,
        confidence_score: 0.884,
        ais_matched: false,
        imo: "UNKNOWN",
        mmsi: "N/A (SILENT)",
        flag: "Unflagged / Spoofed",
        type: "Crude Oil Tanker (Estimated)",
        speed_knots: 8.2,
      },
      {
        rank: 2,
        vessel_id: "v-9438201",
        name_or_unidentified: "MT OCEAN PRIDE",
        position: { lat: 18.855, lng: 71.762 },
        is_dark: false,
        confidence_score: 0.841,
        ais_matched: true,
        imo: "9438201",
        mmsi: "419001234",
        flag: "Liberia",
        type: "Chemical/Oil Products Tanker",
        speed_knots: 12.8,
      },
      {
        rank: 3,
        vessel_id: "v-9311024",
        name_or_unidentified: "MV SINDHU RATNA",
        position: { lat: 18.882, lng: 71.790 },
        is_dark: false,
        confidence_score: 0.412,
        ais_matched: true,
        imo: "9311024",
        mmsi: "419000889",
        flag: "India",
        type: "Bulk Carrier",
        speed_knots: 11.4,
      },
      {
        rank: 4,
        vessel_id: "v-dark-9014",
        name_or_unidentified: "Unidentified — Dark Track #9014",
        position: { lat: 18.815, lng: 71.710 },
        is_dark: true,
        confidence_score: 0.285,
        ais_matched: false,
        imo: "UNKNOWN",
        mmsi: "N/A",
        flag: "Unknown",
        type: "Small Craft / Offshore Supply",
        speed_knots: 6.0,
      },
      {
        rank: 5,
        vessel_id: "v-9671182",
        name_or_unidentified: "CMA CGM MONSOON",
        position: { lat: 18.930, lng: 71.860 },
        is_dark: false,
        confidence_score: 0.128,
        ais_matched: true,
        imo: "9671182",
        mmsi: "228394000",
        flag: "France",
        type: "Container Ship",
        speed_knots: 19.5,
      },
    ],
    margin_note:
      "CLOSE CONFIDENCE MARGIN: Top candidate #1 (UNK-DARK-7702, 88.4%) leads #2 (MT OCEAN PRIDE, 84.1%) by only +4.3%. Suspect #1 is an uncooperative dark vessel with matching VIIRS radiance. Secondary acoustic/aerial verification required prior to enforcement action.",
    is_close_margin: true,
  },
  "INC-2026-0887": {
    incident_id: "INC-2026-0887",
    rows: [
      {
        rank: 1,
        vessel_id: "v-9284710",
        name_or_unidentified: "MT NORDIC VOYAGER",
        position: { lat: 8.762, lng: 79.012 },
        is_dark: false,
        confidence_score: 0.962,
        ais_matched: true,
        imo: "9284710",
        mmsi: "538008122",
        flag: "Marshall Islands",
        type: "VLCC Crude Oil Tanker",
        speed_knots: 7.4,
      },
      {
        rank: 2,
        vessel_id: "v-9128843",
        name_or_unidentified: "WAN HAI 502",
        position: { lat: 8.790, lng: 79.050 },
        is_dark: false,
        confidence_score: 0.580,
        ais_matched: true,
        imo: "9128843",
        mmsi: "563024000",
        flag: "Singapore",
        type: "Container Ship",
        speed_knots: 16.2,
      },
      {
        rank: 3,
        vessel_id: "v-dark-3310",
        name_or_unidentified: "Unidentified — Dark Track #3310",
        position: { lat: 8.740, lng: 78.980 },
        is_dark: true,
        confidence_score: 0.210,
        ais_matched: false,
        imo: "UNKNOWN",
        mmsi: "N/A",
        flag: "Unknown",
        type: "Trawler",
        speed_knots: 4.8,
      },
    ],
    margin_note:
      "DECISIVE ATTRIBUTION: High-confidence attribution (+38.2% margin). MT NORDIC VOYAGER trajectory directly intersects 98% probability kernel with documented speed reduction.",
    is_close_margin: false,
  },
  "INC-2026-0901": {
    incident_id: "INC-2026-0901",
    rows: [
      {
        rank: 1,
        vessel_id: "v-9552109",
        name_or_unidentified: "PACIFIC EMERALD",
        position: { lat: 5.712, lng: 97.752 },
        is_dark: false,
        confidence_score: 0.791,
        ais_matched: true,
        imo: "9552109",
        mmsi: "352001923",
        flag: "Panama",
        type: "Product Tanker",
        speed_knots: 10.1,
      },
    ],
    margin_note:
      "PRELIMINARY ATTRIBUTION: Processing pipeline active. Current lead: PACIFIC EMERALD (79.1%).",
    is_close_margin: false,
  },
};

export const MOCK_REPORTS: Record<string, Report> = {
  "INC-2026-0892": {
    incident_id: "INC-2026-0892",
    report_text: `### 1. INCIDENT & SENSOR OBSERVATION SUMMARY
On **2026-09-02 at 04:22:18 UTC**, Sentinel-1C C-band SAR acquired high-resolution VV/VH imagery over Mumbai Offshore Sector 4 (18.912° N, 71.845° E). Automated segmentation extracted an acute surface slick with an aggregate area of **14.82 km²**, elongation ratio of **4.38**, and principal axis orientation of **042.6° True**. The radiometric signature exhibits a dark threshold drop of -11.4 dB relative to ambient seawater, ruling out natural biogenic films or wind-shadow lookalikes.

### 2. HYDRODYNAMIC DRIFT & BACKTRACK ORIGIN
Lagrangian particle backtracking was computed using HYCOM 1/12° ocean surface velocity fields forced by ERA5 high-resolution marine boundary layer wind stress (5.4 kts NNE). 
- **Estimated Release Time Window:** \`2026-09-01 16:30 UTC\` to \`2026-09-02 01:15 UTC\` (~18.5 hours prior to SAR acquisition).
- **Core Origin Kernel Coordinates:** Centroid at \`18.845° N, 71.745° E\` (\(\pm 1.8\) km 95% confidence ellipse).

### 3. SUSPECT IDENTIFICATION & ATTRIBUTION MATRIX
Spatio-temporal intersection with maritime traffic in the backtrack corridor identified 5 candidate vessels:
1. **Unidentified Dark Vessel #7702** — Attribution Confidence: **88.4%** | Anomaly Index: **0.924**
   - Transponder status: Non-transmitting / AIS Silent.
   - VIIRS Nighttime Radiance Anomaly (Suomi-NPP 21:18 UTC) corroborated thermal combustion / localized radiance of 0.84 nW/cm²·sr coinciding with spatial position.
   - Vessel executed an unannounced 78-minute speed reduction to 8.2 knots directly inside the origin centroid.
2. **MT OCEAN PRIDE (IMO: 9438201, Flag: Liberia)** — Attribution Confidence: **84.1%** | Anomaly Index: **0.682**
   - Transmitting continuous AIS; historical maintenance profile flags recent cargo tank washing cycles.

### 4. STATUTORY VIOLATION & UNCERTAINTY STATEMENT
> **MARPOL ANNEX I FLAG:** Evidence indicates intentional operational discharge exceeding the allowable 15 ppm effluent limit under MARPOL 73/78 Annex I, Regulation 15.

**Evidentiary Caveat:** Close margin between Candidate #1 and #2 (+4.3% delta). Because Candidate #1 operated with deactivated AIS, statutory identification relies on SAR-derived radar cross section (RCS) geometric dimensions and VIIRS nocturnal corroboration.`,
    data_source_mode: "real",
    marpol_flag: true,
    resolution: {
      status: "unresolved",
      reason_code: "Referred to Port State Control & Aerial Recon",
      notes: "NTRO Maritime Desk dispatched Dornier-228 Maritime Reconnaissance sortie for visual validation at 07:00 UTC.",
    },
    generated_at_utc: "2026-09-02 05:15:00 UTC",
    case_officer: "Investigator S. Menon, NTRO / ICG Intel Division",
  },
  "INC-2026-0887": {
    incident_id: "INC-2026-0887",
    report_text: `### 1. EXECUTIVE INCIDENT DOSSIER
RADARSAT Constellation Mission (RCM-2) captured a major oil discharge slick spanning **32.40 km²** in the Gulf of Mannar deepwater corridor on 2026-09-01 18:10:04 UTC.

### 2. DRIFT MODEL & CORROBORATION
SPH Particle backtrack modeling bounded the release event between **2026-08-31 22:00 UTC** and **2026-09-01 06:30 UTC**.

### 3. PRIMARY TARGET ATTRIBUTION
- **Target Suspect:** \`MT NORDIC VOYAGER\` (IMO: 9284710, Flag: Marshall Islands, DWT: 318,000)
- **Attribution Score:** **96.2%** (Decisive lead, +38.2% margin).
- Corroborated with continuous AIS trajectory throttle dip and VIIRS nighttime emission spike.

### 4. MARPOL ENFORCEMENT ACTION
Flagged under MARPOL Annex I. Detention notice issued to Colombo & Tuticorin Port State Control authorities.`,
    data_source_mode: "real",
    marpol_flag: true,
    resolution: {
      status: "resolved",
      reason_code: "Detention Notice Issued to Port State Control",
      notes: "Vessel intercepted in Tuticorin outer anchorage; physical oil fingerprinting samples collected.",
    },
    generated_at_utc: "2026-09-01 20:30:00 UTC",
    case_officer: "Lead Analyst K. Rao, Maritime Security Operations",
  },
};

export const MOCK_VALIDATION_CASES: ValidationCase[] = [
  {
    incident_name: "2018 Corsica",
    date: "07 OCT 2018",
    location: "Cap Corse, Mediterranean Sea (42.92° N, 9.65° E)",
    summary:
      "Collision between Ro-Pax Ulysse and container ship CSL Virginia resulting in 600m³ fuel oil spill. Benchmarked against EMSA CleanSeaNet & ground-truth trajectory data.",
    metrics: {
      iou: 0.864,
      dice: 0.927,
      origin_error_km: 1.25,
      top1_correct: true,
      precision_at_k: 0.94,
    },
    comparison_images: [
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=800&q=80",
    ],
    ground_truth_vessel: "CSL Virginia (IMO: 9305532)",
    predicted_vessel: "CSL Virginia (IMO: 9305532, 98.4% Confidence)",
  },
  {
    incident_name: "2024 Singapore",
    date: "14 JUN 2024",
    location: "Pasir Panjang Terminal / Singapore Strait (1.27° N, 103.78° E)",
    summary:
      "Allision of dredger VOX MAXIMA with bunker vessel MARINE HONOUR resulting in low-sulfur fuel oil discharge. Validated against MPA Singapore official telemetry.",
    metrics: {
      iou: 0.892,
      dice: 0.943,
      origin_error_km: 0.85,
      top1_correct: true,
      precision_at_k: 1.0,
    },
    comparison_images: [
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80",
    ],
    ground_truth_vessel: "VOX MAXIMA (IMO: 9454096)",
    predicted_vessel: "VOX MAXIMA (IMO: 9454096, 97.1% Confidence)",
  },
];

export const MOCK_ALERTS: Alert[] = [
  {
    id: "ALT-2026-891",
    timestamp: "2026-09-02 04:35:12 UTC",
    message: "CRITICAL: SAR Detection triggered for Mumbai Offshore Sector 4 (14.82 km²). Dark vessel #7702 identified in origin kernel.",
    incident_id: "INC-2026-0892",
    severity: "critical",
    unread: true,
  },
  {
    id: "ALT-2026-890",
    timestamp: "2026-09-02 04:22:18 UTC",
    message: "Sentinel-1C pass complete: 1 anomalous radar backscatter polygon extracted (Confidence: 88.4%).",
    incident_id: "INC-2026-0892",
    severity: "pending",
    unread: true,
  },
  {
    id: "ALT-2026-884",
    timestamp: "2026-09-01 20:32:00 UTC",
    message: "Investigator Report generated & signed for Gulf of Mannar (MT NORDIC VOYAGER 96.2%). MARPOL detention alert transmitted.",
    incident_id: "INC-2026-0887",
    severity: "info",
    unread: false,
  },
  {
    id: "ALT-2026-879",
    timestamp: "2026-09-01 18:15:20 UTC",
    message: "RADARSAT RCM-2 pass detected 32.40 km² oil slick. Hydrodynamic drift modeling initialized.",
    incident_id: "INC-2026-0887",
    severity: "critical",
    unread: false,
  },
  {
    id: "ALT-2026-870",
    timestamp: "2026-09-01 14:10:00 UTC",
    message: "HYCOM 1/12° oceanic current vectors updated for Indian Ocean EEZ region.",
    incident_id: "INC-2026-0892",
    severity: "info",
    unread: false,
  },
];

// ==========================================
// SWAPPABLE API SERVICE FUNCTIONS
// ==========================================

export async function fetchIncidents(): Promise<IncidentCard[]> {
  // Swappable single function per contract
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_INCIDENTS;
}

export async function fetchIncidentById(id: string): Promise<IncidentCard | null> {
  await new Promise((r) => setTimeout(r, 60));
  return MOCK_INCIDENTS.find((inc) => inc.incident_id === id) || MOCK_INCIDENTS[0];
}

export async function fetchDetectionResult(incidentId: string): Promise<DetectionResult> {
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_DETECTIONS[incidentId] || MOCK_DETECTIONS["INC-2026-0892"];
}

export async function fetchDriftOrigin(incidentId: string): Promise<DriftOrigin> {
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_DRIFT_ORIGINS[incidentId] || MOCK_DRIFT_ORIGINS["INC-2026-0892"];
}

export async function fetchCandidates(incidentId: string): Promise<Candidate[]> {
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_CANDIDATES[incidentId] || MOCK_CANDIDATES["INC-2026-0892"];
}

export async function fetchVesselDetail(vesselId: string): Promise<VesselDetail> {
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_VESSEL_DETAILS[vesselId] || MOCK_VESSEL_DETAILS["v-dark-7702"];
}

export async function fetchRanking(incidentId: string): Promise<RankingResponse> {
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_RANKINGS[incidentId] || MOCK_RANKINGS["INC-2026-0892"];
}

export async function fetchReport(incidentId: string): Promise<Report> {
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_REPORTS[incidentId] || MOCK_REPORTS["INC-2026-0892"];
}

export async function updateReportResolution(
  incidentId: string,
  resolution: { status: "unresolved" | "resolved"; reason_code?: string; notes?: string }
): Promise<Report> {
  await new Promise((r) => setTimeout(r, 100));
  const current = MOCK_REPORTS[incidentId] || MOCK_REPORTS["INC-2026-0892"];
  current.resolution = resolution;
  return { ...current };
}

export async function fetchValidationCases(): Promise<ValidationCase[]> {
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_VALIDATION_CASES;
}

export async function fetchAlerts(): Promise<Alert[]> {
  await new Promise((r) => setTimeout(r, 80));
  return MOCK_ALERTS;
}
