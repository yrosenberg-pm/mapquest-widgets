// components/widgets/DeliveryETA.tsx
'use client';

import { useState, useEffect } from 'react';
import { Package, Truck, MapPin, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { geocode, getDirections } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';

type DeliveryStatus = 'preparing' | 'in_transit' | 'nearby' | 'delivered';

interface DeliveryState {
  status: DeliveryStatus;
  currentLocation?: { lat: number; lng: number };
  destinationLocation?: { lat: number; lng: number };
  etaMinutes?: number;
  distanceMiles?: number;
  lastUpdate?: Date;
  driverName?: string;
}

interface DeliveryETAProps {
  orderId?: string;
  destinationAddress: string;
  driverLocation?: { lat: number; lng: number };
  initialStatus?: DeliveryStatus;
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  simulateMovement?: boolean;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

export default function DeliveryETA({
  orderId = 'ORD-12345',
  destinationAddress,
  driverLocation,
  initialStatus = 'in_transit',
  accentColor = '#6366f1',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  borderRadius = '0.5rem',
  simulateMovement = true,
}: DeliveryETAProps) {
  const [status, setStatus] = useState<DeliveryState>({
    status: initialStatus,
    driverName: 'Alex',
  });
  const [loading, setLoading] = useState(true);

  const bgColor = darkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inactiveColor = darkMode ? '#374151' : '#e5e7eb';

  useEffect(() => {
    const initDelivery = async () => {
      setLoading(true);
      try {
        const destResult = await geocode(destinationAddress);
        if (!destResult) return;

        const destCoords = { lat: destResult.lat, lng: destResult.lng };
        let currentDriverLocation = driverLocation || {
          lat: destCoords.lat + (Math.random() - 0.5) * 0.15,
          lng: destCoords.lng + (Math.random() - 0.5) * 0.15,
        };

        const directions = await getDirections(
          `${currentDriverLocation.lat},${currentDriverLocation.lng}`,
          `${destCoords.lat},${destCoords.lng}`
        );

        setStatus({
          status: initialStatus,
          currentLocation: currentDriverLocation,
          destinationLocation: destCoords,
          etaMinutes: directions ? Math.round(directions.time / 60) : 15,
          distanceMiles: directions ? directions.distance : 5,
          lastUpdate: new Date(),
          driverName: 'Alex',
        });
      } catch (err) {
        console.error('Failed to initialize delivery:', err);
      } finally {
        setLoading(false);
      }
    };
    initDelivery();
  }, [destinationAddress, driverLocation, initialStatus]);

  useEffect(() => {
    if (!simulateMovement || !status.currentLocation || !status.destinationLocation) return;
    if (status.status === 'delivered') return;

    const interval = setInterval(() => {
      setStatus((prev) => {
        if (!prev.currentLocation || !prev.destinationLocation || prev.status === 'delivered') return prev;

        const progress = 0.05;
        const newLat = prev.currentLocation.lat + (prev.destinationLocation.lat - prev.currentLocation.lat) * progress;
        const newLng = prev.currentLocation.lng + (prev.destinationLocation.lng - prev.currentLocation.lng) * progress;
        const newEta = Math.max(0, (prev.etaMinutes || 0) - 1);
        const newDistance = Math.max(0, (prev.distanceMiles || 0) * 0.95);

        return {
          ...prev,
          currentLocation: { lat: newLat, lng: newLng },
          etaMinutes: newEta,
          distanceMiles: newDistance,
          status: newDistance < 0.1 ? 'delivered' : newDistance < 0.5 ? 'nearby' : prev.status,
          lastUpdate: new Date(),
        };
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [simulateMovement, status.currentLocation, status.destinationLocation, status.status]);

  const getStatusInfo = () => {
    switch (status.status) {
      case 'preparing': return { icon: Package, text: 'Preparing your order', color: '#f59e0b' };
      case 'in_transit': return { icon: Truck, text: `${status.driverName} is on the way`, color: accentColor };
      case 'nearby': return { icon: MapPin, text: `${status.driverName} is nearby`, color: '#22c55e' };
      case 'delivered': return { icon: CheckCircle2, text: 'Delivered!', color: '#22c55e' };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  const steps = ['preparing', 'in_transit', 'nearby', 'delivered'];
  const currentIndex = steps.indexOf(status.status);
  const progressPercent = (currentIndex / (steps.length - 1)) * 100;

  const markers: Array<{ lat: number; lng: number; label: string; color: string; icon?: string }> = [];
  if (status.currentLocation && status.status !== 'delivered') {
    markers.push({ lat: status.currentLocation.lat, lng: status.currentLocation.lng, label: `${status.driverName} - Driver`, color: accentColor, icon: 'pulse' as const });
  }
  if (status.destinationLocation) {
    markers.push({ lat: status.destinationLocation.lat, lng: status.destinationLocation.lng, label: 'Delivery Address', color: '#22c55e', icon: 'pin' as const });
  }

  const mapCenter = status.currentLocation || status.destinationLocation || { lat: 39.7392, lng: -104.9903 };

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden ${bgColor}`} style={{ minWidth: '550px', fontFamily, borderRadius }}>
      <div className={`px-4 py-3 border-b ${borderColor} flex items-center justify-between`}>
        <div>
          <h3 className={`font-semibold ${textColor}`}>Order {orderId}</h3>
          <p className={`text-xs ${mutedText}`}>Live tracking</p>
        </div>
        <div className={`text-xs ${mutedText} flex items-center gap-1`}>
          <RefreshCw className="w-3 h-3" />
          {status.lastUpdate && `Updated ${status.lastUpdate.toLocaleTimeString()}`}
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className={`w-8 h-8 animate-spin ${mutedText}`} />
        </div>
      ) : (
        <>
          <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: statusInfo.color + '15' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: statusInfo.color + '25' }}>
              <StatusIcon className="w-5 h-5" style={{ color: statusInfo.color }} />
            </div>
            <div className="flex-1">
              <div className={`font-medium ${textColor}`}>{statusInfo.text}</div>
              {status.etaMinutes !== undefined && status.status !== 'delivered' && (
                <div className={`text-sm ${mutedText}`}>{status.etaMinutes} min away · {status.distanceMiles?.toFixed(1)} miles</div>
              )}
            </div>
            {status.status !== 'delivered' && status.etaMinutes !== undefined && (
              <div className="text-right">
                <div className="text-2xl font-bold" style={{ color: statusInfo.color }}>{status.etaMinutes}</div>
                <div className={`text-xs ${mutedText}`}>min</div>
              </div>
            )}
          </div>

          <div className={`px-6 py-4 border-t ${borderColor}`}>
            <div className="relative h-3">
              <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full" style={{ backgroundColor: inactiveColor }} />
              <div className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full transition-all duration-500" style={{ backgroundColor: accentColor, width: `${progressPercent}%` }} />
              <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 flex justify-between">
                {steps.map((step, index) => (
                  <div
                    key={step}
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: index <= currentIndex ? accentColor : inactiveColor,
                      boxShadow: index === currentIndex ? `0 0 0 4px ${accentColor}30` : undefined,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-between mt-3">
              <span className={`text-xs ${mutedText}`}>Preparing</span>
              <span className={`text-xs ${mutedText}`}>On the way</span>
              <span className={`text-xs ${mutedText}`}>Nearby</span>
              <span className={`text-xs ${mutedText}`}>Delivered</span>
            </div>
          </div>

          <div className={`border-t ${borderColor}`} style={{ height: '300px' }}>
            <MapQuestMap
              apiKey={apiKey}
              center={mapCenter}
              zoom={13}
              darkMode={darkMode}
              accentColor={accentColor}
              markers={markers}
              height="100%"
              showRoute={!!(status.currentLocation && status.destinationLocation && status.status !== 'delivered')}
              routeStart={status.currentLocation || undefined}
              routeEnd={status.destinationLocation || undefined}
              routeColor={accentColor}
            />
          </div>
        </>
      )}

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