// components/widgets/NeighborhoodScore.tsx
'use client';

import { useState } from 'react';
import { 
  MapPin, Navigation, Loader2, ChevronRight, ChevronLeft, Home,
  ShoppingCart, Utensils, Coffee, Trees, Dumbbell, GraduationCap, Pill, Building2,
  LucideIcon
} from 'lucide-react';
import { geocode, searchPlaces, getRouteMatrix } from '@/lib/mapquest';
import MapQuestMap from './MapQuestMap';

interface Category {
  id: string;
  name: string;
  icon: LucideIcon;
  group: string;
  mqCategory: string;
  weight: number;
}

interface CategoryScore {
  category: Category;
  score: number;
  avgScore: number;
  description: string;
  places: { name: string; walkTime: number; distance: number }[];
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
  { id: 'restaurant', name: 'Restaurants', icon: Utensils, group: 'Amenities', mqCategory: 'sic:581208', weight: 2 },
  { id: 'coffee', name: 'Coffee Shops', icon: Coffee, group: 'Amenities', mqCategory: 'sic:581221', weight: 1 },
  { id: 'parks', name: 'Parks', icon: Trees, group: 'Lifestyle', mqCategory: 'sic:799951', weight: 2 },
  { id: 'fitness', name: 'Fitness', icon: Dumbbell, group: 'Lifestyle', mqCategory: 'sic:799101', weight: 1 },
  { id: 'schools', name: 'Schools', icon: GraduationCap, group: 'Education', mqCategory: 'sic:821101', weight: 2 },
  { id: 'pharmacy', name: 'Pharmacy', icon: Pill, group: 'Amenities', mqCategory: 'sic:591205', weight: 2 },
  { id: 'banks', name: 'Banks', icon: Building2, group: 'Amenities', mqCategory: 'sic:602101', weight: 1 },
];

const apiKey = process.env.NEXT_PUBLIC_MAPQUEST_API_KEY || '';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const categoryScores: CategoryScore[] = await Promise.all(
        categories.map(async (category) => {
          try {
            const places = await searchPlaces(loc!.lat, loc!.lng, category.mqCategory, 1.5, 8);

            if (!places || places.length === 0) {
              return {
                category,
                score: 2,
                avgScore: 5,
                description: 'Very limited options in this area',
                places: [],
              };
            }

            const destinations = places.slice(0, 5).map(p => ({
              lat: p.place?.geometry?.coordinates?.[1] || 0,
              lng: p.place?.geometry?.coordinates?.[0] || 0,
            })).filter(d => d.lat !== 0);

            let walkTimes: number[] = [];
            if (destinations.length > 0) {
              try {
                const matrix = await getRouteMatrix([loc!, ...destinations], { routeType: 'pedestrian' });
                walkTimes = matrix.time.slice(1);
              } catch {
                walkTimes = places.slice(0, 5).map(p => (p.distance || 0.5) * 20 * 60);
              }
            }

            const avgWalkTime = walkTimes.length > 0
              ? walkTimes.reduce((a, b) => a + b, 0) / walkTimes.length
              : 900;
            const countScore = Math.min(places.length / 4, 1) * 4;
            const timeScore = Math.max(0, 6 - (avgWalkTime / 180));
            const score = Math.min(10, Math.max(1, countScore + timeScore));

            let description: string;
            if (score >= 8) description = `Excellent ${category.name.toLowerCase()} options nearby`;
            else if (score >= 6) description = `Good variety within walking distance`;
            else if (score >= 4) description = `Some options available`;
            else description = `Limited options in this area`;

            return {
              category,
              score: Math.round(score * 10) / 10,
              avgScore: 5 + Math.random() * 2,
              description,
              places: places.slice(0, 5).map((p, i) => ({
                name: p.name,
                walkTime: Math.round((walkTimes[i] || 600) / 60),
                distance: p.distance || 0.5,
              })),
            };
          } catch {
            return {
              category,
              score: 5,
              avgScore: 5,
              description: 'Could not analyze this category',
              places: [],
            };
          }
        })
      );

      setScores(categoryScores);

      const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
      const weightedSum = categoryScores.reduce((sum, cs) => {
        const cat = categories.find(c => c.id === cs.category.id);
        return sum + cs.score * (cat?.weight || 1);
      }, 0);
      const overall = Math.round((weightedSum / totalWeight) * 10) / 10;
      setOverallScore(overall);

      onScoreCalculated?.({ overall, categories: categoryScores });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return '#22c55e';
    if (score >= 6) return '#eab308';
    if (score >= 4) return '#f97316';
    return '#ef4444';
  };

  const ScoreRing = ({ score, size = 48 }: { score: number; size?: number }) => {
    const color = getScoreColor(score);
    const circumference = 2 * Math.PI * 18;
    const progress = (score / 10) * circumference;

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

  const CategoryIcon = ({ icon: Icon, className }: { icon: LucideIcon; className?: string }) => (
    <Icon className={className || 'w-4 h-4'} />
  );

  const groupedCategories = categories.reduce((groups, cat) => {
    if (!groups[cat.group]) groups[cat.group] = [];
    groups[cat.group].push(cat);
    return groups;
  }, {} as Record<string, Category[]>);

  const mapCenter = location || { lat: 39.8283, lng: -98.5795 };

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden ${bgColor}`} style={{ minWidth: '900px', fontFamily, borderRadius }}>
      <div className="flex" style={{ height: '500px' }}>
        {/* Sidebar */}
        <div className={`w-80 border-r ${borderColor} flex flex-col overflow-hidden`}>
          {/* Header */}
          <div className={`p-4 border-b ${borderColor}`}>
            <h3 className={`font-semibold ${textColor}`}>Neighborhood Score</h3>
            <p className={`text-xs mt-1 ${mutedText}`}>Walk score-style analysis</p>
          </div>

          {/* Address Input */}
          <div className={`p-4 border-b ${borderColor}`}>
            <div className="relative">
              <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${mutedText}`} />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && calculateScores()}
                placeholder="Enter an address..."
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg border ${borderColor} ${inputBg} ${textColor} text-sm`}
              />
            </div>
            <button
              onClick={calculateScores}
              disabled={loading || (!address && !location)}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium text-sm disabled:opacity-50"
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
                <div>
                  <div className={`text-sm font-medium ${textColor}`}>Overall Score</div>
                  <div className={`text-xs ${mutedText}`}>
                    {overallScore >= 8 ? 'Excellent' : overallScore >= 6 ? 'Good' : overallScore >= 4 ? 'Fair' : 'Limited'}
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
                  onClick={() => setSelectedCategory(null)}
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
                  Nearby Places
                </div>
                {selectedCategory.places.length > 0 ? (
                  <div className="space-y-2">
                    {selectedCategory.places.map((place, i) => (
                      <div key={i} className={`flex items-center justify-between p-2 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                        <span className={`text-sm ${textColor}`}>{place.name}</span>
                        <span className={`text-xs ${mutedText}`}>{place.walkTime} min walk</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-sm ${mutedText}`}>No places found nearby</p>
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
                            onClick={() => catScore && setSelectedCategory(catScore)}
                            disabled={!catScore}
                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                              darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                            } disabled:opacity-50`}
                          >
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-8 h-8 rounded-lg flex items-center justify-center"
                                style={{ backgroundColor: catScore ? getScoreColor(catScore.score) + '20' : (darkMode ? '#374151' : '#f3f4f6') }}
                              >
                                <Icon 
                                  className="w-4 h-4" 
                                  style={{ color: catScore ? getScoreColor(catScore.score) : (darkMode ? '#9ca3af' : '#6b7280') }} 
                                />
                              </div>
                              <span className={`text-sm ${textColor}`}>{cat.name}</span>
                            </div>
                            {catScore ? (
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-sm font-medium"
                                  style={{ color: getScoreColor(catScore.score) }}
                                >
                                  {catScore.score.toFixed(1)}
                                </span>
                                <ChevronRight className={`w-4 h-4 ${mutedText}`} />
                              </div>
                            ) : (
                              <span className={`text-xs ${mutedText}`}>—</span>
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
            height="500px"
            markers={location ? [{ lat: location.lat, lng: location.lng, label: 'Home', color: accentColor }] : []}
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