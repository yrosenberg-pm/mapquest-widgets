// components/widgets/NeighborhoodScore.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  MapPin, Navigation, Loader2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  ShoppingCart, Utensils, Coffee, Trees, Dumbbell, GraduationCap, Pill, Building2,
  Bus, LucideIcon, MessageCircle, Send, X, Sparkles, CornerDownLeft,
  HeartPulse, Baby, Dog, Store, Wine, Zap, Footprints, Briefcase, BatteryCharging, Bike, Car
} from 'lucide-react';
import { geocode, searchPlaces, getDirections } from '@/lib/mapquest';
import { decodeHereFlexiblePolyline } from '@/lib/hereFlexiblePolyline';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';
import WidgetHeader from './WidgetHeader';

interface Category {
  id: string;
  name: string;
  icon: LucideIcon;
  group: string;
  mqCategory: string;
  weight: number;
}

type ThresholdType = 'standard' | 'walkable';

interface CategoryConfig {
  idealCount: number;
  searchRadius: number;
  thresholdType: ThresholdType;
}

interface POI {
  distance: number;
  name: string;
  lat?: number;
  lng?: number;
}

interface CategoryScore {
  category: Category;
  score: number;
  description: string;
  places: POI[];
  poiCount: number;
  closestDistance: number;
  error?: boolean;
}

interface NeighborhoodScoreProps {
  address?: string;
  lat?: number;
  lng?: number;
  categories?: Category[];
  accentColor?: string;
  darkMode?: boolean;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
  fontFamily?: string;
  borderRadius?: string;
  onScoreCalculated?: (result: { overall: number; categories: CategoryScore[] }) => void;
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'grocery', name: 'Groceries', icon: ShoppingCart, group: 'Amenities', mqCategory: 'multi:sic:541105,sic:541101,grocery store,supermarket', weight: 3 },
  { id: 'restaurant', name: 'Restaurants', icon: Utensils, group: 'Amenities', mqCategory: 'q:restaurant', weight: 2 },
  { id: 'coffee', name: 'Coffee Shops', icon: Coffee, group: 'Amenities', mqCategory: 'sic:581228', weight: 1 },
  { id: 'shopping', name: 'Shopping', icon: Store, group: 'Amenities', mqCategory: 'multi:sic:531101,sic:531102,shopping center,convenience store,retail store', weight: 1 },
  { id: 'pharmacy', name: 'Pharmacy', icon: Pill, group: 'Amenities', mqCategory: 'sic:591205', weight: 2 },
  { id: 'banks', name: 'Banks', icon: Building2, group: 'Amenities', mqCategory: 'sic:602101', weight: 1 },
  { id: 'parks', name: 'Parks', icon: Trees, group: 'Lifestyle', mqCategory: 'sic:799951', weight: 2 },
  { id: 'fitness', name: 'Fitness', icon: Dumbbell, group: 'Lifestyle', mqCategory: 'sic:799101', weight: 1 },
  { id: 'nightlife', name: 'Nightlife', icon: Wine, group: 'Lifestyle', mqCategory: 'multi:sic:581301,bar,nightclub,theater,entertainment venue', weight: 1 },
  { id: 'petFriendly', name: 'Pet-Friendly', icon: Dog, group: 'Lifestyle', mqCategory: 'multi:sic:074201,dog park,pet store,veterinary clinic', weight: 1 },
  { id: 'healthcare', name: 'Healthcare', icon: HeartPulse, group: 'Healthcare', mqCategory: 'multi:sic:801101,sic:806201,hospital,urgent care,medical clinic', weight: 3 },
  { id: 'schools', name: 'Schools', icon: GraduationCap, group: 'Education', mqCategory: 'sic:821101', weight: 2 },
  { id: 'daycare', name: 'Daycare', icon: Baby, group: 'Education', mqCategory: 'multi:sic:835101,daycare center,preschool,child care center', weight: 2 },
  { id: 'publicTransit', name: 'Public Transit', icon: Bus, group: 'Transportation', mqCategory: 'multi:sic:411101,sic:411104,sic:411201,sic:401101,sic:413101,sic:448301,metro station,subway,train station,light rail,trolley,streetcar,ferry terminal,transit center,amtrak,commuter rail', weight: 2 },
  { id: 'evCharging', name: 'EV Charging', icon: Zap, group: 'Transportation', mqCategory: 'multi:ev charging station,electric vehicle charger', weight: 1 },
];

const STANDARD_THRESHOLDS = [
  { maxDistance: 0.2, score: 5 },
  { maxDistance: 0.4, score: 4 },
  { maxDistance: 0.75, score: 3 },
  { maxDistance: 1.25, score: 2 },
  { maxDistance: 1.75, score: 1 },
];

const WALKABLE_THRESHOLDS = [
  { maxDistance: 0.15, score: 5 },
  { maxDistance: 0.3, score: 4 },
  { maxDistance: 0.5, score: 3 },
  { maxDistance: 0.75, score: 2 },
  { maxDistance: 1.0, score: 1 },
];

function getClosestScore(distance: number, thresholdType: ThresholdType): number {
  const thresholds = thresholdType === 'walkable' ? WALKABLE_THRESHOLDS : STANDARD_THRESHOLDS;
  for (const t of thresholds) {
    if (distance <= t.maxDistance) return t.score;
  }
  return 0;
}

function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

function geojsonToMapCoords(geometry: any): { lat: number; lng: number }[] | null {
  if (!geometry) return null;
  const { type, coordinates } = geometry;
  if (type === 'Polygon' && coordinates?.[0])
    return coordinates[0].map(([lng, lat]: [number, number]) => ({ lat, lng }));
  if (type === 'MultiPolygon' && coordinates?.length) {
    let best: [number, number][] = [];
    let bestArea = 0;
    for (const poly of coordinates) {
      if (poly[0]) {
        const a = ringArea(poly[0]);
        if (a > bestArea) { bestArea = a; best = poly[0]; }
      }
    }
    return best.map(([lng, lat]) => ({ lat, lng }));
  }
  return null;
}

// Ray-casting point-in-polygon test
function pointInPolygon(pt: { lat: number; lng: number }, ring: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat, xi = ring[i].lng;
    const yj = ring[j].lat, xj = ring[j].lng;
    if ((yi > pt.lat) !== (yj > pt.lat) &&
        pt.lng < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const categoryConfigs: Record<string, CategoryConfig> = {
  grocery: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
  restaurant: { idealCount: 10, searchRadius: 2, thresholdType: 'standard' },
  coffee: { idealCount: 5, searchRadius: 1, thresholdType: 'walkable' },
  shopping: { idealCount: 5, searchRadius: 2, thresholdType: 'standard' },
  pharmacy: { idealCount: 2, searchRadius: 2, thresholdType: 'standard' },
  banks: { idealCount: 2, searchRadius: 2, thresholdType: 'standard' },
  parks: { idealCount: 3, searchRadius: 1, thresholdType: 'walkable' },
  fitness: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
  nightlife: { idealCount: 5, searchRadius: 2, thresholdType: 'standard' },
  petFriendly: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
  healthcare: { idealCount: 3, searchRadius: 3, thresholdType: 'standard' },
  schools: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
  daycare: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
  publicTransit: { idealCount: 5, searchRadius: 2, thresholdType: 'walkable' },
  evCharging: { idealCount: 3, searchRadius: 3, thresholdType: 'standard' },
};

const categoryColors: Record<string, string> = {
  grocery: '#8b5cf6',
  restaurant: '#ef4444',
  coffee: '#f59e0b',
  shopping: '#f97316',
  pharmacy: '#06b6d4',
  banks: '#3b82f6',
  parks: '#10b981',
  fitness: '#ec4899',
  nightlife: '#7c3aed',
  petFriendly: '#a855f7',
  healthcare: '#dc2626',
  schools: '#6366f1',
  daycare: '#f472b6',
  publicTransit: '#0ea5e9',
  evCharging: '#16a34a',
};

const CATEGORY_ICON_SVG: Record<string, string> = {
  grocery: '<path d="M9 9h1l1 5h6l1-4H11" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="16" r=".9" fill="white"/><circle cx="16" cy="16" r=".9" fill="white"/>',
  restaurant: '<path d="M11 8v4a2 2 0 004 0V8M13 12v6M17 8v8M17 8a2 2 0 01-.5 4" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  coffee: '<path d="M10 9h6v5a3 3 0 01-3 3h0a3 3 0 01-3-3V9zM16 10h1a2 2 0 010 4h-1M10 19h6" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  shopping: '<path d="M9 10l1-3h6l1 3M9 10h8l-.7 7H9.7L9 10z" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="13" y1="13" x2="13" y2="15" stroke="white" stroke-width="1.5" stroke-linecap="round"/>',
  pharmacy: '<path d="M13 9v8M9 13h8" stroke="white" stroke-width="2.5" stroke-linecap="round"/>',
  banks: '<path d="M13 8l-5 3h10l-5-3zM9 12v5M13 12v5M17 12v5M8 17h10" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  parks: '<path d="M13 7l-4 6h8l-4-6zM13 11l-3 5h6l-3-5z" fill="none" stroke="white" stroke-width="1.4" stroke-linejoin="round"/><line x1="13" y1="16" x2="13" y2="19" stroke="white" stroke-width="1.5"/>',
  fitness: '<path d="M8 13h10M10 10v6M16 10v6" stroke="white" stroke-width="2" stroke-linecap="round"/>',
  nightlife: '<path d="M10 8h6l-2.5 4v3h-1v-3L10 8zM11 18h4" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  petFriendly: '<circle cx="10.5" cy="9.5" r="1.3" fill="white"/><circle cx="15.5" cy="9.5" r="1.3" fill="white"/><circle cx="8.5" cy="13" r="1.3" fill="white"/><circle cx="17.5" cy="13" r="1.3" fill="white"/><ellipse cx="13" cy="16" rx="2.5" ry="2" fill="white"/>',
  healthcare: '<path d="M13 9c-1.2-1.8-3.5-2-4.5-.5s-.3 4.2 4.5 8c4.8-3.8 5.5-6.5 4.5-8s-3.3-1.3-4.5.5z" fill="white" fill-opacity="0.9" stroke="white" stroke-width="1"/>',
  schools: '<path d="M13 8l-6 3.5 6 3.5 6-3.5L13 8z" fill="none" stroke="white" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 13v3.5l3 2 3-2V13" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  daycare: '<circle cx="13" cy="10" r="2.5" fill="none" stroke="white" stroke-width="1.5"/><path d="M9.5 19v-2a3.5 3.5 0 017 0v2" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round"/>',
  publicTransit: '<rect x="9" y="8" width="8" height="10" rx="2" fill="none" stroke="white" stroke-width="1.5"/><line x1="9" y1="14" x2="17" y2="14" stroke="white" stroke-width="1.5"/><circle cx="11" cy="16.5" r=".8" fill="white"/><circle cx="15" cy="16.5" r=".8" fill="white"/>',
  evCharging: '<path d="M15 8l-4.5 6H13l-.5 4L17 12h-2.5L15 8z" fill="white" fill-opacity="0.9" stroke="white" stroke-width=".8" stroke-linejoin="round"/>',
};

function categoryPinSvg(categoryId: string, color: string, isHighlighted: boolean): string {
  const size = isHighlighted ? 36 : 28;
  const viewBox = 26;
  const cx = viewBox / 2;
  const cy = 10;
  const r = 9;
  const iconSvg = CATEGORY_ICON_SVG[categoryId] || '';
  const strokeW = isHighlighted ? 2.5 : 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 1.35)}" viewBox="0 0 ${viewBox} ${Math.round(viewBox * 1.35)}">
    <defs><filter id="s"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.25"/></filter></defs>
    <g filter="url(#s)">
      <path d="M${cx} ${viewBox * 1.25}C${cx} ${viewBox * 1.25} ${cx + r + 1} ${cy + r + 2} ${cx + r + 1} ${cy} A${r + 1} ${r + 1} 0 0 0 ${cx - r - 1} ${cy} C${cx - r - 1} ${cy + r + 2} ${cx} ${viewBox * 1.25} ${cx} ${viewBox * 1.25}Z" fill="${color}" stroke="white" stroke-width="${strokeW}"/>
      <g transform="translate(${cx - 13}, ${cy - 13}) scale(1)">${iconSvg}</g>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

function calculateCategoryScore(pois: POI[], config: CategoryConfig): number {
  if (pois.length === 0) return 0;

  const CLOSEST_WEIGHT = 0.5;
  const DENSITY_WEIGHT = 0.3;
  const AVERAGE_DIST_WEIGHT = 0.2;

  const closestDistance = Math.min(...pois.map(p => p.distance));
  const closestScore = getClosestScore(closestDistance, config.thresholdType);

  const cappedCount = Math.min(pois.length, config.idealCount * 2);
  const densityScore = Math.min(5, (cappedCount / config.idealCount) * 5);

  const avgDistance = pois.reduce((sum, p) => sum + p.distance, 0) / pois.length;
  const avgScore = Math.max(0, 5 - (avgDistance * 2.5));

  const rawScore = (closestScore * CLOSEST_WEIGHT) + 
                   (densityScore * DENSITY_WEIGHT) + 
                   (avgScore * AVERAGE_DIST_WEIGHT);

  return Math.round(rawScore * 10) / 10;
}

function calculateOverallScore(categoryScores: CategoryScore[]): number {
  const scores = categoryScores
    .filter(catScore => !catScore.error)
    .map(catScore => catScore.score);
  
  if (scores.length === 0) return 0;
  
  const sum = scores.reduce((total, score) => total + score, 0);
  const average = sum / scores.length;
  
  return Math.round(average * 10) / 10;
}

export default function NeighborhoodScore({
  address: initialAddress = '',
  lat: initialLat,
  lng: initialLng,
  categories = DEFAULT_CATEGORIES,
  accentColor = '#6366f1',
  darkMode = false,
  showBranding = true,
  companyName,
  companyLogo,
  fontFamily,
  onScoreCalculated,
}: NeighborhoodScoreProps) {
  const [address, setAddress] = useState(initialAddress);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );
  const [scores, setScores] = useState<CategoryScore[]>([]);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryScore | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<POI | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapFitBounds, setMapFitBounds] = useState<{ north: number; south: number; east: number; west: number } | undefined>(undefined);
  const [mapZoomToLocation, setMapZoomToLocation] = useState<{ lat: number; lng: number; zoom?: number } | undefined>(undefined);
  const placeItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Walkability isoline state
  const [showWalkability, setShowWalkability] = useState(false);
  const [walkabilityPolygons, setWalkabilityPolygons] = useState<Array<{ coordinates: { lat: number; lng: number }[]; color: string; label: string }>>([]);
  const [walkabilityLoading, setWalkabilityLoading] = useState(false);

  // Area boundary state
  const [boundaryPolygon, setBoundaryPolygon] = useState<{ lat: number; lng: number }[] | null>(null);
  const [boundaryLabel, setBoundaryLabel] = useState<string>('');
  const [boundaryHint, setBoundaryHint] = useState<string>('');

  // EV Score state
  const [evScore, setEvScore] = useState<number | null>(null);
  const [evBreakdown, setEvBreakdown] = useState<{
    chargerCount: number; evPermits: number;
    solarPermits: number; permitGrowthRate: number;
  } | null>(null);

  // Commute time state
  const [workAddress, setWorkAddress] = useState('');
  const [workLocation, setWorkLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [commuteData, setCommuteData] = useState<{
    driveMinutes: number; transitMinutes: number | null;
    walkMinutes: number | null; bikeMinutes: number | null;
    distanceMiles: number;
  } | null>(null);
  const [commuteLoading, setCommuteLoading] = useState(false);

  // Chat state
  interface ChatMsg { role: 'user' | 'assistant'; content: string }
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => chatInputRef.current?.focus(), 150);
    }
  }, [chatOpen]);

  const sendChatMessage = useCallback(async (text?: string) => {
    const msg = text ?? chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    const userMsg: ChatMsg = { role: 'user', content: msg };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);

    try {
      const scoresSummary = scores.map(s => {
        const topPlaces = s.places.slice(0, 5).map(p => `  - ${p.name} (${p.distance.toFixed(2)} mi)`).join('\n');
        return `${s.category.name}: ${s.score.toFixed(1)}/5 — ${s.poiCount} found, closest at ${s.closestDistance === Infinity ? 'N/A' : s.closestDistance.toFixed(2) + ' mi'}\n${topPlaces}`;
      }).join('\n\n');

      const commuteStr = commuteData
        ? `COMMUTE: ${commuteData.driveMinutes} min drive (${commuteData.distanceMiles} mi)${commuteData.transitMinutes != null ? `, ${commuteData.transitMinutes} min transit` : ''}${commuteData.walkMinutes != null ? `, ${commuteData.walkMinutes} min walk` : ''}${commuteData.bikeMinutes != null ? `, ${commuteData.bikeMinutes} min bike` : ''} to ${workAddress || 'work'}`
        : '';
      const walkStr = walkabilityPolygons.length > 0 ? 'WALKABILITY: 10-min and 20-min walk zones available on map' : '';

      const evStr = evScore !== null ? `EV READINESS: ${evScore}/100${evBreakdown ? ` (${evBreakdown.chargerCount} chargers, ${evBreakdown.solarPermits} solar permits, ${evBreakdown.permitGrowthRate}% growth)` : ''}` : '';

      const context = `WIDGET: Neighborhood Score
ADDRESS: ${address || 'Unknown'}
LOCATION: ${location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'Not set'}
OVERALL SCORE: ${overallScore !== null ? `${overallScore.toFixed(1)} / 5` : 'Not calculated yet'}
${evStr}
${commuteStr}
${walkStr}

CATEGORY SCORES:
${scoresSummary || 'No scores calculated yet. The user needs to click "Calculate Scores" first.'}`;

      const res = await fetch('/api/widget-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: chatMessages.slice(-10),
          context,
          lat: location?.lat,
          lng: location?.lng,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong: ${data.error}` }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I couldn\'t connect to the assistant. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, scores, chatMessages, address, location]);

  const fetchWalkabilityIsolines = useCallback(async (loc: { lat: number; lng: number }) => {
    setWalkabilityLoading(true);
    try {
      const params = new URLSearchParams({
        endpoint: 'isoline',
        origin: `${loc.lat},${loc.lng}`,
        rangeType: 'time',
        rangeValues: '600,1200',
        transportMode: 'pedestrian',
      });
      const res = await fetch(`/api/here?${params}`);
      if (!res.ok) throw new Error('Isoline fetch failed');
      const data = await res.json();
      const polys: typeof walkabilityPolygons = [];
      const labels = ['10-min walk', '20-min walk'];
      const colors = ['#3b82f6', '#93c5fd'];
      if (data.isolines) {
        data.isolines.forEach((iso: any, idx: number) => {
          if (iso.polygons?.[0]?.outer) {
            const decoded = decodeHereFlexiblePolyline(iso.polygons[0].outer);
            polys.push({
              coordinates: decoded.points.map(p => ({ lat: p.lat, lng: p.lng })),
              color: colors[idx] || '#3b82f6',
              label: labels[idx] || `${(idx + 1) * 10}-min`,
            });
          }
        });
      }
      setWalkabilityPolygons(polys);
    } catch {
      setWalkabilityPolygons([]);
    } finally {
      setWalkabilityLoading(false);
    }
  }, []);

  const resolveBoundary = useCallback(async (addr: string): Promise<{ polygon: { lat: number; lng: number }[]; label: string } | 'too_large' | null> => {
    if (!addr.trim()) return null;
    const trimmed = addr.trim();
    const parts = trimmed.split(',').map(s => s.trim());

    const primaryName = parts[0];
    const isStreetAddress = /^\d+\s/.test(primaryName);
    const primaryIsZip = /^\d{5}$/.test(primaryName);
    const zipMatch = trimmed.match(/\b(\d{5})\b/);

    const attempts: { type: string; q: string }[] = [];

    if (primaryIsZip) {
      attempts.push({ type: 'zip', q: primaryName });
    } else if (isStreetAddress) {
      if (zipMatch) attempts.push({ type: 'zip', q: zipMatch[1] });
      const cityPart = parts.find((p, i) =>
        i > 0 && !/^\d/.test(p) && !/united states/i.test(p) && !/^[A-Z]{2}$/.test(p) && !/^[A-Z]{2}\s+\d{5}/.test(p)
      );
      if (cityPart) {
        attempts.push({ type: 'neighborhood', q: cityPart });
      }
    } else {
      if (zipMatch) attempts.push({ type: 'zip', q: zipMatch[1] });
      attempts.push({ type: 'neighborhood', q: trimmed });
      // Only try the bare name when the user didn't provide location context
      if (parts.length === 1) {
        attempts.push({ type: 'neighborhood', q: primaryName });
      }
    }

    const seen = new Set<string>();
    const unique = attempts.filter(a => {
      const key = `${a.type}:${a.q}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Reject polygons too large for a neighborhood-level score (e.g. entire states)
    const isTooLarge = (coords: { lat: number; lng: number }[]) => {
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const c of coords) {
        if (c.lat < minLat) minLat = c.lat;
        if (c.lat > maxLat) maxLat = c.lat;
        if (c.lng < minLng) minLng = c.lng;
        if (c.lng > maxLng) maxLng = c.lng;
      }
      return (maxLat - minLat) > 1.5 || (maxLng - minLng) > 1.5;
    };

    let rejectedAsLarge = false;

    try {
      for (const attempt of unique) {
        const res = await fetch(`/api/boundary?type=${attempt.type}&q=${encodeURIComponent(attempt.q)}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.approximate) continue;
        const coords = geojsonToMapCoords(data.geometry);
        if (coords && coords.length >= 3) {
          if (isTooLarge(coords)) { rejectedAsLarge = true; continue; }
          return { polygon: coords, label: data.label || primaryName };
        }
      }
      for (const attempt of unique) {
        const res = await fetch(`/api/boundary?type=${attempt.type}&q=${encodeURIComponent(attempt.q)}`);
        if (!res.ok) continue;
        const data = await res.json();
        const coords = geojsonToMapCoords(data.geometry);
        if (coords && coords.length >= 3) {
          if (isTooLarge(coords)) { rejectedAsLarge = true; continue; }
          return { polygon: coords, label: data.label || primaryName };
        }
      }
    } catch { /* boundary unavailable */ }
    // If all neighborhood attempts failed (e.g. user searched a city name), hint to narrow
    if (!primaryIsZip && !isStreetAddress && !rejectedAsLarge && unique.length > 0) {
      rejectedAsLarge = true;
    }
    return rejectedAsLarge ? 'too_large' : null;
  }, []);

  const fetchEvScore = useCallback(async (loc: { lat: number; lng: number }) => {
    try {
      const params = new URLSearchParams({ lat: String(loc.lat), lng: String(loc.lng) });
      const res = await fetch(`/api/ev-score?${params}`);
      if (!res.ok) { setEvScore(null); setEvBreakdown(null); return; }
      const data = await res.json();
      setEvScore(data.score ?? null);
      setEvBreakdown(data.breakdown ?? null);
    } catch {
      setEvScore(null);
      setEvBreakdown(null);
    }
  }, []);

  const calculateCommute = useCallback(async () => {
    if (!location || !workLocation) return;
    setCommuteLoading(true);
    try {
      const fromStr = `${location.lat},${location.lng}`;
      const toStr = `${workLocation.lat},${workLocation.lng}`;

      const [driveResult, walkResult, bikeResult] = await Promise.all([
        getDirections(fromStr, toStr, 'fastest'),
        getDirections(fromStr, toStr, 'pedestrian').catch(() => null),
        getDirections(fromStr, toStr, 'bicycle').catch(() => null),
      ]);

      const driveSec = (driveResult?.time || 0) * 60;
      const driveDist = driveResult?.distance || 0;

      let transitMin: number | null = null;
      try {
        const transitParams = new URLSearchParams({
          endpoint: 'transit',
          origin: `${location.lat},${location.lng}`,
          destination: `${workLocation.lat},${workLocation.lng}`,
        });
        const transitRes = await fetch(`/api/here?${transitParams}`);
        const transitData = await transitRes.json();
        const transitRoute = transitData.routes?.[0];
        if (transitRoute) {
          const totalSec = transitRoute.sections?.reduce((sum: number, s: any) => sum + (s.travelSummary?.duration || 0), 0) || 0;
          transitMin = Math.round(totalSec / 60);
        }
      } catch { /* transit not always available */ }

      const walkMin = walkResult?.time ? Math.round((walkResult.time * 60) / 60) : null;
      const bikeMin = bikeResult?.time ? Math.round((bikeResult.time * 60) / 60) : null;

      setCommuteData({
        driveMinutes: Math.round(driveSec / 60),
        transitMinutes: transitMin,
        walkMinutes: walkMin,
        bikeMinutes: bikeMin,
        distanceMiles: Math.round(driveDist * 10) / 10,
      });
    } catch {
      setCommuteData(null);
    } finally {
      setCommuteLoading(false);
    }
  }, [location, workLocation]);


  // Keep Tailwind classes for AddressAutocomplete compatibility
  const inputBg = darkMode ? 'bg-gray-700' : 'bg-gray-50';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  const calculateScores = async () => {
    let loc = location;

    if (!loc && address) {
      try {
        const result = await geocode(address);
        if (result && result.lat && result.lng) {
          loc = { lat: result.lat, lng: result.lng };
          setLocation(loc);
        } else {
          setError('Address not found');
          return;
        }
      } catch {
        setError('Could not find address');
        return;
      }
    }

    if (!loc) {
      setError('Please enter an address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const haversine = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const R = 3959;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      // Fetch boundary AND raw POI data in parallel
      const [boundaryResult, rawCategoryScores] = await Promise.all([
        resolveBoundary(address),
        Promise.all(
          categories.map(async (category) => {
            try {
              const config = categoryConfigs[category.id] || { idealCount: 3, searchRadius: 2, thresholdType: 'standard' as ThresholdType };

              if (category.id === 'publicTransit') {
                const fetchRadius = Math.round(Math.max(config.searchRadius, 2) * 1609.34);
                const inStr = `${loc!.lat},${loc!.lng};r=${fetchRadius}`;
                const res = await fetch(`/api/here?endpoint=stations&in=${encodeURIComponent(inStr)}&maxPlaces=50`);
                if (!res.ok) throw new Error('Station search failed');
                const data = await res.json();

                const RAIL_MODES = new Set(['subway', 'metro', 'lightRail', 'tram', 'monorail',
                  'regionalTrain', 'intercityTrain', 'highSpeedTrain', 'cityTrain', 'train', 'rail']);

                interface StationPOI extends POI { isRail: boolean }

                const allStations: StationPOI[] = (data.stations || []).map((s: any) => {
                  const sLat = s.place?.location?.lat ?? s.place?.lat ?? 0;
                  const sLng = s.place?.location?.lng ?? s.place?.lng ?? 0;
                  const dist = haversine(loc!.lat, loc!.lng, sLat, sLng);
                  const transports: any[] = s.transports || s.place?.transports || [];
                  const modeNames = transports.map((t: any) => t.mode || t.name || '').filter(Boolean);
                  const uniqueModes = [...new Set(modeNames)];
                  const isRail = uniqueModes.some(m => RAIL_MODES.has(m));
                  const modeStr = uniqueModes.length > 0 ? ` (${uniqueModes.join(', ')})` : '';
                  return {
                    distance: Math.round(dist * 100) / 100,
                    name: (s.place?.name || s.name || 'Transit Stop') + modeStr,
                    lat: sLat || undefined,
                    lng: sLng || undefined,
                    isRail,
                  };
                }).filter((p: StationPOI) => p.distance > 0 && p.distance <= config.searchRadius);

                const railStations = allStations.filter(s => s.isRail).sort((a, b) => a.distance - b.distance);
                const busStations = allStations.filter(s => !s.isRail).sort((a, b) => a.distance - b.distance);
                const stationPois: POI[] = [...railStations, ...busStations];

                const poiCount = stationPois.length;
                const closestDistance = poiCount > 0 ? Math.min(...stationPois.map(p => p.distance)) : Infinity;
                const score = calculateCategoryScore(stationPois, config);
                let description: string;
                const railCount = railStations.length;
                if (score >= 4) description = `Excellent transit access${railCount > 0 ? ` — ${railCount} subway/rail station${railCount > 1 ? 's' : ''}` : ''}`;
                else if (score >= 3) description = `Good transit options${railCount > 0 ? ` — ${railCount} subway/rail` : ''}`;
                else if (score >= 2) description = 'Some transit stops available';
                else if (score >= 1) description = 'Limited transit in this area';
                else description = 'No transit stops found nearby';
                return { category, score, description, places: stationPois, poiCount, closestDistance };
              }

              const places = await searchPlaces(
                loc!.lat,
                loc!.lng,
                category.mqCategory,
                config.searchRadius,
                100
              );

              if (!places || places.length === 0) {
                return {
                  category,
                  score: 0,
                  description: 'None found nearby',
                  places: [],
                  poiCount: 0,
                  closestDistance: Infinity,
                };
              }

              const groceryBlocklist = [
                'apple', 'microsoft', 'google', 'best buy', 'target mobile',
                'verizon', 'at&t', 't-mobile', 'sprint', 'gamestop',
                'foot locker', 'nike', 'adidas', 'lululemon', 'gap',
                'banana republic', 'old navy', 'h&m', 'zara', 'forever 21',
                'sephora', 'ulta', 'mac cosmetics', 'bath & body works',
                'victoria\'s secret', 'pink', 'american eagle', 'hollister',
                'abercrombie', 'express', 'buckle', 'zumiez', 'hot topic',
                'spencer\'s', 'build-a-bear', 'claire\'s', 'piercing pagoda',
                'kay jewelers', 'jared', 'zales', 'pandora', 'swarovski',
                'tesla', 'bmw', 'mercedes', 'lexus', 'audi', 'porsche',
              ];

              const pois: POI[] = places
                .map(p => {
                  let distance = p.distance;
                  let lat: number | undefined;
                  let lng: number | undefined;

                  if (p.place?.geometry?.coordinates) {
                    const coords = p.place.geometry.coordinates;
                    if (coords && coords.length >= 2) {
                      lng = coords[0];
                      lat = coords[1];
                      if ((distance === undefined || distance === null || distance === 0)) {
                        distance = haversine(loc!.lat, loc!.lng, lat, lng);
                      }
                    }
                  }

                  if ((distance === undefined || distance === null || distance === 0) && (p as any).distanceKm) {
                    distance = (p as any).distanceKm * 0.621371;
                  }

                  return {
                    distance: distance || 0,
                    name: p.name || 'Unknown',
                    lat,
                    lng,
                  };
                })
                .filter(p => p.distance > 0)
                .filter(p => p.distance <= config.searchRadius)
                .filter(p => {
                  if (category.id === 'grocery') {
                    const nameLower = p.name.toLowerCase();
                    return !groceryBlocklist.some(blocked => nameLower.includes(blocked));
                  }
                  return true;
                })
                .sort((a, b) => a.distance - b.distance);

              const poiCount = pois.length;
              const closestDistance = poiCount > 0 ? pois[0].distance : Infinity;
              const score = calculateCategoryScore(pois, config);

              let description: string;
              if (score >= 4) description = `Excellent ${category.name.toLowerCase()} options nearby`;
              else if (score >= 3) description = `Good variety within walking distance`;
              else if (score >= 2) description = `Some options available`;
              else if (score >= 1) description = `Limited options in this area`;
              else description = `None found nearby`;

              return { category, score, description, places: pois, poiCount, closestDistance };
            } catch {
              return {
                category,
                score: 0,
                description: 'Unable to load',
                places: [],
                poiCount: 0,
                closestDistance: Infinity,
                error: true,
              };
            }
          })
        ),
      ]);

      // Set boundary state
      if (boundaryResult === 'too_large') {
        setBoundaryPolygon(null);
        setBoundaryLabel('');
        setBoundaryHint('That area is too broad — try a zip code or neighborhood for a more detailed score.');
      } else if (boundaryResult) {
        setBoundaryPolygon(boundaryResult.polygon);
        setBoundaryLabel(boundaryResult.label);
        setBoundaryHint('');
      } else {
        setBoundaryPolygon(null);
        setBoundaryLabel('');
        setBoundaryHint('');
      }

      // Filter POIs to only those within the boundary, then recalculate scores
      const ring = (boundaryResult && boundaryResult !== 'too_large') ? boundaryResult.polygon : null;
      const categoryScores: CategoryScore[] = ring
        ? rawCategoryScores.map(cs => {
            if (cs.error || cs.places.length === 0) return cs;
            const filtered = cs.places.filter(p =>
              p.lat != null && p.lng != null
                ? pointInPolygon({ lat: p.lat, lng: p.lng }, ring)
                : false
            );
            const config = categoryConfigs[cs.category.id] || { idealCount: 3, searchRadius: 2, thresholdType: 'standard' as ThresholdType };
            const score = filtered.length > 0 ? calculateCategoryScore(filtered, config) : 0;
            const poiCount = filtered.length;
            const closestDistance = poiCount > 0 ? Math.min(...filtered.map(p => p.distance)) : Infinity;

            let description: string;
            if (cs.category.id === 'publicTransit') {
              const railCount = filtered.filter(p => p.name.includes('(subway') || p.name.includes('(metro') || p.name.includes('(light') || p.name.includes('(train') || p.name.includes('(rail')).length;
              if (score >= 4) description = `Excellent transit access${railCount > 0 ? ` — ${railCount} subway/rail station${railCount > 1 ? 's' : ''}` : ''}`;
              else if (score >= 3) description = `Good transit options${railCount > 0 ? ` — ${railCount} subway/rail` : ''}`;
              else if (score >= 2) description = 'Some transit stops available';
              else if (score >= 1) description = 'Limited transit in this area';
              else description = 'No transit stops found in this area';
            } else {
              if (score >= 4) description = `Excellent ${cs.category.name.toLowerCase()} options nearby`;
              else if (score >= 3) description = `Good variety within the area`;
              else if (score >= 2) description = `Some options available`;
              else if (score >= 1) description = `Limited options in this area`;
              else description = `None found in this area`;
            }
            return { ...cs, places: filtered, score, poiCount, closestDistance, description };
          })
        : rawCategoryScores;

      setScores(categoryScores);

      const overall = calculateOverallScore(categoryScores);
      setOverallScore(overall);

      if (loc) {
        setMapZoomToLocation({ lat: loc.lat, lng: loc.lng, zoom: 14 });
        setMapFitBounds(undefined);
        fetchWalkabilityIsolines(loc);
        fetchEvScore(loc);
      }

      onScoreCalculated?.({ overall, categories: categoryScores });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 4) return '#22c55e';
    if (score >= 3) return '#eab308';
    if (score >= 2) return '#f97316';
    return '#ef4444';
  };

  const ScoreRing = ({ score, size = 48 }: { score: number; size?: number }) => {
    const color = getScoreColor(score);
    const circumference = 2 * Math.PI * 18;
    const progress = (score / 5) * circumference;

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle 
            cx={size / 2} 
            cy={size / 2} 
            r={18} 
            fill="none" 
            stroke="var(--border-default)" 
            strokeWidth="4" 
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={18}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>{score.toFixed(1)}</span>
        </div>
      </div>
    );
  };

  const CategoryIcon = ({ icon: Icon, className, style }: { icon: LucideIcon; className?: string; style?: React.CSSProperties }) => (
    <span style={style}><Icon className={className || 'w-4 h-4'} /></span>
  );

  const groupedCategories = categories.reduce((groups, cat) => {
    if (!groups[cat.group]) groups[cat.group] = [];
    groups[cat.group].push(cat);
    return groups;
  }, {} as Record<string, Category[]>);

  const mapCenter = location || { lat: 39.8283, lng: -98.5795 };

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
        title="Neighborhood Score"
        subtitle="Score an area based on nearby amenities."
        variant="impressive"
        layout="inline"
        icon={<MapPin className="w-4 h-4" />}
      />
      <div className="flex flex-col md:flex-row md:h-[700px]">
        {/* Map + Chat overlay - shown first on mobile */}
        <div className="relative h-[300px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={location ? 14 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={(() => {
              const markers: Array<{ lat: number; lng: number; label?: string; color?: string; type?: 'home' | 'poi'; iconUrl?: string; iconSize?: [number, number]; iconAnchor?: [number, number]; iconCircular?: boolean; zIndexOffset?: number; onClick?: () => void }> = [];
              
              if (location) {
                markers.push({ lat: location.lat, lng: location.lng, label: 'Home', color: accentColor, type: 'home' });
              }
              
              if (selectedCategory && selectedCategory.places.length > 0) {
                const catId = selectedCategory.category.id;
                const categoryColor = categoryColors[catId] || '#10b981';
                const highlightedColor = '#1d4ed8';
                
                selectedCategory.places.forEach((poi) => {
                  if (poi.lat && poi.lng) {
                    const isHighlighted = selectedPlace?.name === poi.name && selectedPlace?.distance === poi.distance;
                    const pinColor = isHighlighted ? highlightedColor : categoryColor;
                    const pinSize = isHighlighted ? 36 : 28;
                    const pinH = Math.round(pinSize * 1.35);
                    markers.push({
                      lat: poi.lat,
                      lng: poi.lng,
                      label: poi.name,
                      iconUrl: categoryPinSvg(catId, pinColor, isHighlighted),
                      iconSize: [pinSize, pinH],
                      iconAnchor: [pinSize / 2, pinH],
                      iconCircular: false,
                      zIndexOffset: isHighlighted ? 900 : 0,
                      onClick: () => {
                        const matchingPoi = selectedCategory.places.find(
                          p => p.lat === poi.lat && p.lng === poi.lng
                        );
                        if (matchingPoi) {
                          setSelectedPlace(matchingPoi);
                          setMapZoomToLocation({ lat: matchingPoi.lat!, lng: matchingPoi.lng!, zoom: 16 });
                          setMapFitBounds(undefined);
                          
                          const placeKey = `${matchingPoi.name}-${matchingPoi.distance}`;
                          const listItem = placeItemRefs.current.get(placeKey);
                          if (listItem) {
                            if (!expandedCategories.has(selectedCategory.category.id) && 
                                selectedCategory.places.indexOf(matchingPoi) >= 10) {
                              const newExpanded = new Set(expandedCategories);
                              newExpanded.add(selectedCategory.category.id);
                              setExpandedCategories(newExpanded);
                              setTimeout(() => {
                                listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 100);
                            } else {
                              listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }
                        }
                      },
                    });
                  }
                });
              }

              if (workLocation) {
                markers.push({ lat: workLocation.lat, lng: workLocation.lng, label: 'Work', color: '#f59e0b', type: 'home' });
              }

              return markers;
            })()}
            polygons={[
              ...(boundaryPolygon ? [{
                coordinates: boundaryPolygon,
                color: accentColor,
                fillOpacity: 0.08,
                strokeWidth: 2,
              }] : []),
              ...(showWalkability ? walkabilityPolygons.map(p => ({
                coordinates: p.coordinates,
                color: p.color,
                fillOpacity: 0.12,
                strokeWidth: 2,
              })) : []),
            ]}
            fitBounds={mapFitBounds}
            zoomToLocation={mapZoomToLocation}
          />

          {/* Chat overlay — bottom-right of map */}
          <div className="absolute bottom-3 right-3 z-[1000]" style={{ pointerEvents: 'auto' }}>
            {chatOpen ? (
              <div
                className="flex flex-col rounded-2xl overflow-hidden shadow-xl"
                style={{
                  width: 320,
                  height: 380,
                  background: 'var(--bg-widget)',
                  border: '1px solid var(--border-subtle)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
                  style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: accentColor }} />
                  <span className="text-xs font-semibold flex-1" style={{ color: 'var(--text-main)' }}>
                    Neighborhood Assistant
                  </span>
                  <button
                    onClick={() => setChatOpen(false)}
                    className="p-1 rounded-md transition-colors hover:bg-black/5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto prism-scrollbar px-3 py-2 space-y-2">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-6">
                      <Sparkles className="w-6 h-6 mx-auto mb-2" style={{ color: accentColor, opacity: 0.5 }} />
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Ask me anything about this neighborhood
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                        {[
                          'What is the closest school?',
                          'Is this area walkable?',
                          'Best coffee nearby?',
                        ].map(q => (
                          <button
                            key={q}
                            onClick={() => sendChatMessage(q)}
                            className="text-[10px] px-2 py-1 rounded-full transition-colors hover:opacity-80"
                            style={{
                              background: accentColor + '15',
                              color: accentColor,
                              border: `1px solid ${accentColor}30`,
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className="max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed"
                        style={
                          msg.role === 'user'
                            ? { background: accentColor, color: 'white', borderBottomRightRadius: 4 }
                            : { background: 'var(--bg-input)', color: 'var(--text-main)', borderBottomLeftRadius: 4 }
                        }
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div
                        className="px-3 py-2 rounded-xl text-xs"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', borderBottomLeftRadius: 4 }}
                      >
                        <span className="inline-flex gap-1">
                          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div
                  className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                  style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}
                >
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                    placeholder="Ask about this area..."
                    className="flex-1 text-xs px-3 py-2 rounded-lg outline-none"
                    style={{
                      background: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                    }}
                    disabled={chatLoading}
                  />
                  <button
                    onClick={() => sendChatMessage()}
                    disabled={!chatInput.trim() || chatLoading}
                    className="p-2 rounded-lg transition-colors disabled:opacity-30 hover:brightness-110 transition-all"
                    style={{ background: accentColor, color: 'white' }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all hover:scale-105"
                style={{
                  background: 'var(--bg-widget)',
                  border: '1px solid var(--border-subtle)',
                  color: accentColor,
                }}
              >
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-semibold">Ask AI</span>
              </button>
            )}
          </div>
        </div>
        {/* Sidebar */}
        <div 
          className="w-full md:w-[40%] flex flex-col overflow-hidden border-t md:border-t-0 md:border-r md:order-1"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {/* Header with Input */}
          <div 
            className="p-4"
            style={{ 
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-panel)',
            }}
          >
            <div
              className="rounded-xl flex items-center gap-2.5"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', padding: '10px 12px' }}
            >
              <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
              <AddressAutocomplete
                value={address}
                onChange={(newAddress) => {
                  setAddress(newAddress);
                  if ((scores.length > 0 || overallScore !== null) && newAddress !== address) {
                    setScores([]);
                    setOverallScore(null);
                    setSelectedCategory(null);
                    setSelectedPlace(null);
                    setLocation(null);
                    setError(null);
                  }
                }}
                onSelect={(result) => {
                  if (result.lat && result.lng) {
                    setLocation({ lat: result.lat, lng: result.lng });
                  }
                }}
                placeholder="Enter a city, zip code, or neighborhood to get started"
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
              onClick={calculateScores}
              disabled={loading || (!address && !location)}
              className="prism-btn prism-btn-primary w-full mt-2 hover:brightness-110 transition-all"
              style={{ 
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                boxShadow: `0 4px 12px ${accentColor}40`,
              }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 prism-spinner" /> Analyzing...</>
              ) : (
                <><Navigation className="w-4 h-4" /> Calculate Scores</>
              )}
            </button>
            {error && (
              <p 
                className="mt-2 text-xs font-medium px-3 py-2 rounded-lg"
                style={{ 
                  color: 'var(--color-error)', 
                  background: 'var(--color-error-bg)' 
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto prism-scrollbar">

            {boundaryHint && (
              <div
                className="mx-4 mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs leading-relaxed"
                style={{ background: '#f59e0b12', border: '1px solid #f59e0b30', color: '#92400e' }}
              >
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                <span>{boundaryHint}</span>
              </div>
            )}

            {/* Overall Score + Quick Tools */}
            {overallScore !== null && (
              <div className="p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {/* Score header */}
                <div className="flex items-center gap-4">
                  <ScoreRing score={overallScore} size={72} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      Neighborhood Score
                    </div>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-3xl font-extrabold leading-none" style={{ color: getScoreColor(overallScore) }}>
                        {overallScore.toFixed(1)}
                      </span>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>/ 5</span>
                      <span
                        className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: getScoreColor(overallScore) + '18',
                          color: getScoreColor(overallScore),
                        }}
                      >
                        {overallScore >= 4 ? 'Excellent' : overallScore >= 3 ? 'Good' : overallScore >= 2 ? 'Fair' : 'Limited'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* EV Readiness Score */}
                {evScore !== null && (
                  <div
                    className="mt-3 p-3 rounded-xl"
                    style={{
                      background: 'var(--bg-panel)',
                      border: '1.5px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          background: (evScore >= 70 ? '#22c55e' : evScore >= 45 ? '#eab308' : '#ef4444') + '18',
                        }}
                      >
                        <BatteryCharging
                          className="w-6 h-6"
                          style={{ color: evScore >= 70 ? '#22c55e' : evScore >= 45 ? '#eab308' : '#ef4444' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                          EV Readiness
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className="text-2xl font-extrabold leading-none"
                            style={{ color: evScore >= 70 ? '#22c55e' : evScore >= 45 ? '#eab308' : '#ef4444' }}
                          >
                            {evScore}
                          </span>
                          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>/ 100</span>
                          <span
                            className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{
                              background: (evScore >= 70 ? '#22c55e' : evScore >= 45 ? '#eab308' : '#ef4444') + '18',
                              color: evScore >= 70 ? '#22c55e' : evScore >= 45 ? '#eab308' : '#ef4444',
                            }}
                          >
                            {evScore >= 80 ? 'Excellent' : evScore >= 60 ? 'Good' : evScore >= 40 ? 'Fair' : 'Limited'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${evScore}%`,
                          background: evScore >= 70 ? '#22c55e' : evScore >= 45 ? '#eab308' : '#ef4444',
                        }}
                      />
                    </div>
                    {/* Compact breakdown */}
                    {evBreakdown && (
                      <div className="flex gap-3 mt-2 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Zap className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {evBreakdown.chargerCount} chargers
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {evBreakdown.solarPermits} solar permits
                          </span>
                        </div>
                        {evBreakdown.permitGrowthRate > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-medium" style={{ color: '#22c55e' }}>
                              +{evBreakdown.permitGrowthRate}% growth
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Quick tool cards — side by side */}
                {location && (
                  <div className="flex flex-col gap-2 mt-3">
                    {/* Walkability card */}
                    <button
                      onClick={() => setShowWalkability(v => !v)}
                      className="flex flex-col items-start gap-1.5 p-2.5 rounded-xl transition-all text-left hover:opacity-80"
                      style={{
                        background: showWalkability ? `${accentColor}12` : 'var(--bg-panel)',
                        border: `1.5px solid ${showWalkability ? accentColor : 'var(--border-subtle)'}`,
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <Footprints className="w-4 h-4" style={{ color: showWalkability ? accentColor : 'var(--text-muted)' }} />
                        {walkabilityLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--text-muted)' }} />
                        ) : (
                          <div
                            className="w-7 h-4 rounded-full relative transition-colors flex-shrink-0"
                            style={{ background: showWalkability ? accentColor : 'var(--border-default)' }}
                          >
                            <div
                              className="w-3 h-3 rounded-full bg-white absolute top-[2px] transition-all shadow-sm"
                              style={{ left: showWalkability ? 14 : 2 }}
                            />
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--text-main)' }}>
                        Walkability
                      </span>
                      {showWalkability && walkabilityPolygons.length > 0 ? (
                        <div className="flex gap-2 flex-wrap">
                          {walkabilityPolygons.map((p, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-sm" style={{ background: p.color, opacity: 0.7 }} />
                              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{p.label}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {showWalkability ? 'Loading zones...' : 'Show walk zones'}
                        </span>
                      )}
                    </button>

                    {/* Commute card */}
                    <div
                      className="flex flex-col items-start gap-1.5 p-2.5 rounded-xl"
                      style={{
                        background: commuteData ? `#f59e0b12` : 'var(--bg-panel)',
                        border: `1.5px solid ${commuteData ? '#f59e0b' : 'var(--border-subtle)'}`,
                      }}
                    >
                      <div className="flex items-center justify-between w-full">
                        <Briefcase className="w-4 h-4" style={{ color: commuteData ? '#f59e0b' : 'var(--text-muted)' }} />
                      </div>
                      <span className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--text-main)' }}>
                        Commute
                      </span>
                      {commuteData ? (
                        <div className="flex flex-col gap-1 w-full">
                          <div className="flex items-center gap-1">
                            <Car className="w-2.5 h-2.5" style={{ color: accentColor }} />
                            <span className="text-[11px] font-bold" style={{ color: accentColor }}>{commuteData.driveMinutes}m</span>
                            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>drive</span>
                          </div>
                          {commuteData.transitMinutes != null && (
                            <div className="flex items-center gap-1">
                              <Bus className="w-2.5 h-2.5" style={{ color: '#0ea5e9' }} />
                              <span className="text-[11px] font-bold" style={{ color: '#0ea5e9' }}>{commuteData.transitMinutes}m</span>
                              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>transit</span>
                            </div>
                          )}
                          {commuteData.walkMinutes != null && (
                            <div className="flex items-center gap-1">
                              <Footprints className="w-2.5 h-2.5" style={{ color: '#16a34a' }} />
                              <span className="text-[11px] font-bold" style={{ color: '#16a34a' }}>{commuteData.walkMinutes}m</span>
                              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>walk</span>
                            </div>
                          )}
                          {commuteData.bikeMinutes != null && (
                            <div className="flex items-center gap-1">
                              <Bike className="w-2.5 h-2.5" style={{ color: '#9333ea' }} />
                              <span className="text-[11px] font-bold" style={{ color: '#9333ea' }}>{commuteData.bikeMinutes}m</span>
                              <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>bike</span>
                            </div>
                          )}
                          <button
                            onClick={() => { setCommuteData(null); setWorkAddress(''); setWorkLocation(null); }}
                            className="text-[9px] mt-0.5 self-start transition-colors hover:opacity-80"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Change address
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5 w-full">
                          <div
                            className="flex-1 rounded-lg flex items-center gap-1 px-2 py-1.5"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                          >
                            <AddressAutocomplete
                              value={workAddress}
                              onChange={(v) => { setWorkAddress(v); if (!v) { setWorkLocation(null); setCommuteData(null); } }}
                              onSelect={(result) => {
                                if (result.lat && result.lng) setWorkLocation({ lat: result.lat, lng: result.lng });
                              }}
                              placeholder="Work address..."
                              darkMode={darkMode}
                              inputBg="transparent"
                              textColor={textColor}
                              mutedText={mutedText}
                              borderColor="transparent"
                              className="flex-1"
                              hideIcon
                            />
                          </div>
                          <button
                            onClick={calculateCommute}
                            disabled={commuteLoading || !workLocation}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-30 hover:brightness-110 transition-all"
                            style={{ background: accentColor, color: 'white' }}
                          >
                            {commuteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
                              <>
                                <Navigation className="w-3.5 h-3.5" />
                                Calculate Commute
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Category Scores */}
            {selectedCategory ? (
              <div className="p-3">
                <button
                  onClick={() => {
                    setSelectedCategory(null);
                    setSelectedPlace(null);
                  }}
                  className="flex items-center gap-1 text-sm mb-3 transition-colors hover:opacity-80"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <div className="flex items-center gap-3 mb-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: accentColor + '20' }}
                  >
                    <CategoryIcon icon={selectedCategory.category.icon} className="w-5 h-5" style={{ color: accentColor }} />
                  </div>
                  <div className="flex-1">
                    <div 
                      className="font-medium"
                      style={{ color: 'var(--text-main)' }}
                    >
                      {selectedCategory.category.name}
                    </div>
                    <div 
                      className="text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {selectedCategory.description}
                    </div>
                  </div>
                  <ScoreRing score={selectedCategory.score} size={48} />
                </div>
                <div 
                  className="text-xs font-medium uppercase tracking-wide mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Nearby Places ({selectedCategory.poiCount} found)
                </div>
                {selectedCategory.places.length > 0 ? (
                  <>
                    <div className="space-y-1.5">
                      {(expandedCategories.has(selectedCategory.category.id) 
                        ? selectedCategory.places 
                        : selectedCategory.places.slice(0, 10)
                      ).map((place, i) => {
                        const isSelected = selectedPlace?.name === place.name && selectedPlace?.distance === place.distance;
                        const placeKey = `${place.name}-${place.distance}`;
                        return (
                          <button
                            key={i}
                            ref={(el) => {
                              if (el) {
                                placeItemRefs.current.set(placeKey, el);
                              } else {
                                placeItemRefs.current.delete(placeKey);
                              }
                            }}
                            onClick={() => {
                              setSelectedPlace(place);
                              if (place.lat && place.lng) {
                                setMapZoomToLocation({ lat: place.lat, lng: place.lng, zoom: 16 });
                                setMapFitBounds(undefined);
                              }
                            }}
                            className="w-full flex items-center justify-between p-2 rounded-lg transition-colors hover:opacity-80"
                            style={{
                              background: isSelected ? accentColor : 'var(--bg-panel)',
                              color: isSelected ? 'white' : 'var(--text-main)',
                            }}
                          >
                            <span className={`text-sm truncate flex-1 text-left ${isSelected ? 'font-bold' : ''}`}>
                              {place.name} · {place.distance.toFixed(2)} mi
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedCategory.places.length > 10 && (
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedCategories);
                          if (newExpanded.has(selectedCategory.category.id)) {
                            newExpanded.delete(selectedCategory.category.id);
                          } else {
                            newExpanded.add(selectedCategory.category.id);
                          }
                          setExpandedCategories(newExpanded);
                        }}
                        className="w-full mt-2 flex items-center justify-center gap-1 text-xs transition-colors hover:opacity-80"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {expandedCategories.has(selectedCategory.category.id) ? (
                          <>
                            <ChevronUp className="w-3 h-3" /> Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" /> Show all {selectedCategory.poiCount} results
                          </>
                        )}
                      </button>
                    )}
                  </>
                ) : (
                  <p 
                    className="text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {selectedCategory.error ? 'Unable to load places' : 'No places found nearby'}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-3">
                {Object.entries(groupedCategories).map(([group, cats]) => (
                  <div key={group} className="mb-3">
                    <div 
                      className="text-xs font-medium uppercase tracking-wide mb-1.5"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {group}
                    </div>
                    <div className="space-y-1">
                      {cats.map((cat) => {
                        const catScore = scores.find(s => s.category.id === cat.id);
                        const Icon = cat.icon;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => {
                              if (catScore) {
                                setSelectedCategory(catScore);
                                setSelectedPlace(null);
                                if (catScore.places.length > 0 && location) {
                                  const placesWithCoords = catScore.places.filter(p => p.lat && p.lng);
                                  if (placesWithCoords.length > 0) {
                                    const lats = [location.lat, ...placesWithCoords.map(p => p.lat!)];
                                    const lngs = [location.lng, ...placesWithCoords.map(p => p.lng!)];
                                    setMapFitBounds({
                                      north: Math.max(...lats),
                                      south: Math.min(...lats),
                                      east: Math.max(...lngs),
                                      west: Math.min(...lngs),
                                    });
                                    setMapZoomToLocation(undefined);
                                  }
                                }
                              }
                            }}
                            disabled={!catScore}
                            className="prism-list-item w-full flex items-center justify-between p-2 rounded-lg transition-colors disabled:opacity-50 hover:opacity-80 disabled:hover:opacity-50"
                            style={{ border: 'none' }}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div 
                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: catScore ? getScoreColor(catScore.score) + '20' : 'var(--bg-panel)' }}
                              >
                                <Icon 
                                  className="w-4 h-4" 
                                  style={{ color: catScore ? getScoreColor(catScore.score) : 'var(--text-muted)' }} 
                                />
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <div 
                                  className="text-sm truncate"
                                  style={{ color: 'var(--text-main)' }}
                                >
                                  {cat.name}
                                </div>
                                {catScore && (
                                  <div 
                                    className="text-xs"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    {catScore.poiCount} found {catScore.closestDistance !== Infinity && `· closest ${catScore.closestDistance.toFixed(2)} mi`}
                                  </div>
                                )}
                              </div>
                            </div>
                            {catScore ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span
                                  className="text-sm font-medium"
                                  style={{ color: getScoreColor(catScore.score) }}
                                >
                                  {catScore.score.toFixed(1)} / 5
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}><ChevronRight className="w-4 h-4" /></span>
                              </div>
                            ) : (
                              <span 
                                className="text-xs flex-shrink-0"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                —
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
