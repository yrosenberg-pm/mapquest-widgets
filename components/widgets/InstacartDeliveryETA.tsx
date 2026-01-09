// components/widgets/InstacartDeliveryETA.tsx
'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, Car, MapPin, CheckCircle2, Loader2, RefreshCw, Clock, User } from 'lucide-react';
import { geocode, getDirections } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';

type DeliveryStatus = 'shopping' | 'checkout' | 'on_the_way' | 'arriving' | 'delivered';

interface OrderItem {
  name: string;
  quantity: number;
  substituted?: boolean;
}

interface DeliveryState {
  status: DeliveryStatus;
  currentLocation?: { lat: number; lng: number };
  destinationLocation?: { lat: number; lng: number };
  etaMinutes?: number;
  distanceMiles?: number;
  lastUpdate?: Date;
  shopperName?: string;
  storeName?: string;
  items?: OrderItem[];
  itemsFound?: number;
  totalItems?: number;
}

interface InstacartDeliveryETAProps {
  orderId?: string;
  destinationAddress: string;
  shopperLocation?: { lat: number; lng: number };
  initialStatus?: DeliveryStatus;
  storeName?: string;
  orderItems?: OrderItem[];
  darkMode?: boolean;
  showBranding?: boolean;
  fontFamily?: string;
  simulateMovement?: boolean;
}

// Instacart brand colors (from official logo)
const INSTACART_GREEN = '#43B02A';
const INSTACART_DARK_GREEN = '#3A9D23';
const INSTACART_CARROT_ORANGE = '#F6A11A';
const INSTACART_LEAF_GREEN = '#43B02A';

// Carrot icon matching Instacart logo (orange carrot with green leaves)
const CarrotIcon = ({ className, size = 24 }: { className?: string; size?: number }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 32 32" fill="none">
    {/* Green leaves */}
    <ellipse cx="16" cy="6" rx="3" ry="5" fill={INSTACART_LEAF_GREEN} transform="rotate(-20 16 6)"/>
    <ellipse cx="20" cy="7" rx="2.5" ry="4" fill={INSTACART_LEAF_GREEN} transform="rotate(20 20 7)"/>
    <ellipse cx="12" cy="7" rx="2.5" ry="4" fill={INSTACART_LEAF_GREEN} transform="rotate(-40 12 7)"/>
    {/* Orange carrot body */}
    <path 
      d="M16 10 C20 10 23 14 22 22 C21 28 17 30 16 30 C15 30 11 28 10 22 C9 14 12 10 16 10Z" 
      fill={INSTACART_CARROT_ORANGE}
    />
  </svg>
);

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

// Mock shopper names
const SHOPPER_NAMES = ['Maria', 'James', 'Ashley', 'Michael', 'Sarah', 'David', 'Emily', 'Chris'];

// Default mock order items
const DEFAULT_ITEMS: OrderItem[] = [
  { name: 'Organic Bananas', quantity: 1 },
  { name: 'Whole Milk (1 gal)', quantity: 1 },
  { name: 'Eggs (dozen)', quantity: 1 },
  { name: 'Sourdough Bread', quantity: 1 },
  { name: 'Avocados', quantity: 3 },
  { name: 'Greek Yogurt', quantity: 2 },
];

export default function InstacartDeliveryETA({
  orderId = 'IC-847291',
  destinationAddress,
  shopperLocation,
  initialStatus = 'on_the_way',
  storeName = 'Whole Foods Market',
  orderItems = DEFAULT_ITEMS,
  darkMode = false,
  showBranding = true,
  fontFamily,
  simulateMovement = true,
}: InstacartDeliveryETAProps) {
  const [status, setStatus] = useState<DeliveryState>({
    status: initialStatus,
    shopperName: SHOPPER_NAMES[Math.floor(Math.random() * SHOPPER_NAMES.length)],
    storeName,
    items: orderItems,
    itemsFound: orderItems.length,
    totalItems: orderItems.length,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initDelivery = async () => {
      setLoading(true);
      try {
        const destResult = await geocode(destinationAddress);
        if (!destResult) return;

        const destCoords = { lat: destResult.lat, lng: destResult.lng };
        // Generate shopper location ~2-5 miles away, biased to be on land
        // Use positive lat offset (north) and slight east offset to avoid ocean for coastal cities
        let currentShopperLocation = shopperLocation || {
          lat: destCoords.lat + 0.02 + Math.random() * 0.03, // 1.5-3.5 miles north
          lng: destCoords.lng + (Math.random() * 0.03) - 0.005, // slight east bias
        };

        const directions = await getDirections(
          `${currentShopperLocation.lat},${currentShopperLocation.lng}`,
          `${destCoords.lat},${destCoords.lng}`
        );

        setStatus(prev => ({
          ...prev,
          currentLocation: currentShopperLocation,
          destinationLocation: destCoords,
          etaMinutes: directions ? Math.round(directions.time) : 20,
          distanceMiles: directions ? directions.distance : 3,
          lastUpdate: new Date(),
        }));
      } catch (err) {
        console.error('Failed to initialize delivery:', err);
      } finally {
        setLoading(false);
      }
    };
    initDelivery();
  }, [destinationAddress, shopperLocation]);

  // Simulate movement
  useEffect(() => {
    if (!simulateMovement || !status.currentLocation || !status.destinationLocation) return;
    if (status.status === 'delivered') return;

    const interval = setInterval(() => {
      setStatus((prev) => {
        if (!prev.currentLocation || !prev.destinationLocation || prev.status === 'delivered') return prev;

        const progress = 0.06;
        const newLat = prev.currentLocation.lat + (prev.destinationLocation.lat - prev.currentLocation.lat) * progress;
        const newLng = prev.currentLocation.lng + (prev.destinationLocation.lng - prev.currentLocation.lng) * progress;
        const newEta = Math.max(0, (prev.etaMinutes || 0) - 1);
        const newDistance = Math.max(0, (prev.distanceMiles || 0) * 0.94);

        let newStatus: DeliveryStatus = prev.status;
        if (newDistance < 0.1) newStatus = 'delivered';
        else if (newDistance < 0.3) newStatus = 'arriving';

        return {
          ...prev,
          currentLocation: { lat: newLat, lng: newLng },
          etaMinutes: newEta,
          distanceMiles: newDistance,
          status: newStatus,
          lastUpdate: new Date(),
        };
      });
    }, 8000);

    return () => clearInterval(interval);
  }, [simulateMovement, status.currentLocation, status.destinationLocation, status.status]);

  const getStatusInfo = () => {
    switch (status.status) {
      case 'shopping': return { 
        icon: ShoppingBag, 
        text: `${status.shopperName} is shopping at ${status.storeName}`, 
        subtext: `${status.itemsFound}/${status.totalItems} items found`,
        color: INSTACART_CARROT_ORANGE 
      };
      case 'checkout': return { 
        icon: ShoppingBag, 
        text: `${status.shopperName} is checking out`, 
        subtext: 'Almost ready!',
        color: INSTACART_CARROT_ORANGE 
      };
      case 'on_the_way': return { 
        icon: Car, 
        text: `${status.shopperName} is on the way`, 
        subtext: status.storeName,
        color: INSTACART_GREEN 
      };
      case 'arriving': return { 
        icon: MapPin, 
        text: `${status.shopperName} is almost there!`, 
        subtext: 'Get ready for your delivery',
        color: INSTACART_DARK_GREEN 
      };
      case 'delivered': return { 
        icon: CheckCircle2, 
        text: 'Order delivered!', 
        subtext: 'Enjoy your groceries',
        color: INSTACART_DARK_GREEN 
      };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  const steps = ['shopping', 'checkout', 'on_the_way', 'arriving', 'delivered'];
  const currentIndex = steps.indexOf(status.status);
  const progressPercent = (currentIndex / (steps.length - 1)) * 100;

  const markers: Array<{ lat: number; lng: number; label: string; color: string; type?: 'home' | 'poi' | 'default' }> = [];
  
  if (status.currentLocation && status.status !== 'delivered') {
    markers.push({ 
      lat: status.currentLocation.lat, 
      lng: status.currentLocation.lng, 
      label: `${status.shopperName} - Your Shopper`, 
      color: INSTACART_GREEN,
      type: 'home'
    });
  }
  
  if (status.destinationLocation) {
    markers.push({ 
      lat: status.destinationLocation.lat, 
      lng: status.destinationLocation.lng, 
      label: 'Your Address', 
      color: status.status === 'delivered' ? INSTACART_DARK_GREEN : '#6B7280'
    });
  }

  const mapCenter = status.currentLocation || status.destinationLocation || { lat: 39.7392, lng: -104.9903 };

  // Format ETA time
  const getETATime = () => {
    if (!status.etaMinutes) return '';
    const now = new Date();
    const eta = new Date(now.getTime() + status.etaMinutes * 60000);
    return eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div 
      className="prism-widget"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ 
        minWidth: '420px',
        maxWidth: '480px',
        fontFamily: fontFamily || 'var(--brand-font)',
        '--brand-primary': INSTACART_GREEN,
      } as React.CSSProperties}
    >
      {/* Header */}
      <div 
        className="px-5 py-4"
        style={{ 
          background: `linear-gradient(135deg, ${INSTACART_GREEN} 0%, ${INSTACART_DARK_GREEN} 100%)`,
          color: 'white',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <CarrotIcon size={28} />
            </div>
            <div>
              <h3 className="font-bold text-lg">Your order is {status.status === 'delivered' ? 'here!' : 'on the way'}</h3>
              <p className="text-sm opacity-90">Order #{orderId}</p>
            </div>
          </div>
          <div className="text-right">
            {status.status !== 'delivered' && status.etaMinutes !== undefined && (
              <>
                <div className="text-3xl font-bold">{getETATime()}</div>
                <div className="text-xs opacity-80">Estimated arrival</div>
              </>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-8 h-8 prism-spinner" style={{ color: INSTACART_GREEN }} />
        </div>
      ) : (
        <>
          {/* Status Card */}
          <div 
            className="mx-4 -mt-4 rounded-xl p-4 shadow-lg"
            style={{ 
              background: 'var(--bg-widget)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: statusInfo.color + '15' }}
              >
                <StatusIcon className="w-6 h-6" style={{ color: statusInfo.color }} />
              </div>
              <div className="flex-1">
                <div className="font-semibold" style={{ color: 'var(--text-main)' }}>
                  {statusInfo.text}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {statusInfo.subtext}
                </div>
              </div>
              {status.status !== 'delivered' && status.etaMinutes !== undefined && (
                <div 
                  className="text-right px-3 py-1.5 rounded-lg"
                  style={{ background: `${statusInfo.color}15` }}
                >
                  <div className="text-lg font-bold" style={{ color: statusInfo.color }}>
                    {status.etaMinutes} min
                  </div>
                </div>
              )}
            </div>

            {/* Progress Steps */}
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between relative">
                {/* Progress line */}
                <div 
                  className="absolute top-3 left-0 right-0 h-0.5"
                  style={{ background: 'var(--border-default)' }}
                />
                <div 
                  className="absolute top-3 left-0 h-0.5 transition-all duration-500"
                  style={{ 
                    background: INSTACART_GREEN, 
                    width: `${progressPercent}%` 
                  }}
                />
                
                {steps.map((step, index) => {
                  const isComplete = index <= currentIndex;
                  const isCurrent = index === currentIndex;
                  return (
                    <div key={step} className="relative z-10 flex flex-col items-center">
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                        style={{ 
                          background: isComplete ? INSTACART_GREEN : 'var(--bg-input)',
                          color: isComplete ? 'white' : 'var(--text-muted)',
                          boxShadow: isCurrent ? `0 0 0 4px ${INSTACART_GREEN}30` : 'none',
                        }}
                      >
                        {isComplete ? '✓' : index + 1}
                      </div>
                      <span 
                        className="text-[10px] mt-1.5 whitespace-nowrap"
                        style={{ color: isComplete ? 'var(--text-main)' : 'var(--text-muted)' }}
                      >
                        {step === 'shopping' && 'Shopping'}
                        {step === 'checkout' && 'Checkout'}
                        {step === 'on_the_way' && 'On the way'}
                        {step === 'arriving' && 'Arriving'}
                        {step === 'delivered' && 'Delivered'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Shopper Info */}
          <div 
            className="mx-4 mt-3 p-3 rounded-lg flex items-center gap-3"
            style={{ background: 'var(--bg-panel)' }}
          >
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: `${INSTACART_GREEN}20` }}
            >
              <User className="w-5 h-5" style={{ color: INSTACART_GREEN }} />
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm" style={{ color: 'var(--text-main)' }}>
                {status.shopperName}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Your Instacart shopper
              </div>
            </div>
            <div className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <RefreshCw className="w-3 h-3" />
              {status.lastUpdate && status.lastUpdate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </div>
          </div>

          {/* Map */}
          <div className="mx-4 mt-3 rounded-xl overflow-hidden" style={{ height: '200px' }}>
            <MapQuestMap
              apiKey={apiKey}
              center={mapCenter}
              zoom={14}
              darkMode={darkMode}
              accentColor={INSTACART_GREEN}
              markers={markers}
              height="100%"
              showRoute={!!(status.currentLocation && status.destinationLocation && status.status !== 'delivered')}
              routeStart={status.currentLocation || undefined}
              routeEnd={status.destinationLocation || undefined}
              routeColor={INSTACART_GREEN}
              showZoomControls={false}
            />
          </div>

          {/* Order Summary */}
          <div className="mx-4 mt-3 mb-4">
            <div 
              className="text-xs font-medium mb-2 flex items-center gap-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <ShoppingBag className="w-3 h-3" />
              {status.items?.length} items from {status.storeName}
            </div>
            <div 
              className="flex flex-wrap gap-1.5"
            >
              {status.items?.slice(0, 4).map((item, idx) => (
                <span 
                  key={idx}
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ 
                    background: 'var(--bg-input)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {item.quantity > 1 && `${item.quantity}× `}{item.name}
                </span>
              ))}
              {(status.items?.length || 0) > 4 && (
                <span 
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ 
                    background: `${INSTACART_GREEN}15`,
                    color: INSTACART_GREEN,
                  }}
                >
                  +{(status.items?.length || 0) - 4} more
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      {showBranding && (
        <div className="prism-footer">
          <div className="flex items-center gap-2">
            <CarrotIcon size={20} />
            <span 
              style={{ 
                fontWeight: 700, 
                color: INSTACART_GREEN,
                fontSize: '15px',
                letterSpacing: '-0.02em',
              }}
            >
              instacart
            </span>
            <span style={{ color: 'var(--text-muted)' }}> · Powered by </span>
            <strong>MapQuest</strong>
          </div>
        </div>
      )}
    </div>
  );
}
