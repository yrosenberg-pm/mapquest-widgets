// app/[widget]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  SmartAddressInput,
  StarbucksFinder,
  CitiBikeFinder,
  DirectionsEmbed,
  TruckRouting,
  ServiceAreaChecker,
  NeighborhoodScore,
  MultiStopPlanner,
  DeliveryETA,
  InstacartDeliveryETA,
  NHLArenaExplorer,
  HereIsolineWidget,
} from '@/components/widgets';

const API_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

// Valid widget IDs
const VALID_WIDGETS = [
  'nhl',
  'address',
  'starbucks',
  'citibike',
  'directions',
  'truck',
  'service',
  'neighborhood',
  'multistop',
  'delivery',
  'instacart',
  'isoline',
] as const;

type WidgetId = typeof VALID_WIDGETS[number];

export default function WidgetPage() {
  const params = useParams();
  const widgetId = params.widget as string;
  
  const [darkMode, setDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load dark mode preference
  useEffect(() => {
    try {
      const savedPrefs = localStorage.getItem('widgetPreferences');
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
        if (prefs.darkMode !== undefined) setDarkMode(prefs.darkMode);
      }
    } catch (e) {
      console.error('Failed to load preferences:', e);
    }
    setMounted(true);
  }, []);

  // Check if valid widget
  const isValidWidget = VALID_WIDGETS.includes(widgetId as WidgetId);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!isValidWidget) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Widget Not Found</h1>
          <p className="text-gray-600 mb-4">The widget &quot;{widgetId}&quot; doesn&apos;t exist.</p>
          <p className="text-sm text-gray-500">
            Valid widgets: {VALID_WIDGETS.join(', ')}
          </p>
        </div>
      </div>
    );
  }

  const commonProps = {
    apiKey: API_KEY,
    darkMode,
    showBranding: true,
  };

  const renderWidget = () => {
    switch (widgetId) {
      case 'nhl':
        return <NHLArenaExplorer {...commonProps} />;
      case 'address':
        return <SmartAddressInput {...commonProps} onAddressSelect={(a) => console.log('Selected:', a)} />;
      case 'starbucks':
        return <StarbucksFinder {...commonProps} />;
      case 'citibike':
        return <CitiBikeFinder {...commonProps} />;
      case 'directions':
        return <DirectionsEmbed {...commonProps} />;
      case 'truck':
        return <TruckRouting {...commonProps} />;
      case 'service':
        return <ServiceAreaChecker {...commonProps} serviceCenter={{ lat: 47.6062, lng: -122.3321 }} serviceRadiusMiles={15} />;
      case 'neighborhood':
        return <NeighborhoodScore {...commonProps} />;
      case 'multistop':
        return <MultiStopPlanner {...commonProps} />;
      case 'delivery':
        return <DeliveryETA {...commonProps} destinationAddress="123 Main St, Seattle, WA 98101" />;
      case 'instacart':
        return <InstacartDeliveryETA {...commonProps} destinationAddress="123 Main St, Seattle, WA 98101" />;
      case 'isoline':
        return <HereIsolineWidget {...commonProps} defaultTimeMinutes={15} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-2 md:p-4">
      <div className="w-full md:w-auto shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] rounded-xl overflow-hidden">
        {renderWidget()}
      </div>
    </div>
  );
}
