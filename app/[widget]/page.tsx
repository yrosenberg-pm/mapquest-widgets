// app/[widget]/page.tsx
'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { setApiKey, setSearchContext } from '@/lib/mapquest';
import { streetViewBorderRadius } from '@/lib/streetViewRadius';
import { DEFAULT_DEMO_REGION_ID, DEMO_REGIONS, getDemoRegion } from '@/lib/demo/demoRegions';
import { getWidgetLocationProps } from '@/lib/demo/widgetLocationProps';
import type { DemoMapProps } from '@/lib/demo/mapDefaults';
import { 
  StarbucksFinder,
  CoffeeShopFinder,
  CitiBikeFinder,
  DirectionsEmbed,
  TruckRouting,
  TruckRoutePlanner,

  NeighborhoodScore,
  MultiStopPlanner,
  ListingTourPlanner,
  DeliveryETA,
  InstacartDeliveryETA,
  NHLArenaExplorer,
  HereIsolineWidget,
  IsolineOverlapWidget,
  RouteWeatherAlerts,
  CheckoutFlowWidget,
  EVChargingPlanner,
  LiveTrafficWidget,
  CustomRouteWidget,
  PublicTransitDepartures,
  ParkingFinder,
  ConstructionHeatmap,
  ContractorFinder,
  MultiZoneCoverage,
  PropertyIntelligence,
  NeighborhoodProfile,
  ComparableSalesMap,
  MapillaryStreetViewShowcase,
} from '@/components/widgets';

const ENV_API_KEY = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

// Valid widget IDs
const VALID_WIDGETS = [
  'nhl',
  'starbucks',
  'coffee-shop',
  'citibike',
  'directions',
  'truck',
  'truck-route-planner',
  'route-weather',
  'transit',
  'neighborhood',
  'multistop',
  'listing-tour',
  'delivery',
  'instacart',
  'isoline',
  'isoline-overlap',
  'checkout',
  'ev-charging',
  'traffic',
  'custom-route',
  'parking',
  'construction',
  'contractor-finder',
  'zone-coverage',
  'property-intel',
  'neighborhood-profile',
  'comp-sales',
  'streetview-showcase',
] as const;

type WidgetId = typeof VALID_WIDGETS[number];

export default function WidgetPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const widgetId = params.widget as string;
  
  const [darkMode, setDarkMode] = useState(false);
  const [accentColor, setAccentColor] = useState('#2563eb');
  const [fontFamily, setFontFamily] = useState('system-ui, -apple-system, sans-serif');
  const [borderRadius, setBorderRadius] = useState('16px');
  const [showBranding, setShowBranding] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [demoRegionId, setDemoRegionId] = useState(DEFAULT_DEMO_REGION_ID);
  const [effectiveApiKey, setEffectiveApiKey] = useState(ENV_API_KEY);
  const [mounted, setMounted] = useState(false);

  // Auto-scale widgets to fit on iPad/tablet (prevents horizontal clipping for wide widgets).
  const widgetViewportRef = useRef<HTMLDivElement | null>(null);
  const widgetMeasureRef = useRef<HTMLDivElement | null>(null);
  const [widgetScale, setWidgetScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  // Load dark mode preference
  useEffect(() => {
    // Customer-provided API key flows to MapQuestMap (tiles) and lib/mapquest.ts (proxy calls)
    const urlApiKey = searchParams.get('apiKey');
    if (urlApiKey) {
      setApiKey(urlApiKey);
      setEffectiveApiKey(urlApiKey);
    }

    // URL params take priority (so iframe embeds are self-contained)
    try {
      const pDark = searchParams.get('darkMode');
      const pAccent = searchParams.get('accentColor');
      const pFont = searchParams.get('fontFamily');
      const pRadius = searchParams.get('borderRadius');
      const pShowBranding = searchParams.get('showBranding');
      const pCompanyName = searchParams.get('companyName');
      const pCompanyLogo = searchParams.get('companyLogo');
      const pDemoRegion = searchParams.get('demoRegion');

      if (pDark != null) setDarkMode(pDark === '1' || pDark === 'true');
      if (pAccent) setAccentColor(pAccent);
      if (pFont) setFontFamily(pFont);
      if (pRadius) setBorderRadius(pRadius);
      if (pShowBranding != null) setShowBranding(!(pShowBranding === '0' || pShowBranding === 'false'));
      if (pCompanyName) setCompanyName(pCompanyName);
      if (pCompanyLogo) setCompanyLogo(pCompanyLogo);
      if (pDemoRegion && DEMO_REGIONS.some((r) => r.id === pDemoRegion)) setDemoRegionId(pDemoRegion);
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
        if (searchParams.get('demoRegion') == null && prefs.demoRegionId && DEMO_REGIONS.some((r) => r.id === prefs.demoRegionId)) {
          setDemoRegionId(prefs.demoRegionId);
        }
      }
    } catch (e) {
      console.error('Failed to load preferences:', e);
    }
    setMounted(true);
  }, [searchParams]);

  useEffect(() => {
    const region = getDemoRegion(demoRegionId);
    setSearchContext({
      countryCode: region.countryCode,
      near: region.center,
    });
  }, [demoRegionId]);

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
      const isBigWidget = false; // All widgets now render at 1:1 scale
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

  const demoRegion = getDemoRegion(demoRegionId);
  const locationProps = getWidgetLocationProps(widgetId, demoRegionId);

  const commonProps: DemoMapProps & {
    apiKey: string;
    darkMode: boolean;
    accentColor: string;
    fontFamily: string;
    borderRadius: string;
    showBranding: boolean;
    companyName: string | undefined;
    companyLogo: string | undefined;
  } = {
    apiKey: effectiveApiKey,
    darkMode,
    accentColor,
    fontFamily,
    borderRadius,
    showBranding,
    companyName: showBranding ? companyName : undefined,
    companyLogo: showBranding ? companyLogo : undefined,
    defaultMapCenter: demoRegion.center,
    defaultMapZoom: demoRegion.zoom,
  };

  const renderWidget = () => {
    const pTruckMaxElevationFt = searchParams.get('maxElevationFt');
    const truckMaxElevationFtNum =
      pTruckMaxElevationFt != null && pTruckMaxElevationFt !== '' && Number.isFinite(Number(pTruckMaxElevationFt))
        ? Number(pTruckMaxElevationFt)
        : undefined;
    const loc = locationProps;
    const widgetKey = `${widgetId}-${demoRegionId}`;

    switch (widgetId) {
      case 'nhl':
        return <NHLArenaExplorer key={widgetKey} {...commonProps} />;
      case 'starbucks':
        return <StarbucksFinder key={widgetKey} {...commonProps} {...loc} />;
      case 'coffee-shop':
        return <CoffeeShopFinder key={widgetKey} {...commonProps} {...loc} />;
      case 'citibike':
        return <CitiBikeFinder key={widgetKey} {...commonProps} {...loc} />;
      case 'directions':
        return <DirectionsEmbed key={widgetKey} {...commonProps} {...loc} />;
      case 'truck':
        return <TruckRouting key={widgetKey} {...commonProps} {...loc} defaultMaxElevationFt={truckMaxElevationFtNum} />;
      case 'truck-route-planner':
        return <TruckRoutePlanner key={widgetKey} {...commonProps} />;
      case 'route-weather':
        return <RouteWeatherAlerts key={widgetKey} {...commonProps} {...loc} />;
      case 'checkout':
        return <CheckoutFlowWidget key={widgetKey} {...commonProps} />;
      case 'ev-charging':
        return <EVChargingPlanner key={widgetKey} {...commonProps} {...loc} />;

      case 'traffic':
        return (
          <LiveTrafficWidget
            key={widgetKey}
            apiKey={effectiveApiKey}
            center={(loc.center as { lat: number; lng: number }) ?? demoRegion.center}
            title={(loc.title as string) ?? demoRegion.trafficTitle}
            theme={darkMode ? 'dark' : 'light'}
            accentColor={accentColor}
            fontFamily={fontFamily}
            borderRadius={borderRadius}
            refreshInterval={120}
            zoom={(loc.zoom as number) ?? demoRegion.zoom}
            height={860}
            width={1120}
          />
        );
      case 'custom-route':
        return (
          <CustomRouteWidget
            mode="builder"
            apiKey={effectiveApiKey}
            theme={darkMode ? 'dark' : 'light'}
            darkMode={darkMode}
            accentColor={accentColor}
            fontFamily={fontFamily}
            borderRadius={borderRadius}
            showBranding={showBranding}
            companyName={showBranding ? companyName : undefined}
            companyLogo={showBranding ? companyLogo : undefined}
            width={1120}
            height={920}
            title="Coastal Delivery Route"
            description="Prepared for Acme Logistics"
            waypoints={[]}
            routeType="fastest"
            unit="m"
            markerStyle="lettered"
            showManeuvers={true}
            showLegBreakdown={true}
            lineColor="#2563EB"
            lineWeight={4}
            defaultMapCenter={demoRegion.center}
            defaultMapZoom={demoRegion.zoom}
          />
        );
      case 'neighborhood':
        return <NeighborhoodScore key={widgetKey} {...commonProps} {...loc} />;
      case 'multistop':
        return <MultiStopPlanner key={widgetKey} {...commonProps} {...loc} maxStops={50} />;
      case 'listing-tour':
        return <ListingTourPlanner key={widgetKey} {...commonProps} />;
      case 'delivery':
        return <DeliveryETA key={widgetKey} {...commonProps} {...loc} destinationAddress={demoRegion.deliveryDestination} />;
      case 'instacart':
        return <InstacartDeliveryETA key={widgetKey} {...commonProps} {...loc} destinationAddress={demoRegion.deliveryDestination} />;
      case 'isoline':
        return <HereIsolineWidget key={widgetKey} {...commonProps} defaultTimeMinutes={15} {...loc} />;
      case 'isoline-overlap':
        return <IsolineOverlapWidget key={widgetKey} {...commonProps} />;
      case 'transit':
        return <PublicTransitDepartures key={widgetKey} {...commonProps} {...loc} />;
      case 'parking':
        return <ParkingFinder key={widgetKey} {...commonProps} {...loc} />;
      case 'construction':
        return <ConstructionHeatmap key={widgetKey} {...commonProps} {...loc} />;
      case 'contractor-finder':
        return <ContractorFinder key={widgetKey} {...commonProps} {...loc} />;
      case 'zone-coverage':
        return <MultiZoneCoverage key={widgetKey} {...commonProps} />;
      case 'property-intel':
        return <PropertyIntelligence key={widgetKey} {...commonProps} {...loc} />;
      case 'neighborhood-profile':
        return <NeighborhoodProfile key={widgetKey} {...commonProps} {...loc} />;
      case 'comp-sales':
        return <ComparableSalesMap key={widgetKey} {...commonProps} {...loc} />;
      case 'streetview-showcase':
        return (
          <MapillaryStreetViewShowcase
            key={widgetKey}
            mapquestApiKey={effectiveApiKey}
            darkMode={darkMode}
            accentColor={accentColor}
            fontFamily={fontFamily}
            borderRadius={borderRadius}
            showBranding={showBranding}
            companyName={companyName || undefined}
            companyLogo={companyLogo || undefined}
            {...loc}
          />
        );
      default:
        return null;
    }
  };

  const isStreetViewRoute = widgetId === 'streetview-showcase';

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
            className={
              isStreetViewRoute
                ? 'w-full max-w-full overflow-hidden md:max-w-[min(2400px,calc(75%_-_225px))]'
                : 'w-full md:w-auto'
            }
            ref={widgetMeasureRef}
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: widgetScale < 1 ? `translateX(-50%) scale(${widgetScale})` : 'translateX(-50%)',
              transformOrigin: 'top center',
              transition: 'transform 180ms ease',
              borderRadius: isStreetViewRoute ? streetViewBorderRadius(borderRadius) : borderRadius,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              width: isStreetViewRoute ? '100%' : 'fit-content',
              maxWidth: isStreetViewRoute ? undefined : '100%',
            }}
          >
            {renderWidget()}
          </div>
        </div>
      </div>
    </div>
  );
}
