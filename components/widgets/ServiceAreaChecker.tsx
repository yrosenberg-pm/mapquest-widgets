// components/widgets/ServiceAreaChecker.tsx
'use client';

import { useState, useCallback } from 'react';
import { MapPin, Loader2, CheckCircle2, XCircle, Navigation } from 'lucide-react';
import { geocode } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';

interface ServiceAreaCheckerProps {
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  // Service area config - radius in miles from center
  serviceCenter?: { lat: number; lng: number };
  serviceRadiusMiles?: number;
  // Or list of valid zip codes
  validZipCodes?: string[];
  onResult?: (result: { inArea: boolean; address: string; distance?: number }) => void;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

// Default to Denver area
const DEFAULT_CENTER = { lat: 39.7392, lng: -104.9903 };
const DEFAULT_RADIUS = 25; // miles

export default function ServiceAreaChecker({
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  borderRadius = '0.5rem',
  serviceCenter = DEFAULT_CENTER,
  serviceRadiusMiles = DEFAULT_RADIUS,
  validZipCodes,
  onResult,
}: ServiceAreaCheckerProps) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    inArea: boolean;
    address: string;
    distance?: number;
    lat?: number;
    lng?: number;
  } | null>(null);
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lng: number } | null>(null);

  const bgColor = darkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputBg = darkMode ? 'bg-gray-900' : 'bg-gray-50';

  // Calculate distance between two points (Haversine formula)
  const getDistanceMiles = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const checkServiceArea = async (addressToCheck: string, lat?: number, lng?: number) => {
    setLoading(true);
    setResult(null);

    try {
      let checkLat = lat;
      let checkLng = lng;
      let resolvedAddress = addressToCheck;

      // If no coordinates provided, geocode the address
      if (!checkLat || !checkLng) {
        const geocoded = await geocode(addressToCheck);
        if (!geocoded) {
          setResult({ inArea: false, address: addressToCheck });
          return;
        }
        checkLat = geocoded.lat;
        checkLng = geocoded.lng;
        resolvedAddress = geocoded.displayString || addressToCheck;
      }

      // Check if in service area
      const distance = getDistanceMiles(
        serviceCenter.lat,
        serviceCenter.lng,
        checkLat,
        checkLng
      );

      const inArea = distance <= serviceRadiusMiles;

      const checkResult = {
        inArea,
        address: resolvedAddress,
        distance: Math.round(distance * 10) / 10,
        lat: checkLat,
        lng: checkLng,
      };

      setResult(checkResult);
      onResult?.(checkResult);
    } catch (err) {
      console.error('Service area check failed:', err);
      setResult({ inArea: false, address: addressToCheck });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      checkServiceArea(address);
    }
  };

  // Handle map click - reverse geocode and check area
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setClickedPoint({ lat, lng });
    setLoading(true);

    try {
      // Reverse geocode to get address
      const response = await fetch(
        `/api/mapquest?action=reverse&lat=${lat}&lng=${lng}`
      );
      const data = await response.json();

      let clickedAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      if (data.results?.[0]?.locations?.[0]) {
        const loc = data.results[0].locations[0];
        clickedAddress = `${loc.street || ''} ${loc.adminArea5 || ''}, ${loc.adminArea3 || ''} ${loc.postalCode || ''}`.trim();
      }

      setAddress(clickedAddress);
      await checkServiceArea(clickedAddress, lat, lng);
    } catch (err) {
      console.error('Map click handling failed:', err);
      // Still check with coordinates even if reverse geocode fails
      await checkServiceArea(`${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng);
    }
  }, [serviceCenter, serviceRadiusMiles]);

  // Build markers array
  const markers = [
    {
      lat: serviceCenter.lat,
      lng: serviceCenter.lng,
      label: 'Service Center',
      color: accentColor,
    },
  ];

  if (result?.lat && result?.lng) {
    markers.push({
      lat: result.lat,
      lng: result.lng,
      label: result.inArea ? 'In Service Area' : 'Outside Area',
      color: result.inArea ? '#22c55e' : '#ef4444',
    });
  } else if (clickedPoint) {
    markers.push({
      lat: clickedPoint.lat,
      lng: clickedPoint.lng,
      label: 'Checking...',
      color: '#f59e0b',
    });
  }

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden ${bgColor}`} style={{ minWidth: '700px', fontFamily, borderRadius }}>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${borderColor}`}>
        <h3 className={`font-semibold ${textColor}`}>Check Service Area</h3>
        <p className={`text-xs mt-1 ${mutedText}`}>
          Enter an address or click on the map to check if we deliver to your location
        </p>
      </div>

      {/* Content - Side by Side Layout */}
      <div className="flex" style={{ minHeight: '400px' }}>
        {/* Left Panel - Form & Results */}
        <div className={`w-72 flex-shrink-0 p-4 border-r ${borderColor} flex flex-col`}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${borderColor} ${inputBg}`}>
                <MapPin className={`w-4 h-4 flex-shrink-0 ${mutedText}`} />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter address or zip code"
                  className={`flex-1 bg-transparent outline-none text-sm ${textColor}`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !address.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
              style={{ backgroundColor: accentColor }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4" />
                  Check Address
                </>
              )}
            </button>
          </form>

          {/* Result */}
          {result && (
            <div className={`mt-4 p-4 rounded-lg ${result.inArea 
              ? (darkMode ? 'bg-green-900/30 border-green-700' : 'bg-green-50 border-green-200') 
              : (darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200')
            } border`}>
              <div className="flex items-start gap-3">
                {result.inArea ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm ${result.inArea ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                    {result.inArea ? 'We deliver here!' : 'Outside service area'}
                  </div>
                  <div className={`text-xs mt-1 ${mutedText} break-words`}>
                    {result.address}
                  </div>
                  {result.distance !== undefined && (
                    <div className={`text-xs mt-1 ${mutedText}`}>
                      {result.distance} miles from service center
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Service Area Info */}
          <div className={`mt-auto pt-4 text-xs ${mutedText}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
              Service center
            </div>
            <div>Delivery radius: {serviceRadiusMiles} miles</div>
          </div>
        </div>

        {/* Right Panel - Map */}
        <div className="flex-1 relative" style={{ minHeight: '400px' }}>
          <MapQuestMap
            apiKey={apiKey}
            center={serviceCenter}
            zoom={9}
            darkMode={darkMode}
            accentColor={accentColor}
            markers={markers}
            height="100%"
            onClick={handleMapClick}
          />
          
          {/* Service area circle overlay - visual indicator */}
          <div 
            className="absolute pointer-events-none rounded-full border-2 border-dashed opacity-30"
            style={{
              borderColor: accentColor,
              backgroundColor: accentColor + '10',
              width: '60%',
              height: '60%',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
      </div>

      {/* Branding */}
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