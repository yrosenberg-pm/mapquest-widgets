// app/[widget]/page.tsx
'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
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
  IsolineOverlapWidget,
  RouteWeatherAlerts,
  CheckoutFlowWidget,
  EVChargingPlanner,
  HeatmapDensity,
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
  'here-isoline',
  'isoline-overlap',
  'heatmap',
  'checkout',
  'ev-charging',
] as const;

type WidgetId = typeof VALID_WIDGETS[number];

export default function WidgetPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const widgetId = params.widget as string;
  
  const [darkMode, setDarkMode] = useState(false);
  const [accentColor, setAccentColor] = useState('#2563eb');
  const [fontFamily, setFontFamily] = useState('system-ui, -apple-system, sans-serif');
  const [borderRadius, setBorderRadius] = useState('0.5rem');
  const [showBranding, setShowBranding] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [mounted, setMounted] = useState(false);

  // Auto-scale widgets to fit on iPad/tablet (prevents horizontal clipping for wide widgets).
  const widgetViewportRef = useRef<HTMLDivElement | null>(null);
  const widgetMeasureRef = useRef<HTMLDivElement | null>(null);
  const [widgetScale, setWidgetScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  // Load dark mode preference
  useEffect(() => {
    // URL params take priority (so iframe embeds are self-contained)
    try {
      const pDark = searchParams.get('darkMode');
      const pAccent = searchParams.get('accentColor');
      const pFont = searchParams.get('fontFamily');
      const pRadius = searchParams.get('borderRadius');
      const pShowBranding = searchParams.get('showBranding');
      const pCompanyName = searchParams.get('companyName');
      const pCompanyLogo = searchParams.get('companyLogo');

      if (pDark != null) setDarkMode(pDark === '1' || pDark === 'true');
      if (pAccent) setAccentColor(pAccent);
      if (pFont) setFontFamily(pFont);
      if (pRadius) setBorderRadius(pRadius);
      if (pShowBranding != null) setShowBranding(!(pShowBranding === '0' || pShowBranding === 'false'));
      if (pCompanyName) setCompanyName(pCompanyName);
      if (pCompanyLogo) setCompanyLogo(pCompanyLogo);
    } catch (e) {
      console.error('Failed to load embed URL params:', e);
    }

    try {
      const savedPrefs = localStorage.getItem('widgetPreferences');
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
        // Only apply saved prefs if URL didn't specify them
        if (searchParams.get('darkMode') == null && prefs.darkMode !== undefined) setDarkMode(prefs.darkMode);
        if (searchParams.get('accentColor') == null && prefs.accentColor) setAccentColor(prefs.accentColor);
        if (searchParams.get('fontFamily') == null && prefs.fontFamily) setFontFamily(prefs.fontFamily);
        if (searchParams.get('borderRadius') == null && prefs.borderRadius) setBorderRadius(prefs.borderRadius);
        if (searchParams.get('showBranding') == null && prefs.brandingMode) setShowBranding(prefs.brandingMode !== 'whitelabel');
        if (searchParams.get('companyName') == null && prefs.companyName) setCompanyName(prefs.companyName);
        if (searchParams.get('companyLogo') == null && prefs.companyLogo) setCompanyLogo(prefs.companyLogo);
      }
    } catch (e) {
      console.error('Failed to load preferences:', e);
    }
    setMounted(true);
  }, [searchParams]);

  useEffect(() => {
    const recompute = () => {
      const viewport = widgetViewportRef.current;
      const measured = widgetMeasureRef.current;
      if (!viewport || !measured) return;
      const naturalWidth = measured.scrollWidth || measured.offsetWidth;
      const availableWidth = viewport.clientWidth;
      if (!naturalWidth || !availableWidth) return;
      // Presentation sizing caps:
      // - Tablet/iPad: keep widgets significantly smaller for demos.
      // - Desktop: cap the largest widgets so they fit cleanly in the frame.
      const isTablet = window.matchMedia?.('(min-width: 768px) and (max-width: 1024px)').matches ?? false;
      const isLargeDesktop = window.matchMedia?.('(min-width: 1025px)').matches ?? true;
      const isBigWidget = widgetId === 'route-weather' || widgetId === 'checkout' || widgetId === 'heatmap';
      const cap = isTablet ? 0.56 : isLargeDesktop && isBigWidget ? 0.9 : 1;
      const nextScale = Math.min(cap, availableWidth / naturalWidth);
      setWidgetScale(nextScale);
    };

    const raf = window.requestAnimationFrame(recompute);
    window.addEventListener('resize', recompute);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null;
    if (ro && widgetViewportRef.current) ro.observe(widgetViewportRef.current);
    if (ro && widgetMeasureRef.current) ro.observe(widgetMeasureRef.current);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', recompute);
      ro?.disconnect();
    };
  }, [widgetId, darkMode]);

  // Use the actual rendered (scaled) height so we don't reserve extra space below the widget.
  useEffect(() => {
    const measure = () => {
      const el = widgetMeasureRef.current;
      if (!el) return;
      const h = el.getBoundingClientRect().height;
      if (h > 0) setScaledHeight(Math.ceil(h));
    };
    const raf = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(raf);
  }, [widgetScale, widgetId]);

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
    accentColor,
    fontFamily,
    borderRadius,
    showBranding,
    companyName: showBranding ? companyName : undefined,
    companyLogo: showBranding ? companyLogo : undefined,
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
      case 'route-weather':
        return <RouteWeatherAlerts {...commonProps} />;
      case 'heatmap':
        return <HeatmapDensity {...commonProps} />;
      case 'checkout':
        return <CheckoutFlowWidget {...commonProps} />;
      case 'ev-charging':
        return <EVChargingPlanner {...commonProps} />;
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
      case 'here-isoline':
        return <HereIsolineWidget {...commonProps} defaultTimeMinutes={15} />;
      case 'isoline-overlap':
        return <IsolineOverlapWidget {...commonProps} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-2 md:p-4">
      <div className="w-full flex justify-center" ref={widgetViewportRef}>
        <div
          className="w-full relative"
          style={{
            height: scaledHeight != null ? `${scaledHeight}px` : undefined,
            transition: 'height 180ms ease',
          }}
        >
          <div
            className="w-full md:w-auto shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] rounded-xl"
            ref={widgetMeasureRef}
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: widgetScale < 1 ? `translateX(-50%) scale(${widgetScale})` : 'translateX(-50%)',
              transformOrigin: 'top center',
              transition: 'transform 180ms ease',
              width: 'fit-content',
            }}
          >
            {renderWidget()}
          </div>
        </div>
      </div>
    </div>
  );
}
