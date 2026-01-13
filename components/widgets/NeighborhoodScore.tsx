// components/widgets/NeighborhoodScore.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  MapPin, Navigation, Loader2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  ShoppingCart, Utensils, Coffee, Trees, Dumbbell, GraduationCap, Pill, Building2,
  Bus, LucideIcon
} from 'lucide-react';
import { geocode, searchPlaces } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';
import AddressAutocomplete from '../AddressAutocomplete';

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
  { id: 'parks', name: 'Parks', icon: Trees, group: 'Lifestyle', mqCategory: 'sic:799951', weight: 2 },
  { id: 'fitness', name: 'Fitness', icon: Dumbbell, group: 'Lifestyle', mqCategory: 'sic:799101', weight: 1 },
  { id: 'schools', name: 'Schools', icon: GraduationCap, group: 'Education', mqCategory: 'sic:821101', weight: 2 },
  { id: 'pharmacy', name: 'Pharmacy', icon: Pill, group: 'Amenities', mqCategory: 'sic:591205', weight: 2 },
  { id: 'banks', name: 'Banks', icon: Building2, group: 'Amenities', mqCategory: 'sic:602101', weight: 1 },
  { id: 'publicTransit', name: 'Public Transportation', icon: Bus, group: 'Transportation', mqCategory: 'multi:sic:411101,sic:411104,sic:411201,sic:401101,sic:413101,sic:448301,metro station,subway,train station,light rail,trolley,streetcar,ferry terminal,transit center,amtrak,commuter rail', weight: 2 },
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

const categoryConfigs: Record<string, CategoryConfig> = {
  grocery: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
  restaurant: { idealCount: 10, searchRadius: 2, thresholdType: 'standard' },
  coffee: { idealCount: 5, searchRadius: 1, thresholdType: 'walkable' },
  pharmacy: { idealCount: 2, searchRadius: 2, thresholdType: 'standard' },
  banks: { idealCount: 2, searchRadius: 2, thresholdType: 'standard' },
  parks: { idealCount: 3, searchRadius: 1, thresholdType: 'walkable' },
  fitness: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
  schools: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
  publicTransit: { idealCount: 5, searchRadius: 1, thresholdType: 'walkable' },
};

const categoryColors: Record<string, string> = {
  grocery: '#8b5cf6',
  restaurant: '#ef4444',
  coffee: '#f59e0b',
  pharmacy: '#06b6d4',
  banks: '#3b82f6',
  parks: '#10b981',
  fitness: '#ec4899',
  schools: '#6366f1',
  publicTransit: '#0ea5e9',
};

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
      const categoryScores: CategoryScore[] = await Promise.all(
        categories.map(async (category) => {
          try {
            const config = categoryConfigs[category.id] || { idealCount: 3, searchRadius: 2, thresholdType: 'standard' as ThresholdType };
            
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

            const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
              const R = 3959;
              const dLat = (lat2 - lat1) * Math.PI / 180;
              const dLng = (lng2 - lng1) * Math.PI / 180;
              const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                        Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              return R * c;
            };

            // Blocklist of company names that are definitely NOT grocery stores
            // These often get incorrectly categorized in place data
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
                      distance = calculateDistance(loc!.lat, loc!.lng, lat, lng);
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
              // Filter out blocklisted names for grocery category
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

            return {
              category,
              score,
              description,
              places: pois,
              poiCount,
              closestDistance,
            };
          } catch (err) {
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
      );

      setScores(categoryScores);

      const overall = calculateOverallScore(categoryScores);
      setOverallScore(overall);

      if (loc) {
        setMapZoomToLocation({ lat: loc.lat, lng: loc.lng, zoom: 14 });
        setMapFitBounds(undefined);
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
      <div className="flex flex-col-reverse md:flex-row h-auto md:h-[600px]">
        {/* Sidebar */}
        <div 
          className="w-full md:w-80 flex flex-col overflow-hidden border-t md:border-t-0 md:border-r"
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
            <div className="mb-2">
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${accentColor}15` }}
                >
                  <span style={{ color: accentColor }}><MapPin className="w-4 h-4" /></span>
                </div>
                <div>
                  <h3 
                    className="font-bold"
                    style={{ color: 'var(--text-main)', letterSpacing: '-0.02em' }}
                  >
                    Neighborhood Score
                  </h3>
                  <p 
                    className="text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Walk score-style analysis
                  </p>
                </div>
              </div>
            </div>
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
              placeholder="Enter an address..."
              darkMode={darkMode}
              inputBg={inputBg}
              textColor={textColor}
              mutedText={mutedText}
              borderColor={borderColor}
            />
            <button
              onClick={calculateScores}
              disabled={loading || (!address && !location)}
              className="prism-btn prism-btn-primary w-full mt-2"
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

          {/* Overall Score */}
          {overallScore !== null && (
            <div 
              className="p-3"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center gap-3">
                <ScoreRing score={overallScore} size={64} />
                <div className="flex-1">
                  <div 
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-main)' }}
                  >
                    Neighborhood Score
                  </div>
                  <div 
                    className="text-2xl font-bold"
                    style={{ color: getScoreColor(overallScore) }}
                  >
                    {overallScore.toFixed(1)} / 5
                  </div>
                  <div 
                    className="text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {overallScore >= 4 ? 'Excellent' : overallScore >= 3 ? 'Good' : overallScore >= 2 ? 'Fair' : 'Limited'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Category Scores */}
          <div className="flex-1 overflow-y-auto prism-scrollbar">
            {selectedCategory ? (
              <div className="p-3">
                <button
                  onClick={() => {
                    setSelectedCategory(null);
                    setSelectedPlace(null);
                  }}
                  className="flex items-center gap-1 text-sm mb-3 transition-colors"
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
                            className="w-full flex items-center justify-between p-2 rounded-lg transition-colors"
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
                        className="w-full mt-2 flex items-center justify-center gap-1 text-xs transition-colors"
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
                            className="prism-list-item w-full flex items-center justify-between p-2 rounded-lg transition-colors disabled:opacity-50"
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

        {/* Map */}
        <div className="flex-1 relative min-h-[300px] md:min-h-0">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={location ? 14 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="100%"
            markers={(() => {
              const markers: Array<{ lat: number; lng: number; label?: string; color?: string; type?: 'home' | 'poi'; onClick?: () => void }> = [];
              
              if (location) {
                markers.push({ lat: location.lat, lng: location.lng, label: 'Home', color: accentColor, type: 'home' });
              }
              
              if (selectedCategory && selectedCategory.places.length > 0) {
                const categoryColor = categoryColors[selectedCategory.category.id] || '#10b981';
                const highlightedPoiColor = '#3b82f6';
                
                selectedCategory.places.forEach((poi) => {
                  if (poi.lat && poi.lng) {
                    const isHighlighted = selectedPlace?.name === poi.name && selectedPlace?.distance === poi.distance;
                    markers.push({
                      lat: poi.lat,
                      lng: poi.lng,
                      label: poi.name,
                      color: isHighlighted ? highlightedPoiColor : categoryColor,
                      type: 'poi',
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
              
              return markers;
            })()}
            fitBounds={mapFitBounds}
            zoomToLocation={mapZoomToLocation}
          />
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
          <span>
            {companyName && <span style={{ fontWeight: 600 }}>{companyName} · </span>}
            Powered by <strong>MapQuest</strong>
          </span>
        </div>
      )}
    </div>
  );
}
