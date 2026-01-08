// components/widgets/NeighborhoodScore.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  MapPin, Navigation, Loader2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  ShoppingCart, Utensils, Coffee, Trees, Dumbbell, GraduationCap, Pill, Building2,
  LucideIcon
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
  distance: number; // distance in miles from the input address
  name: string;
  lat?: number;
  lng?: number;
}

interface CategoryScore {
  category: Category;
  score: number; // 0-5 scale, one decimal
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
  { id: 'grocery', name: 'Groceries', icon: ShoppingCart, group: 'Amenities', mqCategory: 'sic:541105', weight: 3 },
  { id: 'restaurant', name: 'Restaurants', icon: Utensils, group: 'Amenities', mqCategory: 'q:restaurant', weight: 2 },
  { id: 'coffee', name: 'Coffee Shops', icon: Coffee, group: 'Amenities', mqCategory: 'sic:581228', weight: 1 },
  { id: 'parks', name: 'Parks', icon: Trees, group: 'Lifestyle', mqCategory: 'sic:799951', weight: 2 },
  { id: 'fitness', name: 'Fitness', icon: Dumbbell, group: 'Lifestyle', mqCategory: 'sic:799101', weight: 1 },
  { id: 'schools', name: 'Schools', icon: GraduationCap, group: 'Education', mqCategory: 'sic:821101', weight: 2 },
  { id: 'pharmacy', name: 'Pharmacy', icon: Pill, group: 'Amenities', mqCategory: 'sic:591205', weight: 2 },
  { id: 'banks', name: 'Banks', icon: Building2, group: 'Amenities', mqCategory: 'sic:602101', weight: 1 },
];

// Threshold definitions for closest POI scoring
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

// Category-specific configurations
const categoryConfigs: Record<string, CategoryConfig> = {
  grocery: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
  restaurant: { idealCount: 10, searchRadius: 2, thresholdType: 'standard' },
  coffee: { idealCount: 5, searchRadius: 1, thresholdType: 'walkable' },
  pharmacy: { idealCount: 2, searchRadius: 2, thresholdType: 'standard' },
  banks: { idealCount: 2, searchRadius: 2, thresholdType: 'standard' },
  parks: { idealCount: 3, searchRadius: 1, thresholdType: 'walkable' },
  fitness: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
  schools: { idealCount: 3, searchRadius: 2, thresholdType: 'standard' },
};

// Category colors for map markers
const categoryColors: Record<string, string> = {
  grocery: '#8b5cf6',    // Purple
  restaurant: '#ef4444',  // Red
  coffee: '#f59e0b',      // Amber
  pharmacy: '#06b6d4',    // Cyan
  banks: '#3b82f6',       // Blue
  parks: '#10b981',       // Green
  fitness: '#ec4899',     // Pink
  schools: '#6366f1',     // Indigo
};

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

// Calculate category score using proximity-based algorithm
function calculateCategoryScore(pois: POI[], config: CategoryConfig): number {
  if (pois.length === 0) return 0;

  // Weight factors
  const CLOSEST_WEIGHT = 0.5;      // 50% weight to closest POI
  const DENSITY_WEIGHT = 0.3;      // 30% weight to how many options exist
  const AVERAGE_DIST_WEIGHT = 0.2; // 20% weight to average distance

  // 1. Closest POI score (0-5) - uses category-specific thresholds
  const closestDistance = Math.min(...pois.map(p => p.distance));
  const closestScore = getClosestScore(closestDistance, config.thresholdType);

  // 2. Density score (0-5) - based on count within search radius
  // Cap at idealCount * 2 to prevent over-rewarding very high counts (50+)
  const cappedCount = Math.min(pois.length, config.idealCount * 2);
  const densityScore = Math.min(5, (cappedCount / config.idealCount) * 5);

  // 3. Average distance score (0-5)
  const avgDistance = pois.reduce((sum, p) => sum + p.distance, 0) / pois.length;
  const avgScore = Math.max(0, 5 - (avgDistance * 2.5)); // 0 miles = 5, 2 miles = 0

  // Weighted final score
  const rawScore = (closestScore * CLOSEST_WEIGHT) + 
                   (densityScore * DENSITY_WEIGHT) + 
                   (avgScore * AVERAGE_DIST_WEIGHT);

  // Round to one decimal
  return Math.round(rawScore * 10) / 10;
}

// Calculate overall neighborhood score - simple average (equal weights)
function calculateOverallScore(categoryScores: CategoryScore[]): number {
  const scores = categoryScores
    .filter(catScore => !catScore.error) // Skip categories with errors
    .map(catScore => catScore.score);
  
  if (scores.length === 0) return 0;
  
  const sum = scores.reduce((total, score) => total + score, 0);
  const average = sum / scores.length;
  
  return Math.round(average * 10) / 10; // one decimal place
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
  fontFamily = 'system-ui, -apple-system, sans-serif',
  borderRadius = '0.5rem',
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

  const bgColor = darkMode ? 'bg-gray-800' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedText = darkMode ? 'text-gray-200' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputBg = darkMode ? 'bg-gray-900' : 'bg-gray-50';

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
      console.log('=== Neighborhood Score Analysis ===');
      console.log('Location:', loc);

      const categoryScores: CategoryScore[] = await Promise.all(
        categories.map(async (category) => {
          try {
            const config = categoryConfigs[category.id] || { idealCount: 3, searchRadius: 2, thresholdType: 'standard' as ThresholdType };
            
            console.log(`\n[${category.name}] Searching within ${config.searchRadius} miles...`);
            const places = await searchPlaces(
              loc!.lat, 
              loc!.lng, 
              category.mqCategory, 
              config.searchRadius, 
              100 // Increased limit - will filter by radius after
            );

            console.log(`[${category.name}] API returned ${places?.length || 0} results`);

            if (!places || places.length === 0) {
              console.log(`[${category.name}] No POIs found`);
              return {
                category,
                score: 0,
                description: 'None found nearby',
                places: [],
                poiCount: 0,
                closestDistance: Infinity,
              };
            }

            // Helper function to calculate distance between two coordinates (Haversine formula)
            const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
              const R = 3959; // Earth's radius in miles
              const dLat = (lat2 - lat1) * Math.PI / 180;
              const dLng = (lng2 - lng1) * Math.PI / 180;
              const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                        Math.sin(dLng / 2) * Math.sin(dLng / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              return R * c;
            };

            // Convert to POI format with distances and coordinates
            const pois: POI[] = places
              .map(p => {
                let distance = p.distance;
                let lat: number | undefined;
                let lng: number | undefined;
                
                // Extract coordinates from place geometry
                if (p.place?.geometry?.coordinates) {
                  const coords = p.place.geometry.coordinates;
                  // Coordinates are [lng, lat]
                  if (coords && coords.length >= 2) {
                    lng = coords[0];
                    lat = coords[1];
                    // If distance is missing, calculate it from coordinates
                    if ((distance === undefined || distance === null || distance === 0)) {
                      distance = calculateDistance(loc!.lat, loc!.lng, lat, lng);
                    }
                  }
                }
                
                // If still no distance, try to get from place properties
                if ((distance === undefined || distance === null || distance === 0) && (p as any).distanceKm) {
                  distance = (p as any).distanceKm * 0.621371; // Convert km to miles
                }
                
                return {
                  distance: distance || 0,
                  name: p.name || 'Unknown',
                  lat,
                  lng,
                };
              })
              .filter(p => p.distance > 0) // Filter out places with no valid distance
              .filter(p => p.distance <= config.searchRadius) // Filter by actual search radius
              .sort((a, b) => a.distance - b.distance); // Sort by distance

            const poiCount = pois.length;
            const closestDistance = poiCount > 0 ? pois[0].distance : Infinity;

            console.log(`[${category.name}] Processed ${poiCount} POIs`);
            console.log(`[${category.name}] Closest: ${closestDistance.toFixed(2)} miles`);
            console.log(`[${category.name}] Average distance: ${(pois.reduce((sum, p) => sum + p.distance, 0) / poiCount).toFixed(2)} miles`);

            // Calculate score
            const score = calculateCategoryScore(pois, config);
            console.log(`[${category.name}] Calculated score: ${score.toFixed(1)} / 5`);

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
              places: pois, // Store ALL POIs within radius (not just top 10)
              poiCount,
              closestDistance,
            };
          } catch (err) {
            console.error(`[${category.name}] Error:`, err);
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

      console.log('\n=== Category Scores Summary ===');
      categoryScores.forEach(cs => {
        console.log(`${cs.category.name}: ${cs.score.toFixed(1)}/5 (${cs.poiCount} POIs found)`);
      });

      setScores(categoryScores);

      const overall = calculateOverallScore(categoryScores);
      console.log(`\n=== Overall Neighborhood Score: ${overall.toFixed(1)} / 5 ===\n`);
      setOverallScore(overall);

      // Center map on the input location
      if (loc) {
        setMapZoomToLocation({ lat: loc.lat, lng: loc.lng, zoom: 14 });
        setMapFitBounds(undefined);
      }

      onScoreCalculated?.({ overall, categories: categoryScores });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      console.error('Analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 4) return '#22c55e'; // green
    if (score >= 3) return '#eab308'; // yellow
    if (score >= 2) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  const ScoreRing = ({ score, size = 48 }: { score: number; size?: number }) => {
    const color = getScoreColor(score);
    const circumference = 2 * Math.PI * 18;
    const progress = (score / 5) * circumference; // Changed from /10 to /5

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={18} fill="none" stroke={darkMode ? '#374151' : '#e5e7eb'} strokeWidth="4" />
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
          <span className={`text-sm font-bold ${textColor}`}>{score.toFixed(1)}</span>
        </div>
      </div>
    );
  };

  const CategoryIcon = ({ icon: Icon, className, style }: { icon: LucideIcon; className?: string; style?: React.CSSProperties }) => (
    <Icon className={className || 'w-4 h-4'} style={style} />
  );

  const groupedCategories = categories.reduce((groups, cat) => {
    if (!groups[cat.group]) groups[cat.group] = [];
    groups[cat.group].push(cat);
    return groups;
  }, {} as Record<string, Category[]>);

  const mapCenter = location || { lat: 39.8283, lng: -98.5795 };

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden ${bgColor}`} style={{ minWidth: '900px', fontFamily, borderRadius }}>
      <div className="flex" style={{ height: '600px' }}>
        {/* Sidebar */}
        <div className={`w-80 border-r ${borderColor} flex flex-col overflow-hidden`}>
          {/* Header with Input */}
          <div className={`p-4 border-b ${borderColor}`}>
            <div className="mb-3">
              <h3 className={`font-semibold ${textColor}`}>Neighborhood Score</h3>
              <p className={`text-xs mt-0.5 ${mutedText}`}>Walk score-style analysis</p>
            </div>
            <AddressAutocomplete
              value={address}
              onChange={(newAddress) => {
                setAddress(newAddress);
                // Clear previous results when address changes (only if we have existing results)
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
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium text-sm disabled:opacity-50"
              style={{ backgroundColor: accentColor }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
              ) : (
                <><Navigation className="w-4 h-4" /> Calculate Scores</>
              )}
            </button>
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          </div>

          {/* Overall Score */}
          {overallScore !== null && (
            <div className={`p-4 border-b ${borderColor}`}>
              <div className="flex items-center gap-4">
                <ScoreRing score={overallScore} size={64} />
                <div className="flex-1">
                  <div className={`text-sm font-medium ${textColor}`}>Neighborhood Score</div>
                  <div className={`text-2xl font-bold`} style={{ color: getScoreColor(overallScore) }}>
                    {overallScore.toFixed(1)} / 5
                  </div>
                  <div className={`text-xs ${mutedText}`}>
                    {overallScore >= 4 ? 'Excellent' : overallScore >= 3 ? 'Good' : overallScore >= 2 ? 'Fair' : 'Limited'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Category Scores */}
          <div className="flex-1 overflow-y-auto">
            {selectedCategory ? (
              <div className="p-4">
                <button
                  onClick={() => {
                    setSelectedCategory(null);
                    setSelectedPlace(null);
                  }}
                  className={`flex items-center gap-1 text-sm ${mutedText} hover:${textColor} mb-4`}
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <div className="flex items-center gap-3 mb-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: accentColor + '20' }}
                  >
                    <CategoryIcon icon={selectedCategory.category.icon} className={`w-5 h-5`} style={{ color: accentColor }} />
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium ${textColor}`}>{selectedCategory.category.name}</div>
                    <div className={`text-xs ${mutedText}`}>{selectedCategory.description}</div>
                  </div>
                  <ScoreRing score={selectedCategory.score} size={48} />
                </div>
                <div className={`text-xs font-medium uppercase tracking-wide mb-2 ${mutedText}`}>
                  Nearby Places ({selectedCategory.poiCount} found)
                </div>
                {selectedCategory.places.length > 0 ? (
                  <>
                    <div className="space-y-2">
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
                              // Zoom to this specific place
                              if (place.lat && place.lng) {
                                setMapZoomToLocation({ lat: place.lat, lng: place.lng, zoom: 16 });
                                setMapFitBounds(undefined);
                              }
                            }}
                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                              isSelected 
                                ? darkMode ? 'bg-blue-600' : 'bg-blue-500' 
                                : darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                          >
                            <span className={`text-sm ${isSelected ? 'text-white font-bold' : textColor} truncate flex-1 text-left`}>
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
                        className={`w-full mt-2 flex items-center justify-center gap-1 text-xs ${mutedText} hover:${textColor} transition-colors`}
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
                  <p className={`text-sm ${mutedText}`}>
                    {selectedCategory.error ? 'Unable to load places' : 'No places found nearby'}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4">
                {Object.entries(groupedCategories).map(([group, cats]) => (
                  <div key={group} className="mb-4">
                    <div className={`text-xs font-medium uppercase tracking-wide mb-2 ${mutedText}`}>{group}</div>
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
                                // Calculate bounds to fit all POIs
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
                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                              darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                            } disabled:opacity-50`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div 
                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: catScore ? getScoreColor(catScore.score) + '20' : (darkMode ? '#374151' : '#f3f4f6') }}
                              >
                                <Icon 
                                  className="w-4 h-4" 
                                  style={{ color: catScore ? getScoreColor(catScore.score) : (darkMode ? '#9ca3af' : '#6b7280') }} 
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`text-sm ${textColor} truncate`}>{cat.name}</div>
                                {catScore && (
                                  <div className={`text-xs ${mutedText}`}>
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
                                <ChevronRight className={`w-4 h-4 ${mutedText}`} />
                              </div>
                            ) : (
                              <span className={`text-xs ${mutedText} flex-shrink-0`}>—</span>
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
        <div className="flex-1">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={location ? 14 : 4}
            darkMode={darkMode}
            accentColor={accentColor}
            height="600px"
            markers={(() => {
              const markers: Array<{ lat: number; lng: number; label?: string; color?: string; type?: 'home' | 'poi'; onClick?: () => void }> = [];
              
              // Add home location marker - use different icon type
              if (location) {
                markers.push({ lat: location.lat, lng: location.lng, label: 'Home', color: accentColor, type: 'home' });
              }
              
              // Add POI markers for selected category - plot ALL POIs (not just displayed ones)
              if (selectedCategory && selectedCategory.places.length > 0) {
                const categoryColor = categoryColors[selectedCategory.category.id] || '#10b981';
                const highlightedPoiColor = '#3b82f6'; // Bright blue color for highlighted POI
                
                // Plot ALL POIs within radius
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
                        // Find and select the matching POI
                        const matchingPoi = selectedCategory.places.find(
                          p => p.lat === poi.lat && p.lng === poi.lng
                        );
                        if (matchingPoi) {
                          setSelectedPlace(matchingPoi);
                          // Zoom to this specific place
                          setMapZoomToLocation({ lat: matchingPoi.lat!, lng: matchingPoi.lng!, zoom: 16 });
                          setMapFitBounds(undefined);
                          
                          // Scroll to the list item
                          const placeKey = `${matchingPoi.name}-${matchingPoi.distance}`;
                          const listItem = placeItemRefs.current.get(placeKey);
                          if (listItem) {
                            // Ensure the item is visible (expand if needed)
                            if (!expandedCategories.has(selectedCategory.category.id) && 
                                selectedCategory.places.indexOf(matchingPoi) >= 10) {
                              const newExpanded = new Set(expandedCategories);
                              newExpanded.add(selectedCategory.category.id);
                              setExpandedCategories(newExpanded);
                              // Wait for expansion, then scroll
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
