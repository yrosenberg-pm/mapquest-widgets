// components/widgets/CommuteTimeCalculator.tsx
'use client';

import { useState, useEffect } from 'react';
import { Briefcase, MapPin, Clock, Car, Train, Bike, PersonStanding, Loader2, Sun, Sunset, Moon, Building2, Home, Navigation } from 'lucide-react';
import { geocode, getDirections } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

interface CommuteTimeCalculatorProps {
  defaultBaseLocation?: string;
  defaultBaseLabel?: string;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  onCommuteCalculated?: (result: { distance: number; baseTime: number; withTrafficTime: number; mode: string }) => void;
}

export default function CommuteTimeCalculator({
  defaultBaseLocation = '',
  defaultBaseLabel = 'Office',
  accentColor = '#3B82F6',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  onCommuteCalculated,
}: CommuteTimeCalculatorProps) {
  const [baseLocation, setBaseLocation] = useState(defaultBaseLocation);
  const [baseLabel, setBaseLabel] = useState(defaultBaseLabel);
  const [destination, setDestination] = useState('');
  const [baseCoords, setBaseCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [travelMode, setTravelMode] = useState('fastest');
  const [selectedTime, setSelectedTime] = useState('morning');
  const [customTime, setCustomTime] = useState('08:00');
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [result, setResult] = useState<{ distance: number; baseTime: number; withTrafficTime: number; mode: string } | null>(null);
  const [baseResult, setBaseResult] = useState<{ time: number; distance: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseLocationSet, setBaseLocationSet] = useState(false);

  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const travelModes = [
    { id: 'fastest', label: 'Drive', icon: Car },
    { id: 'transit', label: 'Transit', icon: Train },
    { id: 'bicycle', label: 'Bike', icon: Bike },
    { id: 'pedestrian', label: 'Walk', icon: PersonStanding },
  ];

  const timesOfDay = [
    { id: 'morning', label: 'Morning Rush', icon: Sun, trafficMultiplier: 1.4, description: '7-9 AM' },
    { id: 'midday', label: 'Midday', icon: Sun, trafficMultiplier: 1.0, description: '11 AM-2 PM' },
    { id: 'evening', label: 'Evening Rush', icon: Sunset, trafficMultiplier: 1.5, description: '5-7 PM' },
    { id: 'night', label: 'Off-Peak', icon: Moon, trafficMultiplier: 0.9, description: '8 PM-6 AM' },
  ];

  const getTrafficMultiplierForTime = (timeStr: string) => {
    const [hours] = timeStr.split(':').map(Number);
    if (hours >= 7 && hours < 9) return 1.4;
    if (hours >= 9 && hours < 11) return 1.1;
    if (hours >= 11 && hours < 14) return 1.0;
    if (hours >= 14 && hours < 16) return 1.1;
    if (hours >= 16 && hours < 19) return 1.5;
    if (hours >= 19 && hours < 21) return 1.2;
    return 0.9;
  };

  const getCurrentTrafficMultiplier = () => {
    if (useCustomTime) {
      return getTrafficMultiplierForTime(customTime);
    }
    const timeConfig = timesOfDay.find(t => t.id === selectedTime);
    return timeConfig?.trafficMultiplier || 1.0;
  };

  useEffect(() => {
    if (baseResult && travelMode === 'fastest') {
      const multiplier = getCurrentTrafficMultiplier();
      const withTrafficTime = baseResult.time * multiplier;
      
      const commuteResult = {
        distance: baseResult.distance,
        baseTime: baseResult.time,
        withTrafficTime,
        mode: travelMode,
      };
      
      setResult(commuteResult);
      if (onCommuteCalculated) onCommuteCalculated(commuteResult);
    }
  }, [selectedTime, customTime, useCustomTime]);

  const setBaseLocationAddress = async () => {
    if (!baseLocation.trim()) {
      setError('Please enter your base location');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await geocode(baseLocation);
      if (!result?.lat || !result?.lng) {
        throw new Error('Could not find that location');
      }
      setBaseCoords({ lat: result.lat, lng: result.lng });
      setBaseLocationSet(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set location');
    } finally {
      setLoading(false);
    }
  };

  const calculateCommute = async () => {
    if (!baseCoords) {
      setError('Please set your base location first');
      return;
    }
    if (!destination.trim()) {
      setError('Please enter a destination');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const destResult = await geocode(destination);
      if (!destResult?.lat || !destResult?.lng) {
        throw new Error('Could not find destination');
      }

      const destLoc = { lat: destResult.lat, lng: destResult.lng };
      setDestCoords(destLoc);

      const directions = await getDirections(
        `${destLoc.lat},${destLoc.lng}`, 
        `${baseCoords.lat},${baseCoords.lng}`, 
        (travelMode === 'transit' ? 'fastest' : travelMode) as 'fastest' | 'shortest' | 'pedestrian' | 'bicycle'
      );

      let distance = directions?.distance || 0;
      let time = directions?.time || 0;

      if (distance === 0 || time === 0) {
        const directUrl = `/api/mapquest?endpoint=directions&from=${destLoc.lat},${destLoc.lng}&to=${baseCoords.lat},${baseCoords.lng}&routeType=${travelMode === 'transit' ? 'fastest' : travelMode}`;
        const directRes = await fetch(directUrl);
        const directData = await directRes.json();
        
        if (directData?.route) {
          distance = directData.route.distance || 0;
          time = (directData.route.realTime || directData.route.time || 0) / 60;
        }
      } else {
        if (time > 100) {
          time = time / 60;
        }
      }

      const directionsData = {
        time: time,
        distance: distance,
      };
      
      setBaseResult(directionsData);

      const multiplier = getCurrentTrafficMultiplier();
      const withTrafficTime = travelMode === 'fastest' 
        ? directionsData.time * multiplier 
        : directionsData.time;

      const commuteResult = {
        distance: directionsData.distance,
        baseTime: directionsData.time,
        withTrafficTime,
        mode: travelMode,
      };

      setResult(commuteResult);
      setError(null);
      if (onCommuteCalculated) onCommuteCalculated(commuteResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate commute');
      if (!destCoords) {
        setResult(null);
        setBaseResult(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
  };

  const formatDistance = (miles: number) => `${miles.toFixed(1)} mi`;

  const formatCustomTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getCommuteRating = (minutes: number) => {
    if (minutes <= 15) return { label: 'Excellent', color: 'var(--color-success)' };
    if (minutes <= 30) return { label: 'Good', color: 'var(--color-info)' };
    if (minutes <= 45) return { label: 'Average', color: 'var(--color-warning)' };
    if (minutes <= 60) return { label: 'Long', color: '#f97316' };
    return { label: 'Very Long', color: 'var(--color-error)' };
  };

  const getTimeDescription = () => {
    if (useCustomTime) {
      return `at ${formatCustomTime(customTime)}`;
    }
    const timeConfig = timesOfDay.find(t => t.id === selectedTime);
    return timeConfig ? `during ${timeConfig.label.toLowerCase()}` : '';
  };

  const mapCenter = destCoords || baseCoords || { lat: 39.8283, lng: -98.5795 };
  
  const markers: Array<{ lat: number; lng: number; label: string; color: string }> = [];
  if (baseCoords) markers.push({ ...baseCoords, label: baseLabel, color: 'var(--text-muted)' });
  if (destCoords) markers.push({ ...destCoords, label: 'Destination', color: 'var(--text-muted)' });

  return (
    <div 
      className="prism-widget w-full md:w-[900px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': accentColor,
      } as React.CSSProperties}
    >
      <div className="flex flex-col md:flex-row md:h-[600px]">
        {/* Map - shown first on mobile */}
        <div className="flex-1 h-[250px] md:h-auto md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={baseCoords && destCoords ? 10 : baseCoords ? 12 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={markers}
            showRoute={!!(baseCoords && destCoords)}
            routeStart={destCoords || undefined}
            routeEnd={baseCoords || undefined}
          />
        </div>
        {/* Sidebar */}
        <div 
          className="w-full md:w-80 flex flex-col overflow-hidden border-t md:border-t-0 md:border-r md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Header */}
          <div 
            className="p-4"
            style={{ 
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
            }}
          >
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${accentColor}15` }}
              >
                <span style={{ color: accentColor }}><Clock className="w-4 h-4" /></span>
              </div>
              <div>
                <h3 
                  className="font-bold"
                  style={{ color: 'var(--text-main)', letterSpacing: '-0.02em' }}
                >
                  Commute Calculator
                </h3>
                <p 
                  className="text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Time to your {baseLabel.toLowerCase()}
                </p>
              </div>
            </div>
          </div>

          {!baseLocationSet ? (
            /* Base Location Setup */
            <div className="p-4 flex-1">
              <div 
                className="p-3 rounded-xl"
                style={{ 
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  <span 
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-main)' }}
                  >
                    Set Your Base Location
                  </span>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <label 
                      className="block text-xs mb-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Location Type
                    </label>
                    <div className="flex gap-1.5">
                      {['Office', 'Home', 'School', 'Custom'].map((label) => (
                        <button
                          key={label}
                          onClick={() => setBaseLabel(label)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: baseLabel === label ? accentColor : 'var(--bg-input)',
                            color: baseLabel === label ? 'white' : 'var(--text-secondary)',
                            border: baseLabel === label ? 'none' : '1px solid var(--border-subtle)',
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label 
                      className="block text-xs mb-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Address
                    </label>
                    <AddressAutocomplete
                      value={baseLocation}
                      onChange={setBaseLocation}
                      onSelect={(result) => {
                        if (result.lat && result.lng) {
                          setBaseCoords({ lat: result.lat, lng: result.lng });
                        }
                      }}
                      placeholder={`Enter your ${baseLabel.toLowerCase()} address`}
                      darkMode={darkMode}
                      inputBg={inputBg}
                      textColor={textColor}
                      mutedText={mutedText}
                      borderColor={borderColor}
                      className="w-full"
                    />
                  </div>

                  <button
                    onClick={setBaseLocationAddress}
                    disabled={loading || !baseLocation.trim()}
                    className="prism-btn prism-btn-primary w-full"
                    style={{ 
                      background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                      boxShadow: `0 4px 12px ${accentColor}40`,
                    }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 prism-spinner" /> : <MapPin className="w-4 h-4" />}
                    Set {baseLabel} Location
                  </button>

                  {error && (
                    <p 
                      className="text-xs font-medium px-2 py-1.5 rounded-lg"
                      style={{ color: 'var(--color-error)', background: 'var(--color-error-bg)' }}
                    >
                      {error}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Commute Result */}
              {result && (
                <div 
                  className="p-3"
                  style={{ 
                    borderBottom: '1px solid var(--border-subtle)',
                    background: `${accentColor}10`,
                  }}
                >
                  {(() => {
                    const rating = getCommuteRating(result.withTrafficTime);
                    return (
                      <div className="text-center">
                        <p 
                          className="text-xs mb-1"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          Commute time {getTimeDescription()}
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <span 
                            className="text-2xl font-bold"
                            style={{ color: 'var(--text-main)' }}
                          >
                            {formatTime(result.withTrafficTime)}
                          </span>
                          <span 
                            className="text-xs font-semibold px-2 py-1 rounded-full"
                            style={{ color: rating.color, background: `${rating.color}15` }}
                          >
                            {rating.label}
                          </span>
                        </div>
                        <div 
                          className="flex items-center justify-center gap-3 mt-1.5 text-xs"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span>{formatDistance(result.distance)}</span>
                          <span>•</span>
                          <span>{formatTime(result.baseTime)} w/o traffic</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Base Location Display */}
              <div 
                className="p-3"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{baseLabel === 'Home' ? <Home className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}</span>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Your {baseLabel}</p>
                      <p className="text-sm truncate max-w-[180px]" style={{ color: 'var(--text-main)' }}>{baseLocation}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setBaseLocationSet(false); setResult(null); setDestCoords(null); setBaseResult(null); }}
                    className="text-xs font-medium"
                    style={{ color: accentColor }}
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Destination Input */}
              <div 
                className="p-3"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <label 
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Check commute from:
                </label>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-default)' }}
                  >
                    <span style={{ color: 'var(--text-muted)' }}><MapPin className="w-3 h-3" /></span>
                  </div>
                  <AddressAutocomplete
                    value={destination}
                    onChange={setDestination}
                    onSelect={(result) => {
                      if (result.lat && result.lng) {
                        setDestCoords({ lat: result.lat, lng: result.lng });
                      }
                    }}
                    placeholder="Property address, job location..."
                    darkMode={darkMode}
                    inputBg={inputBg}
                    textColor={textColor}
                    mutedText={mutedText}
                    borderColor={borderColor}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Travel Mode */}
              <div 
                className="px-3 py-2.5"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <label 
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Travel Mode
                </label>
                <div className="flex gap-1.5">
                  {travelModes.map((mode) => {
                    const isActive = travelMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => setTravelMode(mode.id)}
                        className="flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-all"
                        style={{
                          background: isActive ? accentColor : 'var(--bg-panel)',
                          color: isActive ? 'white' : 'var(--text-muted)',
                          border: isActive ? `2px solid ${accentColor}` : '1px solid var(--border-subtle)',
                        }}
                      >
                        <mode.icon className="w-4 h-4" />
                        <span className="text-xs font-medium">{mode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Departure Time - Only for driving */}
              {travelMode === 'fastest' && (
                <div className="px-3 py-2.5 flex-1 overflow-y-auto prism-scrollbar min-h-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <label 
                      className="text-xs font-medium"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Departure Time
                    </label>
                    <button
                      onClick={() => setUseCustomTime(!useCustomTime)}
                      className="text-xs font-medium"
                      style={{ color: accentColor }}
                    >
                      {useCustomTime ? 'Use presets' : 'Pick time'}
                    </button>
                  </div>

                  {useCustomTime ? (
                    <div 
                      className="p-2.5 rounded-lg"
                      style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}
                    >
                      <label 
                        className="block text-xs mb-1.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Select departure time:
                      </label>
                      <input
                        type="time"
                        value={customTime}
                        onChange={(e) => setCustomTime(e.target.value)}
                        className="prism-input"
                        style={{ height: '36px' }}
                      />
                      <p 
                        className="text-xs mt-1.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Traffic: {Math.round((getTrafficMultiplierForTime(customTime) - 1) * 100)}% {getTrafficMultiplierForTime(customTime) >= 1 ? 'slower' : 'faster'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {timesOfDay.map((time) => {
                        const isActive = selectedTime === time.id;
                        return (
                          <button
                            key={time.id}
                            onClick={() => setSelectedTime(time.id)}
                            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all"
                            style={{
                              background: isActive ? `${accentColor}10` : 'transparent',
                              border: isActive ? `2px solid ${accentColor}` : '1px solid var(--border-subtle)',
                            }}
                          >
                            <time.icon 
                              className="w-4 h-4" 
                              style={{ color: isActive ? accentColor : 'var(--text-muted)' }} 
                            />
                            <div>
                              <p 
                                className="text-xs font-medium"
                                style={{ color: 'var(--text-main)' }}
                              >
                                {time.label}
                              </p>
                              <p 
                                className="text-xs"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {time.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Calculate Button */}
              {!result && (
                <div className="p-3 flex-shrink-0">
                  <button
                    onClick={calculateCommute}
                    disabled={loading || !destination.trim()}
                    className="prism-btn prism-btn-primary w-full"
                    style={{ 
                      background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                      boxShadow: `0 4px 12px ${accentColor}40`,
                    }}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 prism-spinner" /> Calculating...</>
                    ) : (
                      <><Navigation className="w-4 h-4" /> Calculate Commute</>
                    )}
                  </button>
                  {error && (
                    <p 
                      className="mt-2 text-xs font-medium px-2 py-1.5 rounded-lg"
                      style={{ color: 'var(--color-error)', background: 'var(--color-error-bg)' }}
                    >
                      {error}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

      </div>

      {/* Footer */}
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
          <span>
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by <strong>MapQuest</strong>
          </span>
        </div>
      )}
    </div>
  );
}
