'use client';

import { useState, useEffect } from 'react';
import { Briefcase, MapPin, Clock, Car, Train, Bike, PersonStanding, Loader2, Sun, Sunset, Moon, Building2, Home, Navigation, ChevronDown } from 'lucide-react';
import { geocode, getDirections } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

export default function CommuteTimeCalculator({
  defaultBaseLocation = '',
  defaultBaseLabel = 'Office',
  accentColor = '#2563eb',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  borderRadius = '0.5rem',
  onCommuteCalculated,
}) {
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
  const [baseResult, setBaseResult] = useState<{ time: number; distance: number } | null>(null); // Store base directions result
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseLocationSet, setBaseLocationSet] = useState(false);

  const bgColor = darkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputBg = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const markerColor = darkMode ? '#6b7280' : '#4b5563';

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

  // Get traffic multiplier based on custom time
  const getTrafficMultiplierForTime = (timeStr) => {
    const [hours] = timeStr.split(':').map(Number);
    if (hours >= 7 && hours < 9) return 1.4; // Morning rush
    if (hours >= 9 && hours < 11) return 1.1; // Late morning
    if (hours >= 11 && hours < 14) return 1.0; // Midday
    if (hours >= 14 && hours < 16) return 1.1; // Early afternoon
    if (hours >= 16 && hours < 19) return 1.5; // Evening rush
    if (hours >= 19 && hours < 21) return 1.2; // Early evening
    return 0.9; // Night/off-peak
  };

  const getCurrentTrafficMultiplier = () => {
    if (useCustomTime) {
      return getTrafficMultiplierForTime(customTime);
    }
    const timeConfig = timesOfDay.find(t => t.id === selectedTime);
    return timeConfig?.trafficMultiplier || 1.0;
  };

  // Recalculate when time selection changes (if we have base result)
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

      console.log('getDirections returned:', directions);

      // If getDirections returned null, try fetching directly
      let distance = directions?.distance || 0;
      let time = directions?.time || 0;

      if (distance === 0 || time === 0) {
        // Fetch directions directly from API
        console.log('Fetching directions directly...');
        const directUrl = `/api/mapquest?endpoint=directions&from=${destLoc.lat},${destLoc.lng}&to=${baseCoords.lat},${baseCoords.lng}&routeType=${travelMode === 'transit' ? 'fastest' : travelMode}`;
        const directRes = await fetch(directUrl);
        const directData = await directRes.json();
        console.log('Direct API response:', directData);
        
        if (directData?.route) {
          distance = directData.route.distance || 0;
          // Time is in seconds, convert to minutes
          time = (directData.route.realTime || directData.route.time || 0) / 60;
        }
      } else {
        // Convert time if it's in seconds (> 100)
        if (time > 100) {
          time = time / 60;
        }
      }

      console.log('Final values - time (min):', time, 'distance (mi):', distance);

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
      setError(null); // Clear any previous errors
      if (onCommuteCalculated) onCommuteCalculated(commuteResult);
    } catch (err) {
      console.error('Commute calculation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to calculate commute');
      // Don't clear result if we have destCoords - route is showing
      if (!destCoords) {
        setResult(null);
        setBaseResult(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
  };

  const formatDistance = (miles) => `${miles.toFixed(1)} mi`;

  const formatCustomTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getCommuteRating = (minutes) => {
    if (minutes <= 15) return { label: 'Excellent', color: 'text-green-600', bgColor: darkMode ? 'bg-green-900/30' : 'bg-green-50' };
    if (minutes <= 30) return { label: 'Good', color: 'text-blue-600', bgColor: darkMode ? 'bg-blue-900/30' : 'bg-blue-50' };
    if (minutes <= 45) return { label: 'Average', color: 'text-yellow-600', bgColor: darkMode ? 'bg-yellow-900/30' : 'bg-yellow-50' };
    if (minutes <= 60) return { label: 'Long', color: 'text-orange-600', bgColor: darkMode ? 'bg-orange-900/30' : 'bg-orange-50' };
    return { label: 'Very Long', color: 'text-red-600', bgColor: darkMode ? 'bg-red-900/30' : 'bg-red-50' };
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
  if (baseCoords) markers.push({ ...baseCoords, label: baseLabel, color: markerColor });
  if (destCoords) markers.push({ ...destCoords, label: 'Destination', color: markerColor });

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden ${bgColor}`} style={{ minWidth: '900px', fontFamily, borderRadius }}>
      <div className="flex" style={{ height: '750px' }}>
        <div className={`w-96 border-r ${borderColor} flex flex-col overflow-hidden`}>
          <div className={`p-4 border-b ${borderColor} flex-shrink-0`}>
            <div className="flex items-center gap-2">
              <Clock className={`w-5 h-5 ${mutedText}`} />
              <h3 className={`font-semibold ${textColor}`}>Commute Time Calculator</h3>
            </div>
            <p className={`text-xs mt-1 ${mutedText}`}>See how long it takes to get to your {baseLabel.toLowerCase()}</p>
          </div>

          {!baseLocationSet ? (
            <div className="p-4 flex-1">
              <div className={`p-4 rounded-lg border ${borderColor} ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className={`w-4 h-4 ${mutedText}`} />
                  <span className={`text-sm font-medium ${textColor}`}>Set Your Base Location</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className={`block text-xs mb-1 ${mutedText}`}>Location Type</label>
                    <div className="flex gap-2">
                      {['Office', 'Home', 'School', 'Custom'].map((label) => (
                        <button
                          key={label}
                          onClick={() => setBaseLabel(label)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            baseLabel === label
                              ? 'text-white'
                              : `${darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-600 hover:bg-gray-100'} border ${borderColor}`
                          }`}
                          style={baseLabel === label ? { backgroundColor: accentColor } : {}}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs mb-1 ${mutedText}`}>Address</label>
                    <input
                      type="text"
                      value={baseLocation}
                      onChange={(e) => setBaseLocation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && baseLocation.trim()) {
                          setBaseLocationAddress();
                        }
                      }}
                      placeholder={`Enter your ${baseLabel.toLowerCase()} address`}
                      className={`w-full px-3 py-2 rounded-lg border ${borderColor} ${inputBg} ${textColor} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                    />
                  </div>

                  <button
                    onClick={setBaseLocationAddress}
                    disabled={loading || !baseLocation.trim()}
                    className="w-full py-2.5 px-4 rounded-lg text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: accentColor }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                    Set {baseLabel} Location
                  </button>

                  {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Commute Time Result - Prominent Display */}
              {result && (
                <div className={`p-4 border-b ${borderColor}`} style={{ backgroundColor: accentColor + '10' }}>
                  {(() => {
                    const rating = getCommuteRating(result.withTrafficTime);
                    return (
                      <div className="text-center">
                        <p className={`text-xs ${mutedText} mb-1`}>Commute time {getTimeDescription()}</p>
                        <div className="flex items-center justify-center gap-3">
                          <span className={`text-3xl font-bold ${textColor}`}>{formatTime(result.withTrafficTime)}</span>
                          <span className={`text-sm font-medium px-2 py-1 rounded ${rating.color} ${rating.bgColor}`}>
                            {rating.label}
                          </span>
                        </div>
                        <div className={`flex items-center justify-center gap-4 mt-2 text-sm ${mutedText}`}>
                          <span>{formatDistance(result.distance)}</span>
                          <span>•</span>
                          <span>{formatTime(result.baseTime)} without traffic</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Base Location Display */}
              <div className={`p-4 border-b ${borderColor} flex-shrink-0`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                      darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-300'
                    }`}>
                      {baseLabel === 'Home' ? <Home className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                    </div>
                    <div>
                      <p className={`text-xs ${mutedText}`}>Your {baseLabel}</p>
                      <p className={`text-sm ${textColor} truncate max-w-[200px]`}>{baseLocation}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setBaseLocationSet(false); setResult(null); setDestCoords(null); setBaseResult(null); }}
                    className={`text-xs ${mutedText} hover:underline`}
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Destination Input */}
              <div className={`p-4 border-b ${borderColor} flex-shrink-0`}>
                <label className={`block text-xs font-medium mb-2 ${mutedText}`}>Check commute from:</label>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-300 text-gray-600'
                  }`}>
                    <MapPin className="w-3 h-3" />
                  </div>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && destination.trim()) {
                        calculateCommute();
                      }
                    }}
                    placeholder="Property address, job location..."
                    className={`flex-1 px-3 py-2 rounded-lg border ${borderColor} ${inputBg} ${textColor} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                  />
                </div>
              </div>

              {/* Travel Mode */}
              <div className={`px-4 py-3 border-b ${borderColor} flex-shrink-0`}>
                <label className={`block text-xs font-medium mb-2 ${mutedText}`}>Travel Mode</label>
                <div className="flex gap-2">
                  {travelModes.map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setTravelMode(mode.id)}
                      className={`flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-lg border transition-all ${
                        travelMode === mode.id
                          ? 'border-2 text-white'
                          : `${borderColor} ${mutedText} hover:border-gray-400`
                      }`}
                      style={travelMode === mode.id ? { backgroundColor: accentColor, borderColor: accentColor } : {}}
                    >
                      <mode.icon className="w-4 h-4" />
                      <span className="text-xs">{mode.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Departure Time - Only for driving */}
              {travelMode === 'fastest' && (
                <div className={`px-4 py-3 flex-1 overflow-y-auto min-h-0`}>
                  <div className="flex items-center justify-between mb-2">
                    <label className={`text-xs font-medium ${mutedText}`}>Departure Time</label>
                    <button
                      onClick={() => setUseCustomTime(!useCustomTime)}
                      className={`text-xs font-medium hover:underline`}
                      style={{ color: accentColor }}
                    >
                      {useCustomTime ? 'Use presets' : 'Pick specific time'}
                    </button>
                  </div>

                  {useCustomTime ? (
                    <div className={`p-3 rounded-lg border ${borderColor} ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                      <label className={`block text-xs mb-2 ${mutedText}`}>Select departure time:</label>
                      <input
                        type="time"
                        value={customTime}
                        onChange={(e) => setCustomTime(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border ${borderColor} ${inputBg} ${textColor} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                      />
                      <p className={`text-xs mt-2 ${mutedText}`}>
                        Traffic estimate for {formatCustomTime(customTime)}: {Math.round((getTrafficMultiplierForTime(customTime) - 1) * 100)}% {getTrafficMultiplierForTime(customTime) >= 1 ? 'slower' : 'faster'} than baseline
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {timesOfDay.map((time) => (
                        <button
                          key={time.id}
                          onClick={() => setSelectedTime(time.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                            selectedTime === time.id
                              ? 'border-2'
                              : `${borderColor} hover:border-gray-400`
                          }`}
                          style={selectedTime === time.id ? { borderColor: accentColor } : {}}
                        >
                          <time.icon className={`w-4 h-4 ${selectedTime === time.id ? '' : mutedText}`} style={selectedTime === time.id ? { color: accentColor } : {}} />
                          <div>
                            <p className={`text-xs font-medium ${textColor}`}>{time.label}</p>
                            <p className={`text-xs ${mutedText}`}>{time.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Calculate Button - Only show if no result yet */}
              {!result && (
                <div className="p-4 flex-shrink-0">
                  <button
                    onClick={calculateCommute}
                    disabled={loading || !destination.trim()}
                    className="w-full py-2.5 px-4 rounded-lg text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ backgroundColor: accentColor }}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
                    ) : (
                      <><Navigation className="w-4 h-4" /> Calculate Commute</>
                    )}
                  </button>
                  {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-1">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={baseCoords && destCoords ? 10 : baseCoords ? 12 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="750px"
            markers={markers}
            showRoute={!!(baseCoords && destCoords)}
            routeStart={destCoords || undefined}
            routeEnd={baseCoords || undefined}
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