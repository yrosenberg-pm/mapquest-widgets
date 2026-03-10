'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Building2,
  ChevronDown,
  Clock,
  DollarSign,
  ExternalLink,
  Filter,
  HardHat,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react';
import MapQuestMap from './MapQuestMap';
import WidgetHeader from './WidgetHeader';
import AddressAutocomplete from '../AddressAutocomplete';
import { reverseGeocode } from '@/lib/mapquest';

/* ─── Types ─── */

interface ContractorAddress {
  street_no: string | null;
  street: string | null;
  city: string | null;
  zip_code: string | null;
  state: string | null;
  address_id: string | null;
  latlng: [number, number] | null;
}

interface Contractor {
  id: string;
  name: string | null;
  business_name: string | null;
  business_type: string | null;
  license: string | null;
  license_issue_date: string | null;
  license_exp_date: string | null;
  license_act_date: string | null;
  classification: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  phone: string | null;
  email: string | null;
  dba: string | null;
  linkedin_url: string | null;
  revenue: string | null;
  employee_count: string | null;
  primary_industry: string | null;
  review_count: number | null;
  rating: number | null;
  status_tally: Record<string, number> | null;
  tag_tally: Record<string, number> | null;
  permit_count: number | null;
  avg_job_value: number | null;
  total_job_value: number | null;
  avg_construction_duration: number | null;
  avg_inspection_pass_rate: number | null;
  address: ContractorAddress | null;
}

interface ContractorWithDistance extends Contractor {
  distanceMi: number;
}

/* ─── Constants ─── */

const SPECIALTIES: { value: string; label: string }[] = [
  { value: '', label: 'All Specialties' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'general_building_contractor', label: 'General Building' },
  { value: 'general_engineering_contractor', label: 'General Engineering' },
  { value: 'framing_and_carpentry', label: 'Framing & Carpentry' },
  { value: 'concrete_and_paving', label: 'Concrete & Paving' },
  { value: 'landscaping_and_outdoor_work', label: 'Landscaping' },
  { value: 'demolition_and_excavation', label: 'Demolition' },
  { value: 'fencing_and_glazing', label: 'Fencing & Glazing' },
  { value: 'specialty_trades', label: 'Specialty Trades' },
];

const RADIUS_OPTIONS = [5, 10, 25, 50] as const;

const TAG_COLORS: Record<string, string> = {
  solar: '#F97316',
  hvac: '#3B82F6',
  roofing: '#8B5CF6',
  new_construction: '#EF4444',
  remodel: '#F59E0B',
  electrical: '#EAB308',
  plumbing: '#64748B',
  adu: '#EC4899',
  ev_charger: '#10B981',
  pool_and_hot_tub: '#06B6D4',
  addition: '#6366F1',
  kitchen: '#D946EF',
  bathroom: '#14B8A6',
  heat_pump: '#0EA5E9',
};

const TAG_LABELS: Record<string, string> = {
  solar: 'Solar',
  hvac: 'HVAC',
  roofing: 'Roofing',
  new_construction: 'New Construction',
  remodel: 'Remodel',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  adu: 'ADU',
  ev_charger: 'EV Charger',
  pool_and_hot_tub: 'Pool & Spa',
  addition: 'Addition',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  heat_pump: 'Heat Pump',
};

type SortKey = 'distance' | 'rating' | 'permits' | 'passRate';

/* ─── Helpers ─── */

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ratingColor(rating: number | null): string {
  if (rating == null) return '#6B7280';
  if (rating >= 4.0) return '#10B981';
  if (rating >= 3.0) return '#F59E0B';
  if (rating >= 2.0) return '#F97316';
  return '#EF4444';
}

function passRateColor(rate: number | null): string {
  if (rate == null) return '#6B7280';
  if (rate >= 85) return '#10B981';
  if (rate >= 70) return '#3B82F6';
  if (rate >= 50) return '#F59E0B';
  return '#EF4444';
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function renderStars(rating: number | null) {
  if (rating == null) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span className="inline-flex items-center gap-px">
      {Array.from({ length: full }, (_, i) => (
        <Star key={`f${i}`} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      ))}
      {half && (
        <span className="relative w-3.5 h-3.5">
          <Star className="absolute inset-0 w-3.5 h-3.5 text-gray-300" />
          <span className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          </span>
        </span>
      )}
      {Array.from({ length: empty }, (_, i) => (
        <Star key={`e${i}`} className="w-3.5 h-3.5 text-gray-300" />
      ))}
    </span>
  );
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
  return { from, to };
}

function getSearchOffsets(radiusMi: number): [number, number][] {
  const offsets: [number, number][] = [[0, 0]];
  if (radiusMi >= 5) {
    offsets.push([0.04, 0], [-0.04, 0], [0, 0.05], [0, -0.05]);
  }
  if (radiusMi >= 10) {
    offsets.push(
      [0.07, 0], [-0.07, 0], [0, 0.09], [0, -0.09],
      [0.04, 0.05], [-0.04, 0.05], [0.04, -0.05], [-0.04, -0.05],
    );
  }
  if (radiusMi >= 25) {
    offsets.push(
      [0.14, 0], [-0.14, 0], [0, 0.18], [0, -0.18],
      [0.07, 0.09], [-0.07, 0.09], [0.07, -0.09], [-0.07, -0.09],
    );
  }
  if (radiusMi >= 50) {
    offsets.push(
      [0.28, 0], [-0.28, 0], [0, 0.36], [0, -0.36],
      [0.14, 0.18], [-0.14, 0.18], [0.14, -0.18], [-0.14, -0.18],
    );
  }
  return offsets;
}

async function discoverZips(lat: number, lng: number, radiusMi: number): Promise<string[]> {
  const offsets = getSearchOffsets(radiusMi);
  const results = await Promise.all(
    offsets.map(async ([dlat, dlng]) => {
      try {
        const loc = await reverseGeocode(lat + dlat, lng + dlng);
        if (!loc?.postalCode) return null;
        return loc.postalCode.split('-')[0];
      } catch {
        return null;
      }
    }),
  );
  return [...new Set(results.filter((z): z is string => !!z && z.length === 5))];
}

async function searchContractorsForZip(
  zipCode: string,
  dateFrom: string,
  dateTo: string,
  specialty: string,
  propertyType: string,
): Promise<Contractor[]> {
  const params = new URLSearchParams({
    endpoint: 'contractors-search',
    geo_id: zipCode,
    permit_from: dateFrom,
    permit_to: dateTo,
    size: '50',
  });

  if (specialty) params.append('contractor_classification_derived', specialty);
  if (propertyType && propertyType !== 'both') params.set('property_type', propertyType);

  const res = await fetch(`/api/shovels?${params.toString()}`);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.items || []) as Contractor[];
}

/* ─── Widget Props ─── */

interface ContractorFinderProps {
  apiKey: string;
  darkMode?: boolean;
  accentColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  showBranding?: boolean;
  companyName?: string;
  companyLogo?: string;
}

/* ─── Main Component ─── */

export default function ContractorFinder({
  apiKey,
  darkMode = false,
  accentColor = '#2563eb',
  fontFamily,
  borderRadius,
  showBranding,
  companyName,
  companyLogo,
}: ContractorFinderProps) {
  const border = 'var(--border-subtle)';
  const textMain = 'var(--text-main)';
  const textMuted = 'var(--text-muted)';
  const bgPanel = 'var(--bg-panel)';

  const [locationInput, setLocationInput] = useState('');
  const [searchCenter, setSearchCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [specialty, setSpecialty] = useState('');
  const [propertyType, setPropertyType] = useState('both');
  const [radius, setRadius] = useState<number>(25);
  const [sortBy, setSortBy] = useState<SortKey>('distance');

  const [contractors, setContractors] = useState<ContractorWithDistance[]>([]);
  const [selectedContractor, setSelectedContractor] = useState<ContractorWithDistance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [progress, setProgress] = useState('');

  const dates = useMemo(() => getDefaultDateRange(), []);

  const handleSearch = useCallback(async () => {
    if (!searchCenter) {
      setError('Please select a location first.');
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedContractor(null);
    setContractors([]);
    setSearchPerformed(true);

    try {
      setProgress('Finding nearby areas...');
      const zips = await discoverZips(searchCenter.lat, searchCenter.lng, radius);
      if (zips.length === 0) {
        setError('Could not find ZIP codes near this location.');
        setLoading(false);
        return;
      }

      setProgress(`Searching ${zips.length} area${zips.length > 1 ? 's' : ''} for contractors...`);
      const allResults = await Promise.all(
        zips.map((zip) => searchContractorsForZip(zip, dates.from, dates.to, specialty, propertyType)),
      );

      const merged = new Map<string, Contractor>();
      for (const batch of allResults) {
        for (const c of batch) {
          if (!merged.has(c.id)) merged.set(c.id, c);
        }
      }

      const withDistance: ContractorWithDistance[] = [];
      for (const c of merged.values()) {
        const latlng = c.address?.latlng;
        if (!latlng || !Number.isFinite(latlng[0]) || !Number.isFinite(latlng[1])) continue;
        const dist = haversineMi(searchCenter.lat, searchCenter.lng, latlng[0], latlng[1]);
        if (dist <= radius) {
          withDistance.push({ ...c, distanceMi: dist });
        }
      }

      setContractors(withDistance);
      if (withDistance.length === 0) {
        setError('No contractors found in this area. Try expanding the radius or changing filters.');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search for contractors. Please try again.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  }, [searchCenter, radius, specialty, propertyType, dates]);

  const sortedContractors = useMemo((): ContractorWithDistance[] => {
    const sorted = [...contractors];
    switch (sortBy) {
      case 'distance':
        sorted.sort((a, b) => a.distanceMi - b.distanceMi);
        break;
      case 'rating':
        sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case 'permits':
        sorted.sort((a, b) => (b.permit_count ?? 0) - (a.permit_count ?? 0));
        break;
      case 'passRate':
        sorted.sort((a, b) => (b.avg_inspection_pass_rate ?? 0) - (a.avg_inspection_pass_rate ?? 0));
        break;
    }
    return sorted;
  }, [contractors, sortBy]);

  const mapCenter = useMemo(
    () => searchCenter || { lat: 39.8283, lng: -98.5795 },
    [searchCenter],
  );

  const [liveMapZoom, setLiveMapZoom] = useState(4);
  const handleContractorBoundsChange = useCallback((b: { zoom: number }) => setLiveMapZoom(b.zoom), []);

  const mapZoom = useMemo(() => {
    if (!searchCenter) return 4;
    if (radius <= 5) return 12;
    if (radius <= 10) return 11;
    if (radius <= 25) return 10;
    return 9;
  }, [searchCenter, radius]);

  const markers = useMemo(() => {
    const pins: {
      lat: number;
      lng: number;
      label?: string;
      color?: string;
      type?: 'home' | 'poi' | 'default';
      onClick?: () => void;
      zIndexOffset?: number;
    }[] = [];

    if (searchCenter) {
      pins.push({
        lat: searchCenter.lat,
        lng: searchCenter.lng,
        label: '<b>Search Location</b>',
        color: accentColor,
        type: 'home',
        zIndexOffset: 1000,
      });
    }

    for (const c of sortedContractors) {
      const ll = c.address?.latlng;
      if (!ll) continue;
      const isSelected = selectedContractor?.id === c.id;
      const name = c.name || c.business_name || 'Unknown';
      const industryStr = c.primary_industry ? `<br/>${c.primary_industry}` : '';
      const ratingStr = c.rating != null ? `<br/>★ ${c.rating.toFixed(1)}` : '';
      const passStr = c.avg_inspection_pass_rate != null ? ` · ${c.avg_inspection_pass_rate}% pass` : '';

      pins.push({
        lat: ll[0],
        lng: ll[1],
        label: `<b>${name}</b>${industryStr}${ratingStr}${passStr}`,
        color: isSelected ? accentColor : ratingColor(c.rating),
        type: 'poi',
        zIndexOffset: isSelected ? 900 : 0,
        onClick: () => setSelectedContractor(c),
      });
    }

    return pins;
  }, [sortedContractors, searchCenter, selectedContractor, accentColor]);

  const contractorCards = useMemo(() => {
    return sortedContractors.map((c) => (
      <ContractorCard
        key={c.id}
        contractor={c}
        isSelected={selectedContractor?.id === c.id}
        accentColor={accentColor}
        onClick={() => setSelectedContractor(c)}
      />
    ));
  }, [sortedContractors, selectedContractor, accentColor]);

  /* ─── Render ─── */

  const topTags = useMemo(() => {
    if (!selectedContractor?.tag_tally) return [];
    const entries = Object.entries(selectedContractor.tag_tally).sort((a, b) => b[1] - a[1]);
    return entries.slice(0, 8);
  }, [selectedContractor]);

  const maxTagCount = topTags.length > 0 ? topTags[0][1] : 1;

  return (
    <div
      className="prism-widget w-full md:w-[1100px]"
      data-theme={darkMode ? 'dark' : 'light'}
      style={{ fontFamily: fontFamily || 'var(--brand-font)', '--brand-primary': accentColor } as React.CSSProperties}
    >
      <WidgetHeader
        title="Contractor Finder"
        subtitle={contractors.length > 0 ? `${contractors.length} contractor${contractors.length !== 1 ? 's' : ''} found` : 'Search contractors by specialty and location'}
        variant="impressive"
        layout="inline"
        icon={<HardHat className="w-4 h-4" />}
      />

      <div className="flex flex-col md:flex-row md:h-[720px]">
        {/* ─── Left Panel ─── */}
        <div
          className="w-full md:w-[400px] flex flex-col border-t md:border-t-0 md:border-r md:order-1 overflow-hidden"
          style={{ borderColor: border }}
        >
          {selectedContractor ? (
            /* ─── Detail View ─── */
            <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar p-4 space-y-3">
              <button
                onClick={() => setSelectedContractor(null)}
                className="flex items-center gap-1.5 text-[13px] font-medium mb-2 cursor-pointer hover:opacity-80"
                style={{ color: accentColor }}
              >
                <ArrowLeft className="w-4 h-4" /> Back to results
              </button>

              {/* Name & Industry */}
              <h3 className="text-[17px] font-bold leading-tight" style={{ color: textMain }}>
                {selectedContractor.name || selectedContractor.business_name || 'Unknown'}
              </h3>
              {selectedContractor.dba && (
                <p className="text-xs mt-0.5" style={{ color: textMuted }}>
                  DBA: {selectedContractor.dba}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {selectedContractor.primary_industry && (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${accentColor}18`, color: accentColor }}
                  >
                    {selectedContractor.primary_industry}
                  </span>
                )}
                {selectedContractor.business_type && (
                  <span className="text-[11px]" style={{ color: textMuted }}>{selectedContractor.business_type}</span>
                )}
              </div>

              {/* Rating */}
              {selectedContractor.rating != null && (
                <div className="flex items-center gap-2 mt-2.5">
                  {renderStars(selectedContractor.rating)}
                  <span className="text-sm font-semibold" style={{ color: textMain }}>{selectedContractor.rating.toFixed(1)}</span>
                  {selectedContractor.review_count != null && (
                    <span className="text-xs" style={{ color: textMuted }}>({selectedContractor.review_count} reviews)</span>
                  )}
                </div>
              )}

              {/* Key Metrics */}
              <div className="rounded-xl p-3" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: textMuted }}>
                  Key Metrics
                </h4>
                <div className="grid grid-cols-2 gap-2.5">
                  {selectedContractor.avg_inspection_pass_rate != null && (
                    <MetricBox
                      icon={<Award className="w-3.5 h-3.5" />}
                      label="Pass Rate"
                      value={`${selectedContractor.avg_inspection_pass_rate}%`}
                      valueColor={passRateColor(selectedContractor.avg_inspection_pass_rate)}
                    />
                  )}
                  {selectedContractor.permit_count != null && (
                    <MetricBox
                      icon={<HardHat className="w-3.5 h-3.5" />}
                      label="Total Permits"
                      value={selectedContractor.permit_count.toLocaleString()}
                    />
                  )}
                  {selectedContractor.avg_job_value != null && (
                    <MetricBox
                      icon={<DollarSign className="w-3.5 h-3.5" />}
                      label="Avg Job Value"
                      value={formatCurrency(selectedContractor.avg_job_value)}
                    />
                  )}
                  {selectedContractor.avg_construction_duration != null && (
                    <MetricBox
                      icon={<Clock className="w-3.5 h-3.5" />}
                      label="Avg Duration"
                      value={`${selectedContractor.avg_construction_duration} days`}
                    />
                  )}
                  {selectedContractor.total_job_value != null && (
                    <MetricBox
                      icon={<TrendingUp className="w-3.5 h-3.5" />}
                      label="Total Job Value"
                      value={formatCurrency(selectedContractor.total_job_value)}
                    />
                  )}
                  {selectedContractor.employee_count && (
                    <MetricBox
                      icon={<Users className="w-3.5 h-3.5" />}
                      label="Employees"
                      value={selectedContractor.employee_count}
                    />
                  )}
                </div>
              </div>

              {/* Work Types */}
              {topTags.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                    Work Types
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {topTags.map(([tag, count]) => (
                      <div key={tag} className="flex items-center gap-2">
                        <span className="text-[11px] w-[90px] flex-shrink-0 text-right" style={{ color: textMuted }}>
                          {TAG_LABELS[tag] || tag}
                        </span>
                        <div
                          className="flex-1 h-3.5 rounded-sm overflow-hidden"
                          style={{ background: 'var(--bg-input)' }}
                        >
                          <div
                            className="h-full rounded-sm transition-all duration-300"
                            style={{
                              width: `${Math.max(4, (count / maxTagCount) * 100)}%`,
                              background: TAG_COLORS[tag] || accentColor,
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold w-10 flex-shrink-0" style={{ color: textMain }}>
                          {count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Permit Status */}
              {selectedContractor.status_tally && Object.keys(selectedContractor.status_tally).length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: textMuted }}>
                    Permit Status
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(selectedContractor.status_tally).map(([status, count]) => (
                      <div
                        key={status}
                        className="px-2.5 py-1 rounded-lg text-xs"
                        style={{ background: bgPanel, border: `1px solid ${border}` }}
                      >
                        <span className="font-semibold" style={{ color: textMain }}>{count.toLocaleString()}</span>{' '}
                        <span style={{ color: textMuted }}>{status.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact & License */}
              <div className="rounded-xl p-3" style={{ background: bgPanel, border: `1px solid ${border}` }}>
                <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: textMuted }}>
                  Contact & Info
                </h4>
                <div className="flex flex-col gap-2">
                  {selectedContractor.primary_phone && (
                    <div className="flex items-center gap-2 text-[13px]">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" style={{ color: textMuted }} />
                      <a href={`tel:${selectedContractor.primary_phone}`} className="no-underline" style={{ color: accentColor }}>
                        {selectedContractor.primary_phone}
                      </a>
                    </div>
                  )}
                  {selectedContractor.primary_email && (
                    <div className="flex items-center gap-2 text-[13px]">
                      <Mail className="w-3.5 h-3.5 flex-shrink-0" style={{ color: textMuted }} />
                      <a href={`mailto:${selectedContractor.primary_email}`} className="no-underline truncate" style={{ color: accentColor }}>
                        {selectedContractor.primary_email}
                      </a>
                    </div>
                  )}
                  {selectedContractor.address && (
                    <div className="flex items-center gap-2 text-[13px]" style={{ color: textMain }}>
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: textMuted }} />
                      <span>
                        {[selectedContractor.address.street_no, selectedContractor.address.street].filter(Boolean).join(' ')}
                        {selectedContractor.address.city && `, ${selectedContractor.address.city}`}
                        {selectedContractor.address.state && `, ${selectedContractor.address.state}`}
                        {selectedContractor.address.zip_code && ` ${selectedContractor.address.zip_code}`}
                      </span>
                    </div>
                  )}
                  {selectedContractor.linkedin_url && (
                    <div className="flex items-center gap-2 text-[13px]">
                      <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" style={{ color: textMuted }} />
                      <a href={selectedContractor.linkedin_url} target="_blank" rel="noopener noreferrer" className="no-underline" style={{ color: accentColor }}>
                        LinkedIn Profile
                      </a>
                    </div>
                  )}
                  {selectedContractor.license && (
                    <div className="flex items-center gap-2 text-[13px] mt-1" style={{ color: textMain }}>
                      <Award className="w-3.5 h-3.5 flex-shrink-0" style={{ color: textMuted }} />
                      <span>
                        License #{selectedContractor.license}
                        {selectedContractor.license_issue_date && ` · Issued ${selectedContractor.license_issue_date}`}
                      </span>
                    </div>
                  )}
                  {selectedContractor.revenue && (
                    <div className="flex items-center gap-2 text-[13px]" style={{ color: textMain }}>
                      <DollarSign className="w-3.5 h-3.5 flex-shrink-0" style={{ color: textMuted }} />
                      <span>Revenue: {selectedContractor.revenue}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ─── Search + Results ─── */
            <>
              {/* Search Controls */}
              <div className="p-4 flex-shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
                {/* Location */}
                <div
                  className="rounded-xl flex items-center gap-2.5 mb-3"
                  style={{ background: 'var(--bg-input)', border: `1px solid ${border}`, padding: '10px 12px' }}
                >
                  <Search className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                  <AddressAutocomplete
                    value={locationInput}
                    onChange={setLocationInput}
                    onSelect={(addr) => {
                      setLocationInput(addr.displayString);
                      if (addr.lat != null && addr.lng != null) {
                        setSearchCenter({ lat: addr.lat, lng: addr.lng });
                      }
                    }}
                    placeholder="Enter address, city, or ZIP..."
                    darkMode={darkMode}
                    className="flex-1"
                    hideIcon
                  />
                </div>

                {/* Specialty + Property Type */}
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Specialty</span>
                    </div>
                    <div className="relative">
                      <select
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
                        className="w-full h-9 px-2.5 pr-7 rounded-lg text-[12px] appearance-none cursor-pointer outline-none"
                        style={{ background: bgPanel, border: `1px solid ${border}`, color: textMain }}
                      >
                        {SPECIALTIES.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Building2 className="w-3 h-3" style={{ color: textMuted }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Property</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['both', 'residential', 'commercial'] as const).map(pt => {
                        const active = propertyType === pt;
                        const label = pt === 'both' ? 'All' : pt === 'residential' ? 'Res.' : 'Com.';
                        return (
                          <button
                            key={pt}
                            onClick={() => setPropertyType(pt)}
                            className="text-[10px] font-semibold py-1.5 rounded-lg transition-colors text-center hover:opacity-80"
                            style={{
                              background: active ? `${accentColor}18` : bgPanel,
                              border: `1px solid ${active ? `${accentColor}45` : border}`,
                              color: active ? accentColor : 'var(--text-secondary)',
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Radius */}
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <MapPin className="w-3 h-3" style={{ color: textMuted }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: textMuted }}>Radius</span>
                  </div>
                  <div className="flex gap-1">
                    {RADIUS_OPTIONS.map((r) => {
                      const active = radius === r;
                      return (
                        <button
                          key={r}
                          onClick={() => setRadius(r)}
                          className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-colors text-center hover:opacity-80"
                          style={{
                            background: active ? `${accentColor}18` : bgPanel,
                            border: `1px solid ${active ? `${accentColor}45` : border}`,
                            color: active ? accentColor : 'var(--text-secondary)',
                          }}
                        >
                          {r} mi
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Search Button */}
                <button
                  onClick={handleSearch}
                  disabled={loading || !searchCenter}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
                  style={{ background: loading || !searchCenter ? 'var(--text-muted)' : accentColor }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {progress || 'Searching...'}
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" />
                      Search Contractors
                    </>
                  )}
                </button>
              </div>

              {/* Results */}
              <div className="flex-1 min-h-0 overflow-y-auto prism-scrollbar">
                {!searchPerformed && !loading && (
                  <div className="py-8 px-6 text-center">
                    <HardHat className="w-10 h-10 mx-auto opacity-20" style={{ color: textMuted }} />
                    <p className="text-[13px] mt-3 leading-relaxed" style={{ color: textMuted }}>
                      Enter a location and specialty to find contractors in your area.
                    </p>
                  </div>
                )}

                {loading && (
                  <div className="flex items-center gap-2 py-6 justify-center" style={{ color: textMuted }}>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">{progress || 'Searching...'}</span>
                  </div>
                )}

                {searchPerformed && !loading && contractors.length > 0 && (
                  <>
                    {/* Sort + Count */}
                    <div
                      className="flex items-center justify-between px-4 py-2"
                      style={{ borderBottom: `1px solid ${border}` }}
                    >
                      <span className="text-xs" style={{ color: textMuted }}>
                        {contractors.length} contractor{contractors.length !== 1 ? 's' : ''} found
                      </span>
                      <div className="flex items-center gap-1">
                        <Filter className="w-3 h-3" style={{ color: textMuted }} />
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as SortKey)}
                          className="border-none bg-transparent text-xs font-medium cursor-pointer outline-none"
                          style={{ color: textMain }}
                        >
                          <option value="distance">Nearest</option>
                          <option value="rating">Highest Rated</option>
                          <option value="permits">Most Permits</option>
                          <option value="passRate">Best Pass Rate</option>
                        </select>
                      </div>
                    </div>

                    {/* Contractor Cards */}
                    <div className="p-2">
                      {contractorCards}
                    </div>
                  </>
                )}

                {searchPerformed && !loading && contractors.length === 0 && error && (
                  <div className="py-8 px-6 text-center">
                    <Search className="w-10 h-10 mx-auto opacity-20" style={{ color: textMuted }} />
                    <p className="text-[13px] mt-3 leading-relaxed" style={{ color: textMuted }}>{error}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ─── Map Panel ─── */}
        <div className="relative h-[300px] md:h-auto md:flex-1 md:order-2">
          <MapQuestMap
            apiKey={apiKey}
            center={mapCenter}
            zoom={mapZoom}
            darkMode={darkMode}
            markers={markers}
            height="100%"
            mapType={liveMapZoom >= 18 ? 'hybrid' : undefined}
            onBoundsChange={handleContractorBoundsChange}
          />
        </div>
      </div>

      {showBranding && (
        <div className="prism-footer">
          {companyLogo && (
            <img
              src={companyLogo}
              alt={companyName || 'Company logo'}
              className="prism-footer-logo"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
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

/* ─── Sub-components ─── */

function MetricBox({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <div>
        <div className="text-sm font-bold" style={{ color: valueColor || 'var(--text-main)' }}>{value}</div>
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

function ContractorCard({
  contractor,
  isSelected,
  accentColor,
  onClick,
}: {
  contractor: ContractorWithDistance;
  isSelected: boolean;
  accentColor: string;
  onClick: () => void;
}) {
  const topTags = useMemo(() => {
    if (!contractor.tag_tally) return [];
    return Object.entries(contractor.tag_tally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [contractor.tag_tally]);

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 mb-1.5 rounded-xl transition-colors cursor-pointer hover:opacity-80"
      style={{
        border: `1px solid ${isSelected ? accentColor : 'var(--border-subtle)'}`,
        background: isSelected ? `${accentColor}10` : 'var(--bg-panel)',
      }}
    >
      {/* Name + Rating */}
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-main)' }}>
            {contractor.name || contractor.business_name || 'Unknown Contractor'}
          </div>
          {contractor.primary_industry && (
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{contractor.primary_industry}</div>
          )}
        </div>
        {contractor.rating != null && (
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-main)' }}>{contractor.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {contractor.permit_count != null && (
          <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <HardHat className="w-3 h-3" />
            {contractor.permit_count.toLocaleString()} permits
          </span>
        )}
        {contractor.avg_inspection_pass_rate != null && (
          <span
            className="text-[11px] flex items-center gap-1 font-semibold"
            style={{ color: passRateColor(contractor.avg_inspection_pass_rate) }}
          >
            <Award className="w-3 h-3" />
            {contractor.avg_inspection_pass_rate}% pass
          </span>
        )}
        <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <MapPin className="w-3 h-3" />
          {contractor.distanceMi.toFixed(1)} mi
        </span>
        {contractor.revenue && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{contractor.revenue}</span>
        )}
      </div>

      {/* Tags */}
      {topTags.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {topTags.map(([tag, count]) => (
            <span
              key={tag}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: `${TAG_COLORS[tag] || accentColor}20`,
                color: TAG_COLORS[tag] || accentColor,
              }}
            >
              {TAG_LABELS[tag] || tag} ({count})
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
