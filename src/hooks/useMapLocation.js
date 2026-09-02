import { useState, useCallback, useEffect } from 'react'

export default function useMapLocation(initialCenter) {
  const [location, setLocation] = useState({
    lat: initialCenter[0].toFixed(2),
    lng: initialCenter[1].toFixed(2)
  });
  
  const [placeName, setPlaceName] = useState("Loading...");

  const fetchPlaceName = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`
      );
      const data = await response.json();
      
      if (data && data.address) {
        // Try to get a meaningful name: city, town, village, county, or state
        const name = data.address.city || data.address.town || data.address.village || data.address.county || data.address.state || "Unknown Location";
        const state = data.address.state || data.address.country || "";
        
        if (name && state && name !== state) {
          setPlaceName(`${name}, ${state}`);
        } else if (name) {
          setPlaceName(name);
        } else {
          setPlaceName("Unknown Location");
        }
      } else {
        setPlaceName("Unknown Location");
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      setPlaceName("Unknown Location");
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchPlaceName(initialCenter[0], initialCenter[1]);
  }, []);

  const onMoveEnd = useCallback((e) => {
    const center = e.target.getCenter()
    const newLat = center.lat;
    const newLng = center.lng;
    
    setLocation({
      lat: newLat.toFixed(2),
      lng: newLng.toFixed(2)
    });
    
    setPlaceName("Loading...");
    fetchPlaceName(newLat, newLng);
  }, [])

  return { location, placeName, onMoveEnd }
}
