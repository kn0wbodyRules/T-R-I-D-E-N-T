/**
 * Shamil Predicts — Mock / Placeholder Data
 *
 * ALL VALUES ARE PLACEHOLDERS — clearly marked as pending.
 * Replace with real pipeline data when available.
 *
 * Convention:
 *   • `null` value   → no data available (render pending/skeleton state)
 *   • `isPending`     → data source exists but hasn't resolved yet
 */

// ── AQI ────────────────────────────────────────
export const mockAQI = {
  value: null,
  category: null, // 'good' | 'satisfactory' | 'moderate' | 'poor' | 'very_poor' | 'severe'
  isPending: true,
  station: null,
  date: null,
}

// ── Pollutants ─────────────────────────────────
export const mockPollutants = [
  { id: 'no2',  label: 'NO\u2082',  fullName: 'Nitrogen Dioxide',         value: null, unit: '\u00B5g/m\u00B3', isPending: true },
  { id: 'so2',  label: 'SO\u2082',  fullName: 'Sulfur Dioxide',           value: null, unit: '\u00B5g/m\u00B3', isPending: true },
  { id: 'co',   label: 'CO',        fullName: 'Carbon Monoxide',          value: null, unit: 'mg/m\u00B3',      isPending: true },
  { id: 'o3',   label: 'O\u2083',   fullName: 'Ozone',                    value: null, unit: '\u00B5g/m\u00B3', isPending: true },
  { id: 'pm25', label: 'PM 2.5',    fullName: 'Fine Particulate Matter',  value: null, unit: '\u00B5g/m\u00B3', isPending: true },
  { id: 'pm10', label: 'PM 10',     fullName: 'Coarse Particulate Matter',value: null, unit: '\u00B5g/m\u00B3', isPending: true },
]

// ── HCHO (Formaldehyde) ────────────────────────
export const mockHCHO = {
  value: null,
  unit: 'mol/m\u00B2',
  isElevated: false,   // relative to 7-day local average — NOT an absolute threshold
  sevenDayAvg: null,
  isPending: true,
  source: 'Sentinel-5P TROPOMI',
}

// ── Last-fetched timestamp ─────────────────────
export const mockLastFetched = {
  timestamp: null, // ISO 8601 string when available
  isPending: true,
}

// ── Map defaults ───────────────────────────────
export const DEFAULT_MAP_CENTER = [20.5937, 78.9629] // geographic center of India
export const DEFAULT_MAP_ZOOM = 5
