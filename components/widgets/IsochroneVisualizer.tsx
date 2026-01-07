// components/widgets/IsochroneVisualizer.tsx
'use client';

import { useState } from 'react';
import { MapPin, Clock, Car, Bike, PersonStanding, Loader2 } from 'lucide-react';
import { geocode, getRouteMatrix } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';

interface IsochroneRing {
  minutes: number;
  color: string;
  points: { lat: number; lng: number }[];
}

type TravelMode = 'fastest' | 'pedestrian' | 'bicycle';

interface IsochroneVisualizerProps {
  address?: string;
  lat?: number;
  lng?: number;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  defaultTimeRanges?: number[];
  onIsochroneCalculated?: (rings: IsochroneRing[]) => void;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

const RING_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];

export default function IsochroneVisualizer({
  address: initialAddress = '',
  lat: initialLat,
  lng: initialLng,
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  borderRadius = '0.5rem',
  defaultTimeRanges = [5, 10, 15, 20],
  onIsochroneCalculated,
}: IsochroneVisualizerProps) {
  const [address, setAddress] = useState(initialAddress);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );
  const [travelMode, setTravelMode] = useState<TravelMode>('fastest');
  const [timeRanges, setTimeRanges] = useState<number[]>(defaultTimeRanges);
  const [rings, setRings] = useState<IsochroneRing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bgColor = darkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputBg = darkMode ? 'bg-gray-900' : 'bg-gray-50';

  const travelModes: { id: TravelMode; icon: any; label: string }[] = [
    { id: 'fastest', icon: Car, label: 'Drive' },
    { id: 'bicycle', icon: Bike, label: 'Bike' },
    { id: 'pedestrian', icon: PersonStanding, label: 'Walk' },
  ];

  const generateIsochrones = async () => {
    if (!address && !location) {
      setError('Please enter an address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let center = location;

      if (!center && address) {
        const geocoded = await geocode(address);
        if (!geocoded) {
          throw new Error('Could not find that address');
        }
        center = { lat: geocoded.lat, lng: geocoded.lng };
        setLocation(center);
      }

      if (!center) {
        throw new Error('No location available');
      }

      const numDirections = 8;
      const generatedRings: IsochroneRing[] = [];

      for (let i = 0; i < timeRanges.length; i++) {
        const minutes = timeRanges[i];
        const estimatedDistance = travelMode === 'pedestrian' 
          ? minutes * 0.05 / 60 * 3
          : travelMode === 'bicycle'
          ? minutes * 0.05 / 60 * 12
          : minutes * 0.05 / 60 * 30;

        const points: { lat: number; lng: number }[] = [];
        for (let j = 0; j < numDirections; j++) {
          const angle = (j / numDirections) * 2 * Math.PI;
          const latOffset = estimatedDistance * Math.cos(angle) / 69;
          const lngOffset = estimatedDistance * Math.sin(angle) / (69 * Math.cos(center.lat * Math.PI / 180));
          points.push({
            lat: center.lat + latOffset,
            lng: center.lng + lngOffset,
          });
        }

        generatedRings.push({
          minutes,
          color: RING_COLORS[i % RING_COLORS.length],
          points,
        });
      }

      setRings(generatedRings);
      onIsochroneCalculated?.(generatedRings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate isochrones');
    } finally {
      setLoading(false);
    }
  };

  const mapCenter = location || { lat: 39.8283, lng: -98.5795 };
  const mapMarkers = location
    ? [{ lat: location.lat, lng: location.lng, label: 'Center', color: accentColor }]
    : [];

  // Convert rings to map circles (radius in meters)
  const mapCircles = location && rings.length > 0 ? rings.map((ring) => {
    // Estimate distance based on travel mode and time
    const speedMph = travelMode === 'pedestrian' ? 3 : travelMode === 'bicycle' ? 12 : 30;
    const distanceMiles = (ring.minutes / 60) * speedMph;
    const radiusMeters = distanceMiles * 1609.34; // Convert miles to meters
    
    return {
      lat: location.lat,
      lng: location.lng,
      radius: radiusMeters,
      color: ring.color,
      fillOpacity: 0.15,
      strokeWidth: 2,
    };
  }) : [];

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden ${bgColor}`} style={{ minWidth: '900px', width: '100%', fontFamily, borderRadius }}>
      {/* Main content - FIXED HEIGHT */}
      <div className="flex" style={{ height: '500px' }}>
        {/* Controls - scrollable */}
        <div className={`w-80 flex-shrink-0 border-r ${borderColor} flex flex-col h-full overflow-hidden`}>
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className={`font-semibold mb-4 ${textColor}`}>Travel Time Zones</h3>

            {/* Address Input */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${mutedText}`}>Starting Location</label>
              <div className="relative">
                <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${mutedText}`} />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter an address..."
                  className={`w-full pl-10 pr-4 py-2.5 rounded-lg border ${borderColor} ${inputBg} ${textColor} text-sm`}
                />
              </div>
            </div>

            {/* Travel Mode */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${mutedText}`}>Travel Mode</label>
              <div className="flex gap-2">
                {travelModes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setTravelMode(mode.id)}
                    className={`flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-lg border transition-all ${
                      travelMode === mode.id
                        ? 'border-2 text-white'
                        : `${borderColor} ${mutedText} hover:border-gray-400`
                    }`}
                    style={travelMode === mode.id ? { borderColor: accentColor, backgroundColor: accentColor } : undefined}
                  >
                    <mode.icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Time Ranges */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${mutedText}`}>Time Ranges (minutes)</label>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 15, 20, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => {
                      if (timeRanges.includes(mins)) {
                        setTimeRanges(timeRanges.filter((t) => t !== mins));
                      } else {
                        setTimeRanges([...timeRanges, mins].sort((a, b) => a - b));
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      timeRanges.includes(mins)
                        ? 'text-white'
                        : `${borderColor} ${mutedText} hover:border-gray-400`
                    }`}
                    style={timeRanges.includes(mins) ? { borderColor: accentColor, backgroundColor: accentColor } : undefined}
                  >
                    {mins}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${darkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-600'}`}>
                {error}
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={generateIsochrones}
              disabled={loading || (!address && !location)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-white font-medium disabled:opacity-50 transition-colors"
              style={{ backgroundColor: accentColor }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
              ) : (
                <><Clock className="w-4 h-4" /> Generate Map</>
              )}
            </button>

            {/* Legend */}
            {rings.length > 0 && (
              <div className={`mt-4 p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className={`text-xs font-medium mb-2 ${mutedText}`}>Travel Time from Center</div>
                {rings.map((ring, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs py-1">
                    <div
                      className="w-4 h-2 rounded"
                      style={{ backgroundColor: ring.color + '60', border: `1px solid ${ring.color}` }}
                    />
                    <span className={textColor}>{ring.minutes} minutes</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 h-full">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={location ? 11 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={mapMarkers}
            circles={mapCircles}
          />
        </div>
      </div>

      {showBranding && (
        <div className={`p-3 border-t ${borderColor} ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className="flex items-center justify-center gap-3">
            {companyLogo && (
              <img 
                src={companyLogo} 
                alt={companyName || 'Company logo'} 
                className="h-6 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span className={`text-xs ${mutedText}`}>
              {companyName && <span className="font-medium">{companyName} · </span>}
              Powered by <strong>MapQuest</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}