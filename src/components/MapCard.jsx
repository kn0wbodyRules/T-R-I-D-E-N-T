import React, { useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import useMapLocation from '../hooks/useMapLocation'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../data/mockData'

function MapController({ onMoveEnd, targetCenter }) {
  const map = useMap()
  
  useMapEvents({ moveend: onMoveEnd })

  React.useEffect(() => {
    if (targetCenter) {
      map.flyTo(targetCenter, map.getZoom(), { animate: true })
    }
  }, [targetCenter, map])

  return null
}

export default function MapCard() {
  const { location, placeName, onMoveEnd } = useMapLocation(DEFAULT_MAP_CENTER)
  
  const [isEditingPlace, setIsEditingPlace] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [targetCenter, setTargetCenter] = useState(null)
  const [isSearching, setIsSearching] = useState(false)

  const latNum = parseFloat(location.lat)
  const lngNum = parseFloat(location.lng)
  const latStr = `${Math.abs(latNum).toFixed(2)}° ${latNum >= 0 ? 'N' : 'S'}`
  const lngStr = `${Math.abs(lngNum).toFixed(2)}° ${lngNum >= 0 ? 'E' : 'W'}`

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setIsEditingPlace(false)
      return
    }
    
    setIsSearching(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`)
      const data = await res.json()
      if (data && data.length > 0) {
        setTargetCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)])
      }
    } catch (e) {
      console.error("Search error", e)
    } finally {
      setIsSearching(false)
      setIsEditingPlace(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch()
    } else if (e.key === 'Escape') {
      setIsEditingPlace(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRadius: '32px',
        background: '#F5E6A0',
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0 8px 12px 8px',
          fontFamily: "'Slackey', sans-serif",
          fontWeight: 400,
          fontSize: '32px',
          color: 'transparent',
          WebkitTextStroke: '2px #3F4A1F',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}
      >
        MAP
      </div>

      {/* Map area */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
          borderRadius: '24px',
          overflow: 'hidden',
          background: '#ddd8c4',
        }}
      >
        <MapContainer
          center={DEFAULT_MAP_CENTER}
          zoom={DEFAULT_MAP_ZOOM}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <MapController onMoveEnd={onMoveEnd} targetCenter={targetCenter} />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution=""
          />
        </MapContainer>

        {/* Bottom gradient overlay with coordinates */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            pointerEvents: 'none',
            background: 'linear-gradient(to top, rgba(162,194,166,0.9) 0%, rgba(162,194,166,0.5) 60%, transparent 100%)',
            padding: '40px 24px 24px 24px',
          }}
        >
          {isEditingPlace ? (
            <div style={{ display: 'flex', alignItems: 'center', pointerEvents: 'auto', gap: '8px', paddingBottom: '4px' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  // Only close if we're not currently searching (to prevent blur during fetch)
                  if(!isSearching) setIsEditingPlace(false)
                }}
                autoFocus
                placeholder="Search location..."
                style={{
                  fontFamily: "'Nunito', sans-serif",
                  fontSize: '20px',
                  padding: '4px 12px',
                  borderRadius: '16px',
                  border: '2px solid #3F4A1F',
                  background: 'rgba(245, 230, 160, 0.9)',
                  color: '#3F4A1F',
                  outline: 'none',
                  flex: 1,
                }}
              />
              <span 
                className="material-symbols-rounded" 
                onClick={handleSearch}
                style={{ fontSize: '28px', color: '#3F4A1F', cursor: 'pointer' }}
              >
                {isSearching ? 'hourglass_empty' : 'search'}
              </span>
            </div>
          ) : (
            <div
              style={{
                fontFamily: "'Slackey', sans-serif",
                fontWeight: 400,
                fontSize: '28px',
                color: '#3F4A1F',
                lineHeight: 1.1,
                paddingBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                pointerEvents: 'auto',
                cursor: 'pointer'
              }}
              onClick={() => {
                setSearchQuery('') // Or set to placeName if you prefer
                setIsEditingPlace(true)
              }}
            >
              <span style={{flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                {placeName}
              </span>
              <span className="material-symbols-rounded" style={{ fontSize: '24px', opacity: 0.8 }}>search</span>
            </div>
          )}
          <div
            style={{
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 600,
              fontSize: '14px',
              color: '#3F4A1F',
              opacity: 0.9,
            }}
          >
            {latStr}, {lngStr}
          </div>
        </div>
      </div>

      {/* Bottom hint bar */}
      <div
        style={{
          color: '#3F4A1F',
          padding: '16px 8px 4px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '12px', fontFamily: "'Nunito', sans-serif", fontWeight: 600, opacity: 0.7 }}>Click location name to search, or drag map</span>
        <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>download</span>
      </div>
    </div>
  )
}
