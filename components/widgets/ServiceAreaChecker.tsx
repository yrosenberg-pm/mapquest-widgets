// components/widgets/ServiceAreaChecker.tsx
'use client';

import { useState, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle, Navigation, MapPin, Eye, EyeOff } from 'lucide-react';
import { geocode } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';
import WidgetHeader from './WidgetHeader';

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
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
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
  const [showServiceArea, setShowServiceArea] = useState(true);

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

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
        resolvedAddress = (geocoded as any).displayString || addressToCheck;
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
    <div 
      className="prism-widget w-full md:w-[900px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <WidgetHeader
        title="Service Area Checker"
        subtitle="Check delivery availability by address or map click."
        variant="impressive"
        layout="inline"
        icon={<Navigation className="w-4 h-4" />}
      />

      {/* Content - Side by Side Layout */}
      <div className="flex flex-col md:flex-row" style={{ minHeight: '520px' }}>
        {/* Map - shown first on mobile */}
        <div className="relative h-[300px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={serviceCenter}
            zoom={9}
            darkMode={darkMode}
            accentColor={accentColor}
            markers={markers}
            circles={showServiceArea ? [{
              lat: serviceCenter.lat,
              lng: serviceCenter.lng,
              radius: serviceRadiusMiles * 1609.34,
              color: accentColor,
              fillOpacity: 0.1,
            }] : []}
            height="100%"
            onClick={handleMapClick}
          />
        </div>
        {/* Left Panel - Form & Results */}
        <div 
          className="w-full md:w-72 flex-shrink-0 p-4 flex flex-col border-t md:border-t-0 md:border-r md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <form onSubmit={handleSubmit} className="space-y-2">
            <div
              className="rounded-xl flex items-center gap-2.5"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '10px 12px' }}
            >
              <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
              <AddressAutocomplete
                value={address}
                onChange={(v) => {
                  setAddress(v);
                  setResult(null);
                }}
                onSelect={(result) => {
                  if (result.lat && result.lng) {
                    checkServiceArea(result.displayString, result.lat, result.lng);
                  }
                }}
                placeholder="Enter address or zip code"
                darkMode={darkMode}
                inputBg={inputBg}
                textColor={textColor}
                mutedText={mutedText}
                borderColor={borderColor}
                className="flex-1"
                hideIcon
              />
            </div>

            <button
              type="submit"
              disabled={loading || !address.trim()}
              className="prism-btn prism-btn-primary w-full"
              style={{ 
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                boxShadow: `0 4px 12px ${accentColor}40`,
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 prism-spinner" />
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
            <div 
              className="mt-3 p-4 rounded-xl"
              style={{
                background: result.inArea ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                border: `1px solid ${result.inArea ? 'var(--color-success)' : 'var(--color-error)'}20`,
              }}
            >
              <div className="flex items-start gap-3">
                {result.inArea ? (
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-success)' }} />
                ) : (
                  <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-error)' }}><XCircle className="w-5 h-5" /></span>
                )}
                <div className="flex-1 min-w-0">
                  <div 
                    className="font-semibold text-sm"
                    style={{ color: result.inArea ? 'var(--color-success)' : 'var(--color-error)' }}
                  >
                    {result.inArea ? 'We deliver here!' : 'Outside service area'}
                  </div>
                  <div 
                    className="text-xs mt-1 break-words"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {result.address}
                  </div>
                  {result.distance !== undefined && (
                    <div 
                      className="text-xs mt-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {result.distance} miles from service center
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Service Area Info */}
          <div 
            className="mt-auto pt-4 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: accentColor }} 
              />
              Service center
            </div>
            <div>Delivery radius: {serviceRadiusMiles} miles</div>
            {/* Toggle for service area visibility */}
            <button
              onClick={() => setShowServiceArea(!showServiceArea)}
              className="flex items-center gap-1.5 text-xs mt-1 transition-colors"
              style={{ 
                color: showServiceArea ? accentColor : 'var(--text-muted)',
                opacity: showServiceArea ? 1 : 0.7
              }}
            >
              <span>{showServiceArea ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</span>
              {showServiceArea ? 'Hide area' : 'Show area'}
            </button>
          </div>
        </div>

      </div>

      {/* Footer / Branding */}
      {showBranding && (
        <div className="prism-footer">
          {companyLogo && (
            <img 
              src={companyLogo} 
              alt={companyName || 'Company logo'} 
              className="prism-footer-logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span aria-label="Powered by MapQuest">
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by
          </span>
          <img src="/brand/mapquest-footer-light.svg" alt="MapQuest" className="prism-footer-logo prism-footer-logo--light" />
          <img src="/brand/mapquest-footer-dark.svg" alt="MapQuest" className="prism-footer-logo prism-footer-logo--dark" />
        </div>
      )}
    </div>
  );
}
